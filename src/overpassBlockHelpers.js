/**
 * Created by Andy Likuski on 2019.08.13
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */


import {featuresOfOsmType, wayFeatureNameOrDefault} from './locationHelpers.js';
import {
  _calculateNodeAndWayRelationships,
  configuredHighwayWayFilters,
  fetchOsmRawTask,
  highwayNodeFilters,
  highwayWayFiltersNoAreas,
  highwayWayFiltersOnlyAreas,
  osmResultTask
} from './overpassHelpers.js';
import {
  chainObjToValues,
  compactEmpty, composeWithChain,
  composeWithChainMDeep,
  composeWithMap,
  composeWithMapMDeep,
  mapMDeep,
  mapObjToValues,
  mapToNamedResponseAndInputs,
  mapToNamedResponseAndInputsMDeep,
  mergeAllWithKey,
  omitDeep,
  reqStrPathThrowing,
  resultsToResultObj, sequenceBucketed,
  splitAtInclusive,
  strPathOr,
  taskToResultTask,
  toMergedResponseAndInputs,
  toNamedResponseAndInputs,
  traverseReduce,
  traverseReduceResultError,
  traverseReduceWhile,
  waitAllBucketed
} from '@rescapes/ramda';
import {loggers} from '@rescapes/log';
import {
  _intersectionStreetNamesFromWaysAndNodesResult,
  _linkedFeatures,
  _reduceFeaturesByHeadAndLast,
  cleanGeojson,
  hashNodeFeature,
  hashPoint,
  hashPointsToWayCoordinates,
  hashWayFeature,
  nodeMatchesWayEnd
} from './overpassFeatureHelpers.js';
import * as R from 'ramda';
import T from 'folktale/concurrency/task/index.js';
import Result from 'folktale/result/index.js';

import {scaleOrdinal} from 'd3-scale';
import {schemeCategory10} from 'd3-scale-chromatic';
import {length} from '@turf/turf';
import {v} from '@rescapes/validate';
import PropTypes from 'prop-types';
import {isNode} from 'browser-or-node';

const {of, waitAll, task, rejected} = T;

let fs;
if (isNode) {
  import('fs-extra')
    .then(_fs => {
      fs = _fs.default
    });
}

const log = loggers.get('rescapeDefault');


/**
 * Simple OSM query to return the ways of an intersection node.
 * @param {Object} osmConfig
 * @param {String} nodeId In the form 'node/id'
 * @returns {string}
 */
export const waysOfNodeQuery = (osmConfig, nodeId) => {
  const id = R.compose(
    R.last,
    R.split('/')
  )(nodeId);
  return `
    // waysOfNodeQuery for nodeId: ${id}
    node(id:${id})->.matchingNode;
    (
    ${
    // Include way areas if includePedestrianArea is specified
    R.ifElse(
      osmConfig => R.propOr(false, 'includePedestrianArea', osmConfig),
      () => `// Find ways within 10 meters of the node for ways with area=="yes" and ways containing the node otherwise
      way(around.bn.matchingNode:10)${highwayWayFiltersOnlyAreas};
      `,
      () => ''
    )(osmConfig)
  }
    way(bn.matchingNode)${highwayWayFiltersNoAreas};
    )->.matchingWays;
    .matchingWays out geom;
  `;
};

/**
 * Query to get all nodes of the given way, not just intersection nodes
 * @param osmConfig
 * @param {Object} [osmConfig.includePedestrianArea] Default false, include pedestrian areas in the query
 * This helps us break up blocks at pedestrian areas but currently creates some extra blocks we don't want
 * @param wayId
 * @returns {string}
 */
const nodesOfWayQuery = (osmConfig, wayId) => {
  const id = R.compose(
    R.last,
    R.split('/')
  )(wayId);
  return `
// nodesOfWayQuery 
    // Always include area way queries in case a way's end is node is part of an area
    way(id:${id})[area = "yes"]->.matchingAreaWay;
    way(id:${id})[area != "yes"]->.matchingWay;
    // Find nodes within 10 meters of the node for ways with area=="yes" and ways containing the node otherwise
    (
    ${
    // Include way areas if includePedestrianArea is specified
    R.ifElse(
      osmConfig => R.propOr(false, 'includePedestrianArea', osmConfig),
      () => `node(around.w.matchingAreaWay:10)${highwayNodeFilters};`,
      () => ''
    )(osmConfig)
  }
    node(w.matchingWay)${highwayNodeFilters};
    )->.matchingNodes;
    .matchingNodes out geom;
  `;
};

/**
 * Query to get all intersection nodes of the given wayFeature, not just intersection nodes
 * @param {Object} osmConfig
 * @param {Boolean} osmConfig.includePedestrianArea Default false, include areas in wayFeature query results
 * @param {Object} wayContext
 * @param {Object} wayContext.wayFeature Context info about the wayFeature to put in the osm query comments
 * @param {String} wayId The OSM way id
 * @returns {string} The query string
 */
const intersectionNodesOfWayQuery = (osmConfig, {wayFeature}, wayId) => {
  const id = R.compose(
    R.last,
    R.split('/')
  )(wayId);
  const wayFeatureName = wayFeatureNameOrDefault('UNNAMED STREET', wayFeature);
  return `
  // Query for intersectionNodesOfWay of street: ${wayFeatureName} with id ${wayId}
  ${
    // Include wayFeature areas if includePedestrianArea is specified
    R.ifElse(
      osmConfig => R.propOr(false, 'includePedestrianArea', osmConfig),
      () => `way(id:${id})[area = "yes"]->.matchingAreaWay;`,
      () => ''
    )(osmConfig)
  }
    way(id:${id})[area != "yes"]->.matchingWay;
    // Find nodes within 10 meters of the node for ways with area=="yes" and ways containing the node otherwise
    (
    ${
    // Include wayFeature areas if includePedestrianArea is specified
    R.ifElse(
      osmConfig => R.propOr(false, 'includePedestrianArea', osmConfig),
      () => `node(around.w.matchingAreaWay:10)${highwayNodeFilters};`,
      () => ''
    )(osmConfig)
  }
    node(w.matchingWay)${highwayNodeFilters};
    )->.matchingNodes;
    // Find the nodes that are intersections
    foreach .matchingNodes -> .currentNode(
    // TODO enable area here when areas above is uncommented 
  way(bn.currentNode)${configuredHighwayWayFilters(osmConfig)}->.allWays;
  ${
    // Include wayFeature areas if includePedestrianArea is specified
    R.ifElse(
      osmConfig => R.propOr(false, 'includePedestrianArea', osmConfig),
      () => `(.allWays; - .matchingAreaWay;)->.eligibleWays;`,
      () => '(.allWays;)->.eligibleWays;'
    )(osmConfig)
  }
  (.eligibleWays; - .matchingWay;)->.allOtherWays;
  node(w.allOtherWays)->.nodesOfAllOtherWays;
  node.currentNode.nodesOfAllOtherWays->.intersectionNodes;
  (.intersectionNodes; .allIntersectionNodes;)->.allIntersectionNodes;
);
.allIntersectionNodes; out geom;
  `;
};


