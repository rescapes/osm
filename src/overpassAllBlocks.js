import {
  reqStrPathThrowing,
  pickDeepPaths,
  resultToTaskWithResult,
  toNamedResponseAndInputs,
  mapToNamedResponseAndInputs,
  compact,
  strPathOr,
  waitAllBucketed
} from 'rescape-ramda';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import {
  highwayNodeFilters,
  highwayWayFilters,
  osmIdToAreaId
} from './overpassHelpers';
import * as Result from 'folktale/result';
import {
  _blockToGeojson, _buildPartialBlocks, _sortOppositeBlocksByNodeOrdering,
  _hashBlock,
  _queryLocationVariationsUntilFoundResultTask, _wayEndPointToDirectionalWays, nodesByWayIdTask
} from './overpassBlockHelpers';
import {parallelWayNodeQueriesResultTask} from './overpassBlockHelpers';
import {nominatimLocationResultTask} from './nominatimLocationSearch';
import {
  _intersectionStreetNamesFromWaysAndNodes,
  findMatchingNodes,
  hashNodeFeature,
  hashWayFeature
} from './overpassFeatureHelpers';
import {isGeojsonShapeOrHasRadius, isNominatimEligible} from './locationHelpers';

/**
 * Created by Andy Likuski on 2019.07.26
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Resolve the location and then query for the all of its blocks in overpass.
 * This process will first use nominatimResultTask to query nomatim.openstreetmap.org for the relationship
 * of the neighborhood of the city. If it fails it will try the entire city. With this result we
 * query overpass using the area representation of the neighborhood or city, which is the OpenStreetMap id
 * plus a magic number defined by Overpass. If the neighborhood area query fails to give us the results we want,
 * we retry with the city area. TODO If we have a full city query when we want a neighborhood we should reduce
 * the results somewhow
 * @param {Object} osmConfig
 * @param {Object} [osmConfig.allowFallbackToCity] Default false. Let's the nomanatim query fallback to the city
 * if the neighborhood can't be found
 * @param {Object} location A location object
 * @returns {Task<{Ok: blocks, Error: errors>}>}
 * In Ok a list of results found in the form [{location,  results}]
 * Where each location represents a block and the results are the OSM geojson data
 * The results contain nodes and ways and intersections (the street intersections of each node)
 * Error contains Result.Errors in the form {errors: {errors, location}, location} where the internal
 * location are varieties of the original with an osm area id added. Result.Error is only returned
 * if no variation of the location succeeds in returning a result
 */
export const locationToOsmAllBlocksQueryResultsTask = ({allowFallbackToCity}, location) => {

  return R.composeK(
    // Unwrap the result we created for _queryLocationVariationsUntilFoundResultTask
    // Put it in the {Ok: [], Error: []} structure
    result => {
      return of(result.matchWith({
        Ok: ({value}) => ({
          Ok: [value],
          Error: []
        }),
        Error: ({value}) => ({
          Error: [value],
          Ok: []
        })
      }));
    },
    resultToTaskWithResult(
      locationVariationsWithOsm => R.cond([
        [R.length,
          // If we have variations, query then in order until a positive result is returned
          locationVariationsWithOsm => _queryLocationVariationsUntilFoundResultTask(
            locationWithOsm => R.map(
              // This returns a {Ok: [block locations], Error: [Error]}
              // If anything is in error, we know the query failed, so we pass a Result.Error
              results => R.ifElse(
                R.compose(R.length, R.prop('Error')),
                // Put in a Result.Error so this result is skipped
                results => Result.Error(R.prop('Error', results)),
                // Put in a Result.Ok so this result is processed
                results => Result.Ok(R.prop('Ok', results))
              )(results),
              _queryOverpassWithLocationForAllBlocksResultsTask(locationWithOsm)
            ),
            locationVariationsWithOsm
          )
        ],
        // If no query produced results return a Result.Error so we can give up gracefully
        [R.T,
          () => of(Result.Error({
            errors: ({
              errors: ['This location lacks jurisdiction or geojson properties to allow querying. The location must either have a country and city or geojson whose features all are shapes or have a radius property'],
              location
            }),
            location
          }))
        ]
      ])(locationVariationsWithOsm)
    ),
    // Nominatim query on the place search string.
    location => R.cond([
      // If it's a geojson shape or has a radius, it's already prime for querying
      [location => isGeojsonShapeOrHasRadius(location),
        location => of(Result.Ok([location]))
      ],
      // If it's got jurisdiction info, query nominatim to resolve the area
      [
        location => isNominatimEligible(location),
        location => nominatimLocationResultTask({
          listSuccessfulResult: true,
          allowFallbackToCity: allowFallbackToCity || false
        }, location)
      ],
      [R.T, location => of(Result.Error({
        error: 'Location not eligible for nominatim query and does not have a geojson shape or radius',
        location
      }))]
    ])(location)
  )(location);
};

