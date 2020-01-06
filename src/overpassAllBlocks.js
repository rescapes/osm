import {loggers} from 'rescape-log';

const log = loggers.get('rescapeDefault');
import {
  reqStrPathThrowing,
  pickDeepPaths,
  resultToTaskWithResult,
  toNamedResponseAndInputs,
  mapToNamedResponseAndInputs,
  strPathOr,
  mapMDeep,
  toArrayIfNot,
  composeWithChainMDeep,
  traverseReduceWhile,
  traverseReduceDeep,
  mapToNamedResponseAndInputsMDeep
} from 'rescape-ramda';
import distance from '@turf/distance';
import {
  turfPointToLocation
} from 'rescape-helpers';
import {turfBboxToOsmBbox, extractSquareGridFeatureCollectionFromGeojson} from 'rescape-helpers';
import center from '@turf/center';
import bbox from '@turf/bbox';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import {
  aroundPointDeclaration,
  configuredHighwayWayFilters,
  highwayNodeFilters,
  osmIdToAreaId
} from './overpassHelpers';
import * as Result from 'folktale/result';
import {
  _buildPartialBlocks,
  _sortOppositeBlocksByNodeOrdering,
  _hashBlock,
  _queryLocationVariationsUntilFoundResultTask,
  waysByNodeIdTask
} from './overpassBlockHelpers';
import {parallelWayNodeQueriesResultTask} from './overpassBlockHelpers';
import {nominatimLocationResultTask, nominatimReverseGeocodeToLocationResultTask} from './nominatimLocationSearch';
import {
  _intersectionStreetNamesFromWaysAndNodesResult
} from './overpassFeatureHelpers';
import {
  geojsonFeaturesHaveShapeOrRadii,
  isNominatimEligible,
  geojsonFeaturesHaveShape,
  geojsonFeaturesHaveRadii,
  locationAndOsmResultsToLocationWithGeojson, geojsonFeaturesIsPoint
} from './locationHelpers';
import {length} from '@turf/turf';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {_calculateNodeAndWayRelationships} from './overpassBlocks';
import {
  _recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask
} from './overpassBuildBlocks';
import {geocodeJursidictionResultTask} from './googleLocation';

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
 * location are varieties of the original with an osm area id added. result.Error is only returned
 * if no variation of the location succeeds in returning a result
 */
