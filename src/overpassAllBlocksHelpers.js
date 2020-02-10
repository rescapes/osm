/**
 * Created by Andy Likuski on 2020.01.08
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {
  composeWithMapMDeep,
  mapMDeep,
  mapToMergedResponseAndInputs,
  mapToNamedResponseAndInputs,
  reqStrPathThrowing,
  resultsToResultObj,
  strPathOr,
  toNamedResponseAndInputs,
  traverseReduceWhileBucketedTasks
} from 'rescape-ramda';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import * as Result from 'folktale/result';
import {
  _buildPartialBlocks,
  _hashBlock,
  _sortOppositeBlocksByNodeOrdering,
  parallelWayNodeQueriesResultTask,
  waysByNodeIdResultsTask
} from './overpassBlockHelpers';
import {_calculateNodeAndWayRelationships} from './overpassHelpers';
import {
  _intersectionStreetNamesFromWaysAndNodesResult,
  hashNodeFeature,
  hashWayFeature
} from './overpassFeatureHelpers';
import {length} from '@turf/turf';
import {_recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask} from './overpassBuildBlocks';
import {loggers} from 'rescape-log';

const log = loggers.get('rescapeDefault');


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
export const _queryOverpassForAllBlocksResultsTask = (
  osmConfig,
  {location, way: wayQueries, node: nodeQueries}
) => {
  return R.composeK(
    // Take the Result.Ok with responses and organize the features into blocks
    // Or put them in an Error array
    // Task Result [<way, node>] -> Task <Ok: [Location], Error: [<way, node>]>
    result => result.matchWith({
      Ok: ({value: {way, node}}) => R.composeK(
        ({Ok: {way, node, waysByNodeId}, Error: errors}) => {
          if (R.length(errors)) {
            log.warn(`Some waysByNodeId could not be queried ${JSON.stringify(errors)}`);
          }
          // Get the features from the response
          const [ways, nodes] = R.map(reqStrPathThrowing('response.features'), [way, node]);
          return R.map(
            ({Ok: oks, Error: errs}) => {
              return {Ok: oks, Error: R.concat(errors, errs || [])};
            },
            organizeResponseFeaturesResultsTask(osmConfig, location, {
              ways,
              nodes
            })
          );
        },
        // If we are doing a narrow street query we need to get waysByNode so we know which nodes of the street are real intersections
        // TODO we aren't using these results
        ({way, node}) => R.ifElse(
          ({osmConfig}) => R.propOr(false, 'forceWaysOfNodeQueries', osmConfig),
          // Produces {Ok: {way, node, waysByNodeId: {...}}, Error: []}
          // waysByNodeId contain the query results by node id. If any errors occur they are stored in Error.
          ({way, node}) => waysByNodeIdResultsTask(osmConfig, {way, node}),
          // Otherwise we don't need waysByNode because our query was comprehensive
          ({way, node}) => of({Ok: {way, node, waysByNodeId: {}}, Error: []})
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
 * @param {Object} osmConfig.disableNodesOfWayQueries. Don't allow OSM queries to find nodes of incomplete ways
 * We do this when we node the way/node set is complete and/or we have ways/nodes that aren't from OSM
 * @param {Object} location Used for context to help resolve the blocks. This location represents the geojson
 * or jurisdiction data used to create the way and node queries
 * @param {Object} features {ways, nodes} way features and node features
 * @param {Object} [features.ways] Required unless partialBlocks is specified
 * @param {Object} [features.nodes] Required unless partialBlocks is specified
 * @param {Object} [features.partialBlocks]: Optional use these partialBlocks were constructed externally
 * @returns {Task<Ok:[block], Error:[]>} where block is an object with {ways, nodes}
 */
export const organizeResponseFeaturesResultsTask = (
  osmConfig,
  location,
  {ways, nodes, partialBlocks}
) => {

  return R.composeK(
    ({nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, partialBlocks}) => {
      return _partialBlocksToFeaturesResultsTask(
        osmConfig,
        location, {
          nodeIdToWays,
          wayIdToNodes,
          wayEndPointToDirectionalWays,
          nodeIdToNodePoint,
          partialBlocks
        }
      );
    },
    // Creates helpers and partialBlocks, which are blocks with a node and one directional way
    // from which we'll complete all our blocks. Note that this also trims nodes to get rid of
    // fake intersections (where the way changes but it's not really a new street)
    // Returns { partialBlocks, nodeIdToNode, nodePointToNode, nodeIdToNodePoint, wayIdToWay, wayIdToNodes, wayIdToWayPoints, nodeIdToWays, wayEndPointToDirectionalWays };
    mapToMergedResponseAndInputs(
      ({ways, nodes}) => {
        return of(
          R.ifElse(
            R.identity,
            // Combine the existing partial blocks with node and way relationships
            partialBlocks => {
              return R.merge(_calculateNodeAndWayRelationships({
                // Use unique ways and nodes to get relationship data
                ways: R.uniqBy(hashWayFeature, R.chain(R.prop('ways'), partialBlocks)),
                nodes: R.uniqBy(hashNodeFeature, R.chain(R.prop('nodes'), partialBlocks))
              }), {partialBlocks});
            },
            // Build the partial blocks
            () => _buildPartialBlocks({ways, nodes})
          )(partialBlocks)
        );
      }
    )
  )({ways, nodes, location});
};

