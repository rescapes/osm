import {
  reqStrPathThrowing,
  resultToTaskNeedingResult,
  pickDeepPaths,
  resultToTaskWithResult,
  toNamedResponseAndInputs,
  compactEmpty,
  chainObjToValues,
  compact,
  splitAtInclusive
} from 'rescape-ramda';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import {
  highwayNodeFilters,
  highwayWayFilters,
  osmIdToAreaId
} from './overpass';
import * as Result from 'folktale/result';
import {_blocksToGeojson, _blockToGeojson, _queryLocationVariationsUntilFoundResultTask} from './overpassBlockHelpers';
import {parallelWayNodeQueriesResultTask} from './overpassBlockHelpers';
import {nominatimLocationResultTask} from './nominatimLocationSearch';
import {
  findMatchingNodes,
  hashNodeFeature,
  hashPoint,
  hashPointsToWayCoordinates,
  hashWayFeature
} from './overpassFeatureHelpers';

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
 * @param {Object} location A location object
 * @returns {Task<Result<Object>>} Result.Ok in the form {location,  results} if data is found,
 * otherwise Result.Error in the form {errors: {errors, location}, location} where the internal
 * location are varieties of the original with an osm area id added. Result.Error is only returned
 * if no variation of the location succeeds in returning a result
 * The results contain nodes and ways
 */
export const locationToOsmAllBlocksQueryResultsTask = location => {

  // Create a function that expects the location variations and returns the results
  // of _queryForAllBlocksOfLocationsTask for the location variation that overpass can resolve
  // (currently either a neighborhood level query or failing that city level query)
  const _queryOverpassForAllBlocksUntilFoundResultTask = _queryLocationVariationsUntilFoundResultTask(
    _queryOverpassWithLocationForAllBlocksResultTask
  );


  return R.composeK(
    resultToTaskWithResult(
      locationVariationsWithOsm => R.cond([
        [R.length,
          locationVariationsWithOsm => _queryOverpassForAllBlocksUntilFoundResultTask(
            locationVariationsWithOsm
          )
        ],
        // No OSM ids resolved, try to query by geojson bounds
        /*[() => hasLatLngIntersections(location),
          () => _queryOverpassForAllBlocksUntilFoundResultTask({locations: [locations]})
        ], */
        // If no query produced results return a Result.Error so we can give up gracefully
        [R.T,
          () => of(Result.Error({
            errors: ({
              errors: ['OSM Nominatim query could not resolve a neighborhood or city for this location. Check spelling'],
              location
            }),
            location
          }))
        ]
      ])(locationVariationsWithOsm)
    ),
    // Nominatim query on the place search string.
    location => nominatimLocationResultTask(location)
  )(location);
};

/**
 * Queries for all blocks matching the Osm area id in the given location
 * @param {Object} locationWithOsm Location object with  bbox, osmId, placeId from
 * @private
 * @returns {Task<Result<[Object]>>} The block represented as locations
 */
