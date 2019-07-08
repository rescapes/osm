/**
 * Created by Andy Likuski on 2019.06.14
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
  compact,
  compactEmpty, mapMDeep,
  mapObjToValues, mergeAllWithKey,
  reqStrPathThrowing,
  resultToTaskNeedingResult, resultToTaskWithResult,
  traverseReduceWhile
} from 'rescape-ramda';
import {of, waitAll} from 'folktale/concurrency/task';
import * as Result from 'folktale/result';
import {
  _cleanGeojson, _filterForIntersectionNodesAroundPoint,
  _intersectionsFromWaysAndNodes, _linkedFeatures, _reduceFeaturesByHeadAndLast, AROUND_LAT_LON_TOLERANCE,
  fetchOsmRawTask,
  highwayOsmFilter,
  osmEquals, osmIdEquals, osmNotEqual
} from './overpass';
import {nominatimResultTask} from './search';
import {hasLatLngIntersections, isLatLng} from './locationHelpers';
import {compareTwoStrings} from 'string-similarity';
import {googleIntersectionTask} from './googleLocation';
import {loggers} from 'rescape-log';

const log = loggers.get('rescapeDefault');


const servers = [
  //'https://lz4.overpass-api.de/api/interpreter',
  //'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

function* gen() {
  let serverIndex = -1;
  while (true) {
    serverIndex = R.modulo(serverIndex + 1, R.length(servers));
    yield servers[serverIndex];
  }
}

const genServer = gen();
const roundRobinOsmServers = () => {
  return genServer.next().value;
};

/**
 * Determines if an OSM query result is a valid block
 * @param wayFeatures
 * @param nodeFeatures
 */