/**
 * Builds partial blocks to features One or more partial blocks can result in a features.
 * @param {Object} osmConfig
 * @param {Object} osmConfig.disableNodesOfWayQueries
 * @param {Object} location The original location that was searched for to create these blocks
 * @param {Object} locationConfig
 * @param locationConfig.nodeIdToWays
 * @param locationConfig.wayIdToNodes
 * @param locationConfig.wayEndPointToDirectionalWays
 * @param locationConfig.nodeIdToNodePoint
 * @param [{Object}] partialBlocks Each partial block has a node and way key with a single node and way to start.
 * @return {Task<Result<Object>>} Object containing Ok: [Object] and Error: [Object] with the successful blocks
 * and blocks that failes
 * @private
 */
const _partialBlocksToFeaturesResultsTask = (
  osmConfig,
  location,
  {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, partialBlocks}) => {
  return composeWithMapMDeep(1, [
    // Convert the results their values under Ok and Error
    // [Result] -> {Ok: [Object], Error: [Object]}
    blockResults => {
      log.warn(`_partialBlocksToFeaturesResultsTask: Calling resultsToResultObj on ${R.length(blockResults)} blocks`);
      return resultsToResultObj(blockResults);
    },

    // Extract the intersection street names
    ({blocks, nodeIdToWays}) => {
      log.warn(`_partialBlocksToFeaturesResultsTask: Calling _intersectionStreetNamesFromWaysAndNodesResult on ${R.length(blocks)} blocks`);
      return R.map(
        block => {
          const nodesToIntersectingStreetsResult = _intersectionStreetNamesFromWaysAndNodesResult(
            osmConfig,
            reqStrPathThrowing('ways', block),
            reqStrPathThrowing('nodes', block),
            nodeIdToWays
          );
          return R.map(
            nodesToIntersectingStreets => ({
              // Put the OSM results together
              block: R.merge(block, {nodesToIntersectingStreets}),
              // Add the intersections to the location and return it
              location: R.merge(
                location,
                {
                  intersections: R.values(nodesToIntersectingStreets)
                }
              )
            }),
            nodesToIntersectingStreetsResult
          );
        },
        blocks
      );
    },
    // Filter out fake blocks that are just street connectors.
    // This will be more sophisticated in the future.
    // For now just eliminate any block that is less than osmConfig.minimumWayLength meters long
    // TODO we don't want to lose ways, so we don't do this until we can  incorporate these short into adjacent walks
    toNamedResponseAndInputs('blocks',
      ({blocks}) => {
        log.warn(`_partialBlocksToFeaturesResultsTask: Removing small ways on ${R.length(blocks)} blocks`);
        return R.filter(
          block => R.compose(
            // ways add up to at least 20 meters
            //R.lte(R.propOr(20, 'minimumWayLength', osmConfig)),
            // add up the ways
            ways => R.reduce(
              (accum, way) => R.add(accum, length(way, {units: 'meters'})),
              0,
              ways
            )
          )(strPathOr([], 'ways', block)),
          blocks
        );
      }
    ),
    // Once we pick the best version of the block, simply take to values and discard the hash keys,
    // TODO remove. We shouldn't have duplicates anymore
    toNamedResponseAndInputs('blocks',
      ({hashToBestBlock}) => {
        return R.values(hashToBestBlock);
      }
    ),
    // TODO remove. We shouldn't have duplicates anymore
    toNamedResponseAndInputs('hashToBestBlock',
      ({blocks}) => {
        log.warn(`_partialBlocksToFeaturesResultsTask: Calling _removeOpposingDuplicateBlocks on ${R.length(blocks)} blocks`);
        return _removeOpposingDuplicateBlocks(blocks);
      }
    ),
    toNamedResponseAndInputs('blocks',
      ({blocksResult, nodeIdToWays}) => {
        // TODO just extracting the value from Result.Ok here.
        // Change to deal with Result.Error
        const {blocks, errorBlocks} = blocksResult.value;
        log.debug(`_partialBlocksToFeaturesResultsTask: Calling _intersectionStreetNamesFromWaysAndNodesResult on ${R.length(blocks)} blocks`);
        if (R.length(errorBlocks)) {
          log.warn(`One or more blocks couldn't be built. Errors: ${JSON.stringify(errorBlocks)}`);
        }
        return R.map(
          // Add intersections to the blocks based on the ways and nodes' properties
          block => R.merge(block, {
              nodesToIntersectingStreets: _intersectionStreetNamesFromWaysAndNodesResult(
                osmConfig,
                reqStrPathThrowing('ways', block),
                reqStrPathThrowing('nodes', block),
                nodeIdToWays
              )
            }
          ),
          blocks
        );
      }
    ),
    // [Object] -> Task Result [Object]
    // For each block travel along it and accumulate connected ways until we reach a node or dead end
    // If a node is reached trim the last way to end at that node
    mapToNamedResponseAndInputs('blocksResult',
      ({nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, partialBlocks}) => {
        return _traversePartialBlocksToBuildBlocksResultTask(
          osmConfig,
          {
            nodeIdToWays,
            wayIdToNodes,
            wayEndPointToDirectionalWays,
            nodeIdToNodePoint
          },
          partialBlocks
        );
      }
    )
  ])({nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, partialBlocks});
};