export const locationToOsmAllBlocksQueryResultsTask = v((osmConfig, location) => {
  return R.composeK(
    // Unwrap the result we created for _queryLocationVariationsUntilFoundResultTask
    // Put it in the {Ok: [], Error: []} structure
    result => {
      return of(result.matchWith({
        Ok: ({value}) => ({
          Ok: toArrayIfNot(value),
          Error: []
        }),
        Error: ({value}) => ({
          Error: toArrayIfNot(value),
          Ok: []
        })
      }));
    },
    // The last step is to assign each location jurisdiction information if it doesn't already have it
    // We check country and (city or county) of the location and only query for jurisdiction data if it lacks these fields
    result => resultToTaskWithResult(
      // Process Result Tasks locations, merging in jurisdiction data when needed
      // Task Result [Location] -> Task Result [Location]
      resultsAndLocations => {
        return traverseReduceDeep(2,
          (locations, location) => R.concat(locations, [location]),
          of(Result.Ok([])),
          R.map(
            ({results, location}) => {
              return R.ifElse(
                ({location}) => {
                  return R.both(
                    location => R.propOr(null, 'country', location),
                    location => R.any(
                      prop => R.propOr(null, prop, location),
                      ['city', 'country']
                    )
                  )(location);
                },
                // If we had a country or city, we already have jurisdiction data. Just rewrap in Result.Ok and task
                obj => R.compose(of, Result.Ok)(obj),
                // Reverse geocode and combine results, favoring keys already in location
                ({results, location}) => {
                  // Task Result Object -> Task Result Object
                  return mapMDeep(2,
                    l => {
                      // Merge the results of the reverse goecoding. We'll keep our geojson since it represents
                      // the block and the reverse geocode just represents the center point
                      return {results, location: R.merge(l, location)};
                    },
                    // Reverse geocode the center of the block to get missing jurisdiction data
                    nominatimReverseGeocodeToLocationResultTask(
                      // Convert the geojson line into a {lat, lon} center point
                      R.compose(
                        latLon => R.fromPairs(R.zip(['lat', 'lon'], latLon)),
                        point => turfPointToLocation(point),
                        geojson => center(geojson),
                        location => R.prop('geojson', location)
                      )(location)
                    )
                  );
                }
              )({results, location});
            },
            resultsAndLocations
          )
        );
      }
    )(result),
    // Use the results to create geojson for the location
    // Task Result [<results, location>] -> Task Result [<results, location>]
    result => of(mapMDeep(2,
      ({results, location}) => {
        return {
          results,
          location: locationAndOsmResultsToLocationWithGeojson(location, results)
        };
      }
    )(result)),
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
        location => composeWithChainMDeep(2, [
          ({nominatimLocations, googleLocation}) => {
            // If we get a googleLocation that is more than 100 meters from the nominatim point,
            // use the Google center point for the geojson
            const nominatimLocation = R.head(nominatimLocations || []);
            const dist = (nominatimLocationGeojson, googleLocationGeojson) => distance(
              nominatimLocationGeojson,
              googleLocationGeojson,
              {units: 'meters'}
            );
            const resolvedLocations = R.ifElse(
              ({nominatimLocation, googleLocation}) => R.allPass(
                [
                  ({nominatimLocation}) => nominatimLocation,
                  ({googleLocation}) => googleLocation,
                  ({nominatimLocation, googleLocation}) => {
                    return R.lt(100, dist(
                      nominatimLocation,
                      googleLocation)
                    );
                  }
                ])({
                nominatimLocation: strPathOr(null, 'geojson.features.0', nominatimLocation),
                googleLocation: strPathOr(null, 'geojson', googleLocation)
              }),
              ({nominatimLocation, googleLocation}) => {
                log.debug(`Preferring Google's jurisdiction center point over OSM's. They are ${
                  dist(
                    strPathOr(null, 'geojson.features.0', nominatimLocation),
                    strPathOr(null, 'geojson', googleLocation)
                  )
                } meters apart`);
                return Array.of(R.set(
                  // Replace just the geometry of the only feature. We don't want to replace proprties like radius
                  R.lensPath(['geojson', 'features', 0, 'geometry']),
                  // Replaces the single feature
                  reqStrPathThrowing('geojson.geometry', googleLocation),
                  nominatimLocation
                ));
              },
              ({nominatimLocations}) => nominatimLocations
            )({nominatimLocation, googleLocation});
            log.info(`Resolved the following jurisdiction locations ${JSON.stringify(resolvedLocations)}`);
            return of(Result.Ok(resolvedLocations));
          },
          // If nominatimLocationResultTask gives us a center point back, ask Google for it's center point
          // for the Jurisdiction. If Google's is really different, use Google's which usually has better
          // center points in terms of what is the activity center of the city
          mapToNamedResponseAndInputsMDeep(2, 'googleLocation',
            ({nominatimLocations}) => {
              return R.ifElse(
                nominatimLocations => R.allPass([
                  R.length,
                  strPathOr(false, '0.geojson.features'),
                  nominatimLocations => {
                    return geojsonFeaturesIsPoint(reqStrPathThrowing('geojson', R.head(nominatimLocations)));
                  }
                ])(nominatimLocations),
                () => geocodeJursidictionResultTask(location),
                () => of(Result.Ok(null))
              )(nominatimLocations);
            }
          ),
          mapToNamedResponseAndInputsMDeep(2, 'nominatimLocations',
            ({location}) => {
              return nominatimLocationResultTask({
                listSuccessfulResult: true,
                allowFallbackToCity: R.propOr(false, 'allowFallbackToCity', osmConfig)
              }, location);
            })
        ])({location})
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
            pickDeepPaths(['osmId', 'osmType', 'geojson'], locationWithOsm)
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
    // Task Result [<way, node>] -> Task <Ok: [Location], Error: [<way, node>]>
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
 * @returns {Task<Ok:[block], Error:[]>} where block is an object with {ways, nodes}
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
        const nodesToIntersectingStreets = _intersectionStreetNamesFromWaysAndNodesResult(
          reqStrPathThrowing('ways', block),
          reqStrPathThrowing('nodes', block),
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
            // ways add up to at least 20 meters
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
              nodesToIntersectingStreets: _intersectionStreetNamesFromWaysAndNodesResult(
                reqStrPathThrowing('ways', block),
                reqStrPathThrowing('nodes', block),
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
          block => _hashBlock(R.over(R.lensProp('nodes'), () => [], block)),
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
      ({wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint, wayIdToNodes, wayIdToWay}) => _buildPartialBlocks(
        {wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint, wayIdToNodes, wayIdToWay}
      )
    ),
    ({ways, nodes}) => R.merge({ways, nodes}, _calculateNodeAndWayRelationships(({ways, nodes})))
  )({ways, nodes, location});
};

/**
 * Construct one or more Overpass queries to get all eligible highway ways or nodes for area of the given osmId or optionally
 * geojsonBOunds
 * @param {Object} osmConfig
 * @param {String} type 'way' or 'node' We have to do the queries separately because overpass combines the geojson
 * results in buggy ways
 * @param {Object} location Location data optionally containing OSM overrides
 * @param {String} [location.osmId] OSM id to be used to constrain the area of the query. This id corresponds
 * to a neighborhood or city's boundaries or a center point.
 * @param {String} [location.osmType] Either 'relation' for a boundary or 'point' for a jurisdiction's center point.
 * If center point is specified there must be a feature present in the location.geojson.features that defines
 * a radius to search
 * It can only be left undefined if geojson features are defined
 * @param {Object} [location.geojson] The location geojson features to query individually if the query is not based on jurisdiction
 * @param {Object} [location.osmOverrides] Optional overrides to force certain OSM way and node ids
 * @param {Object} [location.country] For radius queries based on jurisdiction
 * @returns {[string]} The queries for each feature of the location, or possibly more if the location features
 * are broken up into smaller bounding boxes
 */
function _constructHighwayQueriesForType(osmConfig, {type}, location) {

  const {osmId, geojson} = location;

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
        feature => {
          return {areaId, geojson: {features: [feature]}};
        },
        // Get 1km squares of the area
        extractSquareGridFeatureCollectionFromGeojson({cellSize: 1, units: 'kilometers'}, geojson).features
      )
    ],
    // If feature properties have radii split them up into features.
    // The properties.radius instructs OSM what around:radius value to use
    [({geojson}) => {
      return geojsonFeaturesHaveRadii(geojson);
    },
      ({areaId, geojson}) => {
        return R.map(
          feature => ({areaId, geojson: {features: [feature]}}),
          geojson.features
        );
      }
    ],
    // Just put the location in an array since we'll search for it by areaId
    [({areaId}) => areaId, Array.of],
    // This should never happen
    [R.T, () => {
      throw new Error('Cannot query for a location that lacks both an areaId and geojson features with shapes or radii');
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
      ({geojson}) => geojsonFeaturesHaveShape(geojson),
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
    [
      ({geojson}) => geojsonFeaturesHaveRadii(geojson),
      ({geojson}) => {
        return R.map(
          feature => {
            const around = R.cond([
              [
                feature => R.propEq('type', 'Point', reqStrPathThrowing('geometry', feature)),
                feature => aroundPointDeclaration(reqStrPathThrowing('properties.radius', feature), feature)
              ],
              [R.T,
                feature => {
                  throw new Error(`Feature type must be a Point to do radius query: ${JSON.stringify(feature)}`);
                }
              ]
            ])(feature);
            // Filter by radius
            const wayQuery = `way${around}${configuredHighwayWayFilters(osmConfig)}`;
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
