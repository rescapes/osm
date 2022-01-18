import {
  _hashBlock,
  blocksToGeojson,
  blockToGeojson,
  isRealIntersection,
  isRealIntersectionTask,
  nodesAndIntersectionNodesForIncompleteWayResultTask,
  orderWayFeaturesOfBlock,
  removeReverseTagsOfOrderWayFeaturesOfBlock,
  styledBlock,
  trimWayToNode,
  trimWayToNodeObj,
  waysOfNodeQuery
} from './overpassBlockHelpers.js';
import {_calculateNodeAndWayRelationships, fetchOsmRawTask, osmResultTask} from './overpassHelpers.js';
import {hashNodeFeature, hashPoint, hashWayFeature, wayFeatureToCoordinates} from './overpassFeatureHelpers.js';
import {
  compact, composeWithChain,
  composeWithChainMDeep, mapToMergedResponseAndInputs, mapToNamedResponseAndInputs,
  mapToNamedResponseAndInputsMDeep, reqPathThrowing,
  reqStrPathThrowing,
  resultToTaskNeedingResult,
  resultToTaskWithResult,
  strPathOr
} from '@rescapes/ramda';

import * as R from 'ramda';
import T from 'folktale/concurrency/task/index.js';

const {of} = T;
import Result from 'folktale/result/index.js';
import {loggers} from '@rescapes/log';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {nodeFromCoordinate} from './locationHelpers.js';

const log = loggers.get('rescapeDefault');

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
 * @returns {Object} task that resolves to Result.Ok with a complete block a at block: {
 * nodes: [one or more nodes],
 * ways: [one or more ways],
 * }. Nodes is normally two unless the block is a dead end. Ways are 1 or more, depending how many ways are need to
 * connect to the closest node (intersection).
 * partialBlocks are the blocks not consumed by the function
 * Also returns updated partialBlocks to those that are still remaining to be process. Also returns nodeIdToWays, which might
 * have been updated to include more ways that were queried for.
 * If a Result.Error occurs it will be returned containing the failed block along with updated {partialBlocks, nodeIdToWays}
 * The caller should abandon the block but keep the partialBlock and nodeIdToWays updates
 */