/***
 * Queries the locationWithNominatimData with the OverPass API for its given street block. Querying happens once or twice, first
 * with the neighborhood specified (faster) and then without if no results return. The neighborhood is
 * also be omitted in a first and only query if the locationWithNominatimData doesn't have one
 * @param {Function<location>} queryLocationResultTask Called with each locationWithNominatimData variation and must return
 * a result task with the query results
 * @param {[Object]} locationVariationsOfOsm 1 or more of the same locationWithNominatimData with different osmIds
 * The first should be a neighborhood osmId if available, and the second is the city osmId. We hope to get
 * results with the neighborhood level osmId because it is faster, but if we get no results we query with the
 * city osmId. Alternatively this can be a locationWithNominatimData with lat/lons specified for the intersections.
 * Having lat/lons is just as good as an osmId
 * @returns {Task<Result<Object>>} Result.Ok in the form {locationWithNominatimData, block} or a Result.Error in the form {locationWithNominatimData, error}
 * The block contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysByNodeId, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the locationWithNominatimData's block is listed first followed by the rest (usually one)
 * in alphabetical order
 */
export const _queryLocationVariationsUntilFoundResultTask = R.curry((osmConfig, queryLocationResultTasks, locationVariationsOfOsm) => {
  return composeWithChain([
    result => of(
      // If we had no results report the errors of each query
      // We create this somewhat strange format so that we know what variation of the locationWithNominatimData was used for each
      // query. So the Result.Error looks like:
      // {
      //  errors: [
      //    {
      //       errors: [
      //        { error: error message about the query, nodeQuery: the osm way query },
      //        { error: error message about the query, nodeQuery: the osm node query},
      //       ]
      //       locationWithNominatimData: the variation of the locationWithNominatimData for this query
      //    },
      //    ... other locationWithNominatimData variations that were tried
      //  ]
      //  locationWithNominatimData: arbitrary first variation of the locationWithNominatimData
      // }
      result.mapError(errors => ({
          errors: R.map(location => ({errors, location}), locationVariationsOfOsm),
          location: R.head(locationVariationsOfOsm)
        })
      )
    ),
    // A chained Task that runs 1 or 2 queries as needed
    locationVariationsOfOsm => traverseReduceWhile(
      {
        // Fail the _predicate to stop searching when we have a Result.Ok
        predicate: (previousResult, result) => R.complement(Result.Ok.hasInstance)(result),
        // Take the the last accumulation after the _predicate fails
        accumulateAfterPredicateFail: true
      },

      // If we get a Result.Ok, just return it. The first Result.Ok we get is our final value
      // When we get Result.Errors, concat them for reporting
      (previousResult, result) => result.matchWith({
        Error: ({value}) => previousResult.mapError(R.append(value)),
        Ok: R.identity
      }),
      // Starting condition is failure
      of(Result.Error([])),
      // Create a list of Tasks. We'll only run as many as needed
      // We start with limiting queries to a neighborhood and if nothing there works or there is no hood we limit
      // to the city. Within each area why try up to 3 queries.
      // chain here is used to flatten the multiple results produced by each locationsWithOsm
      R.chain(
        locationWithOsm => queryLocationResultTasks(osmConfig, locationWithOsm),
        locationVariationsOfOsm
      )
    )
  ])(locationVariationsOfOsm);
});

/**
 * Perform the OSM queries in parallel
 * @param {Object} osmConfig
 * @param {Object} location Only used for context for testing with mocks
 * @param {Object} queries Object keyed by query type 'way' and 'node' and valued by and array of OSM query strings.
 * The feature results of multiple way queries are combined uniquely and the results of multiple node queries are combined uniquely
 * @returns {Task<Result<Object>>} A Result.Ok The original query object with response props added containing the OSM response.
 * If one of the queries fail then a Result.Error object is returned with the errors instead
 * @sig parallelWayNodeQueriesResultTask:: String query, Object response <way: <query, node: <query> -> Task <way: <query, response>, node: <query, response>>>
 */
export const parallelWayNodeQueriesResultTask = (osmConfig, location, queries) => {
  return R.compose(
    // This converts failed tasks to a Result.Error and success to Result.Ok
    taskToResultTask,
    // Produce the two Result Tasks.
    // TODO If either Result is an Error the whole thing should be a Result Error
    queries => {
      return R.map(
        // If both results are Result.Ok, combine them. Otherwise create a result
        // Just combine the results to get {way: {query, response}, node: {query, response}}
        objResults => {
          return R.ifElse(
            objResults => {
              return R.all(r => Result.Ok.hasInstance(r), objResults);
            },
            // Merge them into a Result.Ok
            objResults => {
              return traverseReduce(R.merge, Result.Ok({}), objResults);
            },
            // When there is a Result.Error from Overpass it's in the form Result.Error[{value, server}]. So
            // we concat these errors
            objResults => {
              return traverseReduceResultError(
                (accum, errors) => {
                  return R.over(
                    R.lensProp('error'), error => R.concat(error, errors), accum
                  );
                },
                Result.Error({location, error: []}),
                objResults
              );
            }
          )(objResults);
        },
        waitAll(
          // mapObjToValues removes the way and node keys from query
          mapObjToValues(
            (queries, type) => {
              return composeWithChain([
                // Then map the task response to include the queries for debugging/error resolution
                // if the OSM can't be resolved
                // Maps Result.Ok to a {
                // way|node: {query: original query, response: unique features}
                //}
                result => {
                  return of(
                    R.map(
                      response => ({
                        [type]: {
                          queries,
                          response
                        }
                      }),
                      result
                    )
                  );
                },
                // For each type, way and node, combine the unique features of all the queries
                results => {
                  return of(
                    traverseReduce(
                      (accum, response) => R.over(
                        R.lensProp('features'),
                        features => R.compose(
                          R.uniqBy(R.prop('id')),
                          features => R.concat(features, strPathOr([], 'features', response))
                        )(features),
                        accum
                      ),
                      Result.Ok({type: 'FeatureCollection', features: []}),
                      results
                    )
                  );
                },
                // Perform the tasks in parallel
                ({queries, type}) => {
                  return sequenceBucketed({monadType: of},
                    R.map(
                      query => osmResultTask({
                          name: `parallelWayNodeQueriesResultTask: ${type}`,
                          context: R.merge({type}, location)
                        },
                        options => {
                          return fetchOsmRawTask(options, query);
                        }
                      ),
                      queries
                    )
                  );
                }
              ])({queries, type});
            },
            queries
          )
        )
      );
    }
  )(queries);
};

/***
 * Given node results this finds all ways of each node so that we can resolve street names of the intersections
 * @param {Object} osmConfig
 * @param {Object} location Only used for context for mock tests
 * @param {Object} queries
 * @param {Object} queries.way Currently non used but returned
 * @param {Object} queries.node Response contains the nodes
 * @param {Object} queries.node.response Response containing the nodes
 * @returns {Task<Object>} Object keyed by way, node, and waysByNodeId. waysByNodeId is and object keyed
 * by nodeId and valued by a query and response
 * @sig waysByNodeIdResultsTask:: Task {Ok: <way: <query, response>, node: <query, response>>>, Error: [node id queris that error]} ->
 * Task <way: <query, response>, node: <query, response>, waysByNodeId: <node: <query, response>>>> ->
 */