/**
 * If there are blocks that are the same block in different, directions. Remove
 * TODO our logic should have eliminated the need for this
 * @param blocks
 * @private
 */
const _removeOpposingDuplicateBlocks = blocks => {
  return R.reduceBy(
    (otherBlock, block) => {
      return R.when(
        () => otherBlock,
        // When we have 2 blocks it means we have the block in each direction, which we expect.
        // It's also possible to get some weird cases where ways were entered wrong in OSM and overlap,
        // creating the same block in terms of the node has but with different way ids
        block => {
          // TODO if we get in here we did something wrong
          log.warn(`_removeOpposingDuplicateBlocks: Received matching opposing blocks. This shouldn't happen anymore. Block 1: ${
            JSON.stringify(block)
          } Block 2: ${
            JSON.stringify(otherBlock)
          }`);
          if (R.complement(R.equals)(
            ...R.map(
              b => R.compose(R.sort(R.identity), R.map(reqStrPathThrowing('id')), reqStrPathThrowing('ways'))(b),
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
  );
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
 * @param {Object} partialBlocks
 * @returns {[Object]} The blocks
 * @private
 */
export const _traversePartialBlocksToBuildBlocksResultTask = (
  osmConfig,
  {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint},
  partialBlocks
) => {

  // Hash the partial blocks independent of direction so we can eliminate twin partialBlocks whenever
  // one is processed.
  const hashToPartialBlocks = R.reduceBy(
    (a, b) => R.concat(a, [b]),
    [],
    block => _hashBlock(R.over(R.lensProp('nodes'), () => [], block)),
    partialBlocks
  );
  // Block b:: [b] -> Task Result [b]
  // Wait in parallel but bucket tasks to prevent stack overflow
  return mapMDeep(2,
    ({blocks, errorBlocks}) => {
      log.debug(`_traversePartialBlocksToBuildBlocksResultTask: Done with ${
        R.length(blocks)
      } blocks and ${
        R.length(errorBlocks)
      } error blocks`);
      // Remove the empty partialBlocks, just returning the blocks and errorBlocks
      return {blocks, errorBlocks};
    },
    // traverseReduceWhile allows us to chain tasks together that rely on the result of the previous task
    // since we can't know how many tasks we need to use up all the partialBlocks, we simply give it
    // the chance to run R.length(partialBlocks) times, knowing we might not need that many before we quit
    // Each traverseReduceWhile is called it will create a complete block. The block might consist of multiple
    // partialBlocks if the node between the partialBlocks wasn't a real intersection node, which we only
    // discover whilst traversing
    traverseReduceWhileBucketedTasks(
      {
        accumulateAfterPredicateFail: false,
        predicate: ({value: {partialBlocks}}, x) => {
          // Quit if we have no more partial blocks
          log.debug(`_traversePartialBlocksToBuildBlocksResultTask: Predicate. ${R.length(partialBlocks)} remaining`);
          return R.length(partialBlocks);
        },
        // Chain to chain the results of each task. R.map would embed them within each other
        mappingFunction: R.chain,
        monadConstructor: of
      },
      // Ignore x, which just indicates the index of the reduction. We reduce until we run out of partialBlocks
      ({value: {partialBlocks, blocks, errorBlocks}}, x) => {
        return R.map(
          // partialBlocks are those remaining to be processed
          // block is the completed block that was created with one or more partial blocks
          // Result.Ok -> Result.Ok, Result.Error -> Result.Ok
          result => result.matchWith({
            Ok: ({value: {partialBlocks, block}}) => {
              log.debug(`_traversePartialBlocksToBuildBlocksResultTask: finished block. ${R.length(partialBlocks)} remaining`);
              return Result.Ok({
                partialBlocks,
                blocks: R.concat(blocks, [block]),
                errorBlocks
              });
            },
            Error: ({value: {error}}) => {
              // Something went wrong processing a partial block
              // error is {nodes, ways}, so we can eliminate the partialBlock matching it
              // TODO error should contain information about the error
              return Result.Ok({
                partialBlocks: R.difference(partialBlocks, [error]),
                blocks,
                errorBlocks: R.concat(errorBlocks, [error])
              });
            }
          }),
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
      of(Result.Ok({partialBlocks, blocks: [], errorBlocks: []})),
      // Just need to call a maximum of partialBlocks to process them all
      R.times(of, R.length(partialBlocks))
    )
  );
};