const predicate = ({wayFeatures, nodeFeatures}) => R.allPass([
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
    way(bn.matchingNode)${highwayOsmFilter}->.matchingWays;
    .matchingWays out geom;
  `;
};


/**
 * Query the given locations
 * @param {Object} location A Location object
 * @param {[String]} location.intersections Two pairs of strings representing the intersections cross-streets
 * @returns {Task<Result>} Result.Ok with the geojson results and the location in the form {results, location}
 * or a Result.Error in the form {error, location}. The location has a new property googleIntersctionObjs if Result.Ok,
 * which is the result of the google geocodings
 * The results contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysOfNodes, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 * Otherwise Result.Error in the form {errors: {errors, location}, location} where the internal
 * location are varieties of the original with an osm area id added. Result.Error is only returned
 * if no variation of the location succeeds in returning a result
 */
export const queryLocationOsm = location => {
  // This long chain of Task reads bottom to top. Only the functions marked Task are actually async calls.
  // Everything else is wrapped in a Task to match the expected type
  return R.composeK(
    // Task (Result.Ok Object | Result.Error) -> Task Result.Ok Object | Task Result.Error
    locationResult => {
      return resultToTaskWithResult(
        location => mapMDeep(2,
          results => ({location, results}),
          _locationToOsmQueryResults(location)
        ),
        locationResult
      );
    },
    location => R.cond([
      // If we defined explicitly OSM intersections set the intersections to them
      [R.view(R.lensPath(['data', 'osmOverrides', 'intersections'])),
        location => of(Result.of(
          R.over(
            R.lensProp('intersections'),
            () => R.view(R.lensPath(['data', 'osmOverrides', 'intersections']), location),
            location)
        ))
      ],
      // OSM needs full street names (Avenue not Ave), so use Google to resolve them
      // Use Google to resolve full names. If Google can't resolve either intersection a Result.Error
      // is returned. Otherwise a Result.Ok containing the location with the updated location.intersections
      // Also maintain the Google results. We can use either the intersections or the Google geojson to
      // resolve OSM data.
      [R.T,
        // Task Result -> Task Result
        location => mapMDeep(2,
          // Replace the intersections with the fully qualified names
          googleIntersectionObjs => {
            // If either intersection was a lat/lon it will return a locationWithJurisdictions
            // property. Use the first one we find to populate missing jurisdiction info in the location
            // if needed
            const jurisdiction = R.compose(
              R.ifElse(
                Result.Ok.hasInstance,
                result => R.pick(['country', 'state', 'city', 'neighborhood'], result.value),
                R.always({})
              ),
              R.when(R.identity, R.prop('locationWithJurisdictions')),
              R.find(R.has('locationWithJurisdictions'))
            )(googleIntersectionObjs);
            return R.mergeAll([
              // Any retrieved jurisdiction info gets lower priority than what is already in the location
              // That way if jurisdiction data with a lat/lon the Google jurisdiction won't trump
              jurisdiction,
              location,
              {
                intersections: R.zipWith(
                  (googleIntersectionObj, locationIntersection) => {
                    // If our intersection is a 'lat/lon' string, not a pair of streets, just return it
                    if (R.is(String, locationIntersection)) {
                      return locationIntersection;
                    }
                    const googleIntersection = R.prop('intersection', googleIntersectionObj);
                    // Make sure the order of the googleIntersection streets match the original, even though
                    // the Google one might be different to correct the name
                    return R.sort(
                      // Use compareTwoStrings to rank the similarity and subtract from 1 so the most similar
                      // wins
                      googleIntersectionStreetname => 1 - compareTwoStrings(
                        googleIntersectionStreetname,
                        reqStrPathThrowing('0', locationIntersection)
                      ),
                      googleIntersection
                    );
                  },
                  googleIntersectionObjs,
                  R.prop('intersections', location)
                ),
                googleIntersectionObjs
              }
            ]);
          },
          googleIntersectionTask(location)
        )
      ]
    ])(location)
  )(location);
};


/***
 * Sorts the features by connecting them at their start/ends
 * @param {[Object]} wayFeatures List of way features to sort
 * @param {[Object]} nodeFeatures Two node features representing the block intersection
 * @param {Object} Object contains keys nodes and ways. Nodes must always be the two node Features of the4 block.
 * ways must be at least on way Feature, possibly shortened to match the block and up to n way features with at
 * most the first and last possibly shortened to match the block
 */
export const getFeaturesOfBlock = (wayFeatures, nodeFeatures) => {
  // Build a lookup of start and end points
  // This results in {
  //  end_coordinate_hash: {head: [feature]}
  //  coordinate_hash: {head: [feature], tail: [feature] }
  //  end_coordinate_hash: {tail: [feature]}
  //}
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
 * Given a location with an osmId included, query the Overpass API and cleanup the results to get a single block
 * of geojson representing the location's two intersections and the way(s) representing the block
 * @param {Object} locationWithOsm A Location object that also has an osmId to limit the area of the queries.
 * @param {Object} locationWithOsm.data.osmOverrides Option overrides for the query
 * @param {[String]} locationWithOsm.data.osmOverrides.ways Optional way ids to use to resolve the ways
 * instead of relying on the street names
 * @param {[String]} locationWithOsm.data.osmOverrides.nodes Optional way ids to use to resolve the nodes
 * instead of relying on the street names
 * @param {[Object]} [geojsonPoints] Optional two geojson points, which either from Google or User-entered.
 * If specified these further constrain the nodes to within 5 meters of what is found for the street intersections
 * If the street intersections aren't specified then these are used alone to determine the two correct nodes.
 * @returns {Task<Result<Object>>} Result.Ok or a Result.Error in the form {error}
 * The results contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysOfNodes, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 */
const _queryOverpassForBlockWithOptionalOsmOverridesTask = (locationWithOsm, geojsonPoints) => {
  return R.composeK(
    queriesObj => _queryOverpassForBlockTask(R.merge(queriesObj, {waysOfNodeQuery})),
    // Build an OSM query for the location. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    locationWithOsm => of(
      R.fromPairs(R.map(
        type => [type, constructInstersectionsQuery({type}, locationWithOsm, geojsonPoints)],
        ['way', 'node']
      ))
    )
  )(locationWithOsm);
};

/***
 * Queries the location with the OverPass API for its given street block. Querying happens once or twice, first
 * with the neighborhood specified (faster) and then without if no results return. The neighborhood is
 * also be omitted in a first and only query if the location doesn't have one
 * @param {[Object]} locationVariationsOfOsm 1 or more of the same location with different osmIds
 * The first should be a neighborhood osmId if available, and the second is the city osmId. We hope to get
 * results with the neighborhood level osmId because it is faster, but if we get no results we query with the
 * city osmId. Alternatively this can be a location with lat/lons specified for the intersections.
 * Having lat/lons is just as good as an osmId
 * @returns {Task<Result<Object>>} Result.Ok in the form {location, result} or a Result.Error in the form {location, error}
 * The results contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysOfNodes, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 */
const _queryOverpassForBlockTaskUntilFound = locationVariationsOfOsm => {

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
        // Stop searching when we have a Result.Ok
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
      of(Result.Error([])),
      // Create a list of Tasks. We'll only run as many as needed
      // We start with limiting queries to a neighborhood and if nothing there works or there is no hood we limit
      // to the city. Within each area why try up to 3 queries.
      R.chain(
        locationWithOsm => {
          // geojson points from google or data entry can help us resolve OSM data when street names aren't enough
          const geojsonPoints = R.map(
            reqStrPathThrowing('geojson'),
            R.propOr([], 'googleIntersectionObjs', locationWithOsm)
          );
          return R.ifElse(
            locationWithOsm => hasLatLngIntersections(locationWithOsm),
            // Query with points if we only have lat/lng intersections
            locationWithOsm => [
              _queryOverpassForBlockWithOptionalOsmOverridesTask(
                R.omit(['intersections'], locationWithOsm),
                geojsonPoints)
            ],
            locationWithOsm => R.concat(
              [
                // First try to find the location using intersections
                _queryOverpassForBlockWithOptionalOsmOverridesTask(locationWithOsm)
              ],
              R.unless(
                R.isEmpty,
                geojsonPoints => [
                  // Next try using both intersections and Google intersection points
                  _queryOverpassForBlockWithOptionalOsmOverridesTask(locationWithOsm, geojsonPoints),
                  // Finally try using only Google intersection points
                  _queryOverpassForBlockWithOptionalOsmOverridesTask(
                    R.omit(['intersections'], locationWithOsm),
                    geojsonPoints)
                ]
              )(geojsonPoints)
            )
          )(locationWithOsm);
        },
        locationVariationsOfOsm
      )
    )
  )(locationVariationsOfOsm);
};

/**
 * Resolve the location and then query for the block in overpass.
 * Overpass will give us too much data back, so we have to clean it up in getFeaturesOfBlock.
 * This process will first use nominatimResultTask to query nomatim.openstreetmap.org for the relationship
 * of the neighborhood of the city. If it fails it will try the entire city. With this result we
 * query overpass using the area representation of the neighborhood or city, which is the OpenStreetMap id
 * plus a magic number defined by Overpass. If the neighborhood area query fails to give us the results we want,
 * we retry with the city area
 * @param location
 * @returns {Task<Result<Object>>} Result.Ok in the form {location,  results} if data is found,
 * otherwise Result.Error in the form {errors: {errors, location}, location} where the internal
 * location are varieties of the original with an osm area id added. Result.Error is only returned
 * if no variation of the location succeeds in returning a result
 * The results contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysOfNodes, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 */
const _locationToOsmQueryResults = location => {
  // Sort LineStrings (ways) so we know how they are connected
  return R.composeK(
    // Chain our queries until we get a result or fail
    locationVariationsWithOsm => R.cond([
      [R.length,
        locationVariationsWithOsm => _queryOverpassForBlockTaskUntilFound(locationVariationsWithOsm)
      ],
      // No OSM ids resolved, try to query with the location f it has lat/lons in the intersection
      [() => hasLatLngIntersections(location),
        () => _queryOverpassForBlockTaskUntilFound([location])],
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
    ])(locationVariationsWithOsm),
    // Remove failed nominatim queries
    results => of(compact(results)),
    // Use OSM Nominatim to get relation of the neighborhood (if it exists) and the city
    // We'll use one of these to query an area in Overpass
    location => waitAll(
      R.map(
        keys => nominatimResultTask(R.pick(keys, location))
          .map(responseResult => responseResult.matchWith({
              Ok: ({value}) => {
                // bounding box comes as two lats, then two lon, so fix
                return R.merge(location, {
                  // We're not using the bbox, but note it anyway
                  bbox: R.map(str => parseFloat(str), R.props([0, 2, 1, 3], value.boundingbox)),
                  osmId: value.osm_id,
                  placeId: value.place_id
                });
              },
              Error: ({value}) => {
                // If no results are found, just return null. Hopefully the other nominatin query will return something
                log.debug(value);
                return null;
              }
              // Remove nulls
            })
          ).mapRejected(
            // If the query fails to excute
            errorResult => errorResult.map(error => {
              log.warn(`Giving up. Nominatim query failed with error message: ${error}`);
              return error;
            })
          ),
        // Query with neighborhood (if given) and without.
        // We'll only actually use the first one that resolves
        compactEmpty(R.concat(
          R.ifElse(
            R.prop('neighborhood'),
            R.always([['country', 'state', 'city', 'neighborhood']]),
            R.always([])
          )(location),
          // This will either have country, state, city or country, city or nothing if it's a location
          // with just a lot/long
          [R.filter(prop => R.propOr(false, prop, location), ['country', 'state', 'city'])]
        ))
      )
    )
  )(location);
};

/**
 * Given a location with an osmId included, query the Overpass API and cleanup the results to get a single block
 * of geojson representing the location's two intersections and the block
 * @param {[String]} queries Queries generated by _queryOverpassForBlockWithOptionalOsmOverrides
 * or _queryOverpassForBlockWithGoogleGeojson. Right now there must be exactly 2 queries, first
 * the query for the ways of block and second the query for the nodes at the intersections of the block.
 * TODO change these to be named queries
 * @returns {Task<Result<Object>>} The Geojson 2 nodes and way features in a Result.Ok. If an error occurs,
 * namely no that the nodes or ways aren't found, a Result.Error is returned. Object has a ways, nodes,
 * and waysOfNodes property. The latter are the ways around each node keyed by node ids, which we can
 * use to resolve the street names of the block and intersecting streets. There is also an intersections
 * key with the street names. intersections is an object keyed by node id and valued by the unique list of streets.
 * The first street is always street matching the way's street and the remaining are alphabetical
 * Normally there are only two unique streets for each intersection.
 * If one or both streets change names or for a >4-way intersection, there can be more.
 * If we handle roundabouts correctly in the future these could also account for more
 */
const _queryOverpassForBlockTask = ({way: wayQuery, node: nodeQuery, waysOfNodeQuery}) => {
  return R.composeK(
    // Finally get the features from the response
    resultToTaskNeedingResult(
      ({way, node, waysOfNodes}) => {
        const [wayFeatures, nodeFeatures] = R.map(reqStrPathThrowing('response.features'), [way, node]);
        const nodeIdToWaysOfNodeFeatures = R.map(reqStrPathThrowing('response.features'), waysOfNodes);
        return of(
          R.merge(
            {
              // Calculate the street names and put them in intersections
              // intersections is an object keyed by node id and valued by the unique list of streets.
              // The first street is always street matching the way's street and the remaining are alphabetical
              // Normally there are only two unique streets for each intersection.
              // If one or both streets change names or for a >4-way intersection, there can be more.
              // If we handle roundabouts correctly in the future these could also account for more
              intersections: _intersectionsFromWaysAndNodes(wayFeatures, nodeIdToWaysOfNodeFeatures),
              // Clean the geojson of each way intersecting  each node
              // Then store the results in {waysOfNodes => {nodeN: ..., nodeM:, ...}}
              waysOfNodes: R.map(
                WaysOfNodeFeatures => R.map(
                  // Clean the features of each first
                  _cleanGeojson,
                  WaysOfNodeFeatures
                ),
                nodeIdToWaysOfNodeFeatures
              )
            },
            // Clean the geojson of each way and node feature to remove weird characters that mess up API storage
            // Then store the features in {ways: ..., nodes: ...}
            getFeaturesOfBlock(
              // Clean the features of each first
              ...R.map(
                features => R.map(_cleanGeojson, features),
                [wayFeatures, nodeFeatures]
              )
            )
          )
        );
      }
    ),

    // If our predicate fails, give up with a Response.Error
    // Task [Object] -> Task Result.Ok (Object) | Result.Error (Object)
    ({way, node, waysOfNodes}) => of(
      R.ifElse(
        // If predicate passes
        ({way: wayFeatures, node: nodeFeatures}) => predicate({wayFeatures, nodeFeatures}),
        // All good, return the responses
        () => Result.Ok({
          node,
          way,
          waysOfNodes
        }),
        // Predicate fails, return a Result.Error with useful info.
        ({way: wayFeatures, node: nodeFeatures}) => Result.Error({
          error: `Found ${R.length(nodeFeatures)} nodes and ${R.length(wayFeatures)} ways`,
          way,
          node,
          waysOfNodes
        })
      )(R.map(reqStrPathThrowing('response.features'), {node, way}))
    ),

    // Once we get our way query and node query done,
    // we want to get all ways of each node that was returned. These ways tell us the street names
    // that OSM has for each intersection, which are our official street names if we didn't collect them manually
    ({way, node}) => R.map(
      // Just combine the results to get {nodeIdN: {query, response}, nodeIdM: {query, response}, ...}
      objs => ({way, node, waysOfNodes: R.mergeAll(objs)}),
      waitAll(
        R.addIndex(R.map)(
          (nodeId, i) => R.map(
            // Then map the task response to include the query for debugging/error resolution
            response => ({[nodeId]: {query: waysOfNodeQuery(nodeId), response}}),
            // Perform the task
            fetchOsmRawTask(
              {
                overpassUrl: roundRobinOsmServers(),
                sleepBetweenCalls: i * 2000
              }, waysOfNodeQuery(nodeId)
            )
          ),
          // Extract the id of each node
          R.compose(
            R.map(reqStrPathThrowing('id')),
            reqStrPathThrowing('response.features')
          )(node)
        )
      )
    ),

    // Perform the OSM queries in "parallel"
    // TODO Wait 2 seconds for the second call, Overpass is super picky. When we get our
    // own server we can remove the delay
    queries => R.map(
      // Just combine the results to get {way: {query, response}, node: {query, response}}
      objs => R.mergeAll(objs),
      waitAll(
        // When we have our own serve we can disable the delay
        R.addIndex(mapObjToValues)(
          (query, type, obj, i) => R.map(
            // Then map the task response to include the query for debugging/error resolution
            response => ({[type]: {query, response}}),
            // Perform the task
            fetchOsmRawTask(
              {
                overpassUrl: roundRobinOsmServers(),
                sleepBetweenCalls: i * 2000
              }, query
            )
          ),
          queries
        )
      )
    )
  )({way: wayQuery, node: nodeQuery});
};


/**
 * Creates OSM Overpass query syntax to declare ways for a give OSM area id.
 * @param {Number} areaId Represents an OSM neighborhood or city
 * @param {[String]} [ways] Way ids if known ahead of time. Otherwise we'll query by the ordered blocks
 * @param {Object} [extraWays] Extra way ids if known ahead of time to add to the ways that the query finds.
 * Object can have any of 3 keys 'blockname', 'intersection1', 'intersection2' where each contains a list of extra
 * way ids to use for that street
 * @param {[[String]]} [orderedBlocks] Two pairs of street intersections used if we don't have way ids.
 * These are optional if geojson points will be used to instead find the nodes of all possible ways
 * @returns {String} Overpass query syntax string that declares the way variables, or an empty string
 * if no ways or orderedBlocks are specified
 * @private
 */
const _createIntersectionQueryWaysDeclarations = (areaId, ways, extraWays, orderedBlocks) => {
  // Convert extra ways to a 3 item array, each containing a list of extra way ids
  // The extraBlockname accounts for the rare case where the blockname is different for each intersection,
  // like E Main St to W Main St
  const extraWaysForBlocks = R.props(['blockname', 'intersection1', 'intersection2', 'extraBlockname'], R.defaultTo({}, extraWays));
  return R.cond([
    // We have hard-coded way ids, just set the first and last to a variable, we don't need w3 because
    // we know for sure that these two ways touch our intersection nodes
    [R.always(R.length(ways)), () => R.join('\n',
      R.addIndex(R.map)(
        (wayId, i) => `way(${wayId})->.w${i + 1};`,
        [R.head(ways), R.last(ways)]
      )
    )],
    // We don't have ordered blocks, we must have geojsonPoints. Do nothing with the ways
    [R.isNil, () => ''],

    // We don't have hard-coded way ids, so search for these values by querying
    [R.T, () => R.join('\n',
      R.addIndex(R.zipWith)(
        (block, extraWaysForBlock, i) => {
          const wayQuery = `way(area:${areaId})${osmEquals('name', block)}${highwayOsmFilter}`;
          // For this block if there are extra ways add them to the union
          const extraWays = R.map(id => `way${osmIdEquals(id)}`, R.defaultTo([], extraWaysForBlock));
          const wayUnion = `(${R.join(';', R.concat([wayQuery], extraWays))};)`;
          return `${wayUnion}->.w${i + 1};`;
        },
        orderedBlocks,
        extraWaysForBlocks
      )
    )]
  ])(orderedBlocks);
};


/**
 * Query Overpass when we optionally know the node and/or way ids ahead of time.
 * Explicit OSM ids are required when the regular resolution using intersections would return the wrong data because of duplicate street names
 * @param type
 * @param country
 * @param state
 * @param city
 * @param {[[String]]} [intersections] Optional if geojsonPoints are specified. The two intersections are an
 * array of two complete street names. Example [['Main Street', 'Chestnut Street'],
 * ['Main Street', 'Orchard Way']] Street abbreviations are not allowed. They will not be matched by OpenStreetMap.
 * If intersections are not specified then geojsonPoints are used to find a way that has an OSM node within 5 meters
 * of each point. The intersections must have one common street name.
 * TODO handle two intersections where the common street name changes mid-block
 * @param {String} [osmId] OSM id to be used to constrain the area of the query. This id corresponds
 * to a neighborhood or city. It can only be left undefined if geojsonPoints are defined
 * @param {Object} data Location data optionally containing OSM overrides
 * @param {Object} [data.osmOverrides] Optional overrides
 * @param {[Number]} [data.osmOverrides.nodes] Optional 2 node ids
 * @param {[Number]} [data.osmOverrides.ways] Optional 1 or more way ids
 * @param {[Object]} [geojsonPoints] Optional. Two geojson points that were either entered by a data collector
 * or came from Google's geocoding API. If supplied these will be used with the intersections to constrain
 * the OSM nodes to withing 5 meters of each of the two points. The points must be in the same order as the
 * given intersections. If intersections are not supplied, geojsonPoints are required. In this latter case
 * we search for a way that contains 1 node within 5 meters of each point
 * @returns {string}
 */
export const constructInstersectionsQuery = ({type}, {country, state, city, intersections, osmId, data}, geojsonPoints) => {

  if (R.and(R.isNil(intersections), R.isNil(geojsonPoints))) {
    throw Error("Improper configuration. One or both of intersections and geojsonPoints must be non-nil");
  }

  // The Overpass Area Id is based on the osm id plus this Overpass magic number
  // Don't calculate this if we didn't pass an osmId
  const areaId = R.when(R.identity, osmId => parseInt(osmId) + 3600000000)(osmId);
  // If we have hard-coded node and/or ways
  const nodes = R.view(R.lensPath(['osmOverrides', 'nodes']), data);
  const ways = R.view(R.lensPath(['osmOverrides', 'ways']), data);
  // If we want to add nodes or ways to what Overpass find itself they are in these structures extraNodes and extraWays
  // Object of nodes to add. Keyed with 'intersection1' and 'intersection2' to add nodes to the respective intersection that
  // OSM can't find itself. 0, 1, or both of the keys can be specified
  const extraNodes = R.view(R.lensPath(['osmOverrides', 'extraNodes']), data);
  // Object of ways to add. Keyed with 'blockname', 'intersection1' and 'intersection2' to add ways to the respective
  // roads that OSM can't find itself. 0, 1, or both of the keys can be specified. This was created because sometimes
  // at an intersection two different streets are the meeting and often one is an unnamed road like a service road
  // or foot path. Since our data collection only supports one street name for an intersection, this allows us to
  // specify the way of the other side of the intersection and add it to the way of the named street
  const extraWays = R.view(R.lensPath(['osmOverrides', 'extraWays']), data);
  // Get the ordered blocks, unless we have hard-coded way ids
  // This normally produces 3 blocks: The main block and the two intersecting blocks
  // If there is no common block it returns 4 blocks where the first two are intersections and the second two are intersections
  const orderedBlocks = R.cond([
    // If we have hard-coded ways, we have no ordered blocks
    [R.always(R.length(ways)), R.always(null)],
    // If we have no intersections, we have no ordered blocks (we must have geojsonPoints)
    [R.isNil, R.always(null)],
    // Convert intersections to ordered blocks
    [R.T, _extractOrderedBlocks]
  ])(intersections);

  // We generate different queries based on the parameters.
  // Rather than documenting the generated queries here it's better to run the tests and look at the log
  const query = `
    ${
    // Declare the way variables if needed
    _createIntersectionQueryWaysDeclarations(areaId, ways, extraWays, orderedBlocks)
    }
    ${
    // Declare the node variables
    _createIntersectionQueryNodesDeclarations(nodes, extraNodes, orderedBlocks, geojsonPoints)
    }
    ${
    // Constrain the declared ways to the declared nodes, producing the .ways variable
    _createIntersectionQueryConstrainWaysToNodes(ways, orderedBlocks)
    } 
    ${
    _createIntersectionQueryOutput(type, orderedBlocks)
    }
    ${
    _createIntersectionQueryEndingIfNeeded(nodes, orderedBlocks)
    }`;
  return query;
};


/**
 * Given a pair of adjacent street intersections, return the 3 blocks of the two intersections. First the main
 * intersection they both have in common, then the other two blocks
 * @returns {[String]} The three blocks
 * @private
 */
export const _extractOrderedBlocks = intersections => {

  // Find the common street
  const streetCount = R.reduce(
    (accum, street) => R.over(
      R.lensProp(street),
      value => (value || 0) + 1,
      accum
    ),
    {},
    R.flatten(intersections)
  );
  // This happens when the block name changes at one intersection. As long as the first blockname of each
  // intersection is the common block, this will still work with OSM
  if (!R.find(R.equals(2), R.values(streetCount))) {
    log.warn(`No common block in intersections: ${JSON.stringify(intersections)}. Will return all four streets`);
    return R.flatten(intersections);
  } else {
    // Sort each intersection, putting the common block first
    const modifiedIntersections = R.map(
      intersection => R.reverse(R.sortBy(street => R.prop(street, streetCount), intersection)),
      intersections
    );
    // List the 3 blocks: common block and then other two blocks
    return [R.head(R.head(modifiedIntersections)), ...R.map(R.last, modifiedIntersections)];
  }
};

const _createIntersectionQueryNodesDeclarations = function (nodes, extraNodes, orderedBlocks, geojsonPoints) {

  // If geojsonPoints are given we can use them to constrain the 2 nodes
  const [around1, around2] = R.ifElse(
    R.complement(R.isNil),
    () => R.map(
      // The 5 indicates 5 meters from the point. I'm assuming that Google and OSM are within 5 meters
      // otherwise we can't trust they are the same intersection
      // Extracts the coordinates from the geojson point. Reverse since lat, lng is expected
      geojsonPoint => `
      (around: ${AROUND_LAT_LON_TOLERANCE}, ${R.join(', ', R.reverse(reqStrPathThrowing('geometry.coordinates', geojsonPoint)))})`,
      geojsonPoints
    ),
    R.always(['', ''])
  )(geojsonPoints);

  // Limitations on nodes. For instance they can't be tagged as traffic signals!
  const nodeFilters = R.join('', [osmNotEqual('traffic_signals', 'signal')]);

  // Declare the node variables
  // Get the two intersection nodes
  return R.cond([
    // We have hard-coded node ids, just set the nodes to them
    [R.length, nodes => `(${R.join(' ', R.map(node => `node(${node});`, nodes))})->.nodes;`],
    // We have no orderedBlocks but we have geojsonPoints
    // Create two for loops. The second is embedded in the first. This looks for eligible nodes
    // and loops until a node for each each intersection that are connected by way(s) are found
    // If this is the case we'll need to close each pair of if/for statements at the end of our query
    // (See _createIntersectionQueryEndingIfNeeded)
    // It's best to output this code and look at it to make sense of it.
    [R.always(R.isNil(orderedBlocks)), () => {
      return `${_filterForIntersectionNodesAroundPoint(around1, 'nodes1', true)}
      ${_filterForIntersectionNodesAroundPoint(around2, 'nodes2', true)}
(.nodes1; .nodes2;)->.nodes;`;
    }],
    // If we have 4 different blocks we change the query to accommodate them
    [R.always(R.compose(R.equals(4), R.length)(orderedBlocks)), () => {
      return `(node(w.w1)(w.w2)${nodeFilters}${around1};
      node(w.w3)(w.w4)${nodeFilters}${around2};
    )->.nodes;`;
    }],
    // Otherwise search for the nodes by searching for the nodes contained in both w1 and w2 and both w1 and w3
    [R.T, () => {
      return `(node(w.w1)(w.w2)${nodeFilters}${around1};
      node(w.w1)(w.w3)${nodeFilters}${around2};
    )->.nodes;`;
    }]
  ])(nodes);
};

// Complements conditions in _createIntersectionQueryNodesDeclarations to sometimes but end blocks at the end of the query
const _createIntersectionQueryEndingIfNeeded = (nodes, orderedBlocks) => {
  return R.cond([
    [R.length, () => ''],
    [R.always(R.isNil(orderedBlocks)), () => '} }; } };'],
    [R.T, () => '']
  ])(nodes);
};

const _createIntersectionQueryConstrainWaysToNodes = (ways, orderedBlocks) => {
  return R.cond([
    // We have hard-coded ways, just return these as our final ways
    [R.length, ways => `(${R.map(way => `way(${way});`, ways)})->.ways;`],
    // We have no orderedBlocks but have geojsonPoints, search for all ways matching our nodes
    [R.always(R.isNil(orderedBlocks)), () => `way${highwayOsmFilter}(bn.nodes)->.ways;`],
    // If we had two different main block names handle it here
    [R.always(R.compose(R.equals(4), R.length)(orderedBlocks)),
      () => `(.w1; .w3;) -> .wx; way.wx(bn.nodes)->.ways;`
    ],
    // Otherwise get all w1 ways containing one or both nodes
    [R.T, () => `way.w1(bn.nodes)->.ways;`]
  ])(ways);
};

/**
 * Creates syntax for the output of the query.
 * @param {String} type Either way or node. We have to query nodes and ways seperately to prevent geojson output errors
 * @param {Object} orderedBlocks Tested for nil. Output is different if we din't have orderedBlocks
 * @private
 */
const _createIntersectionQueryOutput = (type, orderedBlocks) => {
  // Either return nodes or ways. Can't do both because the API messes up the geojson
  const outputVariable = R.cond([
    [R.equals('way'), R.always('.matchingWays')],
    [R.equals('node'), R.always('.matchingNodes')],
    [R.T, () => {
      throw Error('type argument must specified and be "way" or "node"');
    }]
  ])(type);
  return R.ifElse(
    R.isNil,
    // If we didn't have orderedBlocks, we'll have more possible results
    // We have to go through each way and find one that has exactly one node from our two node sets
    () => `foreach .ways -> .singleway (
 node.nodes1(w.singleway)->.nodes1OfSingleWay;
 node.nodes2(w.singleway)->.nodes2OfSingleWay;
 (.nodes1OfSingleWay; .nodes2OfSingleWay;)-> .nodesOfSingleWay;
 way.singleway(bn.nodesOfSingleWay)(if:nodes1OfSingleWay.count(nodes) == 1)(if:nodes2OfSingleWay.count(nodes) == 1)->.matchingWays;
 node.nodesOfSingleWay(if:nodes1OfSingleWay.count(nodes) == 1)(if:nodes2OfSingleWay.count(nodes) == 1)->.matchingNodes;
  ${outputVariable} out geom;
)`,
    // If we had orderedBlocks we're already done
    () => `
    .ways -> .matchingWays;
    .nodes -> .matchingNodes;
    ${outputVariable} out geom;
  `
  )(orderedBlocks);
};