export const waysByNodeIdResultsTask = (osmConfig, {way, node}) => {
  return R.map(
    // Just combine the results to get {nodeIdN: {query, response}, nodeIdM: {query, response}, ...}
    resultObjs => {
      // Split the Result.Ok and Result.Errors into {Ok: [...], Error: [...]}
      const resultObj = resultsToResultObj(resultObjs);
      // Merge the oks and call them waysByNodeId
      return R.over(
        R.lensProp('Ok'),
        objs => {
          return {
            way, node, waysByNodeId: R.mergeAll(objs)
          };
        },
        resultObj
      );
    },
    waitAll(
      R.map(
        nodeId => {
          return mapMDeep(2,
            // Then map the task response to include the query for debugging/error resolution
            response => {
              return {[nodeId]: {query: waysOfNodeQuery(osmConfig, nodeId), response: response}};
            },
            // Perform the task
            osmResultTask({name: 'waysOfNodeQuery', context: {nodeId, type: 'waysOfNode'}},
              options => fetchOsmRawTask(options, waysOfNodeQuery(osmConfig, nodeId))
            )
          );
        },
        // Extract the id of each node
        R.compose(
          R.map(reqStrPathThrowing('id')),
          reqStrPathThrowing('response.features')
        )(node)
      )
    )
  );
};

/***
 * Given way results that are not complete, this finds all nodes of each way.
 * This is used for ways at the edge of a search area where it seems that node data is missing and needs extra querying
 * It first finds the nodes that are intersections with other streets, followed by nodes that
 * are not just intersection nodes.
 * If osmConfig.disableNodesOfWayQueries is true, we don't query OSM. Our only option in this case is to return
 * a node representing the end of the way. This is used when we assume we already have all the data we need and/or
 * the ways/nodes aren't from OSM
 * @param {Object} osmConfig
 * @param {Boolean} [osmConfig.includePedestrianArea] Default true
 * @param {Boolean} [osmConfig.disableNodesOfWayQueries] Default false
 * @param {Object} queries
 * @param {Object} queries.way Response contains the ways
 * @returns {Task<Object>}
 * Object with intersectionNodesByWayId, keyed by way and valued by nodes of the way that are intersections
 * Object with nodesByWayId, keyed by way and valued by nodes of the way
 * @sig nodesOfWayTask:: Task <way: <query, response>>>> ->
 * Task Result.Ok(<way: <query, response>, node: <query, response>, nodesByWayId: <node: <query, response>>, intersectionNodesByWayId: <node: <query, response>>> ->)
 */
export const nodesAndIntersectionNodesForIncompleteWayResultTask = (osmConfig, {way}) => {
  return R.map(
    // Just combine the results to get {nodeIdN: {query, response}, nodeIdM: {query, response}, ...}
    objs => R.ifElse(
      ({objs}) => R.all(Result.Ok.hasInstance)(objs),
      ({way, objs}) => {
        const nodesByWayId = R.mergeAll(R.map(obj => obj.value['nodesOfWay'], objs));
        const intersectionNodesByWayId = R.mergeAll(R.map(obj => obj.value['intersectionNodesOfWay'], objs));
        return Result.Ok({
          way,
          nodesByWayId,
          intersectionNodesByWayId
        });
      },
      // TODO this should never error, but it might need to be structured differently
      ({way, objs}) => Result.Error({way, objs})
    )({way, objs}),
    waitAll(
      // Map each way feature
      R.map(
        wayFeature => {
          const wayId = reqStrPathThrowing('id', wayFeature);
          return composeWithChain([
            // Now we have the intersection nodes of the way and all the nodes of the way.
            // If anything went wrong we have a Result.Error to report.
            // If all goes well we combine the two Result.Oks into one Result.Ok
            ({intersectionNodesOfWayResult, nodesOfWayResult}) => {
              return of(
                R.ifElse(
                  ({intersectionNodesOfWayResult, nodesOfWayResult}) => R.all(
                    Result.Ok.hasInstance,
                    [intersectionNodesOfWayResult, nodesOfWayResult]
                  ),
                  // Combine intersectionNodesOfWayResult and nodesOfWayResult into a single Result.Ok
                  ({intersectionNodesOfWayResult, nodesOfWayResult}) => {
                    return intersectionNodesOfWayResult.chain(
                      intersectionNodesOfWay => nodesOfWayResult.map(
                        nodesOfWay => ({
                          intersectionNodesOfWay,
                          nodesOfWay
                        })
                      )
                    );
                  },
                  ({intersectionNodesOfWayResult, nodesOfWayResult}) => Result.Error({
                    intersectionNodesOfWay: intersectionNodesOfWayResult.value,
                    nodesOfWay: nodesOfWayResult.value
                  })
                )({intersectionNodesOfWayResult, nodesOfWayResult})
              );
            },

            // Get the nodes of the way that aren't just intersections.
            mapToNamedResponseAndInputs('nodesOfWayResult',
              ({wayId}) => _nodesOfWayResultTask(
                osmConfig,
                wayId
              )
            ),

            // Get the nodes of the way that our intersections.
            mapToNamedResponseAndInputs('intersectionNodesOfWayResult',
              ({osmConfig, wayFeature, wayId}) => _intersectionNodesOfWayResultTask(
                osmConfig,
                {wayFeature},
                wayId
              )
            )
          ])({
            osmConfig,
            wayFeature,
            wayId
          });
        },
        reqStrPathThrowing('response.features', way)
      )
    )
  );
};

/**
 * Queries for intersection nodes of the way unless osmConfig.disableNodesOfWayQueries is true
 * If it is true it is assumed that the needed nodes are already available
 * @param {Object} osmConfig
 * @param {Object} wayContext
 * @param {Object} wayContext.wayFeature
 * @param {String} wayId The OSM wayId
 * @return {Task<Result<Object>>} A task that resolves to a Result.Ok containing
 * {[wayId]: {query: nodesOfWayQuery, response: nodesOfWayResponse}} or a Result.Error with an error
 * @private
 */
const _intersectionNodesOfWayResultTask = (osmConfig, {wayFeature}, wayId) => {
  return composeWithMapMDeep(2, [
    // Take the result, key by wayId and combine it with the original query for reference
    ({wayId, intersectionNodesOfWayQuery, intersectionNodesOfWayResponse}) => {
      return {
        [wayId]: {
          query: intersectionNodesOfWayQuery,
          response: intersectionNodesOfWayResponse
        }
      };
    },
    // Find the intersection nodes of the way
    mapToNamedResponseAndInputsMDeep(2, 'intersectionNodesOfWayResponse',
      // Perform the task
      ({wayId, intersectionNodesOfWayQuery}) => osmResultTask({
          name: 'intersectionNodesOfWayQuery',
          context: {wayId, type: 'nodesOfWay'}
        },
        options => fetchOsmRawTask(options, intersectionNodesOfWayQuery)
      )
    )
  ])({wayId, intersectionNodesOfWayQuery: intersectionNodesOfWayQuery(osmConfig, {wayFeature}, wayId)});
};

