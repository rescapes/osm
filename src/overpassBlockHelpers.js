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

import * as R from 'ramda';
import {
  _cleanGeojson,
  _intersectionStreetNamesFromWaysAndNodes, _linkedFeatures,
  _reduceFeaturesByHeadAndLast
} from './overpassFeatureHelpers';
import {
  fetchOsmRawTask, highwayWayFilters, osmAlways, osmEquals, osmNotEqual,
  osmResultTask
} from './overpass';
import {
  mapObjToValues,
  reqStrPathThrowing,
  mapMDeep,
  mergeAllWithKey,
  strPathOr,
  taskToResultTask
} from 'rescape-ramda';
import {waitAll} from 'folktale/concurrency/task';
import * as Result from 'folktale/result';

/**
 * Determines if an OSM query result is a valid block
 * @param wayFeatures
 * @param nodeFeatures
 */
export const predicate = ({wayFeatures, nodeFeatures}) => R.allPass([
  // Not null
  R.complement(R.isNil),
  // We'd normally limit nodes to 2, but there can be 4 if we have a divided road
  // There might be cases where a divided road merges into a nondivided road, so we'll allow 2-4
  ({nodeFeatures}) => R.compose(R.both(R.lte(2), R.gte(4)), R.length)(nodeFeatures),
  // >0 ways:w
  ({wayFeatures}) => R.compose(R.lt(0), R.length)(wayFeatures)
])({wayFeatures, nodeFeatures});


/**
 * Simple OSM query to return the ways of an intersection node.
 * @param {String} nodeId In the form 'node/id'
 * @returns {string}
 */
const waysOfNodeQuery = nodeId => {
  const id = R.compose(
    R.last,
    R.split('/')
  )(nodeId);
  return `
    node(id:${id})->.matchingNode;
    // Find ways within 10 meters of the node for ways with area=="yes" and ways containing the node otherwise
    (way(around.bn.matchingNode:10)[area = "yes"]${highwayWayFilters};
    way(bn.matchingNode)[area != "yes"]${highwayWayFilters};
    )->.matchingWays;
    .matchingWays out geom;
  `;
};


/**
 * Perform the OSM queries in parallel
 * @param {Object} location Only used for context for testing with mocks
 * @param {Object} queries Object keyed by query type 'way' and 'node' and valued by the OSM query string.
 * This can technically be more than two queries or have different names
 * @returns {Task<Result<Object>>} A Result.Ok The original query object with response props added containing the OSM response.
 * If one of the queries fail then a Result.Error object is returned with the errors instead
 * @sig parallelWayNodeQueriesResultTask:: String query, Object response <way: <query, node: <query> -> Task <way: <query, response>, node: <query, response>>>
 */
export const parallelWayNodeQueriesResultTask = (location, queries) => R.compose(
  // This converts failed tasks to a Result.Error and success to Result.Ok
  taskToResultTask,
  queries => R.map(
    // Just combine the results to get {way: {query, response}, node: {query, response}}
    objs => R.mergeAll(objs),
    waitAll(
      // When we have our own serve we can disable the delay
      R.addIndex(mapObjToValues)(
        (query, type, obj, i) => R.map(
          // Then map the task response to include the query for debugging/error resolution
          // TODO currently extracting the Result.Ok value here. Instead we should handle Result.Error
          // if the OSM can't be resolved
          response => ({[type]: {query, response: response.value}}),
          // Perform the task
          osmResultTask({name: 'fetchOsmRawTask', testMockJsonToKey: R.merge({type}, location)},
            options => fetchOsmRawTask(options, query)
          )
        ),
        queries
      )
    )
  )
)(queries);

/***
 * Given node results this finds all ways of each node so that we can resolve street names of the intersections
 * @param {Object} queries
 * @param {Object} queries.way Currently non used but returned
 * @param {Object} queries.node Response contains the nodes
 * @param {Object} queries.node.response Response containing the nodes
 * @returns {Task<Object>} Object keyed by way, node, and waysByNodeId. waysByNodeId is and object keyed
 * by nodeId and valued by a query and response
 * @sig waysOfNodeTask:: Task <way: <query, response>, node: <query, response>>> ->
 * Task <way: <query, response>, node: <query, response>, waysByNodeId: <node: <query, response>>>> ->
 */
export const waysByNodeIdTask = ({way, node}) => R.map(
  // Just combine the results to get {nodeIdN: {query, response}, nodeIdM: {query, response}, ...}
  objs => ({way, node, waysByNodeId: R.mergeAll(objs)}),
  waitAll(
    R.addIndex(R.map)(
      (nodeId, i) => R.map(
        // Then map the task response to include the query for debugging/error resolution
        // TODO currently extracting the Result.Ok value here. Instead we should handle Result.Error
        response => ({[nodeId]: {query: waysOfNodeQuery(nodeId), response: response.value}}),
        // Perform the task
        osmResultTask({name: 'waysOfNodeQuery'},
          options => fetchOsmRawTask(options, waysOfNodeQuery(nodeId))
        )
      ),
      // Extract the id of each node
      R.compose(
        R.map(reqStrPathThrowing('id')),
        reqStrPathThrowing('response.features')
      )(node)
    )
  )
);

/**
 * Map the waysByNodeId to the way features and clean up the geojson of the features to prevent API transmission errors
 * @param {Object} queryResults Object with response.features, which contains a list of way features
 * @returns {Object}
 * @sig mapToCleanedFeatures:: F: features => Task [responses: <features: [F]>>> -> Task <int, [F]>
 */
export const mapToCleanedFeatures = queryResults => R.map(
  // Clean the features of each first
  feature => _cleanGeojson(feature),
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
  feature => _cleanGeojson(feature),
  // Limit to the features
  R.map(
    reqStrPathThrowing('response.features'),
    waysByNodeId
  )
);


