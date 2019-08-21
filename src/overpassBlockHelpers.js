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
  _reduceFeaturesByHeadAndLast, hashPointsToWayCoordinates, hashWayFeature
} from './overpassFeatureHelpers';
import {of} from 'folktale/concurrency/task';
import {
  fetchOsmRawTask, highwayWayFilters,
  osmResultTask
} from './overpass';
import {
  mapObjToValues,
  reqStrPathThrowing,
  mapMDeep,
  mergeAllWithKey,
  strPathOr,
  taskToResultTask,
  traverseReduceWhile,
  compactEmpty,
  chainObjToValues,
  splitAtInclusive,
  toNamedResponseAndInputs
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


/***
 * Queries the location with the OverPass API for its given street block. Querying happens once or twice, first
 * with the neighborhood specified (faster) and then without if no results return. The neighborhood is
 * also be omitted in a first and only query if the location doesn't have one
 * @param {Function<location>} queryLocationResultTask Called with each location variation and must return
 * a result task with the query results
 * @param {[Object]} locationVariationsOfOsm 1 or more of the same location with different osmIds
 * The first should be a neighborhood osmId if available, and the second is the city osmId. We hope to get
 * results with the neighborhood level osmId because it is faster, but if we get no results we query with the
 * city osmId. Alternatively this can be a location with lat/lons specified for the intersections.
 * Having lat/lons is just as good as an osmId
 * @returns {Task<Result<Object>>} Result.Ok in the form {location, result} or a Result.Error in the form {location, error}
 * The results contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysByNodeId, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 */
export const _queryLocationVariationsUntilFoundResultTask = R.curry((queryLocationResultTask, locationVariationsOfOsm) => {

  return R.composeK(
    result => of(
      // If we had no results report the errors of each query
      // We create this somewhat strange format so that we know what variation of the location was used for each
      // query. So the Result.Error looks like:
      // {
      //  errors: [
      //    {
      //       errors: [
      //        { error: error message about the query, nodeQuery: the osm way query },
      //        { error: error message about the query, nodeQuery: the osm node query},
      //       ]
      //       location: the variation of the location for this query
      //    },
      //    ... other location variations that were tried
      //  ]
      //  location: arbitrary first variation of the location
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
        // Fail the predicate to stop searching when we have a Result.Ok
        predicate: (previousResult, result) => R.complement(Result.Ok.hasInstance)(result),
        // Take the the last accumulation after the predicate fails
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
        locationWithOsm => queryLocationResultTask(locationWithOsm),
        locationVariationsOfOsm
      )
    )
  )(locationVariationsOfOsm);
});

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
      mapObjToValues(
        (query, type) => R.map(
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
 * @param {Object} location Only used for context for mock tests
 * @param {Object} queries
 * @param {Object} queries.way Currently non used but returned
 * @param {Object} queries.node Response contains the nodes
 * @param {Object} queries.node.response Response containing the nodes
 * @returns {Task<Object>} Object keyed by way, node, and waysByNodeId. waysByNodeId is and object keyed
 * by nodeId and valued by a query and response
 * @sig waysOfNodeTask:: Task <way: <query, response>, node: <query, response>>> ->
 * Task <way: <query, response>, node: <query, response>, waysByNodeId: <node: <query, response>>>> ->
 */
export const waysByNodeIdTask = (location, {way, node}) => R.map(
  // Just combine the results to get {nodeIdN: {query, response}, nodeIdM: {query, response}, ...}
  objs => ({way, node, waysByNodeId: R.mergeAll(objs)}),
  waitAll(
    R.map(
      (nodeId) => R.map(
        // Then map the task response to include the query for debugging/error resolution
        // TODO currently extracting the Result.Ok value here. Instead we should handle Result.Error
        response => ({[nodeId]: {query: waysOfNodeQuery(nodeId), response: response.value}}),
        // Perform the task
        osmResultTask({name: 'waysOfNodeQuery', testMockJsonToKey: R.merge({nodeId, type: 'waysOfNode'}, location)},
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
      intersections: _intersectionStreetNamesFromWaysAndNodes(wayFeatures, nodeFeatures, wayFeaturesByNodeId)
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

/**
 * Utility function to generate geojson from nodes and ways for testing block creation
 * @param nodes
 * @param ways
 * @returns {string} The complete geojson. View it at http://geojson.io/
 * @private
 */
export const _blockToGeojson = ({nodes, ways}) => JSON.stringify({
    "type": "FeatureCollection",
    "generator": "overpass-ide",
    "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    "timestamp": "",
    "features": R.concat(nodes, ways)
  }, null, '\t'
);

/**
 * Same as _blockToGeojson, but with lists of blocks
 * @param blocks
 * @returns {string}
 * @private
 */
export const _blocksToGeojson = blocks => JSON.stringify({
    "type": "FeatureCollection",
    "generator": "overpass-ide",
    "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    "timestamp": "",
    "features": R.reduce(
      (acc, {nodes, ways}) => R.concat(acc, R.concat(ways, nodes)),
      [],
      blocks
    )
  }, null, '\t'
);

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
    wayPoints => R.sort(R.identity, wayPoints),
    wayPoints => R.uniq(wayPoints),
    ways => R.chain(way => hashWayFeature(way), ways)
  )(ways);
  return `{nodes:[${R.join(',', nodeIds)}], wayPoints:[${R.join(',', wayPoints)}]}`;
};

export const _chooseBlockWithMostAlphabeticalOrdering = blocks => {
  R.sortBy(({nodes}) => scoreStreetNames, blocks);
};

/**
 *
 * @param wayFeatures
 * @param wayIdToWayPoints
 * @param nodePointToNode
 * @private
 */
export const _wayEndPointToDirectionalWays = ({wayFeatures, wayIdToWayPoints, nodePointToNode}) => R.compose(
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
)(wayFeatures);

// 1 Travel from every node along the directional ways
//  A If starting at way end, travel other direction. Go to step 2 for the one direction CONTINUE
//  B Else travel both directions to next node/way endpoint. Go to step 2 for each direction CONTINUEx2
// For area ways (pedestrian areas) find nodes within 5 meters of each waynode. Hash way <-- TODO
//    If the area way only matches one node, hash that matching waynode as a wayendnode.
//    (Above when we travel we'll start at the matching node and go around the area until we reach another node or the wayendnode at the starting point)
// At the end of this process we have a list of objects with nodes and ways.
// nodes has just the start node and ways has just one directional (partial) way whose first point
// is the node
export const _buildPartialBlocks = ({wayIdToWayPoints, nodeIdToWays, nodeIdToNode, nodeIdToNodePoint}) => R.unnest(chainObjToValues(
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