/**
 * Queries for all nodes of the way unless osmConfig.disableNodesOfWayQueries is true
 * If it is true it is assumed that the needed nodes are already available
 * @param {Object} osmConfig
 * @param {String} wayId The OSM wayId
 * @return {Task<Result<Object>>} A task that resolves to a Result.Ok containing
 * {[wayId]: {query: nodesOfWayQuery, response: nodesOfWayResponse}} or a Result.Error with an error
 * @private
 */
const _nodesOfWayResultTask = (osmConfig, wayId) => {
  return composeWithMapMDeep(2, [
    // Take the result, key by wayId and combine it with the original query for reference
    ({wayId, nodesOfWayQuery, nodesOfWayResponse}) => {
      return {[wayId]: {query: nodesOfWayQuery, response: nodesOfWayResponse}};
    },
    // Find all nodes of the way, not just the intersections
    mapToNamedResponseAndInputsMDeep(2, 'nodesOfWayResponse',
      // Perform the task
      ({wayId, nodesOfWayQuery}) => osmResultTask({
          name: 'nodesOfWayQuery',
          context: {wayId, type: 'nodesOfWay'}
        },
        options => fetchOsmRawTask(options, nodesOfWayQuery)
      )
    )
  ])({wayId, nodesOfWayQuery: nodesOfWayQuery(osmConfig, wayId)});
};

/**
 * Map the waysByNodeId to the way features and clean up the geojson of the features to prevent API transmission errors
 * @param {Object} queryResults Object with response.features, which contains a list of way features
 * @returns {Object}
 * @sig mapToCleanedFeatures:: F: features => Task [responses: <features: [F]>>> -> Task <int, [F]>
 */
export const mapToCleanedFeatures = queryResults => R.map(
  // Clean the features of each first
  feature => cleanGeojson(feature),
  // Limit to the features
  reqStrPathThrowing('response.features', queryResults)
);

/**
 *
 * Map the waysByNodeId to the way features and clean up the geojson of the features to prevent API transmission errors
 * @param {Object} waysByNodeId Object keyed by node id and valued by response.features, which contains a list of way features
 * @returns {Object}
 * @sig mapWaysByNodeIdToCleanedFeatures:: F: way features => Task <int, <responses: <features: [F]>>> -> Task <int, [F]>
 */
export const mapWaysByNodeIdToCleanedFeatures = waysByNodeId => mapMDeep(2,
  // Clean the features of each first
  feature => cleanGeojson(feature),
  // Limit to the features
  R.map(
    reqStrPathThrowing('response.features'),
    waysByNodeId
  )
);


/**
 * Given wayFeatures that form a street block (and may overlap neighboring blocks), given nodeFeatures which
 * represent 1 or more intersections of the block (normally 2 but possibly 1 for a dead end or 3 or up to 8 for a
 * divided road intersecting two other divided roads (e.g. =#===#=),
 * and given a mapping of wayFeatures features by those same nodeFeatures ids (where the wayFeatures features are all ways intersecting
 * that nodeFeatures--not just those of wayFeatures), construct an object that has the ways features trimmed and ordered to match
 * the intersection nodes, the intersection nodeFeatures features left in the same order they were given, and additionally
 * an intersections property that is an object keyed by nodeFeatures id and valued by the street names of the ways that meet
 * the intersection. The first wayFeatures street name is that of the block itself, the subsequent are one or more alphabetically
 * listed street names. Example intersections:
 * {nodeFeatures/1234: ['Main St', 'Billy Goat Gate', 'Wonder Woman Way'], nodeFeatures/2345: ['Main St', 'Howdy Doody Drive']}
 * @param {Object} osmConfig
 * @param location {Object} Location object for street context
 * @param features
 * @param features.wayFeatures
 * @param features.nodeFeatures
 * @param features.wayFeaturesByNodeId
 * @returns {Object} {wayFeatures: wayFeatures features, nodeFeatures: nodeFeatures features, intersections: ... }
 */
export const createSingleBlockFeatures = (osmConfig, location, {wayFeatures, nodeFeatures, wayFeaturesByNodeId}) => {
  // Calculate the street names and put them in intersections
  // intersections is an object keyed by nodeFeatures id and valued by the unique list of streets.
  // The first street is always street matching the wayFeatures's street and the remaining are alphabetical
  // Normally there are only two unique streets for each intersection.
  // If one or both streets change names or for a >4-wayFeatures intersection, there can be more.
  // If we handle roundabouts correctly in the future these could also account for more
  // TODO we should handle Result.Error here
  const nodesToIntersections = _intersectionStreetNamesFromWaysAndNodesResult(
    osmConfig,
    wayFeatures,
    nodeFeatures,
    wayFeaturesByNodeId
  ).value;
  return R.merge(
    {
      nodesToIntersections
    },
    // Organize the ways and nodes, trimming the ways down to match the nodes
    // Then store the features in {ways: ..., nodes: ...}
    getFeaturesOfBlock(
      R.over(
        R.lensProp('intersections'),
        intersections => intersections || R.values(nodesToIntersections),
        location
      ),
      wayFeatures,
      nodeFeatures
    )
  );
};

/***
 * Sorts the features by connecting them at their start/ends
 * @param {Object} locationWithNominatimData Location block used to identify the correct street names
 * @param {[[String]]} locationWithNominatimData.intersections Each set of strings represents an intersection of the locationWithNominatimData block
 * @param {[Object]} wayFeatures List of way features to sort. This is 1 or more connected ways that might overlap the
 * block on one or both sides
 * @param {[Object]} nodeFeatures Two node features representing the block intersection
 * TODO what about dead ends? Is the dead end side represented by a node or simply the end of one way?
 * @returns {Object}  {ways: ..., nodes: ...} contains keys nodes and ways. Nodes must always be the two node Features of the block.
 * ways must be at least on way Feature, possibly shortened to match the block and up to n way features with at
 * most the first and last possibly shortened to match the block
 */
