import {
  reqStrPathThrowing,
  pickDeepPaths,
  resultToTaskWithResult,
  toNamedResponseAndInputs,
  toMergedResponseAndInputs,
  mapToNamedResponseAndInputs,
  compact,
  strPathOr,
  waitAllBucketed,
  mapMDeep,
  resultToTaskNeedingResult,
  filterWithKeys
} from 'rescape-ramda';
import {turfBboxToOsmBbox, extractSquareGridFeatureCollectionFromGeojson} from 'rescape-helpers';
import bbox from '@turf/bbox';
import squareGrid from '@turf/square-grid';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import {
  configuredHighwayWayFilters,
  fetchOsmRawTask,
  highwayNodeFilters,
  highwayWayFiltersNoAreas,
  osmIdToAreaId, osmResultTask
} from './overpassHelpers';
import * as Result from 'folktale/result';
import {
  _blockToGeojson,
  _buildPartialBlocks,
  _sortOppositeBlocksByNodeOrdering,
  _hashBlock,
  _queryLocationVariationsUntilFoundResultTask,
  _wayEndPointToDirectionalWays,
  nodesAndIntersectionNodesByWayIdResultTask,
  waysOfNodeQuery,
  removeReverseTagsOfOrderWayFeaturesOfBlock,
  orderWayFeaturesOfBlock, waysByNodeIdTask
} from './overpassBlockHelpers';
import {parallelWayNodeQueriesResultTask} from './overpassBlockHelpers';
import {nominatimLocationResultTask} from './nominatimLocationSearch';
import {
  _intersectionStreetNamesFromWaysAndNodes,
  findMatchingNodes,
  hashNodeFeature, hashPoint,
  hashWayFeature, nodeMatchesWayEnd
} from './overpassFeatureHelpers';
import {
  geojsonFeaturesHaveShapeOrRadii,
  isNominatimEligible,
  geojsonFeaturesHaveShape, geojsonFeaturesHaveRadii, wayFeatureNameOrDefault
} from './locationHelpers';
import {length} from '@turf/turf';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';

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
 * @param {Object} [osmConfig.minimumWayLength]. The minimum lengths of way features to return. Defaults to 20 meters.
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
export const locationToOsmAllBlocksQueryResultsTask = v((osmConfig, location) => {
  return R.composeK(
    // Unwrap the result we created for _queryLocationVariationsUntilFoundResultTask
    // Put it in the {Ok: [], Error: []} structure
    result => {
      return of(result.matchWith({
        Ok: ({value}) => ({
          Ok: R.unless(Array.isArray, Array.of)(value),
          Error: []
        }),
        Error: ({value}) => ({
          Error: R.unless(Array.isArray, Array.of)(value),
          Ok: []
        })
      }));
    },
    resultToTaskWithResult(
      locationVariationsWithOsm => R.cond([
        [R.length,
          // If we have variations, query then in order until a positive result is returned
          locationVariationsWithOsm => _queryLocationVariationsUntilFoundResultTask(
            osmConfig,
            (osmConfig, locationWithOsm) => R.map(
              // _queryOverpassWithLocationForAllBlocksResultsTask returns a {Ok: [block locations], Error: [Error]}
              // We need to reduce this: If anything is in error, we know the query failed, so we pass a Result.Error
              results => R.ifElse(
                R.compose(R.length, R.prop('Error')),
                // Put in a Result.Error so this result is skipped
                results => Result.Error(R.prop('Error', results)),
                // Put in a Result.Ok so this result is processed
                results => Result.Ok(R.prop('Ok', results))
              )(results),
              _queryOverpassWithLocationForAllBlocksResultsTask(osmConfig, locationWithOsm)
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
    // Nominatim query on the place search string or ready for querying because of geojson.
    location => R.cond([
      // If it's a geojson shape or has a radius, it's already prime for querying
      [location => geojsonFeaturesHaveShapeOrRadii(strPathOr(null, 'geojson', location)),
        location => of(Result.Ok([location]))
      ],
      // If it's got jurisdiction info, query nominatim to resolve the area
      [
        location => isNominatimEligible(location),
        location => nominatimLocationResultTask({
          listSuccessfulResult: true,
          allowFallbackToCity: R.propOr(false, 'allowFallbackToCity', osmConfig)
        }, location)
      ],
      [R.T, location => of(Result.Error({
        error: 'Location not eligible for nominatim query and does not have a geojson shape or radius',
        location
      }))]
    ])(location)
  )(location);
}, [
  ['osmConfig', PropTypes.shape().isRequired],
  ['location', PropTypes.shape().isRequired]
], 'locationToOsmAllBlocksQueryResultsTask');

/**
 * Queries for all blocks matching the Osm area id in the given location
 * @param {Object} osmConfig The osm config
 * @param {Object} osmConfig.minimumWayLength. The minimum lengths of way features to return. Defaults to 20 meters.
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
const _queryOverpassWithLocationForAllBlocksResultsTask = (osmConfig, locationWithOsm) => {
  return R.composeK(
    ({way: wayQueries, node: nodeQueries}) => _queryOverpassForAllBlocksResultsTask(
      osmConfig,
      {location: locationWithOsm, way: wayQueries, node: nodeQueries}
    ),
    // Build an OSM query for the location. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    locationWithOsm => of(
      R.fromPairs(R.map(
        type => [
          type,
          _constructHighwayQueriesForType(
            osmConfig,
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
 * @param {Object} osmConfig The osm config
 * @param {Object} [osmConfig.forceWaysOfNodeQueries]. If true also queries each found node for its ways. This is
 * only needed for narrow queries of a street where we don't get all the ways connected to each node of the street.
 * We need to know how many ways each node has so we know if it's really an intersection node, rather than just
 * a point where the way changes.
 * @param {Object} [osmConfig.minimumWayLength]. The minimum lengths of way features to return. Defaults to 20 meters.
 * @param location {Object} Only used for context for testing mocks
 * @param {String} wayQueries The Overpass way queries. One or more queries for the ways. Queries are broken up
 * for efficiency for large areas and the results are uniquely combined
 * @param {String} nodeQueries The overpass node queries. Like way queries, queries are broken up
 * for efficiency for large areas and the results are uniquely combined
 * @returns {Task<Object>} { Ok: location blocks, Error: []
 * Each location block, and results containing: {node, way, nodesToIntersectingStreets} in the Ok array
 * node contains node features, way contains way features, and nodesToIntersectingStreets are keyed by node id
 * and contain one or more street names representing the intersection. It will be just the block name for
 * a dead end street, and contain the intersecting streets for non-deadends
 * Errors in the errors array
 * Result.Error is returned. Object has a ways, nodes
 */
export const _queryOverpassForAllBlocksResultsTask = (osmConfig, {location, way: wayQueries, node: nodeQueries}) => {
  return R.composeK(
    // Take the Result.Ok with responses and organize the features into blocks
    // Or put them in an Error array
    result => result.matchWith({
      Ok: ({value: {way, node}}) => R.composeK(
        ({way, node, waysByNodeId}) => organizeResponseFeaturesResultsTask(osmConfig, location, {
          way,
          node,
          // Get the response of each waysByNodeId query if we need them
          referenceNodeIdToWays: R.map(reqStrPathThrowing('response.features'), waysByNodeId)
        }),
        // If we are doing a narrow street query we need to get waysByNode so we know which nodes of the street are real intersections
        ({way, node}) => R.ifElse(
          ({osmConfig}) => R.propOr(false, 'forceWaysOfNodeQueries', osmConfig),
          ({way, node}) => waysByNodeIdTask(osmConfig, {way, node}),
          // Otherwise we don't need waysByNode because our query was comprehensive
          ({way, node}) => of({way, node, waysByNodeId: {}})
        )({osmConfig, way, node})
      )({way, node}),
      // Create a Results object with the one error
      Error: ({value}) => of({Ok: [], Error: [value]})
    }),
    // Query for the ways and nodes in parallel
    queries => parallelWayNodeQueriesResultTask(osmConfig, location, queries)
  )({way: wayQueries, node: nodeQueries});
};

/**
 * Organizes raw features into blocks
 * @param {Object} osmConfig The osm config
 * @param {Object} osmConfig.minimumWayLength. The minimum lengths of way features to return. Defaults to 20 meters.
 * This exists to eliminate blocks that are just short connectors between streets, roundabout entrances, etc.
 * It should be set to 0 if all segments are needed for routing algorithms
 * @param {Object} location Used for context to help resolve the blocks. This location represents the geojson
 * or jurisdiction data used to create the way and node queries
 * @param result {way, node, referenceNodeIdToWays} with each containing response.features and the original query.
 * referenceNodeIdToWays is optional here. It is only needed for narrow queries on a street so we know which of the returned
 * nodes are real intersections and which are just points where the way changes along the street. It is keyed by node id and valued by ways
 * @returns {Task<Ok:[], Error:[]>}
 */
export const organizeResponseFeaturesResultsTask = (osmConfig, location, {way, node, referenceNodeIdToWays}) => {
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
          // Add the intersections to the location and return it
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
    // Filter out fake blocks that are just street connectors.
    // This will be more sophisticated in the future. For now just eliminate any block that is less than osmConfig.minimumWayLength meters long
    mapToNamedResponseAndInputs('blocks',
      ({blocks}) => of(
        R.filter(
          block => R.compose(
            // ways add up to at least 10 meters
            R.lte(R.propOr(20, 'minimumWayLength', osmConfig)),
            // add up the ways
            ways => R.reduce(
              (accum, way) => R.add(accum, length(way, {units: 'meters'})),
              0,
              ways
            )
          )(strPathOr([], 'ways', block)),
          blocks
        )
      )
    ),
    // Once we pick the best version of the block, simply take to values and discard the hash keys,
    mapToNamedResponseAndInputs('blocks',
      ({hashToBestBlock}) => of(
        R.values(hashToBestBlock)
      )
    ),
    mapToNamedResponseAndInputs('hashToBestBlock',
      ({blocks}) => of(
        R.reduceBy(
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
        )
      )
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
      ({nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, partialBlocks}) => {
        // Block b:: [b] -> Task [b]
        // Wait in parallel but bucket tasks to prevent stack overflow
        return waitAllBucketed(R.reduceWhile(
          (x, {partialBlocks}) => R.length(partialBlocks),
          ({partialBlocks, tasks}) => R.over(
            R.lensProp('task'),
            task => R.concat(tasks, task),
            recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask(
              osmConfig,
              {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
              partialBlocks
            )
          ),
          {partialBlocks, tasks: []},
          null
        ), 1000);
      }
    ),
    // Creates helpers and partialBlocks, which are blocks with a node and one directional way
    // from which we'll complete all our blocks. Note that this also trims nodeFeatures to get rid of
    // fake intersections (where the way changes but it's not really a new street)
    // Returns {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint, partialBlocks, nodeFeatures}
    ({wayFeatures, nodeFeatures, location}) => of(_createPartialBlocks({
      wayFeatures,
      nodeFeatures,
      referenceNodeIdToWays,
      location
    }))
  )({wayFeatures, nodeFeatures, referenceNodeIdToWays, location});
};

/**
 * Creates a bunch of data structures and ultimately the partialBlocks, which are blocks that
 * have a node and one way, where all are unique pairs of a node and directional way.
 * Also returns the data structures for further use
 * @param {[Object]} wayFeatures All the way features of the sought blocks
 * @param {[Object]} nodeFeatures All the node features of the sought blocks
 * @param {Object} [referenceNodeIdToWays] Optional Only needed for narrow street queries where we need to know the ways
 * of the node features so we know if they are real intersections or not. This is keyed by node id and valued by way features
 * @param {Object} location Location defining the bounds of all blocks
 * @returns {Object} {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint, partialBlocks, nodeFeatures} where
 * partialBlocks is the main return value, nodeFeatures might be trimmed to get rid of fake nodes, and the others are helpers
 * @private
 */
const _createPartialBlocks = ({wayFeatures, nodeFeatures, referenceNodeIdToWays, location}) => R.compose(
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
      R.toPairs(wayIdToNodes))
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
 * TODO No longer used because we actaully still need these nodes, we just want to treat them as intersections
 *  Eliminate fake intersection nodes. These are nodes that Overpass returns because the
 * way id changes, but not because of an intersection. In OpenStreetMap ways can end at any point, it just
 * depends on the data source. The best we can do is eliminate nodes that only connect two ways,
 * where both ways start or end at that node, and where those ways have the same name.
 * @param {[Object]} nodeFeatures The nodeFeatures to trim
 * @param {Object} nodeIdToWays Used to trim nodeFeatures, and these also git trimmed to the trimmed nodeFeatures
 * @param {Object} referenceNodeIdToWays Only needed when nodeIdToWays is incomplete because of a narrow query.
 * This supplies all of the ways of each node in nodeFeatures/nodeIdToWays
 * @returns {Object} Object with trimmed versions of {nodeFeature, nodeIdToWays}
 * @private
 */
const _eliminateFakeIntersectionNodes = ({nodeFeatures, nodeIdToWays, referenceNodeIdToWays}) => {

  // If we have optional referenceNodeIdToWays, merge them into the nodeIdToWays
  // referenceNodeIdToWays are only need for narrow street queries where we didn't get all the ways of the nodes back
  // from the original query, so we augment it with individual node query results
  const mergedNodeIdToWays = R.mergeDeepWith(
    (a, b) => R.uniqBy(R.prop('id'), R.concat(a, b)),
    nodeIdToWays,
    referenceNodeIdToWays || {}
  );

  return R.compose(
    // Once we trim nodeFeatures, trim nodeIdToWays. Note that we don't trim mergedNodeIdToWays because
    // we don't want to return the contextual helper ways in referenceNodeIdToWays
    toNamedResponseAndInputs('nodeIdToWays',
      // "Invert" wayIdToNodes to create nodeIdToWays
      ({nodeFeatures, nodeIdToWays}) => {
        const nodeIdLookup = R.indexBy(R.prop('id'), nodeFeatures);
        return filterWithKeys(
          (ways, nodeId) => R.propOr(false, nodeId, nodeIdLookup),
          nodeIdToWays
        );
      }),

    toNamedResponseAndInputs('nodeFeatures',
      ({nodeFeatures, mergedNodeIdToWays}) => R.filter(
        nodeFeature => R.compose(
          wayFeatures => isRealIntersection(wayFeatures, nodeFeature),
          // This will find a matching nodeFeature except in cases where the node is part of a way area.
          mergedNodeIdToWays => R.propOr([], nodeFeature.id, mergedNodeIdToWays)
        )(mergedNodeIdToWays)
      )(nodeFeatures)
    )
  )({nodeFeatures, nodeIdToWays, mergedNodeIdToWays});
};

/**
 * Returns true if the given nodeFeature connects at least two wayFeatures that have different street names.
 * Ways often end and start at a node where there isn't an intersection, and we don't want to treat these
 * nodes as intersections that break up blocks
 * @param {[Object]} wayFeatures List of way features which intersect the node
 * @param {Object} nodeFeature The node feature to test
 * @returns {Boolean} True if 1) There are no ways (maybe node of a way araa, in any case not enough info to say it's
 * not real)
 * 2) there are more than 2 ways,
 * 3) there at least two ways with different street names intersect the node or
 * 4) if the node point is not at the end of at least on way. This means it has to be a real intersection for Overpass
 * to have
 * returned it.
 */
export const isRealIntersection = (wayFeatures, nodeFeature) => R.anyPass([
  // Return true if there are no way features because it's a node of a way area. We never eliminate these
  wayFeatures => R.isEmpty(wayFeatures),
  // Either more than 2 ways
  wayFeatures => R.compose(R.lt(2), R.length)(wayFeatures),
  // The node point is not at the end of a way.
  wayFeatures => R.any(
    wayFeature => R.complement(nodeMatchesWayEnd)(wayFeature, nodeFeature),
    wayFeatures
  ),
  // Or more than 1 distinct way names.
  // If the way doesn't have a name default to the node id, which is to say pretend they have the same name.
  wayFeatures => R.compose(
    R.lt(1),
    R.length,
    R.uniq,
    R.map(
      wayFeature => wayFeatureNameOrDefault(nodeFeature.id, wayFeature)
    )
  )(wayFeatures)
])(wayFeatures);

/**
 * Given a partial block, meaning a block with one node and one or more connected directional ways, recursively
 * travel from the one node to find the closest node, or failing that the next connected way, or failing that
 * end because we have a dead end. This returns an object. The task is at task and the partialBlocks not consumed
 * at partialBlocks
 * @param {Object} osmConfig
 * @param nodeIdToWays
 * @param wayIdToNodes
 * @param wayEndPointToDirectionalWays
 * @param nodeIdToNodePoint
 * @param {Task<Result<Object>>} partialBlocks Contains nodes and ways of the partial block {nodes, ways}
 * @returns {Object} task that resolves to A complete block that has {
 * nodes: [one or more nodes],
 * ways: [one or more ways],
 * }. Nodes is normally two unless the block is a dead end. Ways are 1 or more, depending how many ways are need to
 * connect to the closest node (intersection).
 * partialBlocks are the blocks not consumed by the function
 */
const recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask = (osmConfig, {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint}, partialBlocks) => {
  // Take the first partialBlock. We only have 1 node until we finish, but we could have any number of ways
  const {nodes, ways} = R.head(partialBlocks);
  const remainingPartialBlocks = R.tail(partialBlocks);
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
  R.map(
    // TODO. just extracting the Result.value for now. We need to check for Result.Error
    result => ({block: result.value, partialBlocks}),
    _handleUnendedWaysAndRedundantNodesAndRemainingPartialBlocksResultTask(
      osmConfig,
      {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
      partialBlocks
:
  remainingPartialBlocks, nodes, trimmedWays, firstFoundNodeOfFinalWay, waysAtEndOfFinalWay;
)
)
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
      trimmedWay: trimWayToNodeObj(nodeObj, currentFinalWay)
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
 * Trims the given way to the index of the nodeObj inclusive
 * @param {Object} node The node
 * @param {Object} way The way to trip
 * @returns {Object} The way trimmed ot the node inclusive
 */
const trimWayToNode = (node, way) => {
  // Take the tail because trimWayToNodeObj expects the index based on the tail
  const index = R.indexOf(hashNodeFeature(node), R.tail(hashWayFeature(way)));
  return trimWayToNodeObj({node, index}, way);
};

/**
 * Trims the given way to the index of the nodeObj inclusive
 * @param {Object} nodeObj
 * @param {Number} nodeObj.index The node index of the node in the way
 * @param {Object} nodeObj.node The node
 * @param {Object} way The way to trip
 * @returns {Object} The way trimmed ot the node inclusive
 */
const trimWayToNodeObj = (nodeObj, way) => R.over(
  R.lensPath(['geometry', 'coordinates']),
  // Slice the coordinates to the found node index
  // (+2 because the index is based on remainingWayPoints and we want to be inclusive)
  coordinates => R.slice(0, R.prop('index', nodeObj) + 2, coordinates),
  way
);

/**
 *
 * Create a task to add the found node to the first node to complete the block and set the trimmed ways,
 * Alternatively if we got to a new way then we have to recurse and traverse that way until we find a node
 * or another way
 * Or if we have a dead end we need to query Overpass to get the dead end node. That's why this is a task
 * TODO instead of querying for the dead end node here, we could query for all dead end nodes right after we query Overpass,
 * @param osmConfig
 * @param context
 * @param context.nodeIdToWays Used to see if the ending node of a block is actually a real intersection.
 * @param context.wayIdToNodes
 * @param context.wayEndPointToDirectionalWays
 * @param context.nodeIdToNodePoint
 * @param {[Object]} partialBlocks. partialBlocks not used yet
 * @param {[Object]} trimmedWays, trimmed ways forming the block thus far
 * @param {[Object]} nodes, at least one node of the partial block
 * @param {Object} firstFoundNodeOfFinalWay If non-null, the intersection node that has been found to complete the block
 * @param {Object} waysAtEndOfFinalWay If the way ends without an intersection and another way begins, this is the way
 * and we must recurse. Otherwise this is null
 * @returns {Task<Result.Ok<Object>>} block with nodes with two nodes: nodes + firstFoundNodeOfFinalWay or a dead-end node
 * from Overpass or the result of recursing on waysAtEndOfFinalWay. ways are allways built up to form the complete block, trimmed
 * to fit the two nodes. Also returns the unused partialBlocks
 * @private
 */
const _handleUnendedWaysAndRedundantNodesAndRemainingPartialBlocksResultTask = (
  osmConfig,
  {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
  partialBlocks, nodes, trimmedWays, firstFoundNodeOfFinalWay, waysAtEndOfFinalWay
) => {

  return R.composeK(
    nodeAndTrimmedWayResult => resultToTaskNeedingResult(block => {
      // For debugging only
      _blockToGeojson(block);
      // If the block is complete because there are two nodes now, or failing that we didn't find a joining way,
      // just return the block, otherwise recurse to travel more to
      // reach a node along the new way, reach another way, or reach a dead end
      return R.ifElse(
        // If we added a new way, we recurse
        block => R.lt(R.length(trimmedWays), R.length(block.ways)),
        // If we aren't done recurse on the calling function, appending the block to the remainingPartialBlocks,
        // which will cause block to be processed
        block => recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask(
          osmConfig,
          {wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
          R.concat([block], partialBlocks)
        ),
        // Done
        block => of(block)
      )(block);
    })(nodeAndTrimmedWayResult),

    ({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay}) => R.cond([
      [
        // If we didn't get firstFoundNodeOfFinalWay or waysAtEndOfFinalWay, we have a dead end or need a node outside our search results
        // and need to query overpass for the missing intersection node or for a dead end the node at the end of the trimmedWays
        ({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay}) => R.and(
          R.isNil(firstFoundNodeOfFinalWay),
          R.isEmpty(waysAtEndOfFinalWay)
        ),
        // Find the dead-end node or intersection node outside the query results
        () => _deadEndNodeAndTrimmedWayOfWayResultTask(osmConfig, trimmedWays)
      ],
      [
        // If we got firstFoundNodeOfFinalWay but it's not a real intersection node, recurse. Nodes that are not
        // real intersections are nodes that simply connect two ways of the same street. It's allowable in OpenStreetmap
        // to start a new way without being at a true intersection, or it might be the intersection of a parking lot
        // or something we don't treat as a new block. We treat two (and only two) joining ways as a not real intersection
        // unless the street name changes
        ({firstFoundNodeOfFinalWay}) => R.and(
          firstFoundNodeOfFinalWay,
          R.not(
            isRealIntersection(
              R.prop(R.prop('id', firstFoundNodeOfFinalWay), nodeIdToWays),
              firstFoundNodeOfFinalWay
            )
          )
        ),
        () => {
          // TODO we need to find the partial block and remove it from the list
          const partialBlockOfNode = firstFoundNodeOfFinalWay
          return of(Result.Ok({
            node: R.concat(nodes, [firstFoundNodeOfFinalWay]),
            ways: R.concat(trimmedWays, waysAtEndOfFinalWay)
          }));
        }
      ],
      // We have a firstFoundNodeOfFinalWay or waysAtEndOfFinalWay, pass the node (which might be null) (TODO how can it be null?)
      [
        R.T,
        () => of(Result.Ok({
          node: R.concat(nodes, [firstFoundNodeOfFinalWay]),
          ways: R.concat(trimmedWays, waysAtEndOfFinalWay)
        }))
      ]
    ])({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay})
  )({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay});
};

/**
 *
 * Queries for the nodes of the given way and returns the node that matches the last point of the way (for dead ends)
 * @param {Object} osmConfig
 * @param {[Object]} ways The ways. We want to find the nodes of the final way
 * @returns {Task<Result<Object>>} {ways: the single way trimmed to the intersection or dead end, node: The intersection node or dead end}
 * @private
 */
const _deadEndNodeAndTrimmedWayOfWayResultTask = (osmConfig, ways) => {
  // We only process the last way. Any previous ways are prepended to our results
  const way = R.last(ways);
  // Task Result <way, intersectionNOdesByWayId, nodesByWayId> -> Task Result <ways, node>
  return R.composeK(
    // If we used an intersectionNode, query for its ways and recurse if this node isn't a real intersection
    // because it just connects two ways with the same street name
    ({way, waysAndNodeResult}) => resultToTaskWithResult(
      ({ways, node, intersectionNodesByWayId}) => {
        return R.ifElse(
          // If the node was from the intersectionNodesByWayId, get the ways of the node to see if it's a real intersection
          ({way, intersectionNodesByWayId}) => R.compose(
            R.contains(node),
            reqStrPathThrowing('response.features'),
            R.prop(way.id)
          )(intersectionNodesByWayId),
          // If it's an intersection node, find its ways (which we don't have because we thought it was a dead end),
          // then see if it's a real intersection node (not just connecting two ways of the same street). If it's
          // not a real intersection take the second way that is not way and recurse.
          // Diagram +------ - ----- where + is one end of the way and - is what we thought was an intersection,
          // but is actually just a continuation of the street with another way
          ({ways, node}) => R.composeK(
            isRealIntersectionResult => resultToTaskWithResult(
              ({realIntersection, waysOfIntersection}) => R.ifElse(
                R.identity,
                // Done
                () => of(Result.Ok({ways, node})),
                // Recurse with the new way added, possibly reversed to match the flow of the ways
                () => {
                  // Get the next way R.differenceWith will always be 1 new way, because unreal intersection
                  // connect our existing way with 1 other way (if there were more ways it would be a real intersection)
                  const nextWay = R.compose(
                    R.head,
                    // Remove the __reversed__ tag if it was created, we don't need it.
                    // We just want the way reversed if needed so we flow in the correct direction from way to nextWayFeature
                    nextWayFeature => removeReverseTagsOfOrderWayFeaturesOfBlock([nextWayFeature]),
                    // Reverse the nextWayFeature if needed to match the flow of ways. orderWayFeaturesOfBlock always reverses the first way if any, so list it first
                    nextWayFeature => R.head(orderWayFeaturesOfBlock(R.concat([nextWayFeature], ways))),
                    R.head,
                    R.differenceWith(
                      R.eqProps('id'),
                      waysOfIntersection
                    )
                  )(ways);
                  return _deadEndNodeAndTrimmedWayOfWayResultTask(
                    osmConfig,
                    R.concat(
                      ways,
                      [nextWay]
                    )
                  );
                }
              )(realIntersection)
            )(isRealIntersectionResult),
            result => resultToTaskNeedingResult(
              response => {
                const waysOfIntersection = response.features;
                return of({
                  realIntersection: isRealIntersection(waysOfIntersection, node),
                  waysOfIntersection
                });
              }
            )(result),
            ({node}) => osmResultTask({
                name: 'waysOfNodeQueryForDeadEnds',
                testMockJsonToKey: {node: node.id, type: 'waysOfNode'}
              },
              options => fetchOsmRawTask(options, waysOfNodeQuery(osmConfig, node.id))
            )
          )({ways, node}),
          ({ways, node}) => of(Result.Ok({ways, node}))
        )({way, intersectionNodesByWayId, ways, node});
      }
    )(waysAndNodeResult),
    // Find the first intersection node starting at the way or failing that
    // Find the first node starting at the way
    mapToNamedResponseAndInputs('waysAndNodeResult',
      ({way, nodesAndIntersectionNodesByWayIdResult}) => resultToTaskNeedingResult(
        ({intersectionNodesByWayId, nodesByWayId}) => {
          const endBlockNode = _resolveEndBlockNode(
            way,
            {intersectionNodesByWayId, nodesByWayId}
          );
          return of({
            // trim the way to the node
            ways: R.concat(
              // Keep the ways that aren't the final way
              R.init(ways),
              // Trim the final way
              [trimWayToNode(endBlockNode, way)]
            ),
            node: endBlockNode,
            intersectionNodesByWayId
          });
        }
      )(nodesAndIntersectionNodesByWayIdResult)
    ),
    // Find all nodes of the ways
    mapToNamedResponseAndInputs('nodesAndIntersectionNodesByWayIdResult',
      ({way}) => nodesAndIntersectionNodesByWayIdResultTask(
        osmConfig,
        {
          way: {
            response: {
              features: [way]
            }
          }
        }
      )
    )
  )({way});
};

/**
 * Tries to find the first intersection node of the way that is not the first way point. This is for resolving the
 * second node of blocks where that second node wasn't part of the query results because of the boundary of the query
 * results. If it doesn't find tha intersection node it returns the last node of the way, assuming the way is
 * instead a dead end block
 * @param {Object} way
 * @param {Object} nodes
 * @param {Object} nodes.intersectionNodesByWayId Keyed by one way id and valued by the intersection nodes
 * of the way
 * @param {Object} nodes.nodesByWayId
 * @private
 */
const _resolveEndBlockNode = (way, {intersectionNodesByWayId, nodesByWayId}) => {
  // There are too many of these to mock the results in tests
  const lastPointOfWay = R.last(reqStrPathThrowing('geometry.coordinates', way));
  const wayCoords = hashWayFeature(way);

  // Try to find an intersection node
  const intersectionNode = R.compose(
    // Take the first non-null
    R.head,
    // Remove nulls
    compact,
    featurePoints => {
      const nodeCoordToFeature = R.fromPairs(R.map(
        featurePoint => [
          hashNodeFeature(featurePoint),
          featurePoint
        ],
        featurePoints
      ));
      return R.map(
        // Get the node feature that matches the way coordinate if any
        wayCoord => R.propOr(null, wayCoord, nodeCoordToFeature),
        // Find the first node that isn't the first way point
        R.tail(wayCoords)
      );
    },
    ({response}) => reqStrPathThrowing('features', response),
    // Only one way response
    // <wayId: <response, query>> -> <response, query>
    R.head,
    // Remove way ids keys
    R.values
  )(intersectionNodesByWayId);
  if (intersectionNode) {
    return intersectionNode;
  }

  // If we couldn't find an intersection node, we must have a dead end. Find the last node.
  return R.compose(
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
  )(nodesByWayId);
};

/**
 * Construct one or more Overpass queries to get all eligible highway ways or nodes for area of the given osmId or optionally
 * geojsonBOunds
 * @param {Object} osmConfig
 * @param {String} type 'way' or 'node' We have to do the queries separately because overpass combines the geojson
 * results in buggy ways
 * @param {String} [osmId] OSM id to be used to constrain the area of the query. This id corresponds
 * to a neighborhood or city. It can only be left undefined if geojsonBounds is defined
 * @param {Object} data Location data optionally containing OSM overrides
 * @param {Object} [data.osmOverrides] Optional overrides
 * @param {[Object]} [geojsonBounds] Optional. Bounds to use instead of the area of the osmId
 * @returns {string} The complete Overpass query string
 */
const _constructHighwayQueriesForType = (osmConfig, {type}, {osmId, geojson}) => {

  if (R.not(R.or(osmId, geojson))) {
    throw Error("Improper configuration. osmId or geojsonBounds must be non-nil");
  }

  // The Overpass Area Id is based on the osm id plus this Overpass magic number
  // Don't calculate this if we didn't pass an osmId
  const areaId = R.when(R.identity, osmIdToAreaId)(osmId);

  // If the we are filtering by geojson features, we need at least one query per feature. Large features
  // are broken down into smaller square features that are each converted to a bbox for querying Overpass
  const locationWithSingleFeatures = R.cond([
    [
      ({geojson}) => geojsonFeaturesHaveShape(geojson),
      ({areaId, geojson}) => R.map(
        feature => ({areaId, geojson: {features: [feature]}}),
        // Get 1km squares of the area
        extractSquareGridFeatureCollectionFromGeojson({cellSize: 1, units: 'kilometers'}, geojson).features
      )
    ],
    // If feature properties have radii split them up into features but leave them alone. Each feature
    // has a properties.radius that instructs OSM what around:radius value to use
    [({geojson}) => geojsonFeaturesHaveRadii(geojson),
      ({areaId, geojson}) => R.map(
        feature => ({areaId, geojson: {features: [feature]}}),
        geojson.features
      )
    ],
    // Just put the location in an array since we'll search for it by areaId
    [R.prop('areaId'), Array.of],
    // This should never happen
    [R.T, () => {
      throw new Error('Cannot query for a location taht lacks both an areaId and geojson features with shapes or radii');
    }]
  ])({areaId, geojson});

  // Return the query for each feature that we have created
  return R.map(
    locationWithSingleFeature => {
      // We generate different queries based on the parameters.
      // Rather than documenting the generated queries here it's better to run the tests and look at the log
      const query = `
    ${
        // Declare the way variables if needed
        _createQueryWaysDeclarations(osmConfig, locationWithSingleFeature)
      }
    ${
        // Declare the node variables
        _createQueryNodesDeclarations(type)
      }
    ${
        _createQueryOutput(type)
      }`;
      return query;
    },
    locationWithSingleFeatures
  );
};

/**
 * Creates OSM Overpass query syntax to declare ways for a given OSM area id or geojsonBounds.
 * @param {Object} osmConfig
 * @param {Object} locationWithSingleFeature
 * @param {Number} locationWithSingleFeature.areaId Represents an OSM neighborhood or city
 * @param {Object} [locationWithSingleFeature.geojson] Geojson with one feature. If specifies this limits
 * the query to the bounds of the geojson
 * @returns {String} Overpass query syntax string that declares the way variable
 * @private
 */
const _createQueryWaysDeclarations = v((osmConfig, {areaId, geojson}) => {
  return R.cond([
    [
      ({geojson}) => geojsonFeaturesHaveShapeOrRadii(geojson),
      ({geojson}) => {
        return R.map(
          feature => {
            const bounds = R.compose(turfBboxToOsmBbox, bbox)(feature);
            // Include an area filter if specified in addition to the bbox
            const areaFilterStr = R.when(
              R.identity,
              areaId => `(area:${areaId})`
            )(areaId || '');
            // Filter by the bounds and optionally by the areaId
            const wayQuery = `way(${bounds})${areaFilterStr}${configuredHighwayWayFilters(osmConfig)}`;
            return `${wayQuery}->.ways;`;
          },
          strPathOr([], 'features', geojson)
        );
      }
    ],
    // Just search by area. Name the result ways1 as if there is one geojson feature
    [R.T, ({areaId}) => {
      const wayQuery = `way(area:${areaId})${configuredHighwayWayFilters(osmConfig)}`;
      return `${wayQuery}->.ways;`;
    }]
  ])({areaId, geojson});
}, [
  ['osmConfig', PropTypes.shape().isRequired],
  ['locationWithSingleFeature', PropTypes.shape({
    areaId: PropTypes.string,
    geojson: PropTypes.shape()
  }).isRequired]
], '_createQueryWayDeclarations');

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