const _queryOverpassWithLocationForAllBlocksResultTask = (locationWithOsm) => {
  return R.composeK(
    result => of(result),
    ({way: wayQuery, node: nodeQuery}) => _queryOverpassForAllBlocksResultTask(
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
            pickDeepPaths(['intersections', 'osmId', 'data.osmOverrides'], locationWithOsm)
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
 * @returns {Task<Result<Object>>} The Geojson nodes and way features in a Result.Ok. If an error occurs,
 * Result.Error is returned. Object has a ways, nodes
 */
const _queryOverpassForAllBlocksResultTask = ({location, way: wayQuery, node: nodeQuery}) => {
  return R.composeK(
    // Finally get the features from the response
    resultToTaskNeedingResult(
      ({way, node}) => {
        const [wayFeatures, nodeFeatures] = R.map(reqStrPathThrowing('response.features'), [way, node]);
        return R.compose(
          goo => of(goo),
          toNamedResponseAndInputs('4',
            // 4) Return all blocks found in {Ok: []}. All ways and nodes not used in {Error: []}
            f => f
          ),
          toNamedResponseAndInputs('3',
            ({blocks}) => _blocksToGeojson(R.slice(0, 100, blocks))
          ),
          toNamedResponseAndInputs('blocks',
            // For each block travel along it and accumulate connected ways until we reach a node or dead end
            // If a node is reached trim the last way to end at that node
            ({wayIdToNodes, wayIdToWayPoints, wayEndPointToDirectionalWays, nodeIdToNodePoint, partialBlocks}) => {
              return R.map(
                partialBlock => recursivelyBuildBlock(
                  {wayIdToNodes, wayIdToWayPoints, wayEndPointToDirectionalWays, nodeIdToNodePoint},
                  partialBlock
                ),
                partialBlocks
              );
            }
          ),
          toNamedResponseAndInputs('partialBlocks',
            // 1 Travel from every node along the directional ways
            //  A If starting at way end, travel other direction. Go to step 2 for the one direction CONTINUE
            //  B Else travel both directions to next node/way endpoint. Go to step 2 for each direction CONTINUEx2
            // For area ways (pedestrian areas) find nodes within 5 meters of each waynode. Hash way <-- TODO
            //    If the area way only matches one node, hash that matching waynode as a wayendnode.
            //    (Above when we travel we'll start at the matching node and go around the area until we reach another node or the wayendnode at the starting point)
            // At the end of this process we have a list of objects with nodes and ways.
            // nodes has just the start node and ways has just one directional (partial) way whose first point
            // is the node
            ({wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint}) => R.unnest(chainObjToValues(
              (ways, nodeId) => {
                const nodePoint = reqStrPathThrowing(nodeId, nodeIdToNodePoint);
                return R.map(
                  way => {
                    const wayToSplitAndOrderedWays = way => R.compose(
                      ({way, wayPoints, index}) => R.map(
                        // Process splits, maybe reverse the partial way points to start at the node index
                        partialWayPoints => {
                          const orderedWayPartialPoints = R.unless(
                            R.compose(
                              R.equals(0),
                              R.indexOf(nodePoint)
                            ),
                            R.reverse
                          )(partialWayPoints);
                          // Create a new version of the way with these points
                          return R.set(
                            R.lensPath(['geometry', 'coordinates']),
                            // Changed the hashed points pack to array pairs
                            hashPointsToWayCoordinates(orderedWayPartialPoints),
                            way
                          );
                        },
                        // Split the way points at the node index (ignoring intersections with other nodes)
                        // We split inclusively to get the split point in each result set, but reject single
                        // point results
                        R.reject(
                          R.compose(R.equals(1), R.length),
                          compactEmpty(splitAtInclusive(index, wayPoints))
                        )
                      ),
                      toNamedResponseAndInputs('index',
                        // Get the index of the node in the way's points
                        ({wayPoints}) => R.indexOf(nodePoint, wayPoints)
                      ),
                      toNamedResponseAndInputs('wayPoints',
                        // Get the way points of the way
                        ({way}) => reqStrPathThrowing(R.prop('id', way), wayIdToWayPoints)
                      )
                    )({way});
                    // Travel in one or both directions returning a separate object for each node with one ordered ways coming from it
                    return R.map(
                      partialWay => {
                        return {nodes: [R.prop(nodeId, nodeIdToNode)], ways: [partialWay]};
                      },
                      wayToSplitAndOrderedWays(way)
                    );
                  },
                  ways
                );
              },
              nodeIdToWays
            ))
          ),
          toNamedResponseAndInputs('wayEndPointToDirectionalWays',
            // Hash way endings (wayendnode) ids unless it matches a node in the nodePointToNode (wayendnodehash)
            ({wayFeatures, wayIdToWayPoints, nodePointToNode}) => R.compose(
              // way end points will usually be unique, but some will match two ways when two ways meet at a place
              // that is not an intersection
              // This produces {wayEndPoint: [...ways with that end point], ...}
              endPointToWayPair => R.reduceBy(
                (acc, [endPoint, way]) => R.concat(acc, [way]),
                [],
                ([endPoint]) => endPoint,
                endPointToWayPair
              ),
              R.chain(
                wayFeature => {
                  const wayCoordinates = reqStrPathThrowing(R.prop('id', wayFeature), wayIdToWayPoints);
                  return R.compose(
                    endPointObjs => R.map(({endPoint, way}) => [endPoint, way], endPointObjs),
                    // Filter out points that are already nodes
                    endPointObjs => R.filter(
                      ({endPoint}) => R.not(R.propOr(false, endPoint, nodePointToNode)),
                      endPointObjs
                    ),
                    // Get the first and last point of the way
                    wayCoordinates => R.map(
                      prop => (
                        {
                          endPoint: R[prop](wayCoordinates),
                          way: R.when(
                            () => R.equals('tail', prop),
                            // For the tail end point, created a copy of the wayFeature with the coordinates reversed
                            // This makes it easy to traverse the ways from their endPoints.
                            // Since we hash ways independent of directions, we'll still detect ways we've already traversed
                            wayFeature => R.over(R.lensPath(['geometry', 'coordinates']), R.reverse, wayFeature)
                          )(wayFeature)
                        }
                      ),
                      ['head', 'last']
                    )
                  )(wayCoordinates);
                }
              )
            )(wayFeatures)
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
            // is an area-way (pedestrian area) within 5m (waynodehash) <-- TODO
            ({nodePointToNode, wayFeatures}) => {
              return R.fromPairs(R.map(
                wayFeature => [R.prop('id', wayFeature), findMatchingNodes(nodePointToNode, wayFeature)],
                wayFeatures
              ));
            }
          ),
          toNamedResponseAndInputs('wayIdToWay',
            // way id to way
            ({wayFeatures}) => {
              return R.indexBy(
                R.prop('id'),
                wayFeatures
              );
            }
          ),
          toNamedResponseAndInputs('nodeIdToNodePoint',
            // Hash intersection nodes by id. These are all intersections (nodehash)
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
            // Hash intersection nodes by id. These are all intersections (nodehash)
            ({nodeFeatures}) => R.indexBy(
              R.prop('id'),
              nodeFeatures
            )
          )
        )({wayFeatures, nodeFeatures});
      }
    ),

    // Query for the ways and nodes in parallel
    queries => parallelWayNodeQueriesResultTask(location, queries)
  )({way: wayQuery, node: nodeQuery});
};

/**
 * Given a partial block, meaning a block with one node and one or more connected directional ways, recursively
 * travel from the one node to find the closest node, or failing that the next connected way, or failing that
 * end because we have a dead end
 * @param wayIdToNodes
 * @param wayIdToWayPoints
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
const recursivelyBuildBlock = ({wayIdToNodes, wayIdToWayPoints, wayEndPointToDirectionalWays, nodeIdToNodePoint}, partialBlock) => {
  // We only have 1 node until we finish, but we could have any number of ways
  const {nodes, ways} = partialBlock;
  // Get the current final way of the partial block
  const currentFinalWay = R.last(ways);
  // Get the remaining way points, excluding the first point that the node is on
  const remainingWayPoints = R.compose(
    R.tail,
    id => reqStrPathThrowing(id, wayIdToWayPoints),
    way => R.prop('id', way)
  )(currentFinalWay);

  // Get the first node along this final way, excluding the starting point.
  // If the way is a loop with no other nodes, it could be the same node we started with
  const {firstNodeOfFinalWay, trimmedWay} = R.compose(
    // Chop the way at the node intersection
    nodeObj => R.ifElse(R.identity, nodeObj => ({
        firstNodeOfFinalWay: R.prop('node', nodeObj),
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
  // Replaced the last way of ways with the trimmedWay
  const trimmedWays = R.concat(R.init(ways), [trimmedWay || R.last(ways)])

  // If no node was found, look for the ways at the of the currentFinalWay
  // There might be a way or we might be at a dead end where there is no connecting way
  // The found ways points will flow in the right direction since wayEndPointToDirectionalWays directs
  // ways from the end point
  const waysAtEndOfFinalWay = R.ifElse(R.isNil,
    () => R.compose(
      // Minus the current final way itself
      ways => R.reject(R.equals(currentFinalWay), ways),
      // Any way touching the end point of the current final way
      endPoint => R.propOr([], endPoint, wayEndPointToDirectionalWays),
      // Get the last point of the current final way
      wayPoints => R.last(wayPoints)
    )(remainingWayPoints),
    () => []
  )(firstNodeOfFinalWay);

  const block = {
    // Combine nodes (always 1 node) with firstNodeOfFinalWay if it was found
    nodes: R.concat(nodes, compact([firstNodeOfFinalWay])),
    // Combine current ways (with the last current way possibly shortened)
    // with waysAtEndOfFinalWay if firstNodeOfFinalWay was null and a connect way was found
    ways: R.concat(trimmedWays, waysAtEndOfFinalWay)
  };
  // If the block is complete because there are two blocks now, or failing that we didn't find a joining way,
  // just return the block, otherwise recurse to travel more to
  // reach a node along the new way, reach another way, or reach a dead end
  return R.when(
    block => R.both(
      // Only 1 node so far
      block => R.compose(R.equals(1), R.length, R.prop('nodes'))(block),
      // And we added a new way, so can recurse
      () => R.compose(R.equals(1), R.length)(waysAtEndOfFinalWay)
    )(block),
    block => recursivelyBuildBlock(
      {wayIdToNodes, wayIdToWayPoints, wayEndPointToDirectionalWays, nodeIdToNodePoint},
      block
    )
  )(block);
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
 * @param {[Number]} [data.osmOverrides.nodes] Optional 2 node ids
 * @param {[Number]} [data.osmOverrides.ways] Optional 1 or more way ids
 * @param {[Object]} [geojsonBounds] Optional. Bounds to use instead of the area of the osmId
 * @returns {string} The complete Overpass query string
 */
const _constructHighwaysQuery = ({type}, {osmId, data}, geojsonBounds) => {

  if (R.not(R.or(osmId, geojsonBounds))) {
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
    _createQueryWaysDeclarations(areaId, geojsonBounds)
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
const _createQueryWaysDeclarations = (areaId, geojsonBounds) => {
  return R.cond([
    // TODO handle geojsonBounds
    // We don't have hard-coded way ids, so search for these values by querying
    [R.T, () => {
      const wayQuery = `way(area:${areaId})${highwayWayFilters}`;
      return `${wayQuery}->.ways;`;
    }]
  ])(geojsonBounds);
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
 * @param {String} type Either way or node. We have to query nodes and ways seperately to prevent geojson output errors
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