export const getFeaturesOfBlock = v((location, wayFeatures, nodeFeatures) => {
  // First handle some special cases:
  // If we have exactly one way and it has a tag area="yes" then it's a pedestrian zone or similar and the
  // two nodes aren't necessarily nodes of the pedestrian area.
  if (R.both(
    R.compose(R.equals(1), R.length),
    R.compose(R.equals('yes'), strPathOr(false, '0.properties.tags.area'))
  )(wayFeatures)) {
    // Nothing to trim in this cased
    return {
      ways: wayFeatures,
      nodes: nodeFeatures
    };
  }

  // Build a lookup of start and end points. We use these to link separate ways together.
  // The head label is the first node of a way. The tail is for the last node of a way
  // This results in {
  //  [end_coordinate_hash]: {head: [feature]} // End of only one way
  //  [coordinate_hash]: {head: [feature], tail: [feature] } // Coordinate where ways meet
  //  [end_coordinate_hash]: {tail: [feature]} // End of only one way
  //}
  // TODO this doesn't yet handle ways that are loops
  // For normal streets, two hashes have only one feature. One with one at the head and one with one at the tail
  // The other have two features. So this gives us a good idea of how the features are chained together
  // For cases of divided streets (possibly intersecting other divided streets), we can get more than 1 hash
  // with meeting ways. Here's an example result of a divided road meeting one divided road and one non-divided road:
  /*
    -77.1244713:38.8971897 = Object {head: (2 ways)}
    -77.123609:38.8975095 = Object {last: (1 way),
    head: (1 way)}
    -77.1209758:38.8984144 = Object {last: (1 way)}
    -77.1256942:38.8986197 = Object {last: (1 way)}
    -77.1235902:38.8976161 = Object {head: (1 way),
    last: (1 way)}
    -77.126258:38.8966612 = Object {last: (1 way) }
    -77.123075:38.8970315 = Object {head: (1 way) }
   */
  // Remove any way features whose streets don't match those in the locationWithNominatimData
  // If the wayFeatures don't have a name, leave them in in case they are needed
  const wayFeaturesOfStreet = R.filter(
    wayFeature => R.anyPass([
      R.isNil,
      // If we have street names in locationWithNominatimData.intersections we can eliminate way features that don't match
      // the street. TODO. This probably isn't 100% certain to work, but works in most cases. The danger
      // is we filter out a valid way feature that is named weird
      name => R.includes(
        name,
        // Take the first block of each intersection, this is our main block.
        // I believe they're always the same value, but maybe there's a case where the name changes mid-block
        R.uniq(R.map(reqStrPathThrowing('data.streets.0'), location.intersections))
      )
    ])(wayFeatureNameOrDefault('UNNAMED STREET', wayFeature)),
    wayFeatures
  );

  // Orders the way features, reversing some so that they all flow in the same direction. This results
  // in a flat ordered list of ways
  const modifiedWayFeatures = orderWayFeaturesOfBlock(wayFeaturesOfStreet);

  // Reduce a LineString feature by its head and last point. This results
  // once again in an object keyed by way end point and valued by an object with head and last containing
  // way features that match the point at the head and last point of the way
  const finalLookup = R.reduce(
    (result, feature) => {
      return _reduceFeaturesByHeadAndLast(result, feature);
    },
    {},
    modifiedWayFeatures
  );

  // Use the linker to link the features together, dropping those that aren't between two of the nodes
  // Returns {nodes: nodeFeatures, ways};
  const linkedFeatures = _linkedFeatures(finalLookup, nodeFeatures);

  // Remove the __reversed__ tag from reversed ways. We don't care anymore because our linking is done
  return R.over(
    R.lensProp('ways'),
    wayFeatures => removeReverseTagsOfOrderWayFeaturesOfBlock(wayFeatures),
    linkedFeatures
  );
}, [
  ['location', PropTypes.shape().isRequired],
  ['wayFeatures', PropTypes.arrayOf(PropTypes.shape()).isRequired],
  ['nodeFeatures', PropTypes.arrayOf(PropTypes.shape()).isRequired]
], 'getFeaturesOfBlock');

/**
 * For way features of a single street, orders the features possibly reversing ways that meet one another flow
 * in opposite directions. Example ---> <---- <--- is reordered to be <--- <---- <---- where the first is
 * reversed and marked __reversed__. The __reversed__ should be removed after processing with removeReverseTagsOfOrderWayFeaturesOfBlock
 * @param wayFeaturesOfStreet
 */
export const orderWayFeaturesOfBlock = wayFeaturesOfStreet => {
  // Reduce the way features. For each head and ladst way point, we index the way by that point, creating an object
  // That organizes the way features by each point and whether it's the ways head or last point
  // {
  //  coordinate_hash1: {head: [features]}, // Only the head of ways match this point
  //  coordinate_hash2: {head: [features], last: [features]}, // Both heads and last of ways match this point
  //  coordinate_hash3: {head: [features], last: [features]},
  //  coordinate_hash3: {last: [features]} // Only the end of ways match this point
  //  ...
  // }
  const wayEndPointToHeadLastWayFeatures = R.reduce(
    (result, wayFeature) => {
      return _reduceFeaturesByHeadAndLast(result, wayFeature);
    },
    {},
    wayFeaturesOfStreet
  );
  // Do any features have the same head or last point? If so flip the coordinates of one
  // We need to get all the ways "flowing" in the same direction. The ones we flip we tag with __reversed__
  // so we can flip them back after we finish the sorting
  const modifiedWayEndPointToHeadLastWayFeatures = R.map(
    headLastObj => {
      return R.map(
        wayFeatures => {
          return R.when(
            // When we have more than 1 feature
            wayFeatures => R.compose(R.lt(1), R.length)(wayFeatures),
            // Reverse the first way feature's coordinates
            wayFeatures => reverseFirstWayFeatureAndTag(wayFeatures)
          )(wayFeatures);
        },
        headLastObj
      );
    },
    wayEndPointToHeadLastWayFeatures
  );
  return R.compose(
    // Remove the feature id keys
    R.values,
    // At this point we have a each way listed twice, once from the end point and once from the start point
    // Merge each way feature with the same id, favoring the reversed one if one version of the feature is reversed
    // Take l if it has __reversed__, otherwise take r assuming r has reversed or neither does and are identical
    featureObjs => mergeAllWithKey(
      (_, l, r) => R.ifElse(R.prop('__reversed__'), R.always(l), R.always(r))(l),
      featureObjs),
    // Hash each by feature id
    features => R.map(feature => ({[feature.id]: feature}), features),
    // Flatten all the sets
    R.flatten,
    // Take each head/last object and flatten the way features together, removing head/last
    values => R.chain(R.values, values),
    // Remove way end point coordinate keys
    R.values
  )(modifiedWayEndPointToHeadLastWayFeatures);
};

/**
 Remove any __reversed__ tags from the way features
 */
export const removeReverseTagsOfOrderWayFeaturesOfBlock = wayFeatures => {
  return R.map(R.omit(['__reversed__']), wayFeatures);
};

/**
 * Reverses the first given way feature and marks it as __reversed__. Used for sorting ways when two ways
 * meet at a point but that point is the head point of 1 way and the last point of the other way. In
 * some cases it doesn't matter which way is reversed, so this function reverses the first way. In other
 * cases it does matter so make sure to pass they way that needs to be reversed as the first or only way
 * @param wayFeatures
 * @returns [Objects] The wayFeatures with the points of the first reversed and the first tagged with __reversed__
 * The __reversed__ tag should be removed when no longer needed since it's not valid geojson
 */