/**
 * Queries for all blocks matching the Osm area id in the given location
 * @param {Object} locationWithOsm Location object with  bbox, osmId, placeId from
 * @private
 * @returns  {Task<Object>} { Ok: location blocks, Error: []
 * Each location block, and results containing: {node, way, nodesToIntersectingStreets} in the Ok array
 * node contains node features, way contains way features, and nodesToIntersectingStreets are keyed by node id
 * and contain one or more street names representing the intersection. It will be just the block name for
 * a dead end street, and contain the intersecting streets for non-deadends
 * Errors in the errors array
 * Result.Error is returned. Object has a ways, nodes
 */
const _queryOverpassWithLocationForAllBlocksResultsTask = (locationWithOsm) => {
  return R.composeK(
    ({way: wayQuery, node: nodeQuery}) => _queryOverpassForAllBlocksResultsTask(
      {location: locationWithOsm, way: wayQuery, node: nodeQuery}
    ),
    // Build an OSM query for the location. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    locationWithOsm => of(
      R.fromPairs(R.map(
        type => [
          type,
          _constructHighwaysQuery(
            {type},
            // These are the only properties we might need from the location
            pickDeepPaths(['intersections', 'osmId', 'geojson'], locationWithOsm)
          )
        ],
        ['way', 'node']
      ))
    )
  )(locationWithOsm);
};

/**
 * Queries for all blocks
 * @param location {Object} Only used for context for testing mocks
 * @param {String} wayQuery The Overpass way query
 * @param {String} nodeQuery The overpass node query
 * @returns {Task<Object>} { Ok: location blocks, Error: []
 * Each location block, and results containing: {node, way, nodesToIntersectingStreets} in the Ok array
 * node contains node features, way contains way features, and nodesToIntersectingStreets are keyed by node id
 * and contain one or more street names representing the intersection. It will be just the block name for
 * a dead end street, and contain the intersecting streets for non-deadends
 * Errors in the errors array
 * Result.Error is returned. Object has a ways, nodes
 */
export const _queryOverpassForAllBlocksResultsTask = ({location, way: wayQuery, node: nodeQuery}) => {
  return R.composeK(
    // Take the Result.Ok with responses and organize the features into blocks
    // Or put them in an Error array
    result => of(result.matchWith({
      Ok: ({value: {way, node}}) => organizeResponseFeaturesResultsTask(location, {way, node}),
      // Create a Results object with the one error
      Error: ({value}) => ({Ok: [], Error: [value]})
    })),
    // Query for the ways and nodes in parallel
    queries => parallelWayNodeQueriesResultTask(location, queries)
  )({way: wayQuery, node: nodeQuery});
};

/**
 * Organizes raw features into blocks
 * @param result {way, node} with each containing response.features and the original query
 * @returns {Task<Ok:[], Error:[]>}
 */
