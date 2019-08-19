import {
  reqStrPathThrowing,
  resultToTaskNeedingResult,
  traverseReduceDeepResults,
  pickDeepPaths,
  resultToTaskWithResult,
  compact
} from 'rescape-ramda';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import {
  highwayNodeFilters,
  highwayWayFilters,
  osmIdToAreaId
} from './overpass';
import * as Result from 'folktale/result';
import {_queryLocationVariationsUntilFoundResultTask, getFeaturesOfBlock} from './overpassBlockHelpers';
import {parallelWayNodeQueriesResultTask} from './overpassBlockHelpers';
import {nominatimLocationResultTask} from './nominatimLocationSearch';
import {hashPoint} from './overpassFeatureHelpers';

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

  // 4) Return all blocks found in {Ok: []}. All ways and nodes not used in {Error: []}
  // 3) After traveling once.
  //  A) If point reached is a node, then block is created. Hash block by node ids and in between way ids
  //    (In between way ids can be fetched from the non-reduced ways) DONE
  //  B) If point is wayendnode:
  //    i) If wayendnode matches a node, this is a loop way. Make block and DONE
  //    ii) If wayendnode has has another way, travel that way (reversing its nodes if needed to travel) DONE
  //    iii) if wayendnode has no other way, dead end block. Store block by accumulated node and way(s) reduced to traversed waynodes.
  //  C) If point is waynode: store accumulated waynode and go back to step 3 CONTINUE
  // 2) Traveling. Hash the way segments by hashing the way id with the two node/endpoint id (order independent).
  //  If this segment is already in the hash, abandon this travel (segment has been traversed) DONE
  // 1) Travel from every node: Find ways of node and travel:
  //  A) If starting at way end, travel other direction. Go to step 2 for the one direction CONTINUE
  //  B) Else travel both directions to next node/way endpoint. Go to step 2 for each direction CONTINUEx2
  // For area ways (pedestrian areas) find nodes within 5 meters of each waynode. Hash way
  //    If the area way only matches one node, hash that matching waynode as a wayendnode.
  //    (Above when we travel we'll start at the matching node and go around the area until we reach another node or the wayendnode at the starting point)
  // For loop ways that match exactly 1 node in waynodehash, hash that matching waynode as a wayendnode in wayendnodehash
  //    Above when we travel we'll start at the node and stop at the wayendnode at the same place. See 3.B.i
  return R.composeK(
    // Finally get the features from the response
    resultToTaskNeedingResult(
      ({way, node}) => {
        const [wayFeatures, nodeFeatures] = R.map(reqStrPathThrowing('response.features'), [way, node]);
        // Hash intersection nodes by id. These are all intersections (nodehash)
        const nodeIdToNode = R.indexBy(R.prop('id'), nodeFeatures);
        const nodePointHash = R.indexBy(R.compose(hashPoint, reqStrPathThrowing('geometry.coordinates')), nodeFeatures);
        const matchingNodes = findMatchingNodes(nodePointHash);
        // Hash all way ids by intersection node if any waynode matches or is and area-way (pedestrian area) within 5m (waynodehash)
        const wayIdToNodes = R.fromPairs(R.map(
          wayFeature => [R.prop('id', wayFeature), matchingNodes(wayFeature)],
          wayFeatures
        ));
        // node id to list of ways
        const nodeIdToWays = R.reduce(
          (hash, [wayId, nodes]) => {
            const nodeIds = R.map(reqStrPathThrowing('id'), nodes);
            return R.reduce(
              // Add the wayId to the nodeId key
              (hsh, nodeId) => R.over(
                // Lens to get the node id in the hash
                R.lensProp(nodeId),
                // Add the way id to the list of the nodeId
                wayList => R.concat(wayList || [], [wayId]),
                hsh
              ),
              hash,
              nodeIds
            );
          },
          {},
          R.toPairs(wayIdToNodes)
        );
        // Hash way endings (wayendnode) ids unless it matches a node in the nodehash (wayendnodehash)
        const wayEndPointHashToNodes = R.map(
          wayFeature => {
            const wayCoordinates = reqStrPathThrowing('geometry.coordinates', wayFeature);
            return R.compose(
              // Filter out points that are already nodes
              endPointObjs => R.filter(({endPoint}) => R.not(R.propOr(false, hashPoint(endPoint), nodePointHash), endPointObjs)),
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
          },
          wayFeatures
        );
      }
    ),

    // Query for the ways and nodes in parallel
    queries => parallelWayNodeQueriesResultTask(location, queries)
  )({way: wayQuery, node: nodeQuery});
};

/**
 * Given a list of node features creates a function that expects a way feature and finds the nodes features
 * that the way intersects
 * @param {Object} nodePointHash A list of nodes hashed by point geojson
 * @returns {[Object]} The matching nodes
 */
const findMatchingNodes = R.curry((nodePointHash, wayFeature) => {
  return R.compose(
    nodes => compact(nodes),
    wayFeature => R.map(
      coordinate => R.propOr(null, hashPoint(coordinate), nodePointHash),
      reqStrPathThrowing('geometry.coordinates', wayFeature)
    )
  )(wayFeature);
});
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