export const reverseFirstWayFeatureAndTag = wayFeatures => R.compose(
  // Mark that way feature as reversed
  wayFeatures => R.over(
    R.lensPath([0, '__reversed__']),
    R.T,
    wayFeatures
  ),
  // Reverse the coordinates of the first way feature
  wayFeatures => R.over(
    R.lensPath([0, 'geometry', 'coordinates']),
    R.reverse,
    wayFeatures
  )
)(wayFeatures);

/**
 * Utility function to generate geojson from nodes and ways for testing block creation
 * @param nodes
 * @param ways
 * @returns {string} The complete geojson. View it at http://geojson.io/
 * @private
 */
export const blockToGeojson = ({nodes, ways}) => {
  return JSON.stringify({
      "type": "FeatureCollection",
      "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
      "timestamp": "",
      "features": R.concat(nodes || [], ways || [])
    }, null, '\t'
  );
};

/**
 * Writes a file
 * @param {String} filePath
 * @param {String} body
 * @return {Task<void>} Task that resolves to undefined or rejects with the error
 */
export const generateFileTask = (filePath, body) => {
  return R.chain(
    filePath => {
      return R.ifElse(
        fp => fs.existsSync(fp),
        fp => of(fp),
        fp => rejected(`File at path ${fp} was not created!`)
      )(filePath);
    },
    task(resolver => {
      const stream = fs.createWriteStream(filePath, {encoding: 'utf-8'});
      stream.write(body);
      stream.end();
      stream.on('finish', () => {
        log.debug(`Finished writing to ${filePath}`);
        resolver.resolve(filePath);
      });
      stream.on('error', error => {
        log.warn(`Error writing to ${filePath}. Error: ${JSON.stringify(error)}`);
        resolver.reject(error);
      });
    }));
};

/**
 * Dumps the given locations to geojson as both ways and nodes and just nodes. This returns
 * a Task Result that writes the files
 * @param locations
 * @return {Object} {geojsn, geojsonWays}
 */
export const locationsToGeojsonWaysAndBoth = (locations) => {
  log.debug(`Dumping geojson for ${R.length(locations)}`);
  const locationsCleaned = R.map(omitDeep(['__typename']), locations);
  const geojsonWays = locationsToGeojson(
    R.map(
      location => {
        return R.over(
          R.lensPath(['geojson', 'features']),
          fs => R.when(
            fs => R.not(R.isNil(fs)),
            fs => featuresOfOsmType('way', fs)
          )(fs),
          location
        );
      },
      locationsCleaned
    )
  );
  const geojson = locationsToGeojson(locationsCleaned);
  return {geojson, geojsonWays};
};

/**
 * Dumps the given locations to geojson as both ways and nodes and just nodes. This returns
 * a Task Result that writes the files
 * @param dir
 * @param filename
 * @param locations
 * @return {Task<Result<Object>>} The result of writing the files. You can ignore these results
 */
export const locationsToGeojsonFileResultTask = (dir, filename, locations) => {
  const {geojson, geojsonWays} = locationsToGeojsonWaysAndBoth(locations);
  const file = `${dir}/${filename}.json`;
  const wayFile = `${dir}/way${filename}.json`;
  return composeWithChainMDeep(2, [
    ({geojson, geojsonWays}) => {
      // Return these regardless of how the file writing results
      return of(Result.Ok({geojson, geojsonWays}));
    },
    // Write an html file to review the results
    mapToNamedResponseAndInputsMDeep(2, '_',
      ({file, geojson}) => {
        return taskToResultTask(generateFileTask(
          file,
          JSON.stringify(geojson, null, '\t')
        ));
      }
    ),
    // Write an html file to review the results
    mapToNamedResponseAndInputsMDeep(2, '_',
      ({wayFile, geojsonWays}) => {
        return taskToResultTask(generateFileTask(
          wayFile,
          JSON.stringify(geojsonWays, null, '\t')
        ));
      }
    )
  ])({file, wayFile, geojson, geojsonWays});
};


/**
 * Dumps locationWithNominatimData features to geojson for debgging
 * This also puts the location id into feature properties so that we know what location it was.
 * It also puts the dimension in the geojson properties the former are defined
 * @param locations
 * @returns {string}
 */
export const locationsToGeojsonString = locations => {
  return R.compose(
    blocks => JSON.stringify(blocks, null, '\t'),
    locations => locationsToGeojson(locations)
  )(locations);
};

/**
 * Dumps locationWithNominatimData features to geojson for debgging
 * This also puts the location id into feature properties so that we know what location it was.
 * It also puts the dimension in the geojson properties the former are defined
 * @param locations
 * @returns {Object}
 */
export const locationsToGeojson = locations => {
  return R.compose(
    blocks => blocksToGeojson(blocks),
    locations => R.map(
      R.compose(
        // Index each feature by way or node
        features => R.reduceBy(
          R.flip(R.append),
          [],
          // Get this type and key it to nodes or ways
          feature => R.compose(
            type => R.concat(type, 's'),
            R.head,
            R.split('/'),
            R.prop('id')
          )(feature),
          features
        ),
        location => strPathOr([], 'geojson.features', location)
      ),
      locations
    )
  )(locations);
};

/**
 * Dumps blocks to a geojson string
 * @param blocks Blocks in the form
 * @returns {string}
 */
export const blocksToGeojsonString = blocks => {
  return JSON.stringify(blocksToGeojson(blocks), null, '\t');
};

/**
 * Styles the given block with the given color
 * @param color
 * @param block
 * @return {Object} The block with {ways, nodes} but with the color added to the feature properties
 */
export const styledBlock = (color, block) => {
  return R.compose(
    ...R.map(type => {
        return block => R.over(
          R.lensProp(type),
          things => R.map(
            thing => R.over(
              R.lensProp('properties'),
              t => R.merge(
                R.ifElse(
                  R.equals('nodes'),
                  () => ({
                    'marker-color': color
                  }),
                  () => ({
                    stroke: color,
                    'stroke-width': 2,
                    'stroke-opacity': 1
                  })
                )(type),
                t
              ),
              thing
            ),
            things || []
          ),
          block
        );
      },
      ['ways', 'nodes']
    )
  )(block);
};

/**
 * Dumps blocks to geojson with arbitrary colors to distinguish them
 * @param blocks Blocks in the form
 * @returns {Object}
 */
export const blocksToGeojson = blocks => {
  const color = scaleOrdinal(schemeCategory10);
  // Color blocks randomly to make it clear what is what
  // This is used by http://geojson.io/ and could be used in Mapbox or similar as well
  const styledBlocks = R.addIndex(R.map)(
    (block, index) => {
      // Pass the id to get a randomish color
      const colour = color(index);
      return styledBlock(colour, block);
    },
    blocks
  );

  return {
    "type": "FeatureCollection",
    "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    "timestamp": "",
    "features": R.reduce(
      (acc, {nodes, ways}) => {
        return R.concat(acc, R.concat(ways, nodes));
      },
      [],
      styledBlocks
    )
  };
};

/**
 * The length of the given bocks
 * @param blocks
 * @returns {*}
 * @private
 */
