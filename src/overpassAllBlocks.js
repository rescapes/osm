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
  filterWithKeys,
  traverseReduceWhile
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
  orderWayFeaturesOfBlock, waysByNodeIdTask, _blocksToGeojson
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
  geojsonFeaturesHaveShape, geojsonFeaturesHaveRadii, wayFeatureNameOrDefault, wayFeatureName
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
  const [ways, nodes] = R.map(reqStrPathThrowing('response.features'), [way, node]);
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
        return ({
          // Put the OSM results together
          results: R.merge(block, {nodesToIntersectingStreets}),
          // Add the intersections to the location and return it
          location: R.merge(
            location,
            {
              intersections: R.values(nodesToIntersectingStreets)
            }
          )
        });
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
    // TODO remove. We shouldn't have duplicates anymore
    mapToNamedResponseAndInputs('hashToBestBlock',
      ({blocks}) => of(
        R.reduceBy(
          (otherBlock, block) => {
            // TODO if we get in here we did something wrong
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
      ({blocksResult, nodeIdToWays}) => {
        // TODO just extracting the value from Result.Ok here.
        // Change to deal with Result.Error
        const blocks = blocksResult.value;
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
    mapToNamedResponseAndInputs('blocksResult',
      // For each block travel along it and accumulate connected ways until we reach a node or dead end
      // If a node is reached trim the last way to end at that node
      ({nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, partialBlocks}) => {
        // Hash the partial blocks independent of direction so we can elminate twin partialBlocks whenever
        // on is processed.
        const hashToPartialBlocks = R.reduceBy(
          (a, b) => R.concat(a, [b]),
          [],
          block => _hashBlock(block),
          partialBlocks
        );
        return _traversePartialBlocksToBuildBlocks(
          osmConfig,
          {
            nodeIdToWays,
            wayIdToNodes,
            wayEndPointToDirectionalWays,
            nodeIdToNodePoint,
            hashToPartialBlocks
          },
          partialBlocks
        );
      }
    ),
    // Creates helpers and partialBlocks, which are blocks with a node and one directional way
    // from which we'll complete all our blocks. Note that this also trims nodes to get rid of
    // fake intersections (where the way changes but it's not really a new street)
    // Returns {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint, partialBlocks, nodes}
    ({ways, nodes, location}) => of(_createPartialBlocks({ways, nodes, location}))
  )({ways, nodes, referenceNodeIdToWays, location});
};

/**
 * Given partial blocks, meaning blocks with a way intersection node and a way segment, build up complete blocks. The partial blocks
 * duplicated for each way segment starting at either node with ways ordered from that node toward the next.
 * Illustration. The following is one way segment represented as two partial blocks. The first includes the
 * node on the left and the way nodes in the direction of the arrow. The second includes the node on the right
 * with the same way nodes in the direction of the arrow.
 *  n ---->(n)
 * (n)<---- n
 * Partial blocks are each followed beginning at the first node of the first way in partial blocks. They are processed
 * sequentially with the caveat that once a partial block is consumed in one direction it's twin is removed from the
 * remaining list. The other caveat is that some node intersections are not true intersections, rather places where
 * ways change but the street is the same. In this case we continue building the block until we get to a true
 * intersection node and we remove the traversed partial blocks to prevent later traversal.
 *
 * The end result is a complete set of blocks, where a block has at least two nodes and at least one way in between
 * those nodes. Multiple ways within a block are ordered but the direction is arbitrary based on which partial block
 * was found first.
 *
 * Another exception is dead end ways and ways whose final intersection node was not part of the query results.
 * When a dead end is encountered, we query the way to find out if actually has an intersection node that wasn't
 * part of the original query results. Then we use that result. If the way is truly a dead end, we use the way
 * as node the that the block has a node at both ends of the way(s)
 * @param {Object} osmConfig used for query settings
 * @param {Object} context Context for linking the nodes and ways
 * @param {Object} context.nodeIdToWays
 * @param {Object} context.wayIdToNodes
 * @param {Object} context.wayEndPointToDirectionalWays
 * @param {Object} context.nodeIdToNodePoint
 * @param {Object} context.hashToPartialBlocks Same as partialBlocks keyed by a direction agnostic hash and valued by
 * the pair of partialBlocks that are the same block in opposite directions. These don't need to decrease as
 * partialBlocks are consumed. They are just for reference so we know which blocks are pairs
 * @param {Object} partialBlocks
 * @returns {[Object]} The blocks
 * @private
 */
const _traversePartialBlocksToBuildBlocks = (
  osmConfig,
  {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, hashToPartialBlocks},
  partialBlocks
) => {
  // Block b:: [b] -> Task Result [b]
  // Wait in parallel but bucket tasks to prevent stack overflow
  return mapMDeep(2,
    ({blocks}) => {
      // Remove the empty partialBlocks, just returning the blocks
      return blocks;
    },
    // traverseReduceWhile allows us to chain tasks together that rely on the result of the previous task
    // since we can't know how many tasks we need to use up all the partialBlocks, we simply give it
    // the chance to run R.length(partialBlocks) times, knowing we might not need that many before we quit
    // Each traverseReduceWhile is called it will create a complete block. The block might consist of multiple
    // partialBlocks if the node between the partialBlocks wasn't a real intersection node, which we only
    // discover whilst traversing
    traverseReduceWhile(
      {
        accumulateAfterPredicateFail: false,
        predicate: ({value: {partialBlocks}}, x) => {
          // Quit if we have no more partial blocks
          return R.length(partialBlocks);
        },
        // Chain to chain the results of each task. R.map would embed them within each other
        mappingFunction: R.chain,
        monadConstructor: of
      },
      ({value: {partialBlocks, blocks}}, x) => {
        return mapMDeep(2,
          // partialBlocks are those remaining to be processed
          // block is the completed block that was created with one or more partial blocks
          ({partialBlocks, block}) => {
            return {partialBlocks, blocks: R.concat(blocks, [block])};
          },
          // Call this R.length(partialBlocks) times until there are no partialBlocks left.
          // At most we call this R.length(partialBlocks) times, but if some partialBlocks join
          // into one we call it fewer times
          _recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask(
            osmConfig,
            {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, hashToPartialBlocks},
            partialBlocks
          )
        );
      },
      of(Result.Ok({partialBlocks, blocks: []})),
      // Just need to call a maximum of partialBlocks to process them all
      R.times(of, R.length(partialBlocks))
    )
  );
};

/**
 * Creates a bunch of data structures and ultimately the partialBlocks, which are blocks that
 * have a node and one way, where all are unique pairs of a node and directional way.
 * Also returns the data structures for further use
 * @param {[Object]} ways All the way features of the sought blocks
 * @param {[Object]} nodes All the node features of the sought blocks
 * @param {Object} [referenceNodeIdToWays] Optional Only needed for narrow street queries where we need to know the ways
 * of the node features so we know if they are real intersections or not. This is keyed by node id and valued by way features
 * @param {Object} location Location defining the bounds of all blocks
 * @returns {Object} {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint, partialBlocks, nodes} where
 * partialBlocks is the main return value. partialBlocks are represented for BOTH directions of each way, starting
 * at each node of the way.
 * @private
 */
const _createPartialBlocks = ({ways, nodes, location}) => {
  return R.compose(
    toNamedResponseAndInputs('partialBlocks',
      ({wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint}) => _buildPartialBlocks(
        {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint}
      )
    ),
    ({ways, nodes}) => R.merge({ways, nodes}, _calculateNodeAndWayRelationships(({ways, nodes})))
  )({ways, nodes, location});
};

/**
 * Creates data structures that relate the nodes and ways
 * @param {[Object]} ways Way features
 * @param {[Object]} nodes Node features
 * @returns {Object} nodeIdToNode, nodePointToNode, nodeIdToNodePoint, wayIdToWay, wayIdToNodes, wayIdToWayPoints, nodeIdToWays, wayEndPointToDirectionalWays
 * @private
 */
const _calculateNodeAndWayRelationships = ({ways, nodes}) => {
  return R.compose(
    toNamedResponseAndInputs('wayEndPointToDirectionalWays',
      ({ways, wayIdToWayPoints, nodePointToNode}) => _wayEndPointToDirectionalWays({
        ways,
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
      ({ways}) => R.fromPairs(R.map(
        wayFeature => [
          R.prop('id', wayFeature),
          hashWayFeature(wayFeature)
        ],
        ways
      ))
    ),
    toNamedResponseAndInputs('wayIdToNodes',
      // Hash all way ids by intersection node if any waynode matches or
      // is an area-way (pedestrian area) within 5m  <-- TODO
      ({nodePointToNode, ways}) => {
        return R.fromPairs(R.map(
          wayFeature => [R.prop('id', wayFeature), findMatchingNodes(nodePointToNode, wayFeature)],
          ways
        ));
      }
    ),
    toNamedResponseAndInputs('wayIdToWay',
      // way id to way
      ({ways}) => R.indexBy(
        R.prop('id'),
        ways
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
      ({nodes}) => R.indexBy(
        nodeFeature => hashNodeFeature(nodeFeature),
        nodes
      )
    ),
    toNamedResponseAndInputs('nodeIdToNode',
      // Hash intersection nodes by id. These are all intersections
      ({nodes}) => R.indexBy(
        R.prop('id'),
        nodes
      )
    )
  )({ways, nodes});
};

/**
 * Adds new block data to the data computed by _calculateNodeAndWayRelationships. This is used when
 * we have to query for more ways and nodes and add them to our existing context
 * TODO this isn't comprehensive. If a newly queried way/node intersects another node in our context,
 * we won't detect it here. We could run _calculateNodeAndWayRelationships on everything
 * if that's problematic, but with a performance hit
 * @param {Object} context
 * @param {Object} context. nodeIdToWays
 * @param {Object} context.wayIdToNodes
 * @param {Object} context.wayEndPointToDirectionalWays
 * @param {Object} nodeIdToNodePoint
 * @param {Object} block Block with new ways and nodes. Duplicates of old data is fine
 * @returns {Object} Merged {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint}
 * @private
 */
const _mergeInNewNodeAndWayRelationships = ({nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint}, block) => {
  return R.mergeWith(
    // For each matching top level key, merge and concat+unique arrays or take first for nodeIdToNodePoint
    R.mergeWith(
      (a, b) => R.when(
        Array.isArray, a => R.compose(
          R.uniqBy(R.prop('id')),
          R.concat
        )(a, b)
      )(a)
    ),
    {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
    R.pick(
      ['nodeIdToWays', 'wayIdToNodes', 'wayEndPointToDirectionalWays', 'nodeIdToNodePoint'],
      _calculateNodeAndWayRelationships(block)
    )
  );
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
 * @param {Object} context
 * @param context.nodeIdToWays
 * @param context.wayIdToNodes
 * @param context.wayEndPointToDirectionalWays
 * @param context.nodeIdToNodePoint
 * @param context.hashToPartialBlocks
 * @param {[Object]} partialBlocks Contains nodes and ways of the partial block {nodes, ways}
 * @returns {Object} task that resolves to A complete block that has {
 * nodes: [one or more nodes],
 * ways: [one or more ways],
 * }. Nodes is normally two unless the block is a dead end. Ways are 1 or more, depending how many ways are need to
 * connect to the closest node (intersection).
 * partialBlocks are the blocks not consumed by the function
 */
const _recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask = (
  osmConfig,
  {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, hashToPartialBlocks},
  partialBlocks
) => {
  // Take the first partialBlock whose first node we know is not a fake intersection.
  // A fake intersection is a node where two ways of the same street meet but now other block meets
  // We don't want to start at fake intersections because this sends us one direction complete a block
  // when the other direction should also be part of the block. If there is no such partialBlock then
  // take the first block.
  //
  // This might be a partial block we've never processed or one that we've already
  // built up and put on stop of the partialBlocks stack.
  const partialBlock = R.defaultTo(
    R.head(partialBlocks),
    R.find(
      partialBlock => {
        const node = reqStrPathThrowing('nodes.0', partialBlock);
        return isRealIntersection(nodeIdToWays(R.prop('id', node)), node);
      },
      partialBlocks
    )
  );
  const matchingPartialBlocks =_matchingPartialBlocks(hashToPartialBlocks, partialBlock);
  const remainingPartialBlocks = R.without(matchingPartialBlocks, partialBlocks);
  const {nodes, ways} = partialBlock;
  _blockToGeojson({nodes, ways});
  _blocksToGeojson(remainingPartialBlocks);
  // Get the current final way of the partial block. This is the way we will process
  const way = R.last(ways);
  // Get the remaining way points, excluding the first point that the node is on
  const tailWayPoints = R.compose(
    R.tail,
    way => hashWayFeature(way)
  )(way);

  // Get the first node along the way, excluding the starting point.
  // If the way is a loop with no other nodes, it could be the same node we started with
  // Trim the way down to this node. If needed.
  // TODO I don't know if trimming is ever needed since split partial blocks at the nodes
  const {firstFoundNodeOfWay, trimmedWay} = _findFirstNodeOfWayAndTrimWay(
    {wayIdToNodes, nodeIdToNodePoint},
    way,
    tailWayPoints
  );
  // Replace the last way of ways with the trimmedWay if it was found
  const trimmedWays = R.concat(R.init(ways), [trimmedWay || R.last(ways)]);

  // TODO I don't think this ever happens. We always have a node separating ways. Consider removing
  // If no node was found, look for the ways at the of the currentFinalWay
  // There might be a way or we might be at a dead-end where there is no connecting way
  // The found ways points will flow in the correct direction since wayEndPointToDirectionalWays directs
  // ways from the end point
  const waysAtEndOfFinalWay = R.ifElse(
    R.isNil,
    () => R.compose(
      // Minus the current final way itself. Use the id for comparison because we don't want a trimmed
      // way to evaluate to be not equal to the full version of the same way
      ways => R.reject(R.eqProps('id', way), ways),
      // Any way touching the end point of the current final way
      endPoint => R.propOr([], endPoint, wayEndPointToDirectionalWays),
      // Get the last point of the current final way
      wayPoints => R.last(wayPoints)
    )(tailWayPoints),
    // If we have a node, we don't care about the connecting way at this point
    () => []
  )(firstFoundNodeOfWay);

  // Create a task to add the found node to the first node to complete the block and set the trimmed ways,
  // Alternatively if we got to a new way then we have to recurse and traverse that way until we find an intersection node
  // Or if we have a dead end we need to query Overpass to get the dead end node.
  return _completeBlockOrHandleUnendedWaysAndFakeIntersectionNodesResultTask(
    osmConfig,
    {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, hashToPartialBlocks},
    {partialBlocks: remainingPartialBlocks, firstFoundNodeOfFinalWay: firstFoundNodeOfWay, waysAtEndOfFinalWay},
    {nodes, ways: trimmedWays}
  );
};

/**
 * Searches the given way and its remainingWayPoints (not first point) to find the first intersection node along it.
 * @param {Object} context
 * @param {Object} context.wayIdToNodes Lookup of way id to its nodes
 * @param {Object} context.nodeIdToNodePoint Lookup of node it to its point
 * @param {Object} way The way being searched
 * @param {[Object]} tailWayPoints The remaining points of the way or all the points if the
 * way hasn't been reduced by previous traversal
 * @returns {Object} Returns {firstFoundNodeOfWay, trimmedWay}, the node and the way trimmed to that node
 * If it doesn't find a node because we are at dead end then both values are returned as null.
 * @private
 */
const _findFirstNodeOfWayAndTrimWay = ({wayIdToNodes, nodeIdToNodePoint}, way, tailWayPoints) => R.compose(
  // Chop the way at the node intersection
  nodeObj => R.ifElse(
    R.identity,
    nodeObj => ({
      firstFoundNodeOfWay: R.prop('node', nodeObj),
      // Shorten the way points to the index of the node
      trimmedWay: trimWayToNodeObj(nodeObj, way)
    }),
    // Null case
    () => ({
      firstFoundNodeOfWay: null,
      trimmedWay: null
    })
  )(nodeObj),
  // Take the closest node
  nodeObjs => R.head(nodeObjs),
  nodeObjs => R.sortBy(R.prop('index'), nodeObjs),
  nodeObjs => {
    // Debug view of the block's geojson
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
        nodePoint => R.indexOf(nodePoint, tailWayPoints),
        nodeId => R.prop(nodeId, nodeIdToNodePoint),
        node => R.prop('id', node)
      )(node)
    }),
    nodes
  ),
  // Get the nodes of the way
  wayId => reqStrPathThrowing(
    wayId,
    wayIdToNodes
  ),
  way => R.prop('id', way)
)(way);

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
 * @param {Object} osmConfig
 * @param {Object} context Ways and node context of all of the search area
 * @param {Object} context.nodeIdToWays Used to see if the ending node of a block is actually a real intersection.
 * @param {Object} context.wayIdToNodes
 * @param {Object} context.wayEndPointToDirectionalWays
 * @param {Object} context.nodeIdToNodePoint
 * @param {Object} context.hashToPartialBlocks
 * @param {Object} blockContext Ways and node context of the immediate block being resolved
 * @param {[Object]} blockContext.partialBlocks. partialBlocks not used yet. This does not include the current block's way
 * @param {Object} blockContext.firstFoundNodeOfFinalWay If non-null, the intersection node that has been found to complete the block
 * It's possible that this isn't a real intersection node, simply a node where the ways change but no other way
 * intersects. In this case we continue with the other way connected to this node
 * @param {Object} blockContext.waysAtEndOfFinalWay If the way ends without an intersection and another way begins, this is the way
 * and we must recurse. TODO I believe this case is covered by firstFoundNodeOfFinalWay where that node is not
 * a real intersection. So we might not need this value*
 * @param {Object} block The current block being built up
 * @param {[Object]} block.ways, trimmed ways forming the block thus far
 * @param {[Object]} block.nodes, at least one node of the partial block
 * @returns {Task<Result.Ok<Object>>} {block: {ways, nodes}, partialBlocks}
 * block with {nodes, ways}. nodes  with two or more nodes: nodes + firstFoundNodeOfFinalWay or a dead-end node
 * from Overpass or the result of recursing on waysAtEndOfFinalWay. ways are always built up to form the complete block, trimmed
 * to fit the two nodes.
 * Also returns the unused partialBlocks
 * @private
 */
const _completeBlockOrHandleUnendedWaysAndFakeIntersectionNodesResultTask = (
  osmConfig,
  {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, hashToPartialBlocks},
  {partialBlocks, firstFoundNodeOfFinalWay, waysAtEndOfFinalWay},
  {nodes, ways}
) => {
  return R.composeK(
    nodeAndTrimmedWayResult => resultToTaskWithResult(
      ({block, remainingPartialBlocks}) => {
        // If the block is complete because there are two nodes now, or failing that we didn't find a joining way,
        // just return the block, otherwise recurse to travel more to
        // reach a node along the new way, reach another way, or reach a dead end
        return R.ifElse(
          // If we added a new way, we recurse.
          block => R.lt(R.length(ways), R.length(block.ways)),
          // If we aren't done recurse on the calling function, appending the block to the remainingPartialBlocks,
          // which will cause block to be processed
          // We don't necessarily need to add anything else, but we have to check that it's complete
          block => {
            return _recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask(
              osmConfig,
              // Merge the new way/node relationships into the existing
              _mergeInNewNodeAndWayRelationships({
                  nodeIdToWays,
                  wayIdToNodes,
                  wayEndPointToDirectionalWays,
                  nodeIdToNodePoint
                },
                block
              ),
              R.concat([block], remainingPartialBlocks)
            );
          },
          // Done building the block
          block => of(Result.Ok({block, partialBlocks: remainingPartialBlocks}))
        )(block);
      }
    )(nodeAndTrimmedWayResult),

    // Use the context and blockContext to resolve the next part of the block. This might involve
    // going to the server for more data to resolve dead ends
    ({osmConfig, firstFoundNodeOfFinalWay, waysAtEndOfFinalWay, partialBlocks, hashToPartialBlocks, nodes, ways}) => {
      return _choicePointProcessPartialBlockResultTask(
        osmConfig,
        {nodeIdToWays, hashToPartialBlocks},
        {firstFoundNodeOfFinalWay, waysAtEndOfFinalWay, partialBlocks},
        {nodes, ways}
      );
    }
  )({
    osmConfig,
    firstFoundNodeOfFinalWay, waysAtEndOfFinalWay, nodeIdToWays, hashToPartialBlocks,
    partialBlocks,
    nodes, ways
  });
};

/**
 * Choice point to figure out how to process the the block.
 * We have 3 conditions:
 * 1) "dead-end" way. There is no node information about the end of the way in our context so we need to query
 * OSM to see if this is actually a dead end way or we just need to get more nodes/ways from the server. If
 * it is a dead-end we end the block with the node that is at the end of the way. Otherwise we continue constructing
 * the block with the matching node and ways that come back from the serverr
 * 2) We have firstFoundNodeOfFinalWay but it's not a real intersection, it's simply the node connecting two
 * ways of the same street where there is no intersection. In this case we want to continue along the connecting
 * way
 * 3) Otherwise if we have firstFoundNodeOfFinalWay or waysAtEndOfFinalWay, we append firstFoundNodeOfFinalWay to
 * the blocks nodes and waysAtEndOfFinalWay to the ways and are done with the block. TODO I don't remember
 * what the case for waysAtEndOfFinalWay is anymore.
 * @param osmConfig
 * @param {Object} context
 * @param {Object} context.nodeIdToWays
 * @param {Object} context.hashToPartialBlocks
 * @param {Object} blockContext
 * @param {Object} blockContext.firstFoundNodeOfFinalWay
 * @param {Object} blockContext.waysAtEndOfFinalWay
 * @param {[Object]} blockContext.partialBlocks
 * @param {Object} block
 * @param {[Object]} block.nodes
 * @param {[Object]} block.ways
 * @returns {Task<Result<Object>>} Returns a task resolving to a Result.Ok containing the constructed block
 * {block: {ways, nodes}, remainingPartialBlocks: {[Object]}}}
 * and the remainingPartialBlocks, meaning the partialBlocks that weren't needed to construct the rest of this block.
 * @private
 */
const _choicePointProcessPartialBlockResultTask = (
  osmConfig,
  {nodeIdToWays, hashToPartialBlocks},
  {firstFoundNodeOfFinalWay, waysAtEndOfFinalWay, partialBlocks},
  {nodes, ways}
) => {
  return R.cond([
    [
      // If we didn't get either or firstFoundNodeOfFinalWay or waysAtEndOfFinalWay, we have a dead end or need a node outside our search results
      // and need to query overpass for the missing intersection node or for a dead end the node at the end of the trimmedWays
      ({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay}) => R.and(
        R.isNil(firstFoundNodeOfFinalWay),
        // TODO I don't think we ever have this case. Consider removing
        R.isEmpty(waysAtEndOfFinalWay)
      ),
      // Find the dead-end node or intersection node outside the query results
      () => _deadEndNodeAndTrimmedWayOfWayResultTask(osmConfig, partialBlocks, {nodes, ways})
    ],
    [
      // If we got firstFoundNodeOfFinalWay but it's not a real intersection node, add the node and the connected
      // way to the block and we return it so we can continue processing. If we do this we remove the partial block
      // (in both directions) of the connected way from our partial block list so we don't process it again later.
      // Fake intersections are nodes that simply connect two ways of the same street. It's allowable in OpenStreetmap
      // to start a new way without being at a true intersection, or it might be the intersection of a parking lot
      // or something we don't treat as a new block. We treat two (and only two) joining ways as a not real intersection
      // unless the street name changes
      ({firstFoundNodeOfFinalWay}) => R.both(
        R.identity,
        firstFoundNodeOfFinalWay => R.not(
          isRealIntersection(
            R.prop(R.prop('id', firstFoundNodeOfFinalWay), nodeIdToWays),
            firstFoundNodeOfFinalWay
          )
        )
      )(firstFoundNodeOfFinalWay),
      () => of(
        Result.Ok(
          _extendBlockToFakeIntersectionPartialBlock(
            {hashToPartialBlocks},
            partialBlocks,
            firstFoundNodeOfFinalWay,
            {nodes, ways}
          )
        )
      )
    ],
    // We have a firstFoundNodeOfFinalWay or waysAtEndOfFinalWay, pass the node (which might be null) (TODO how can it be null?)
    [
      R.T,
      () => of(Result.Ok({
        block: {
          // Add firstFoundNodeOfFinalWay if it isn't already added
          nodes: R.compose(
            R.uniqBy(R.prop('id')),
            R.concat(nodes)
          )([firstFoundNodeOfFinalWay]),
          ways: R.concat(ways, waysAtEndOfFinalWay)
        },
        remainingPartialBlocks: partialBlocks
      }))
    ]
  ])({firstFoundNodeOfFinalWay, waysAtEndOfFinalWay});
};

/**
 * Extends a block to the other way of a fake intersection node.
 * @param {Object} config
 * @param config.hashToPartialBlocks
 * @param {[Object]} partialBlocks
 * @param {Object} firstFoundNodeOfFinalWay
 * @param {Object} block
 * @param block.nodes
 * @param block.ways
 * @returns {Object} The given block extended to include the way of the partialBlock that connects to the fake
 * intersection node, firstFoundNodeOfFinalWay. Also returns remainingPartialBlocks with the matching partialBlock
 * removed from partialBlocks. The twin partialBlock will also be removed if one exists.
 * @private
 */
const _extendBlockToFakeIntersectionPartialBlock = (
  {hashToPartialBlocks},
  partialBlocks,
  firstFoundNodeOfFinalWay,
  {nodes, ways}
) => {
  // For fake intersections, we expect a pair of partialBlocks representing the second way that isn't
  // the way we're currently processing. We need to use this way to extend our block and also eliminate
  // the pair of partialBlocks from further processing.
  // Find the partial block of firstFoundNodeOfFinalWay. We'll only match the partial block that actually
  // contains this node. It's twin (if it exists) will start with node on the other side and flow toward
  // this node.
  // If firstFoundNodeOfFinalWay was found by extra queries it won't be in partialBlocks, so just ignore
  // TODO we should never get here with a fake intersection node that isn't from the original partialBlocks set
  // because we can't extend the block with a new way. This case is handled in the dead end code
  const partialBlockOfNode = R.find(
    partialBlock => R.compose(
      R.length,
      partialBlock => R.contains(
        R.prop('id', firstFoundNodeOfFinalWay),
        R.map(R.prop('id'), partialBlock.nodes)
      )
    )(partialBlock),
    partialBlocks
  );
  // Get the twin partial block if it exists
  const matchingPartialBlocks = _matchingPartialBlocks(hashToPartialBlocks, partialBlockOfNode);

  return of(Result.Ok({
    block: {
      // Add firstFoundNodeOfFinalWay if it isn't already there
      // TODO firstFoundNodeOfFinalWay has already been added if we are being
      // called after extending a 'dead-end' way. This might be ok or might be the result of bad logic
      nodes: R.compose(
        R.uniqBy(R.prop('id')),
        R.concat(nodes)
      )([firstFoundNodeOfFinalWay]),
      // Add the partialBlockOfNode ways if there is a partialBlockOfNode
      ways: R.concat(ways, strPathOr([], 'ways', partialBlockOfNode))
    },
    // Remove the matchingPartialBlocks
    remainingPartialBlocks: R.without(matchingPartialBlocks, partialBlocks)
  }));
};

/**
 * Given a partial Block uses hashToPartialBlocks to find the twin partial block and returns both.
 * If the twin isn't found it just returns partialBlock
 * @param hashToPartialBlocks
 * @param partialBlock
 * @returns {[Object]} One or two partialBlocks
 * @private
 */
const _matchingPartialBlocks = (hashToPartialBlocks, partialBlock) => {
  R.defaultTo(
    // Default to just the partialBlock or null
    R.when(R.identity, Array.of)(partialBlock),
    // Find the twin block and the partial block in hashToPartialBlocks
    R.when(
      R.identity,
      partialBlockOfNode => R.prop(
        _hashBlock(partialBlockOfNode),
        hashToPartialBlocks
      )
    )(partialBlock)
  );
};

/**
 *
 * Queries for the nodes of the given way and returns the node that matches the last point of the way (for dead ends).
 * If a matching node is found, we do the following
 * 1) The node is a real intersection, meaning it represents more than just two ways of the same street. Then
 * we have our final node and are done with the block
 * 2) The node is not a real intersection.
 * @param {Object} osmConfig
 * @param {[Object]} partialBlocks
 * @param {Object} block The block we are querying the end of to see if there are more nodes we don't know about
 * @param {[Object]} block.ways The ways
 * @param {[Object]} block.nodes The nodes. We want to find the nodes of the final way
 * @returns {Task<Result<Object>>} {ways: the single way trimmed to the intersection or dead end, nodes: The intersection nodes or dead end}
 * @private
 */
const _deadEndNodeAndTrimmedWayOfWayResultTask = (osmConfig, partialBlocks, {nodes, ways}) => {
  // We only process the last way. Any previous ways are prepended to our results
  const way = R.last(ways);
  const previousWays = R.init(ways);

  // Task Result <way, intersectionNOdesByWayId, nodesByWayId> -> Task Result <ways, node>
  return R.composeK(
    // Add the partialBlocks to the result
    () => mapMDeep(2,
      block => ({
        block,
        // Return the remaining partialBlocks so we know what has been processed
        // TODO it's slightly possible that the way that was added as the result of a fake dead end
        // could overlap with way in partialBlocks, so we could remove that way here. Normally
        // thought such a way was not part of our partialBlocks, otherwise we wouldn't be in
        // _deadEndNodeAndTrimmedWayOfWayResultTask
        remainingPartialBlocks: partialBlocks
      })
    ),

    // If we used intersectionNode at the end of the way, not a regular node,
    // query for its ways to find out if its a real intersection. If it just connects two ways with the same street name,
    // we aren't at the end of the block.
    // Thus we either 1) return a completed block with a real intersection or non intersection node or
    // 2) Return the block with the fake intersection node and next way to indicate that we need to keep constructing
    // the block
    ({endedBlockResult}) => resultToTaskWithResult(
      ({ways, nodes, intersectionNodesByWayId}) => _completeDeadEndNodeOrQueryForFakeIntersectionNodeResultTask(
        osmConfig,
        {ways, nodes, intersectionNodesByWayId}
      )
    )(endedBlockResult),

    // Find the node at the end of the way, whether or not it's an intersection node or not
    // Produce an extended block with the previous ways and nodes and the new trimmed way and end node
    mapToNamedResponseAndInputs('endedBlockResult',
      ({previousWays, way, nodesAndIntersectionNodesByWayIdResult}) => resultToTaskNeedingResult(
        ({intersectionNodesByWayId, nodesByWayId}) => {
          const endBlockNode = _resolveEndBlockNode(
            way,
            {intersectionNodesByWayId, nodesByWayId}
          );
          return of({
            // trim the way to the node
            ways: R.concat(
              // Keep the ways that aren't the final way
              previousWays,
              // Trim the final way
              [trimWayToNode(endBlockNode, way)]
            ),
            nodes: R.concat(
              nodes,
              [endBlockNode]
            ),
            intersectionNodesByWayId
          });
        }
      )(nodesAndIntersectionNodesByWayIdResult)
    ),

    // Query to find all nodes of the final way
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
  )({osmConfig, nodes, previousWays, way});
};

/**
 * If we used intersectionNode at the end of the way, not a regular node, we need to
 * query for its ways to find out if it is a real intersection.
 * If it just connects two ways with the same street name, we aren't at the end of the block.
 * Thus we either 1) return a completed block with a real intersection or non intersection node or
 * 2) Return the block with the fake intersection node and next way to indicate that we need to keep constructing
 * the block
 * @param {[Object]} ways The current ways of the block
 * @param {[Object]} nodes The current nodes of the block, where the final node is the one we are checking
 * @param intersectionNodesByWayId
 * @returns {Object} A block with {ways, nodes}. It will be a complete block (capped by nodes at both ends of the
 * ordered ways) if it the last node is a dead end or real intersection. It will be an incomplete block with
 * a way sticking off the end if the intersection turned out to be fake and we need to keep processing
 * @private
 */
const _completeDeadEndNodeOrQueryForFakeIntersectionNodeResultTask = (osmConfig, {ways, nodes, intersectionNodesByWayId}) => {
  return R.ifElse(
    // If the node was from the intersectionNodesByWayId, get the ways of the node to see if it's a real intersection
    ({way, intersectionNodesByWayId}) => {
      const node = R.last(nodes);
      R.compose(
        R.contains(node),
        reqStrPathThrowing('response.features'),
        R.prop(way.id)
      )(intersectionNodesByWayId);
    },

    // If it's an intersection node, find its ways (which we don't have because we thought it was a dead end,
    // then see if it's a real intersection node (not just connecting two ways of the same street). If it's
    // not a real intersection take the second way that is not way and recurse.
    // Diagram +------ - ----- where + is one end of the way and - is what we thought was an intersection,
    // but is actually just a continuation of the street with another way
    ({ways, nodes}) => {
      return R.composeK(
        isRealIntersectionResult => resultToTaskWithResult(
          ({realIntersection, waysOfIntersection}) => R.ifElse(
            R.identity,
            // It's a real intersection, so just accept the node and return the completed block
            () => of(Result.Ok({ways, nodes})),
            // It's not a real intersection.
            // Add the fake node intersection and new way, possibly reversing the way to match the flow.
            // This block will get further processing since it's not complete.
            () => {
              // Get the next way R.differenceWith will always be 1 new way, because unreal intersection
              // connects our existing way with 1 other way (if there were more ways it would be a real intersection)
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

              // Add the new way. This will force the block to keep processing since there is no final node
              return of(Result.Ok({
                nodes,
                ways: R.concat(
                  ways,
                  [nextWay]
                )
              }));
            }
          )(realIntersection)
        )(isRealIntersectionResult),

        // Get the ways of the node to determine if it's a real intersection
        result => resultToTaskNeedingResult(
          response => {
            const waysOfIntersection = response.features;
            const node = R.tail(nodes);
            return of({
              realIntersection: isRealIntersection(waysOfIntersection, node),
              waysOfIntersection
            });
          }
        )(result),

        // Query for ways of the node to find out if it's a real intersection
        ({node}) => osmResultTask({
            name: 'waysOfNodeQueryForFakeIntersection',
            testMockJsonToKey: {node: node.id, type: 'waysOfNode'}
          },
          options => fetchOsmRawTask(options, waysOfNodeQuery(osmConfig, node.id))
        )
      )({ways, nodes});
    },

    // Otherwise we used a non intersection node for a dead-end way and we're done
    ({ways, nodes}) => {
      return of(Result.Ok({ways, nodes: R.concat(nodes, [node])}));
    }
  )({intersectionNodesByWayId, ways, nodes});
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