/**
 * Given wayFeatures that form a street block (and may overlap neigbhoring blocks), given nodeFeatures which
 * represent 1 or more intersections of the block (normally 2 but possibly 1 for a dead end or 3 or more for divided
 * streets), and given a mapping of wayFeatures features by those same nodeFeatures ids (where the wayFeatures features are all ways intersecting
 * that nodeFeatures--not just those of wayFeatures), construct an object that has the ways features trimmed and ordered to match
 * the intersection nodes, the intersection nodeFeatures features left in the same order they were given, and additionally
 * an intersections property that is an object keyed by nodeFeatures id and valued by the street names of the ways that meet
 * the intersection. The first wayFeatures street name is that of the block itself, the subsequent are one or more alphabetically
 * listed street names. Example intersections:
 * {nodeFeatures/1234: ['Main St', 'Billy Goat Gate', 'Wonder Woman Way'], nodeFeatures/2345: ['Main St', 'Howdy Doody Drive']}
 * @param wayFeatures
 * @param nodeFeatures
 * @param wayFeaturesByNodeId
 * @returns {Object} {wayFeatures: wayFeatures features, nodeFeatures: nodeFeatures features, intersections: ... }
 */
export const createSingleBlockFeatures = ({wayFeatures, nodeFeatures, wayFeaturesByNodeId}) => {
  return R.merge(
    {
      // Calculate the street names and put them in intersections
      // intersections is an object keyed by nodeFeatures id and valued by the unique list of streets.
      // The first street is always street matching the wayFeatures's street and the remaining are alphabetical
      // Normally there are only two unique streets for each intersection.
      // If one or both streets change names or for a >4-wayFeatures intersection, there can be more.
      // If we handle roundabouts correctly in the future these could also account for more
      intersections: _intersectionStreetNamesFromWaysAndNodes(wayFeatures, wayFeaturesByNodeId)
    },
    // Organize the ways and nodes, trimming the ways down to match the nodes
    // Then store the features in {ways: ..., nodes: ...}
    getFeaturesOfBlock(wayFeatures, nodeFeatures)
  );
};

/***
 * Sorts the features by connecting them at their start/ends
 * @param {[Object]} wayFeatures List of way features to sort. This is 1 or more connected ways that might overlap the
 * block on one or both sides
 * @param {[Object]} nodeFeatures Two node features representing the block intersection
 * TODO what about dead ends? Is the dead end side represented by a node or simply the end of one way?
 * @returns {Object}  {ways: ..., nodes: ...} contains keys nodes and ways. Nodes must always be the two node Features of the block.
 * ways must be at least on way Feature, possibly shortened to match the block and up to n way features with at
 * most the first and last possibly shortened to match the block
 */
export const getFeaturesOfBlock = (wayFeatures, nodeFeatures) => {
  // First handle some special cases:
  // If we have exactly one way and it has a tag area="yes" then it's a pedestrian zone or similar and the
  // two nodes aren't necessarily nodes of the pedestrian area.
  if (R.both(
    R.compose(R.equals(1), R.length),
    R.compose(R.equals('yes'), strPathOr(false, '0.properties.tags.area'))
  )(wayFeatures)) {
    return {
      ways: wayFeatures,
      nodes: nodeFeatures
    };
  }

  // Build a lookup of start and end points
  // This results in {
  //  end_coordinate_hash: {head: [feature]}
  //  coordinate_hash: {head: [feature], tail: [feature] }
  //  end_coordinate_hash: {tail: [feature]}
  //}
  // TODO this doesn't yet handle ways that are loops
  // Note that two hashes have only one feature. One with one at the head and one with one at the tail
  // The other have two features. So this gives us a good idea of how the features are chained together
  const lookup = R.reduce(
    (result, feature) => {
      return _reduceFeaturesByHeadAndLast(result, feature);
    },
    {},
    wayFeatures
  );
  // Do any features have the same head or last point? If so flip the coordinates of one
  const modified_lookup = R.map(
    headLastObj => {
      return R.map(
        features => {
          return R.when(
            f => R.compose(R.lt(1), R.length)(f),
            // Reverse the first features coordinates
            f => R.compose(
              f => R.over(R.lensPath([0, '__reversed__']), R.T, f),
              f => R.over(R.lensPath([0, 'geometry', 'coordinates']), R.reverse, f)
            )(f)
          )(features);
        },
        headLastObj
      );
    },
    lookup
  );
  const modifiedWayFeatures = R.compose(
    R.values,
    // Take l if it has __reversed__, otherwise take r assuming r has reversed or neither does and are identical
    featureObjs => mergeAllWithKey(
      (_, l, r) => R.ifElse(R.prop('__reversed__'), R.always(l), R.always(r))(l),
      featureObjs),
    // Hash each by id
    features => R.map(feature => ({[feature.id]: feature}), features),
    R.flatten,
    values => R.chain(R.values, values),
    R.values
  )(modified_lookup);

  // Reduce a LineString feature by its head and last point
  const finalLookup = R.reduce(
    (result, feature) => {
      return _reduceFeaturesByHeadAndLast(result, feature);
    },
    {},
    modifiedWayFeatures
  );

  // Use the linker to link the features together, dropping those that aren't between the two nodes
  const linkedFeatures = _linkedFeatures(finalLookup, nodeFeatures);

  // Finally remove the __reversed__ tags from the ways (we could leave them on for debugging if needed)
  return R.over(
    R.lensProp('ways'),
    ways => R.map(R.omit(['__reversed__']), ways),
    linkedFeatures
  );
};