export const blocksWithLengths = blocks => {
  return R.map(
    // add up the ways
    block => ({
      block, length: R.reduce(
        (accum, way) => R.add(accum, length(way, {units: 'meters'})),
        0,
        strPathOr([], 'ways', block)
      )
    }),
    blocks
  );
};
/**
 * The total length of all given blocks
 * @param blocks
 * @private
 */
export const lengthOfBlocks = blocks => {
  return R.compose(
    blocksWithLengths => R.reduce(
      (accum, block) => R.add(accum, block.length),
      0,
      blocksWithLengths
    ),
    blocks => blocksWithLengths(blocks)
  )(blocks);
};

/**
 * Create a hash based on the nodes and ways based on node ids and way points but independent of order
 * This allows us to match up blocks that are the same point but going in different directions
 * @param nodes
 * @param ways
 * @private
 */
export const _hashBlock = ({nodes, ways}) => {
  const nodeIds = R.compose(
    R.map(R.prop('id')),
    R.sortBy(R.prop('id'))
  )(nodes);
  const wayPoints = R.compose(
    // Ignore duplicate wayPoints for loops and points where the ways meet
    wayPointHash => R.sortBy(R.identity, wayPointHash),
    wayPointHashes => R.uniq(wayPointHashes),
    ways => R.chain(way => hashWayFeature(way), ways)
  )(ways);
  return `{nodes:[${R.join(',', nodeIds)}], wayPoints:[${R.join(',', wayPoints)}]}`;
};

/**
 * Sorts two opposing block pairs based on first node's id of nodes. The blocks will have the nodes reversed
 * since they flow in different directions
 * @param {[Object]} oppositeBlockPair Blocks containing a nodes properties
 * @returns {[Object]} The blocks sorted by the first node's id of nodes
 * @private
 */
export const _sortOppositeBlocksByNodeOrdering = oppositeBlockPair => {
  return R.sortWith([
    block => R.ascend(reqStrPathThrowing('nodes.0.id'), block),
    // For loops fall back to sorting by the hash of the second way point (the point after the node)
    // Loops have to have at least 3 points to make a triangle or more sided polygon
    block => R.ascend(R.compose(hashPoint, reqStrPathThrowing('ways.0.geometry.coordinates.1')), block)
  ])(
    oppositeBlockPair
  );
};

// 1 Travel from every node along the directional ways
//  A If starting at way end, travel other direction. Go to step 2 for the one direction CONTINUE
//  B Else travel both directions to next node/way endpoint. Go to step 2 for each direction CONTINUEx2
// For area ways (pedestrian areas) find nodes within 5 meters of each waynode. Hash way <-- TODO
//    If the area way only matches one node, hash that matching waynode as a wayendnode.
//    (Above when we travel we'll start at the matching node and go around the area until we reach another node or the wayendnode at the starting point)
// At the end of this process we have a list of objects with nodes and ways.
// nodes has just the start node and ways has just one directional (partial) way whose first point
// is the node
export const _buildPartialBlocks = ({ways, nodes}) => {
  // Creates data structures to help process the ways and nodes:
  // nodeIdToNode, nodePointToNode, nodeIdToNodePoint, wayIdToWay, wayIdToNodes, wayIdToWayPoints, nodeIdToWays,
  // wayEndPointToDirectionalWays
  const {
    nodeIdToNode,
    nodePointToNode,
    nodeIdToNodePoint,
    wayIdToWay,
    wayIdToNodes,
    wayIdToWayPoints,
    nodeIdToWays,
    wayEndPointToDirectionalWays
  } = _calculateNodeAndWayRelationships({
    ways,
    nodes
  });
  const partialBlocks = R.unnest(chainObjToValues(
    (nodes, wayId) => {
      const way = R.prop(wayId, wayIdToWay);
      // Split the way by nodes, traveling in each direction from each node to the next node or dead end.
      // This creates twin pairs of each way segment.
      // If a way has no nodes it won't be processed
      return _wayToPartialBlocks({wayIdToWayPoints, nodeIdToNodePoint}, nodes, way);
    },
    wayIdToNodes
  ));
  return {
    partialBlocks,
    nodeIdToNode,
    nodePointToNode,
    nodeIdToNodePoint,
    wayIdToWay,
    wayIdToNodes,
    wayIdToWayPoints,
    nodeIdToWays,
    wayEndPointToDirectionalWays
  };
};

/**
 * Given a way and nodes intersecting it, split the way at the nodes, and travel from each node in both directions
 * to the next node or end of the way
 * Thus we return to partial blocks from each node to the next node or end of the way. We order the way points
 * to be flowing from each node. This results in "twins" where one partial block has node A and flows
 * to the next node B but doesn't include B. Another partial block flows from B to A but doesn't include A.
 * We create the twins like bi-directional travel lanes so we can construct complete blocks by flowing in either
 * direction when we traverse all the blocks
 * @param {Object} context
 * @param {Object} context.wayIdToWayPoints Mapping of the way id to way points
 * @param {Object} context.nodeIdToNodePoint Mapping of the way id to way points
 * @param {Object} nodes The intersection nodes of the way
 * @param {Object} way A way feature
 * @returns {[Object]} One or two partial blocks, each containing ways: [a single partial way] and nodes: [the first node]
 * @private
 */