export const organizeResponseFeaturesResultsTask = (location, {way, node}) => {
  // Finally get the features from the response
  const [wayFeatures, nodeFeatures] = R.map(reqStrPathThrowing('response.features'), [way, node]);
  return R.composeK(
    blocks => of({
      Ok: blocks,
      Error: [] // TODO any blocks that don't process
    }),
    ({blocks, nodeIdToWays}) => of(R.map(
      block => {
        const nodesToIntersectingStreets = _intersectionStreetNamesFromWaysAndNodes(
          R.prop('ways', block),
          R.prop('nodes', block),
          nodeIdToWays
        );
        return {
          // Put the OSM results together
          results: R.merge(block, {nodesToIntersectingStreets}),
          // Add the intereections to the location and return it
          location: R.merge(
            location,
            {
              intersections: R.values(nodesToIntersectingStreets)
            }
          )
        };
      },
      blocks
    )),
    // Once we pick the best version of the block, simply take to values and disgard the hash keys,
    mapToNamedResponseAndInputs('blocks',
      ({hashToBestBlock}) => of(R.values(hashToBestBlock))
    ),
    mapToNamedResponseAndInputs('hashToBestBlock',
      ({blocks}) => of(R.reduceBy(
        (otherBlock, block) => {
          return R.when(
            () => otherBlock,
            // When we have 2 blocks it means we have the block in each direction, which we expect.
            // It's also possible to get some weird cases where ways were entered wrong in OSM and overlap,
            // creating the same block in terms of the node has but with different way ids
            block => {
              if (R.complement(R.equals)(
                ...R.map(
                  b => R.compose(R.sort(R.identity), R.map(R.prop('id')), R.prop('ways'))(b),
                  [otherBlock, block]
                )
              )) {
                // If way ids aren't the same but the nodes hash the same,
                // we have a case where the end of a way overlapped the other,
                // creating a short segment with matching node points, just take the first one. This is an OSM
                // data upload error and probably a useless pseudo-block that we'll throw away
                return otherBlock;
              } else {
                // Choose the block direction to use based on which starts with the lowest node id or failing
                // that for loops which has the lowest first way's second point
                // This is determinative so we can detect geojson changes when updating the location
                // but otherwise arbitrary.
                return R.head(_sortOppositeBlocksByNodeOrdering([otherBlock, block]));
              }
            })(block);
        },
        null,
        // We'll group the blocks by their hash code
        block => _hashBlock(block),
        blocks
      ))
    ),
    mapToNamedResponseAndInputs('blocks',
      ({blocks, nodeIdToWays}) => {
        return of(R.map(
          // Add intersections to the blocks based on the ways and nodes' properties
          block => R.merge(block, {
              nodesToIntersectingStreets: _intersectionStreetNamesFromWaysAndNodes(
                R.prop('ways', block),
                R.prop('nodes', block),
                nodeIdToWays
              )
            }
          ),
          blocks
        ));
      }
    ),
    mapToNamedResponseAndInputs('blocks',
      // For each block travel along it and accumulate connected ways until we reach a node or dead end
      // If a node is reached trim the last way to end at that node
      ({wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, partialBlocks}) => {
        // Block b:: [b] -> Task [b]
        // Wait in parallel but bucket tasks to prevent stack overflow
        return waitAllBucketed(R.map(
          partialBlock => recursivelyBuildBlockTask(
            {wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
            partialBlock
          ),
          partialBlocks
        ), 1000);
      }
    ),
    // Creates helpers and partialBlocks, which are blocks with a node and one directional way
    // from which we'll complete all our blocks
    // {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint, partialBlocks}
    ({wayFeatures, nodeFeatures, location}) => of(_createPartialBlocks({wayFeatures, nodeFeatures, location}))
  )({wayFeatures, nodeFeatures, location});
};

/**
 * Creates a bunch of data structures and ultimately the partialBlocks, which are blocks that
 * have a node and one way, where all are unique pairs of a node and directional way.
 * Also returns the data structures for further use
 * @param {[Object]} wayFeatures All the way features of the sought blocks
 * @param {[Object]} nodeFeatures All the node features of the sought blocks
 * @param {Object} location Location defining the bounds of all blocks
 * @returns {Object} {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint, partialBlocks} where
 * partialBlocks is the main return value and the others are helpers
 * @private
 */
const _createPartialBlocks = ({wayFeatures, nodeFeatures, location}) => R.compose(
  toNamedResponseAndInputs('partialBlocks',
    ({wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint}) => _buildPartialBlocks(
      {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint}
    )
  ),
  toNamedResponseAndInputs('wayEndPointToDirectionalWays',
    ({wayFeatures, wayIdToWayPoints, nodePointToNode}) => _wayEndPointToDirectionalWays({
      wayFeatures,
      wayIdToWayPoints,
      nodePointToNode
    })
  ),
  toNamedResponseAndInputs('nodeIdToWays',
    // "Invert" wayIdToNodes to create nodeIdToWays
    ({wayIdToNodes, wayIdToWay}) => R.reduce(
      (hash, [wayId, nodes]) => {
        const nodeIds = R.map(reqStrPathThrowing('id'), nodes);
        return R.reduce(
          // Add the wayId to the nodeId key
          (hsh, nodeId) => R.over(
            // Lens to get the node id in the hash
            R.lensProp(nodeId),
            // Add the way to the list of the nodeId
            wayList => R.concat(wayList || [], [R.prop(wayId, wayIdToWay)]),
            hsh
          ),
          hash,
          nodeIds
        );
      },
      {},
      R.toPairs(wayIdToNodes)
    )
  ),
  toNamedResponseAndInputs('wayIdToWayPoints',
    // Map the way id to its points
    ({wayFeatures}) => R.fromPairs(R.map(
      wayFeature => [
        R.prop('id', wayFeature),
        hashWayFeature(wayFeature)
      ],
      wayFeatures
    ))
  ),
  toNamedResponseAndInputs('wayIdToNodes',
    // Hash all way ids by intersection node if any waynode matches or
    // is an area-way (pedestrian area) within 5m  <-- TODO
    ({nodePointToNode, wayFeatures}) => {
      return R.fromPairs(R.map(
        wayFeature => [R.prop('id', wayFeature), findMatchingNodes(nodePointToNode, wayFeature)],
        wayFeatures
      ));
    }
  ),
  toNamedResponseAndInputs('wayIdToWay',
    // way id to way
    ({wayFeatures}) => R.indexBy(
      R.prop('id'),
      wayFeatures
    )
  ),
  toNamedResponseAndInputs('nodeIdToNodePoint',
    // Hash intersection nodes by id. These are all intersections
    ({nodeIdToNode}) => R.map(
      nodeFeature => hashNodeFeature(nodeFeature),
      nodeIdToNode
    )
  ),
  toNamedResponseAndInputs('nodePointToNode',
    // Hash the node points to match ways to them
    ({nodeFeatures}) => R.indexBy(
      nodeFeature => hashNodeFeature(nodeFeature),
      nodeFeatures
    )
  ),
  toNamedResponseAndInputs('nodeIdToNode',
    // Hash intersection nodes by id. These are all intersections
    ({nodeFeatures}) => R.indexBy(
      R.prop('id'),
      nodeFeatures
    )
  )
)({wayFeatures, nodeFeatures, location});

/**
 * Given a partial block, meaning a block with one node and one or more connected directional ways, recursively
 * travel from the one node to find the closest node, or failing that the next connected way, or failing that
 * end because we have a dead end
 * @param wayIdToNodes
 * @param wayEndPointToDirectionalWays
 * @param nodeIdToNodePoint
 * @param partialBlock
 * @returns {Object} A complete block that has {
 * nodes: [one or two nodes],
 * ways: [one or more ways],
 * }. Nodes is normally
 * two unless the block is a dead end. Ways are 1 or more, depending how many ways are need to connect to the
 * closest node (intersection). Al
 */
const recursivelyBuildBlockTask = ({wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint}, partialBlock) => {
  // We only have 1 node until we finish, but we could have any number of ways
  const {nodes, ways} = partialBlock;
  // Get the current final way of the partial block
  const currentFinalWay = R.last(ways);
  //_blockToGeojson({nodes: nodes, ways:[currentFinalWay]})
  // Get the remaining way points, excluding the first point that the node is on
  const remainingWayPoints = R.compose(
    R.tail,
    currentFinalWay => hashWayFeature(currentFinalWay)
  )(currentFinalWay);

  // Get the first node along this final way, excluding the starting point.
  // If the way is a loop with no other nodes, it could be the same node we started with
  const {firstFoundNodeOfFinalWay, trimmedWay} = _findFirstNodeOfWayAndTrimWay(
    {wayIdToNodes, nodeIdToNodePoint},
    currentFinalWay,
    remainingWayPoints
  );

  // If no node was found, look for the ways at the of the currentFinalWay
  // There might be a way or we might be at a dead end where there is no connecting way
  // The found ways points will flow in the correct direction since wayEndPointToDirectionalWays directs
  // ways from the end point
  const waysAtEndOfFinalWay = R.ifElse(R.isNil,
    () => R.compose(
      // Minus the current final way itself. Use the id for comparison because we don't want a trimmed
      // way to evaluate to be not equal to the full version of the same way
      ways => R.reject(R.eqProps('id', currentFinalWay), ways),
      // Any way touching the end point of the current final way
      endPoint => R.propOr([], endPoint, wayEndPointToDirectionalWays),
      // Get the last point of the current final way
      wayPoints => R.last(wayPoints)
    )(remainingWayPoints),
    () => []
  )(firstFoundNodeOfFinalWay);

  // Replaced the last way of ways with the trimmedWay if it was found
  const trimmedWays = R.concat(R.init(ways), [trimmedWay || R.last(ways)]);
  // Create a task to add the found node to the first node to complete the block and set the trimmed ways,
  // Alternatively if we got to a new way then we have to recurse and traverse that way until we find a node
  // or another way
  // Or if we have a dead end we need to query Overpass to get the dead end node. That's why this is a task
  // TODO instead of querying for the dead end node here, we could query for all dead end nodes right after we query Overpass,
  return _addIntersectionNodeOrDeadEndNodeTask(
    {wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
    nodes, trimmedWays, firstFoundNodeOfFinalWay, waysAtEndOfFinalWay
  );
};

/**
 * Searches the given currentFinalWay and it's remainingWayPoints to find the first intersection node along it.
 * Returns {firstFoundNodeOfFinalWay, trimmedWay}, the node and the way trimmed to that node
 * If it doesn't find a node because we are at dead end then both values are returned as null.
 * @param {Object} context
 * @param {Object} context.wayIdToNodes Lookup of way id to its nodes
 * @param {Object} context.nodeIdToNodePoint Lookup of node it to its point
 * @param {Object} currentFinalWay The way being searched
 * @param {[Object]} remainingWayPoints The remaining points of the currentFinalWay or all the points if the
 * way hasn't been reduced by previous traversal
 * @private
 */
const _findFirstNodeOfWayAndTrimWay = ({wayIdToNodes, nodeIdToNodePoint}, currentFinalWay, remainingWayPoints) => R.compose(
  // Chop the way at the node intersection
  nodeObj => R.ifElse(R.identity, nodeObj => ({
      firstFoundNodeOfFinalWay: R.prop('node', nodeObj),
      // Shorten the way points to the index of the node
      trimmedWay: R.over(
        R.lensPath(['geometry', 'coordinates']),
        // Slice the coordinates to the found node index
        // (+2 because the index is based on remainingWayPoints and we want to be inclusive)
        coordinates => R.slice(0, R.prop('index', nodeObj) + 2, coordinates),
        currentFinalWay
      )
    }),
    // Null case
    () => ({})
  )(nodeObj),
  // Take the closest node
  nodeObjs => R.head(nodeObjs),
  nodeObjs => R.sortBy(R.prop('index'), nodeObjs),
  nodeObjs => {
    // Debug view of the block's geojson
    //_blockToGeojson({nodes: R.map(R.prop('node'), nodeObjs), ways});
    return nodeObjs;
  },
  // Filter out non-matching (i.e. the node we started with)
  nodeObjs => R.reject(R.compose(R.equals(-1), R.prop('index')))(nodeObjs),
  // Sort the nodes find the closest one, meaning the one that intersects first with the
  // remaining way points. Again, if the way points form an uninterrupted loop, then our same
  // node will match with the last point of remainingWayPoints
  nodes => R.map(
    node => ({
      node, index: R.compose(
        nodePoint => R.indexOf(nodePoint, remainingWayPoints),
        nodeId => R.prop(nodeId, nodeIdToNodePoint),
        node => R.prop('id', node)
      )(node)
    }),
    nodes
  ),
  // Get the nodes of the way
  currentFinalWayId => reqStrPathThrowing(
    currentFinalWayId,
    wayIdToNodes
  ),
  currentFinalWay => R.prop('id', currentFinalWay)
)(currentFinalWay);

/**
 *
 * Create a task to add the found node to the first node to complete the block and set the trimmed ways,
 * Alternatively if we got to a new way then we have to recurse and traverse that way until we find a node
 * or another way
 * Or if we have a dead end we need to query Overpass to get the dead end node. That's why this is a task
 * TODO instead of querying for the dead end node here, we could query for all dead end nodes right after we query Overpass,
 * @param context
 * @param context.wayIdToNodes
 * @param context.wayEndPointToDirectionalWays
 * @param context.nodeIdToNodePoint
 * @param {[Object]} trimmedWays, trimmed ways forming the block thus far
 * @param {[Object]} nodes, always one--the first node of the block
 * @param {Object} firstFoundNodeOfFinalWay If non-null, the intersection node that has been found to complete the block
 * @param {Object} waysAtEndOfFinalWay If the way ends without an intersection and another way begins, this is the way
 * and we must recurse. Otherwise this is null
 * @returns {Object} nodes with two nodes: nodes + firstFoundNodeOfFinalWay or a dead-end node
 * from Overpass or the result of recursing on waysAtEndOfFinalWay. ways are allways built up to form the complete block, trimmed
 * to fit the two nodes
 * @private
 */
const _addIntersectionNodeOrDeadEndNodeTask = (
  {wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
  nodes, trimmedWays, firstFoundNodeOfFinalWay, waysAtEndOfFinalWay
) => {

  return R.composeK(
    node => {
      const block = ({
        // Combine nodes (always 1 node) with firstFoundNodeOfFinalWay if it was found
        // If no firstFoundNodeOfFinalWay was found, we have a dead end. We need the node
        // id of the dead end, so query for the nodes of the way and take the one matching the end of the way
        nodes: R.concat(nodes, compact([node])),
        // Combine current ways (with the last current way possibly shortened)
        // with waysAtEndOfFinalWay if firstFoundNodeOfFinalWay was null and a connect way was found
        ways: R.concat(trimmedWays, waysAtEndOfFinalWay)
      });
      _blockToGeojson(block);
      // If the block is complete because there are two blocks now, or failing that we didn't find a joining way,
      // just return the block, otherwise recurse to travel more to
      // reach a node along the new way, reach another way, or reach a dead end
      return R.ifElse(
        block => R.both(
          // If only 1 node so far
          block => R.compose(R.equals(1), R.length, R.prop('nodes'))(block),
          // And we added a new way, so can recurse
          () => R.compose(R.equals(1), R.length)(waysAtEndOfFinalWay)
        )(block),
        // If we aren't done recurse
        block => recursivelyBuildBlockTask(
          {wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
          block
        ),
        // Done
        block => of(block)
      )(block);
    },

    // If we didn't get firstFoundNodeOfFinalWay or waysAtEndOfFinalWay, we have a dead end and need
    // to query overpass for the node of at the end of the trimmedWays
    ({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay}) => R.ifElse(
      ({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay}) => R.and(
        R.isNil(firstFoundNodeOfFinalWay),
        R.isEmpty(waysAtEndOfFinalWay)
      ),
      // Find the dead-end node
      () => _deadEndNodeOfWayTask({}, R.last(trimmedWays)).map(x => x),
      // We have a firstFoundNodeOfFinalWay or waysAtEndOfFinalWay, pass the node (which might be null)
      () => of(firstFoundNodeOfFinalWay).map(x => x)
    )({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay})
  )({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay});
};

/**
 *
 * Queries for the nodes of the given way and returns the node that matches the last point of the way (for dead ends)
 * @param {Object} [location] Default {} Only used for context in unit tests to identify matching mock results
 * @param {Object} way The way to find nodes of
 * @returns {Object} <way.id: [node]> And object keyed by way id and valued by it's nodes
 * @private
 */
const _deadEndNodeOfWayTask = (location, way) => {
  // There are too many of these to mock the results in tests
  const lastPointOfWay = R.last(reqStrPathThrowing('geometry.coordinates', way));
  return R.map(
    ({nodesByWayId}) => R.compose(
      ({response}) => R.find(
        // Find the node matching the last way point
        node => R.equals(lastPointOfWay, reqStrPathThrowing('geometry.coordinates', node)),
        reqStrPathThrowing('features', response)
      ),
      // Only one way response
      // <wayId: <response, query>> -> <response, query>
      R.head,
      // Remove way ids keys
      R.values
    )(nodesByWayId),
    nodesByWayIdTask(
      location || {},
      {
        way: {
          response: {
            features: [way]
          }
        }
      }
    )
  );
};

/**
 * Construct an Overpass query to get all eligible highway ways or nodes for area of the given osmId or optionally
 * geojsonBOunds
 * @param {String} type 'way' or 'node' We have to do the queries separately because overpass combines the geojson
 * results in buggy ways
 * @param {String} [osmId] OSM id to be used to constrain the area of the query. This id corresponds
 * to a neighborhood or city. It can only be left undefined if geojsonBounds is defined
 * @param {Object} data Location data optionally containing OSM overrides
 * @param {Object} [data.osmOverrides] Optional overrides
 * @param {[Object]} [geojsonBounds] Optional. Bounds to use instead of the area of the osmId
 * @returns {string} The complete Overpass query string
 */
const _constructHighwaysQuery = ({type}, {osmId, geojson}) => {

  if (R.not(R.or(osmId, geojson))) {
    throw Error("Improper configuration. osmId or geojsonBounds must be non-nil");
  }

  // The Overpass Area Id is based on the osm id plus this Overpass magic number
  // Don't calculate this if we didn't pass an osmId
  const areaId = R.when(R.identity, osmIdToAreaId)(osmId);

  // We generate different queries based on the parameters.
  // Rather than documenting the generated queries here it's better to run the tests and look at the log
  const query = `
    ${
    // Declare the way variables if needed
    _createQueryWaysDeclarations(areaId, geojson)
  }
    ${
    // Declare the node variables
    _createQueryNodesDeclarations(type)
  }
    ${
    _createQueryOutput(type)
  }`;
  return query;
};

/**
 * Creates OSM Overpass query syntax to declare ways for a given OSM area id or geojsonBounds.
 * @param {Number} areaId Represents an OSM neighborhood or city
 * @param {Object} [geojsonBounds] Geojson bounds via a polygon. Will override the area id if specified
 * @returns {String} Overpass query syntax string that declares the way variable
 * @private
 */
const _createQueryWaysDeclarations = (areaId, geojson) => {
  return R.cond([
    // TODO handle geojsonBounds
    [
      ({geojson, areaId}) => strPathOr(geojson),
      ({geojson}) => {
        const wayQuery = R.ifElse(
          // Query by geojson and optional areaId
          R.identity,
          areaId => `way(area:${areaId})${highwayWayFilters}`,
          areaId => `way(area:${areaId})${highwayWayFilters}`
        )(areaId);
        return `${wayQuery}->.ways;`;
      }
    ],
    // We don't have hard-coded way ids, so search for these values by querying
    [R.T, ({areaId}) => {
      const wayQuery = `way(area:${areaId})${highwayWayFilters}`;
      return `${wayQuery}->.ways;`;
    }]
  ])({areaId, geojson});
};

/**
 * Creates OSM Overpass query syntax to declare nodes based on .ways defined in _createQueryWaysDeclarations
 * @returns {String} Overpass query syntax string that declares the way variable
 * @private
 */
const _createQueryNodesDeclarations = type => {
  // We only need to generate this for a node query. Ways don't need nodes
  return R.ifElse(R.equals('node'), R.always(`node(w.ways)${highwayNodeFilters}->.nodes;`), R.always(''))(type);
};

/**
 * Creates syntax for the output of the query.
 * @param {String} type Either way or node. We have to query nodes and ways separately to prevent geojson output errors
 * @returns {String} the syntax for the output
 * @private
 */
const _createQueryOutput = type => {
  // Either return nodes or ways. Can't do both because the API messes up the geojson
  return R.cond([
    [R.equals('node'), R.always(`foreach .ways -> .currentway(
      (.ways; - .currentway;)->.allotherways;
  node(w.currentway)->.nodesOfCurrentWay;
  node(w.allotherways)->.nodesOfAllOtherWays;
  node.nodesOfCurrentWay.nodesOfAllOtherWays -> .n;
  (.n ; .result;) -> .result;
  );
.result out geom;`
    )],
    [R.equals('way'), R.always('.ways out geom;')],
    [R.T, () => {
      throw Error('type argument must specified and be "way" or "node"');
    }]
  ])(type);
};