export const _recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask = v((
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
        return isRealIntersection(
          R.compose(
            nodeId => R.prop(nodeId, nodeIdToWays),
            node => R.prop('id', node)
          )(node),
          node
        );
      },
      partialBlocks
    )
  );
  const matchingPartialBlocks = _matchingPartialBlocks(hashToPartialBlocks, partialBlock);
  const matchingSet = new Set(matchingPartialBlocks)
  let remainingPartialBlocks = R.filter(x => !matchingSet.has(x), partialBlocks)

  const {nodes, ways} = partialBlock;
  log.debug(`_recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask: Processing partial block way ids ${
    JSON.stringify(R.map(R.prop('id'), ways))
  } with ${
    R.length(remainingPartialBlocks)
  } remaining.`);

  if (process.env.NODE_ENV !== 'production') {
    //log.debug('_recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask: Geojson of current partial block');
    //log.debug(blockToGeojson({nodes, ways}));
  }
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

  if (R.equals(
    R.length(remainingPartialBlocks),
    R.length(partialBlocks))
  ) {
    const wayIds = R.map(R.prop('id'), R.map(R.prop('ways'), partialBlock));
    log.warn(`Failed to remove the partial block with way ids ${
      JSON.stringify(wayIds)
    } being processed from remainingPartialBlocks. This should never happen. Will remove "manually"`);
    remainingPartialBlocks = R.filter(
      remainingBlock => R.compose(
        ids => {
          return R.none(id => R.includes(id, wayIds), ids)
        },
        R.map(R.prop('id'), R.map(R.prop('ways')))
      )(remainingBlock),
      remainingPartialBlocks
    );
  }

  // Create a task to add the found node to the first node to complete the block and set the trimmed ways,
  // Alternatively if we got to a new way then we have to recurse and traverse that way until we find an intersection node
  // Or if we have a dead end we need to query Overpass to get the dead end node.
  return _completeBlockOrHandleUnendedWaysAndFakeIntersectionNodesResultTask(
    osmConfig,
    {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, hashToPartialBlocks},
    {partialBlocks: remainingPartialBlocks, firstFoundNodeOfFinalWay: firstFoundNodeOfWay, waysAtEndOfFinalWay},
    {nodes, ways: trimmedWays}
  );
}, [
  ['osmConfig', PropTypes.shape().isRequired],
  ['context', PropTypes.shape({
    nodeIdToWays: PropTypes.shape().isRequired,
    wayIdToNodes: PropTypes.shape().isRequired,
    wayEndPointToDirectionalWays: PropTypes.shape().isRequired,
    nodeIdToNodePoint: PropTypes.shape().isRequired,
    hashToPartialBlocks: PropTypes.shape().isRequired
  }).isRequired],
  ['partialBlocks', PropTypes.arrayOf(PropTypes.shape()).isRequired]
], '_recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask');

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
  wayId => reqPathThrowing(
    [wayId],
    wayIdToNodes
  ),
  way => R.prop('id', way)
)(way);

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
 * @returns {Task<Result.Ok<Object>>} {block: {ways, nodes}, partialBlocks, nodeIdToWays}
 * block with {nodes, ways}. nodes  with two or more nodes: nodes + firstFoundNodeOfFinalWay or a dead-end node
 * from Overpass or the result of recursing on waysAtEndOfFinalWay. ways are always built up to form the complete block, trimmed
 * to fit the two nodes.
 * Also returns updated partialBlocks to those that are still remaining to be process. Also returns nodeIdToWays, which might
 * have been updated to include more ways that were queried for.
 * If a Result.Error occurs it will be returned containing the failed block along with updated {partialBlocks, nodeIdToWays}
 * The caller should abandon the block but keep the partialBlock and nodeIdToWays updates
 * @private
 */