const _wayToPartialBlocks = ({wayIdToWayPoints, nodeIdToNodePoint}, nodes, way) => {
  return R.compose(
    ({way, wayPoints, nodeAndIndices}) => {
      const wayPointIndices = R.map(R.prop('wayPointIndex'), nodeAndIndices);
      return R.map(
        // Process splits, maybe reverse the partial way points to start at the node index
        ({node, wayPointIndex}) => {
          const otherWayPointIndices = R.without([wayPointIndex], wayPointIndices);
          const nodePoint = R.prop(R.prop('id', node), nodeIdToNodePoint);
          // Split the way points at the node index (ignoring intersections with other nodes)
          // We split inclusively to get the split point in each result set, but reject single
          // point results
          return R.compose(
            // Turn the 1 or 2 partial ways into trimmed ways going from either direction of the node
            wayPointsOfBothSides => R.map(
              R.compose(
                // Finally combine relevant node to form the partial block
                way => {
                  const block = ({ways: [way], nodes: [node]});
                  blockToGeojson(block);
                  return block;
                },
                // Create a new version of the way with these points
                partialWayPoints => R.set(
                  R.lensPath(['geometry', 'coordinates']),
                  // Changed the hashed points pack to array pairs
                  hashPointsToWayCoordinates(partialWayPoints),
                  way
                ),
                // Reverse the way points that don't flow from the node
                partialWayPoints => R.ifElse(
                  partialWayPoints => R.compose(
                    R.equals(0),
                    R.indexOf(nodePoint)
                  )(partialWayPoints),
                  partialWayPoints => {
                    // Find the next wayPointIndex greater than and closest to the wayPointIndex
                    const nodeIndex = R.compose(
                      R.head,
                      otherWayPointIndices => R.sortBy(nodeIndex => R.subtract(nodeIndex, wayPointIndex), otherWayPointIndices),
                      otherWayPointIndices => R.filter(R.lt(wayPointIndex), otherWayPointIndices)
                    )(otherWayPointIndices);
                    // Slice the full way from the wayPointIndex to the closest nodeIndex (or way end) inclusive
                    return R.slice(wayPointIndex, R.ifElse(R.identity, R.add(1), () => Infinity)(nodeIndex), wayPoints);
                  },
                  // Reverse the wayPoints
                  partialWayPoints => {
                    // Find the next wayPointIndex less than and closest to the wayPointIndex
                    const nodeIndex = R.compose(
                      R.head,
                      otherWayPointIndices => R.sortBy(nodeIndex => R.subtract(wayPointIndex, nodeIndex), otherWayPointIndices),
                      otherWayPointIndices => R.filter(R.gt(wayPointIndex), otherWayPointIndices)
                    )(otherWayPointIndices);
                    // Slice the full way from the closest nodeIndex (or way start) inclusive to the wayPointIndex inclusive
                    // Reverse so we flow from the wayPointIndex node
                    return R.reverse(R.slice(nodeIndex || 0, wayPointIndex + 1, wayPoints));
                  }
                )(partialWayPoints)
              ),
              wayPointsOfBothSides
            ),
            // So we get one or two partial ways
            wayPoints => R.reject(
              R.compose(R.equals(1), R.length),
              compactEmpty(splitAtInclusive(parseInt(wayPointIndex), wayPoints))
            )
          )(wayPoints);
        },
        nodeAndIndices
      );
    },
    toNamedResponseAndInputs('nodeAndIndices',
      // Get the index of the nodes in the way's points
      ({wayPoints}) => R.map(
        node => ({
          node,
          wayPointIndex: R.indexOf(reqStrPathThrowing(R.prop('id', node), nodeIdToNodePoint), wayPoints)
        }),
        nodes
      )
    ),
    toNamedResponseAndInputs('wayPoints',
      // Get the way points of the way
      ({way}) => reqStrPathThrowing(R.prop('id', way), wayIdToWayPoints)
    )
  )({way});
};


/**
 * Returns true if the given nodeFeature connects at least two wayFeatures that have different street names.
 * Ways often end and start at a node where there isn't an intersection, and we don't want to treat these
 * nodes as intersections that break up blocks
 * @param {[Object]} wayFeatures List of way features which intersect the node
 * @param {Object} nodeFeature The node feature to test
 * @returns {Boolean} True if 1 There are no ways (maybe node of a way araa, in any case not enough info to say it's
 * not real)
 * 2) there are more than 2 ways,
 * 3) there at least two ways with different street names intersect the node or
 * 4) if the node point is not at the end of at least on way. This means it has to be a real intersection for Overpass
 * to have
 * returned it.
 */
export const isRealIntersection = v((wayFeatures, nodeFeature) => R.anyPass([
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
      wayFeature => wayFeatureNameOrDefault(reqStrPathThrowing('id', nodeFeature), wayFeature)
    )
  )(wayFeatures)
])(wayFeatures), [
  ['wayFeatures', PropTypes.arrayOf(PropTypes.shape()).isRequired],
  ['nodeFeature', PropTypes.shape().isRequired]
], 'isRealIntersection');

/**
 * If the given nodeFeature fails to qualify as a real intersection using the given wayFeatures, this
 * asks OSM for the ways of the node to and tests the node with the results. This is used for cases where
 * the ways of the node might not have been in the search area and need to be queried separately
 * @param osmConfig
 * @param wayFeatures
 * @param nodeFeature
 * @return {Task<Boolean>} Task resolving {isRealIntersection: true/false, newNodeIdToWays: {}} where newNodeIdToWays
 * are the results of querying. These can be added to the cache of nodeIdToWays to help with intersection
 * name resolution
 */
export const isRealIntersectionTask = (osmConfig, wayFeatures, nodeFeature) => {
  // osmConfig.disableNodesOfWayQueries is true, meaning we already have a complete node/way dataset, or
  // if we already have enough data to prove it's a real interection, return true
  // We don't allow length 1 wayFeatures to pass here because the node usually needs to query for more
  // ways below in order to resolve intersecting street names later
  if (
    strPathOr(false, 'disableNodesOfWayQueries', osmConfig) ||
    (
      R.complement(R.equals)(1, R.length(wayFeatures)) &&
      isRealIntersection(wayFeatures, nodeFeature)
    )
  ) {
    return of({isRealIntersection: true, newNodeIdToWays: {}});
  }
  return composeWithMap([
    toNamedResponseAndInputs('isRealIntersection',
      ({wayFeaturesResponse, nodeFeature}) => {
        // Test if these wayisRealIntersectionTask(
        //           osmConfig,
        //           R.prop(R.prop('id', firstFoundNodeOfFinalWay), nodeIdToWays),
        //           firstFoundNodeOfFinalWay
        //         );Features mean that nodeFeature is a real intersection
        return isRealIntersection(
          reqStrPathThrowing('response.features', wayFeaturesResponse),
          nodeFeature
        );
      }
    ),
    toMergedResponseAndInputs(
      // Extract the results
      ({nodeFeature, results}) => {
        const newNodeIdToWays = strPathOr({}, 'Ok.waysByNodeId', results);
        return {
          wayFeaturesResponse: R.prop(reqStrPathThrowing('id', nodeFeature), newNodeIdToWays),
          // Return {nodeId: [ways], ...}
          newNodeIdToWays: R.map(strPathOr([], 'response.features'), newNodeIdToWays)
        };
      }
    ),
    mapToNamedResponseAndInputs('results',
      ({osmConfig, wayFeatures, nodeFeature}) => {
        // Get the ways features. Putting them in response matches what waysByNodeIdResultsTask expects
        return waysByNodeIdResultsTask(osmConfig, {
          way: {response: {features: wayFeatures}},
          node: {response: {features: [nodeFeature]}}
        });
      }
    )
  ])({osmConfig, wayFeatures, nodeFeature});
};
/**
 * Trims the given way to the index of the nodeObj inclusive
 * @param {Object} nodeObj
 * @param {Number} nodeObj.index The node index of the node in the way
 * @param {Object} nodeObj.node The node
 * @param {Object} way The way to trip
 * @returns {Object} The way trimmed ot the node inclusive
 */
export const trimWayToNodeObj = (nodeObj, way) => R.over(
  R.lensPath(['geometry', 'coordinates']),
  // Slice the coordinates to the found node index
  // (+2 because the index is based on remainingWayPoints and we want to be inclusive)
  coordinates => R.slice(0, R.prop('index', nodeObj) + 2, coordinates),
  way
);

/**
 * Trims the given way to the index of the nodeObj inclusive
 * @param {Object} node The node
 * @param {Object} way The way to trip
 * @returns {Object} The way trimmed ot the node inclusive
 */
export const trimWayToNode = (node, way) => {
  // Take the tail because trimWayToNodeObj expects the index based on the tail
  const index = R.indexOf(hashNodeFeature(node), R.tail(hashWayFeature(way)));
  return trimWayToNodeObj({node, index}, way);
};