export function _completeBlockOrHandleUnendedWaysAndFakeIntersectionNodesResultTask(
  osmConfig,
  {nodeIdToWays, wayIdToNodes, wayEndPointToDirectionalWays, nodeIdToNodePoint, hashToPartialBlocks},
  {partialBlocks, firstFoundNodeOfFinalWay, waysAtEndOfFinalWay},
  block
) {
  const {nodes, ways} = block;
  // Object a, Object b :: a -> Task Result b
  const resultTask = composeWithChainMDeep(2, [
    // The last step is to remove intermediate fake intersection nodes that we marked __FAKE_INTERSECTION__
    obj => {
      return of(Result.Ok(R.over(
        R.lensPath(['block', 'nodes']),
        // Filter out nodes with __FAKE_INTERSECTION__
        nodes => R.filter(R.complement(R.propOr)(false, '__FAKE_INTERSECTION__'), nodes),
        obj
      )));
    },
    // Now we are either done building the block or need to recurse to continue building
    ({block, remainingPartialBlocks, newNodeIdToWays}) => {
      // Merge the new way/node relationships into the existing
      const newNodeAndWayRelationships = R.mergeRight(
        {hashToPartialBlocks},
        _mergeInNewNodeAndWayRelationships({
            // Add any newNodeIdToWays that we found while resolving the block
            // When newNodeIdToWays has nodes that match nodeIdTyWays, it will always have the same ways and possibly more
            // nodeIdToWays is formed by evaluating everything returned from the initial way query, whereas newNodeIdToWays
            // is formed by explicitly looking for nodes of a way. So whereas nodeIdToWays might miss ways that are outside
            // the query area, newNodeIdToWays will not. This makes resolving the street names better because we have all
            // the intersecting ways
            // TODO we don't update nodeIdToNodePoint correspondingly, does it matter?
            nodeIdToWays: R.mergeRight(nodeIdToWays, newNodeIdToWays),
            wayIdToNodes,
            wayEndPointToDirectionalWays,
            nodeIdToNodePoint
          },
          block
        )
      );
      // If the block is complete because there are two nodes now, or failing that we didn't find a joining way,
      // just return the block, otherwise recurse to travel more to
      // reach a node along the new way, reach another way, or reach a dead end
      return R.ifElse(
        // If we added a new way, we recurse.
        block => R.lt(R.length(ways), R.length(reqStrPathThrowing('ways', block))),
        // If we aren't done recurse on the calling function, appending the block to the remainingPartialBlocks,
        // which will cause block to be processed
        // We don't necessarily need to add anything else, but we have to check that it's complete
        block => {
          return _recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask(
            osmConfig,
            newNodeAndWayRelationships,
            R.concat([block], remainingPartialBlocks)
          );
        },
        // Done building the block, return the remaining partial blocks and updated context
        block => of(Result.Ok(
          R.mergeRight({
            block,
            partialBlocks: remainingPartialBlocks
          }, newNodeAndWayRelationships)
        ))
      )(block);
    },

    // Use the context and blockContext to resolve the next part of the block. This might involve
    // going to the server for more data to resolve dead ends
    // TODO We no longer use waysAtEndOfFinalWay. I don't think we ever need it. We just want to add
    // firstFoundNodeOfFinalWay to the block or query Overpass if it doesn't exist
    ({osmConfig, firstFoundNodeOfFinalWay, partialBlocks, hashToPartialBlocks, nodes, ways}) => {
      return _choicePointProcessPartialBlockResultTask(
        osmConfig,
        {nodeIdToWays, hashToPartialBlocks},
        {firstFoundNodeOfFinalWay, partialBlocks},
        {nodes, ways}
      );
    }
  ])({
    osmConfig,
    firstFoundNodeOfFinalWay, waysAtEndOfFinalWay, nodeIdToWays, hashToPartialBlocks,
    partialBlocks,
    nodes, ways
  });
  // If an error occurs make sure the partial blocks are attatched
  return R.map(
    result => result.mapError(
      error => R.mergeRight({partialBlocks}, error)
    ),
    resultTask
  );
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
 * @param {[Object]} blockContext.partialBlocks
 * @param {Object} block
 * @param {[Object]} block.nodes
 * @param {[Object]} block.ways
 * @returns {Task<Result<Object>>} Returns a task resolving to a Result.Ok containing the constructed block
 * {block: {ways, nodes}, remainingPartialBlocks: {[Object]}}, nodeIdToWays: {nodeId: [ways]} where nodeIdToWays
 * are mapping of a node id to its ways to help with street resolution. These are the incidental result of querying
 * and the remainingPartialBlocks, meaning the partialBlocks that weren't needed to construct the rest of this block.
 * If something goes wrong a Result.Error is returned and the block should be abandoned by the caller
 * @private
 */
export function _choicePointProcessPartialBlockResultTask(
  osmConfig,
  {nodeIdToWays, hashToPartialBlocks},
  {firstFoundNodeOfFinalWay, partialBlocks},
  block
) {
  const {nodes, ways} = block;

  // If we didn't get firstFoundNodeOfFinalWay we have a dead end. This means need to query more to
  // find data beyond our search area. If it is truly a dead end we treat the last node of the way at the end
  // as a dead end node, which is somewhat like an intersection
  if (R.isNil(firstFoundNodeOfFinalWay)) {
    // Find the dead-end node or intersection node outside the query results
    log.debug(`_choicePointProcessPartialBlockResultTask: resolving incomplete way for block with way ids ${
        JSON.stringify(R.map(R.prop('id'), ways))
      }.`
    );
    return _resolveIncompleteWayResultTask(osmConfig, partialBlocks, {nodes, ways});
  }

  // Else, see if firstFoundNodeOfFinalWay is a real intersection by checking our existing data or query for more data
  // from OSM. We only need to query for more data when we are at the edge of our search area
  // Once we know firstFoundNodeOfFinalWay is, either complete the block or treat it as a fake intersection and
  // continue building the block
  return composeWithChain([
    ({
       nodeIdToWays, hashToPartialBlocks, partialBlocks, ways, nodes, firstFoundNodeOfFinalWay, block,
       isRealIntersection, newNodeIdToWays
     }) => {
      const resultTask = R.ifElse(
        ({isRealIntersection}) => {
          return isRealIntersection;
        },

        // We have a firstFoundNodeOfFinalWay of a real intersection, so we are done with the block. This is because
        // a block can never extend over a real intersection, by definition of a block
        ({partialBlocks, ways, firstFoundNodeOfFinalWay, block, newNodeIdToWays}) => {
          return of(
            Result.Ok(
              R.mergeRight(
                {newNodeIdToWays},
                _choicePointProcessPartialBlockCompleteBlock({
                  partialBlocks,
                  ways,
                  nodes
                }, block, firstFoundNodeOfFinalWay)
              )
            )
          );
        },

        // If we got firstFoundNodeOfFinalWay but it's not a real intersection node, add the node and the connected
        // way to the block and return it so we can continue processing. If we do this we remove the partial block
        // (in both directions) of the connected way from our partial block list so we don't process it again later.
        // Fake intersections are nodes that simply connect two ways of the same street. It's allowable in OpenStreetmap
        // to start a new way without being at a true intersection, or it might be the intersection of a parking lot
        // or something we don't treat as a new block.
        // We likewise treat two (and only two) joining ways as a not real intersection unless the street name changes
        ({hashToPartialBlocks, partialBlocks, ways, firstFoundNodeOfFinalWay, block}) => {
          if (process.env.NODE_ENV !== 'production') {
            log.debug(`_choicePointProcessPartialBlockResultTask: extending block with fake intersection for ${
              blocksToGeojson([
                // Show firstFoundNodeOfFinalWay
                styledBlock('#00FF00', {ways: [], nodes: [firstFoundNodeOfFinalWay]}),
                block
              ])
            }`);
          }
          return of(
            R.map(
              // Merge in newNodeIdToWays so we can use them
              value => R.mergeRight({newNodeIdToWays}, value),
              _extendBlockToFakeIntersectionPartialBlockResult(
                {hashToPartialBlocks},
                partialBlocks,
                // Mark the node as a fake intersection so we can remove it from the final block when we are done
                // constructing the block
                R.mergeRight({__FAKE_INTERSECTION__: true}, firstFoundNodeOfFinalWay),
                {nodes, ways}
              )
            )
          );
        }
      )({
        nodeIdToWays,
        hashToPartialBlocks,
        partialBlocks,
        ways,
        nodes,
        firstFoundNodeOfFinalWay,
        block,
        isRealIntersection,
        newNodeIdToWays
      });
      // If an error occurs make sure the partial blocks and newNodeIdToWays are returned
      // The first is required to advance recursion. The second might have useful context data
      return R.map(
        result => result.mapError(
          error => R.mergeRight(
            {partialBlocks, nodeIdToWays: newNodeIdToWays},
            error
          )
        ),
        resultTask
      );
    },

    // Determines if firstFoundNodeOfFinalWays is a real intersection based on the data in nodeIdToWays or failing
    // that by querying OSM for the ways
    mapToMergedResponseAndInputs(
      ({block, osmConfig, nodeIdToWays, firstFoundNodeOfFinalWay}) => {
        return isRealIntersectionTask(
          osmConfig,
          R.prop(R.prop('id', firstFoundNodeOfFinalWay), nodeIdToWays),
          firstFoundNodeOfFinalWay
        );
      }
    )
  ])({osmConfig, nodeIdToWays, hashToPartialBlocks, partialBlocks, ways, nodes, firstFoundNodeOfFinalWay, block});
}


/**
 * Complete the block
 * @param partialBlocks
 * @param ways
 * @param block
 * @param firstFoundNodeOfFinalWay
 * @return {*}
 * @private
 */
const _choicePointProcessPartialBlockCompleteBlock = ({
                                                        partialBlocks,
                                                        ways,
                                                        nodes
                                                      }, block, firstFoundNodeOfFinalWay) => {
  log.debug(`_choicePointProcessPartialBlockResultTask: completed block for ${
    JSON.stringify(R.map(R.prop('id'), strPathOr([], 'ways', block)))
  }`);
  return {
    block: {
      // Add firstFoundNodeOfFinalWay if it isn't already added
      nodes: R.compose(
        R.uniqBy(R.prop('id')),
        R.concat(nodes)
      )([firstFoundNodeOfFinalWay]),
      ways
    },
    remainingPartialBlocks: partialBlocks
  };
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
export function _extendBlockToFakeIntersectionPartialBlockResult(
  {hashToPartialBlocks},
  partialBlocks,
  firstFoundNodeOfFinalWay,
  block
) {
  const {nodes, ways} = block;
  const wayIds = R.map(R.prop('id'), ways);
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
    partialBlock => R.includes(
      R.prop('id', firstFoundNodeOfFinalWay),
      R.map(R.prop('id'), reqStrPathThrowing('nodes', partialBlock))
    ),
    partialBlocks
  );
  if (!partialBlockOfNode) {
    log.warn(`_extendBlockToFakeIntersectionPartialBlockResult: Something is wrong with the nodes and ways of this partial block. Cannot find the partialBlock matching firstFoundNodeOfFinalWay for ${
      blockToGeojson({ways, nodes})
    }`);
    return Result.Error({error: {nodes, ways}});
  }

  // Get the twin partial block if it exists
  const matchingPartialBlocks = _matchingPartialBlocks(hashToPartialBlocks, partialBlockOfNode);

  return Result.Ok({
    block: {
      // Add firstFoundNodeOfFinalWay
      nodes: R.concat(nodes, [firstFoundNodeOfFinalWay]),
      // Add the partialBlockOfNode ways if there is a partialBlockOfNode
      // We never add the same way twice in order to prevent infinite loops.
      // If we have a loop then adding firstFoundNodeOfFinalWay and no new way here will indicate that we have
      // a loop and ar done
      ways: R.concat(
        ways,
        R.ifElse(
          newWays => {
            return R.any(
              newWayId => R.includes(newWayId, wayIds),
              R.map(R.prop('id'), newWays)
            );
          },
          () => [],
          R.identity
        )(strPathOr([], 'ways', partialBlockOfNode))
      )
    },
    // Remove the matchingPartialBlocks
    remainingPartialBlocks: R.without(matchingPartialBlocks, partialBlocks)
  });
};

/**
 * Given a partial Block uses hashToPartialBlocks to find the twin partial block and returns both.
 * If the twin isn't found it just returns partialBlock
 * @param hashToPartialBlocks
 * @param partialBlock
 * @returns {[Object]} One or two partialBlocks
 * @private
 */
export function _matchingPartialBlocks(hashToPartialBlocks, partialBlock) {
  return R.defaultTo(
    // Default to just the partialBlock or null
    R.when(R.identity, Array.of)(partialBlock),
    // Find the twin block and the partial block in hashToPartialBlocks
    R.when(
      R.identity,
      partialBlockOfNode => R.prop(
        // Leave out nodes. We only want to compare the way points because our twin partial blocks only
        // have 1 of the nodes at the ends of the block, so they won't match on nodes
        _hashBlock(R.over(R.lensProp('nodes'), () => [], partialBlockOfNode)),
        hashToPartialBlocks
      )
    )(partialBlock)
  );
};

/**
 * Queries for the nodes of the given incomplete way and returns the node that matches the last point of the way (for dead ends).
 * If osmConfig.disableNodesOfWayQueries is true, we don't allow addition querying of OSM to find missing data. This
 * is either because we know we already have all the data we want and/or the ways/nodes aren't from OSM and thus can't be queried
 * If a matching node is found, we do the following
 * 1) The node is a real intersection, meaning it represents more than just two ways of the same street. Then
 * we have our final node and are done with the block
 * 2) The node is not a real intersection.
 * @param {Object} osmConfig
 * @param {Boolean} [osmConfig.includePedestrianArea] Default true
 * @param {Boolean} [osmConfig.disableNodesOfWayQueries] Default false
 * @param {[Object]} partialBlocks
 * @param {Object} block The block we are querying the end of to see if there are more nodes we don't know about
 * @param {[Object]} block.ways The ways
 * @param {[Object]} block.nodes The nodes. We want to find the nodes of the final way
 * @returns {Task<Result<Object>>} {
 * nodeIdToWays: {node.id: [ways]} A mapping of the last found node to its ways if it wasn't a deadend. This
 * helps with street naming
 * block:{
 * ways: the single way trimmed to the intersection or dead end,
 * nodes: The intersection nodes or dead end
 * }
 * }
 * @private
 */
export function _resolveIncompleteWayResultTask(
  osmConfig,
  partialBlocks,
  {nodes, ways}
) {
  // We only process the last way. Any previous ways are prepended to our results
  const way = R.last(ways);
  const previousWays = R.init(ways);

  // Task Result <way, intersectionNOdesByWayId, nodesByWayId> -> Task Result <ways, node>
  return composeWithChainMDeep(2, [
    // Add the partialBlocks to the result
    ({nodeIdToWays, block}) => {
      return of(Result.Ok({
        block,
        // Return the remaining partialBlocks so we know what has been processed
        // TODO it's slightly possible that the way that was added as the result of a fake dead end
        // could overlap with way in partialBlocks, so we could remove that way here. Normally
        // thought such a way was not part of our partialBlocks, otherwise we wouldn't be in
        // _resolveIncompleteWayResultTask
        remainingPartialBlocks: partialBlocks,
        nodeIdToWays
      }));
    },

    // If we used intersectionNode at the end of the way, not a regular node,
    // query for its ways to find out if its a real intersection. If it just connects two ways with the same street name,
    // we aren't at the end of the block.
    // Thus we either 1) return a completed block with a real intersection or non intersection node or
    // 2) Return the block with the fake intersection node and next way to indicate that we need to keep constructing
    // the block
    // This returns Result.Ok({nodeIdToWays: {}, block: {ways, nodes}} where waysOfIntersection are the
    // queried ways of the last node to add to our context to help name streets
    ({endedBlock: {ways, nodes, intersectionNodesByWayId}}) => {
      return _completeDeadEndNodeOrQueryForFakeIntersectionNodeResultTask(
        osmConfig,
        {ways, nodes, intersectionNodesByWayId}
      );
    },

    // If we allow it, query for intersection and regular nodes to find the end of the way
    mapToNamedResponseAndInputsMDeep(2, 'endedBlock',
      ({osmConfig, nodes, previousWays, way}) => {
        return R.ifElse(
          osmConfig => {
            return R.propOr(false, 'disableNodesOfWayQueries', osmConfig);
          },
          () => {
            // If we don't allow further querying (disableNodesOfWayQueries is true),
            // we have to use the last point of the way as the end node
            const endBlockNode = R.compose(
              coordinate => nodeFromCoordinate(
                // Use the standard non-OSM node naming convention node/lon:lat
                {id: `node/${hashPoint(coordinate)}`},
                coordinate
              ),
              coordinates => R.last(coordinates),
              way => wayFeatureToCoordinates(way)
            )(way);
            return of(Result.Ok({
              ways: R.concat(
                previousWays,
                [way]
              ),
              nodes: R.concat(
                nodes,
                [endBlockNode]
              ),
              // We don't have this
              intersectionNodesByWayId: {}
            }));
          },
          osmConfig => {
            return _resolveEndBlockNodeOfIncompleteWayResultTask(osmConfig, {nodes, previousWays}, way);
          }
        )(osmConfig);
      }
    )
  ])({osmConfig, nodes, previousWays, way});
};

/**
 * Resolve the last node the way by querying for intersection nodes and non-intersection nodes
 * @param {Object} osmConfig
 * @param {Object} wayContext
 * @param {Object} wayContext.nodes
 * @param {Object} wayContext.previousWays
 * @param {Object} way
 * @return {Task<Result<Object>>} Object containing the ways trimmed to the node, the nodes including the found node,
 * and intersectionNodesByWayId an object of way id to the intersection nodes
 * @private
 */
const _resolveEndBlockNodeOfIncompleteWayResultTask = (osmConfig, {nodes, previousWays}, way) => {
  return composeWithChainMDeep(2, [
    // Find the node at the end of the way, whether or not it's an intersection node or not
    // Produce an extended block with the previous ways and nodes and the new trimmed way and end node
    ({previousWays, way, nodes, nodesAndIntersectionNodesByWayId}) => {
      const {intersectionNodesByWayId, nodesByWayId} = nodesAndIntersectionNodesByWayId;
      const endBlockNode = _resolveEndBlockNode(
        way,
        {intersectionNodesByWayId, nodesByWayId}
      );
      if (!endBlockNode) {
        const error = `Something is wrong with this partially build block ${blockToGeojson({
          ways: [way],
          nodes
        })}. Cannot find an endBlockNode. Giving up on it`;
        log.warn(error);
        return of(Result.Error(error));
      }
      return of(Result.Ok({
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
      }));
    },

    // Query to find all nodes of the final way
    mapToNamedResponseAndInputsMDeep(2, 'nodesAndIntersectionNodesByWayId',
      ({way}) => {
        return nodesAndIntersectionNodesForIncompleteWayResultTask(
          osmConfig,
          {
            way: {
              response: {
                features: [way]
              }
            }
          }
        );
      }
    )
  ])({osmConfig, nodes, previousWays, way});
};

/**
 * If we used intersectionNode at the end of the way, not a regular node, we need to
 * query for its ways to find out if it is a real intersection.
 * If it just connects two ways with the same street name, we aren't at the end of the block.
 * Thus we either 1) return a completed block with a real intersection or non intersection node or
 * 2) Return the block with the fake intersection node and next way to indicate that we need to keep constructing
 * the block
 * @param {Object} osmConfig
 * @param {[Object]} ways The current ways of the block
 * @param {[Object]} nodes The current nodes of the block, where the final node is the one we are checking
 * @param intersectionNodesByWayId
 * @returns {Task<Result<Object>>} Task that resolves to a Result.Ok with an object {nodeIdToWays, block}
 * nodeIdToWays is keyed by the last node id and valued by its ways. It is only set if we didn't have a dead end node,
 * otherwise it is an empty object. It's added to our context so we can name streets correctly
 * A block with {ways, nodes}. It will be a complete block (capped by nodes at both ends of the
 * ordered ways) if it the last node is a dead end or real intersection. It will be an incomplete block with
 * a way sticking off the end if the intersection turned out to be fake and we need to keep processing
 * @private
 */
export function _completeDeadEndNodeOrQueryForFakeIntersectionNodeResultTask(osmConfig, {
  ways,
  nodes,
  intersectionNodesByWayId
}) {
  const way = R.last(ways);
  const node = R.last(nodes);
  return R.ifElse(
    // If the node was from the intersectionNodesByWayId, get the ways of the node to see if it's a real intersection
    ({intersectionNodesByWayId}) => {
      return R.compose(
        features => R.includes(
          R.prop('id', node),
          R.map(R.prop('id'), features)
        ),
        // Get the features of the response if it exists
        intersectionNodes => strPathOr([], 'response.features', intersectionNodes),
        // Get the nodes of the way if we queried for them
        intersectionNodesByWayId => strPathOr([], reqStrPathThrowing('id', way), intersectionNodesByWayId)
      )(intersectionNodesByWayId);
    },

    // If it's an intersection node, find its ways (which we don't have because we thought it was a dead end,
    // then see if it's a real intersection node (not just connecting two ways of the same street). If it's
    // not a real intersection take the second way that is not way and recurse.
    // Diagram +------ - ----- where + is one end of the way and - is what we thought was an intersection,
    // but is actually just a continuation of the street with another way
    ({ways, nodes, node}) => {
      return composeWithChain([
        isRealIntersectionResult => resultToTaskWithResult(
          ({realIntersection, waysOfIntersection}) => {
            // Return this for use in naming streets
            const nodeIdToWays = {[reqStrPathThrowing('id', node)]: waysOfIntersection};
            return R.ifElse(
              R.identity,
              // It's a real intersection, so just accept the node and return the completed block
              // Also return nodeIdToWays to add to our context so we can resolve the street intersection names
              // if we didn't have them yet
              () => of(Result.Ok({nodeIdToWays, block: {ways, nodes}})),
              // It's not a real intersection.
              // Add the fake node intersection and new way, possibly reversing the way to match the flow.
              // This block will get further processing since it's not complete.
              // Also mark the fake intersection node as __FAKE_INTERSECTION__: true so we can remove it after
              // we finish constructing the block
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
                // Return nodeIdToWays to add to our context so we can name the street intersections correctly
                return of(Result.Ok({
                  nodeIdToWays,
                  block: {
                    // Merge in __FAKE_INTERSECTION__: true to the fake intersection node so we can remove it later
                    nodes: R.over(R.lensIndex(-1), R.mergeRight({__FAKE_INTERSECTION__: true}), nodes),
                    ways: R.concat(
                      ways,
                      [nextWay]
                    )
                  }
                }));
              }
            )(realIntersection);
          }
        )(isRealIntersectionResult),

        // Get the ways of the node to determine if it's a real intersection
        result => resultToTaskNeedingResult(
          response => {
            const waysOfIntersection = response.features;
            return of({
              realIntersection: isRealIntersection(waysOfIntersection, node),
              waysOfIntersection
            });
          }
        )(result),

        // Query for ways of the node to find out if it's a real intersection
        ({node}) => osmResultTask({
            name: 'waysOfNodeQueryForFakeIntersection',
            context: {node: reqStrPathThrowing('id', node), type: 'waysOfNode'}
          },
          options => fetchOsmRawTask(options, waysOfNodeQuery(osmConfig, reqStrPathThrowing('id', node)))
        )
      ])({ways, nodes, node});
    },

    // Otherwise we used a non intersection node for a dead-end way and we're done
    block => {
      const {ways, nodes} = block;
      return of(Result.Ok({nodeIdToWays: {}, block: {ways, nodes}, node}));
    }
  )({intersectionNodesByWayId, ways, nodes, way, node});
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
export function _resolveEndBlockNode(way, {intersectionNodesByWayId, nodesByWayId}) {
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
export const _mergeInNewNodeAndWayRelationships = ({
                                                     nodeIdToWays,
                                                     wayIdToNodes,
                                                     wayEndPointToDirectionalWays,
                                                     nodeIdToNodePoint
                                                   }, block) => {
  return R.mergeWith(
    // For each matching top level key, merge and concat+unique arrays or take first for nodeIdToNodePoint
    R.mergeWith(
      (a, b) => R.when(
        Array.isArray, a => R.compose(
          R.uniqBy(reqStrPathThrowing('id')),
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
