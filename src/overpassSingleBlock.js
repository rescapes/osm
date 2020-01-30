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
import bboxPolygon from '@turf/bbox-polygon';
import buffer from '@turf/buffer';
import bbox from '@turf/bbox';
import distance from '@turf/distance';
import {featureCollection} from '@turf/helpers';
import {
  compact,
  mapKeysAndValues,
  mapToNamedResponseAndInputs,
  pickDeepPaths,
  reqStrPathThrowing,
  resultToTaskNeedingResult,
  resultToTaskWithResult,
  strPathOr,
  traverseReduceDeepResults
} from 'rescape-ramda';
import {of} from 'folktale/concurrency/task';
import * as Result from 'folktale/result';
import {
  _filterForIntersectionNodesAroundPoint,
  AROUND_LAT_LON_TOLERANCE,
  aroundPointDeclaration,
  configuredHighwayWayFilters,
  highwayNodeFilters,
  osmEquals,
  osmIdEquals,
  osmIdToAreaId
} from './overpassHelpers';
import {nominatimLocationResultTask} from './nominatimLocationSearch';
import {
  featuresOfOsmType,
  locationHasGeojsonFeatures,
  locationHasLocationPoints,
  locationWithLocationPoints
} from './locationHelpers';
import {_googleResolveJurisdictionResultTask} from './googleLocation';
import {loggers} from 'rescape-log';
import {
  _queryLocationVariationsUntilFoundResultTask,
  blocksToGeojson,
  createSingleBlockFeatures,
  mapToCleanedFeatures,
  mapWaysByNodeIdToCleanedFeatures,
  parallelWayNodeQueriesResultTask,
  waysByNodeIdResultsTask
} from './overpassBlockHelpers';
import {locationToOsmAllBlocksQueryResultsTask} from './overpassAllBlocks';
import {extents} from './overpassFeatureHelpers';

const log = loggers.get('rescapeDefault');


/**
 * Calls queryLocationForOsmSingleBlockResultTask on each location
 * @param {Object} osmConfig Currently unused
 * @param {[Object]} locations
 * @returns {Object} Object with Ok and Errors. Ok is a list of successfully processed with
 * queryLocationForOsmSingleBlockResultTask and Error is a list of those that failed
 */
export const queryLocationForOsmSingleBlocksResultsTask = (osmConfig, locations) => {
  return traverseReduceDeepResults(
    // 2 means process objects within the resolved task and further within each Result.Ok or Result.Error
    2,
    (oks, value) => R.concat(oks, [value]),
    (errors, value) => R.concat(errors, [value]),
    of({Ok: [], Error: []}),
    R.map(
      location => queryLocationForOsmSingleBlockResultTask(osmConfig, location),
      locations
    )
  );
};

/**
 *
 * Query the given block location
 * @param {Object} osmConfig
 * @param {Object} [osmConfig.forceOsmQuery] Default false, forces osm queries even if the location.geeojson
 * was already set
 * @param {Object} location A Location object
 * @param {[String]} location.intersections Two pairs of strings representing the intersections cross-streets
 * @returns {Task<Result>} Result.Ok with the geojson results and the location in the form {blcok, location}
 * or a Result.Error in the form {error, location}. The location has a new property googleIntersctionObjs if Result.Ok,
 * which is the result of the google geocodings
 * The blocks contain nodes and ways, and nodesToIntersectingStreets ,
 * where there are normally 2 nodes for the two intersections.
 * There must be at least one way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain nodesToIntersectingStreets, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 * Otherwise Result.Error in the form {errors: {errors, location}, location} where the internal
 * location are varieties of the original with an osm area id added. Result.Error is only returned
 * if no variation of the location succeeds in returning a result
 */
export const queryLocationForOsmSingleBlockResultTask = (osmConfig, location) => {
  // If the location already has geojson.features there's nothing to do.
  // If we forceOsmQuery then we query osm and get new geojson
  if (R.allPass([
    location => locationHasGeojsonFeatures(location),
    () => R.not(strPathOr(false, 'forceOsmQuery', osmConfig)),
    location => R.propOr([], 'intersections', location)
  ])(location)) {
    const features = reqStrPathThrowing('geojson.features', location);
    // We already have the geojson and intersections. Mimic the response from OSM
    const nodes = featuresOfOsmType('nodes', features);
    const intersections = reqStrPathThrowing('intersections', location);
    return of(Result.Ok({
        location,
        block: {
          ways: featuresOfOsmType('ways', features),
          nodes,
          nodesToIntersectingStreets: R.compose(
            R.fromPairs,
            R.zipWith((node, intersections) => [
              R.prop('id', node), intersections
            ])
          )(nodes, intersections)
        }
      }
    ));
  }

  return R.composeK(
    // Task (Result.Ok Object | Result.Error) -> Task Result.Ok Object | Task Result.Error
    locationResult => {
      return resultToTaskWithResult(
        location => {
          return _locationToOsmSingleBlockQueryResultTask(osmConfig, location);
        },
        locationResult
      );
    },
    location => {
      return R.cond([
        // If we defined explicitly OSM intersections set the intersections to them
        [R.view(R.lensPath(['data', 'osmOverrides', 'intersections'])),
          location => of(Result.of(
            R.over(
              R.lensProp('intersections'),
              () => R.view(R.lensPath(['data', 'osmOverrides', 'intersections']), location),
              location
            )
          ))
        ],
        [location => locationHasLocationPoints(location), R.compose(of, Result.Ok)],
        // Otherwise OSM needs full street names (Avenue not Ave), so use Google to resolve them
        // Use Google to resolve full names. If Google can't resolve either intersection a Result.Error
        // is returned. Otherwise a Result.Ok containing the location with the updated location.intersections
        // Also maintain the Google results. We can use either the intersections or the Google geojson to
        // resolve OSM data.
        [R.T, location => _googleResolveJurisdictionResultTask(location)]
      ])(location);
    }
  )(locationWithLocationPoints(location));
};


/**
 * Given a location with an osmId included, query the Overpass API and cleanup the results to get a single block
 * of geojson representing the location's two intersections and the way(s) representing the block
 * @param {Object} osmConfig
 * @param {Object} locationWithOsm A Location object that also has an osmId to limit the area of the queries.
 * @param {Object} locationWithOsm.data.osmOverrides Option overrides for the query
 * @param {[String]} locationWithOsm.data.osmOverrides.ways Optional way ids to use to resolve the ways
 * instead of relying on the street names
 * @param {[String]} locationWithOsm.data.osmOverrides.nodes Optional way ids to use to resolve the nodes
 * instead of relying on the street names
 * @param {[Object]} [geojsonPoints] Optional two geojson points, which either from Google or User-entered.
 * If specified these further constrain the nodes to within 5 meters of what is found for the street intersections
 * If the street intersections aren't specified then these are used alone to determine the two correct nodes.
 * @param {[[String]]} intersections The pair of intersection names if available. These are used in the query to help ensure
 * we get the right ways
 * @returns {Task<Result<Object>>} Result.Ok or a Result.Error in the form {error}
 * The results contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysByNodeId, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 */
const _queryOverpassWithLocationForSingleBlockResultTask = (osmConfig, locationWithOsm, geojsonPoints = null, intersections = null) => {
  return R.composeK(
    ({locationWithOsm, queries: {way: wayQuery, node: nodeQuery}}) => _queryOverpassForSingleBlockResultTask(
      osmConfig,
      // Pass intersections if available to help resolve the right ways
      R.merge(locationWithOsm, {intersections}),
      {way: wayQuery, node: nodeQuery}
    ),
    // Build an OSM query for the location. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    mapToNamedResponseAndInputs('queries',
      // Location l, String w, String n: l -> <way: w, node: n>
      ({locationWithOsm}) => of(
        R.fromPairs(R.map(
          type => [
            type,
            _constructInstersectionsQuery(
              osmConfig,
              {type},
              // These are the only properties we might need from the location
              // We pass the intersections if available. We detached them earliser from locationWithOsm
              // So that we can update locationWithOsm with the intersections from Overpass
              R.merge({intersections}, pickDeepPaths(['osmId', 'data.osmOverrides'], locationWithOsm)),
              geojsonPoints
            )
          ],
          ['way', 'node']
        ))
      )
    )
  )({locationWithOsm});
};

/**
 * Tries querying for the location based on the osm area id, osm city id, or intersections of the location
 * @param {Object} osmConfig
 * @param blockLocation
 * @returns {[Task<Result<Object>>[]} List of task with Result.Ok or a Result.Error in the form {error}
 * The results contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysByNodeId, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 * @private
 */
const _queryOverpassBasedLocationPropsForSingleBlockResultTasks = (osmConfig, blockLocation) => {
  // Get geojson points representing the  block location
  const geojsonPoints = R.prop('locationPoints', blockLocation);

  return R.compose(
    tasks => tasks,
    blockLocation => {
      return R.ifElse(
        blockLocation => locationHasLocationPoints(blockLocation),
        // If the query has lat/lng points use them. Just create one task
        blockLocation => [
          _queryOverpassWithLocationForSingleBlockResultTask(
            osmConfig,
            // Remove the lat/lng intersections so we can replace them with street names or failing that way ids from OSM
            R.omit(['intersections'], blockLocation),
            geojsonPoints,
            // Specify the intersections if available. This helps our overpass query get the right ways
            R.propOr(null, 'intersections', blockLocation)
          )
        ],
        // Else use intersections and possible google points
        blockLocation => R.concat(
          [
            // First try to find the location using intersections
            _queryOverpassWithLocationForSingleBlockResultTask(osmConfig, blockLocation)
          ],
          R.unless(
            R.isEmpty,
            geojsonPoints => [
              // Next try using both intersections and Google intersection points
              _queryOverpassWithLocationForSingleBlockResultTask(osmConfig, blockLocation, geojsonPoints),
              // Finally try using only Google intersection points
              _queryOverpassWithLocationForSingleBlockResultTask(
                osmConfig,
                R.omit(['intersections'], blockLocation),
                geojsonPoints)
            ]
          )(geojsonPoints)
        )
      )(blockLocation);
    }
  )(blockLocation);
};

/**
 * Resolve the location and then query for the block in overpass.
 * Overpass can't give precise blocks back so we get more than we need and clean it with getFeaturesOfBlock.
 * This process will first use nominatimResultTask to query nomatim.openstreetmap.org for the relationship
 * of the neighborhood of the city. If it fails it will try the entire city. With this result we
 * query overpass using the area representation of the neighborhood or city, which is the OpenStreetMap id
 * plus a magic number defined by Overpass. If the neighborhood area query fails to give us the results we want,
 * we retry with the city area
 * @param {Object} osmConfig
 * @param {Object} location A location object
 * @returns {Task<Result<Object>>} Result.Ok in the form {location, block} if data is found,
 * otherwise Result.Error in the form {errors: {errors, location}, location} where the internal
 * location are varieties of the original with an osm area id added. Result.Error is only returned
 * if no variation of the location succeeds in returning a result
 * The results contain nodes and ways, where there are normally 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 * Some blocks have more than two nodes if they have multiple divided ways.
 * The results also contain waysByNodeId, and object keyed by node ids and valued by the ways that intersect
 * the node. There is also an intersections array, which is also keyed by node id but valued by an array
 * of street names. The main street of the location's block is listed first followed by the rest (usually one)
 * in alphabetical order
 */
const _locationToOsmSingleBlockQueryResultTask = (osmConfig, location) => {
  const queryOverpassForSingleBlockUntilFoundResultTask = _queryLocationVariationsUntilFoundResultTask(
    osmConfig,
    _queryOverpassBasedLocationPropsForSingleBlockResultTasks
  );

  // Sort LineStrings (ways) so we know how they are connected
  return R.composeK(
    // If we get a Result.Error, it means our query failed. Try next with a bounding box query using the two location
    // points
    result => result.matchWith({
      Ok: ({value}) => {
        return of({block: value, location});
      },
      Error: ({value: {errors, location}}) => {
        return R.ifElse(
          location => R.length(strPathOr([], 'locationPoints', location)),
          location => {
            return R.map(
              result => result.mapError(
                ({location: failedLocation, errors: newErrors}) => Result.Error({
                  location,
                  errors: R.concat(errors, newErrors)
                })
              ),
              _locationToOsmSingleBlockBoundsQueryResultTask(osmConfig, location)
            );
          },
          // We can't do anything more
          location => of(Result.Error({errors, location}))
        )(location);
      }
    }),
    resultToTaskWithResult(
      // Chain our queries until we get a result or fail
      locationVariationsWithOsm => R.cond([
        // If the location has location points we don't need an osm area id because we already know were the block is
        [() => locationHasLocationPoints(location),
          () => queryOverpassForSingleBlockUntilFoundResultTask([location])
        ],
        // Otherwise rely on the osm area id
        [R.length,
          locationVariationsWithOsm => queryOverpassForSingleBlockUntilFoundResultTask(locationVariationsWithOsm)
        ],
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
    // Use OSM Nominatim to get relation of the neighborhood (if it exists) or failig that the city
    // Only neeeded if location.locationPoints is empty, meaning we don't know where the block is geospatially
    location => locationBlocksLatLonsOrNominatimLocationResultTask(location)
  )(location);
};

/**
 * Queries for a single block using a bounds query. The bounds are the box around the two location.locationPoints
 * with a buffer to make sure the street in question and it's neighbors are queried
 * @param osmConfig
 * @param location
 * @private
 */
export const _locationToOsmSingleBlockBoundsQueryResultTask = (osmConfig, location) => {
  const geojson = R.compose(
    // Make a feature collection
    feature => featureCollection([feature]),
    // Make a polygon box from the bounds
    points => bboxPolygon(points),
    // Get the bounds
    features => bbox(features),
    // Make a feature collection of point
    points => featureCollection(points),
    // Buffer the points by 20 meters so we don't miss the intersection nodes at the corners of the bounding box
    points => R.map(point => buffer(point, 20, {units: 'meters'}), points),
    location => reqStrPathThrowing('locationPoints', location)
  )(location);
  const locationWithGeojsonBounds = R.merge(location, {geojson});
  // Try to query by bounds, if we fail accumulate errors

  return R.composeK(
    matchingLocationsWithBlocks => of(_locationToOsmSingleBlockBoundsResolve(location, matchingLocationsWithBlocks)),
    location => locationToOsmAllBlocksQueryResultsTask(osmConfig, location)
  )(locationWithGeojsonBounds);
};

const _locationToOsmSingleBlockBoundsResolve = (location, {Ok: locationsWithBlocks, Errors: errors}) => {
  // Debug
  //blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
  // Find the block that has nodes within an acceptable tolerance of location.locationPoints to be
  // considered the correct block
  const matchingLocationsWithBlocks = compact(
    R.map(
      ({location, results}) => {
        const nodes = extents(reqStrPathThrowing('nodes', results));
        const nodeDistances = R.map(
          // Compare each node to each point and take the shortest distance
          locationPoint => {
            return R.compose(
              R.head,
              R.sortBy(({node, distance}) => distance),
              R.map(node => ({node, distance: distance(node, locationPoint, {units: 'meters'})}))
            )(nodes);
          },
          reqStrPathThrowing('locationPoints', location)
        );
        // If both nodes are within the tolerance distance of the locationPoints, accept the block, else null it
        return R.ifElse(
          () => R.all(nodeDistance => R.gt(AROUND_LAT_LON_TOLERANCE, nodeDistance.distance), nodeDistances),
          R.identity,
          () => null
        )({location, result: results});
      },
      locationsWithBlocks
    )
  );
  return R.ifElse(
    matchingLocationsWithBlocks => R.compose(R.lt(0), R.length)(matchingLocationsWithBlocks),
    matchingLocationsWithBlocks => Result.Ok(R.head(matchingLocationsWithBlocks)),
    () => Result.Error({
      location,
      errors: [`_locationToOsmSingleBlockBoundsQueryResultTask could not resolve location with bounds`]
    })
  )(matchingLocationsWithBlocks);
};

/**
 * Calls nominatimLocationResultTask if a block location doesn't have lat/lon info in
 * locationPoints. If it does then nominatimLocationResultTask if not needed because we can query
 * OSM with a small buffer around the pointIntersections instead of using the osmId from nominatim
 * @param {Object} location
 * @returns {Task<Result.Ok<Object>>} location variations with osmId and osmType added if nominatimLocationResultTask is called
 * Otherwise location in an array
 */
const locationBlocksLatLonsOrNominatimLocationResultTask = location => R.ifElse(
  locationHasLocationPoints,
  location => of(Result.Ok([location])),
  // Use OSM Nominatim to get relation of the neighborhood (if it exists) and the city
  // We'll use one of these to query an area in Overpass.
  // If we have a new location that only has lat/lon this will fail and we'll process the lat/lons above
  location => nominatimLocationResultTask({allowFallbackToCity: true, listSuccessfulResult: true}, location)
)(location);


/**
 * Given a location with an osmId included, query the Overpass API and cleanup the results to get a single block
 * of geojson representing the location's two intersections and the block
 * @param {Object} osmConfig
 * @param {Object} location only used for context in mock tests
 * @param {[String]} queries Queries generated by _queryOverpassForBlockWithOptionalOsmOverrides
 * or _queryOverpassForBlockWithGoogleGeojson. Right now there must be exactly 2 queries, first
 * the query for the ways of block and second the query for the nodes at the intersections of the block.
 * @returns {Task<Result<Object>>} The Geojson 2 nodes and way features in a Result.Ok. If an error occurs,
 * namely no that the nodes or ways aren't found, a Result.Error is returned. Object has a ways, nodes,
 * and waysByNodeId property. The latter are the ways around each node keyed by node ids, which we can
 * use to resolve the street names of the block and intersecting streets. There is also an intersections
 * key with the street names. intersections is an object keyed by node id and valued by the unique list of streets.
 * The first street is always street matching the way's street and the remaining are alphabetical
 * Normally there are only two unique streets for each intersection.
 * If one or both streets change names or for a >4-way intersection, there can be more.
 * If we handle roundabouts correctly in the future these could also account for more
 */
const _queryOverpassForSingleBlockResultTask = (osmConfig, location, {way: wayQuery, node: nodeQuery}) => {

  return R.composeK(
    // Finally get the features from the response
    resultToTaskNeedingResult(
      ({wayFeatures, nodeFeatures, wayFeaturesByNodeId}) => of(createSingleBlockFeatures(
        osmConfig,
        location,
        {wayFeatures, nodeFeatures, wayFeaturesByNodeId}
      ))
    ),
    // Map the way, node, and waysByNodeId to the way features and
    // clean up the geojson of the features to prevent API transmission errors
    // F: way features => Task <int, <responses: <features: [F]>>> -> Task <int, [F]>
    resultToTaskNeedingResult(
      ({way, node, waysByNodeId}) => of(R.merge(
        mapKeysAndValues(
          (queryResults, key) => [
            `${key}Features`,
            mapToCleanedFeatures(queryResults)
          ],
          {way, node}
        ),
        {wayFeaturesByNodeId: mapWaysByNodeIdToCleanedFeatures(waysByNodeId)}
      ))
    ),

    // If our _predicate fails, give up with a Response.Error
    // Task Result [Object] -> Task Result.Ok (Object) | Result.Error (Object)
    resultToTaskWithResult(
      ({Ok: {way, node, waysByNodeId}, Error: errors}) => {
        if (R.length(errors)) {
          log.warn(`Errors getting waysByNodeId ${JSON.stringify(errors)}`);
        }

        return of(
          _validateOsmResults({way, node, waysByNodeId})
        );
      }
    ),

    // Once we get our way query and node query done,
    // we want to get all ways of each node that was returned. These ways tell us the street names
    // that OSM has for each intersection, which are our official street names if we didn't collect them manually
    // Task Result.Ok <way: <queries, response>, node: <queries, response>>> ->
    // Task Result.Ok <way: <queries, response>, node: <queries, response>, waysByNodeId: <node: <queries, response>>>>
    ({result}) => resultToTaskNeedingResult(
      ({way, node}) => waysByNodeIdResultsTask(osmConfig, {way, node})
    )(result),

    // Query for the ways and nodes in parallel
    // <way: [query], node: [query]> -> Task <way: <queries, response>, node: <queries, response>>>
    mapToNamedResponseAndInputs('result',
      ({location, way, node}) => parallelWayNodeQueriesResultTask(osmConfig, location, {way, node})
    )
    // parallelWayNodeQueriesResultTask Expects an array of way and node queries because larger queries need to
    // be broken up into smaller tasks. We don't need to break up single block queries. It combines the results
    // so we get a single FeatureCollection response for each of way and node
  )({location, way: [wayQuery], node: [nodeQuery]});
};

/**
 * Determines if an OSM query result is a valid block
 * @param wayFeatures
 * @param nodeFeatures
 */
export const _predicate = ({wayFeatures, nodeFeatures}) => R.allPass([
  // Not null
  R.complement(R.isNil),
  // We'd normally limit nodes to 2, but there can be up to 8 if we have a divided road that meets
  // two other divided roads, like this: ==#===#==
  // There might be cases where a divided road merges into a nondivided road, so we'll allow 2-4
  ({nodeFeatures}) => R.compose(R.both(R.lte(2), R.gte(8)), R.length)(nodeFeatures),
  // >0 ways:w
  ({wayFeatures}) => R.compose(R.lt(0), R.length)(wayFeatures)
])({wayFeatures, nodeFeatures});

/**
 * Validates the ways and nodes we found to make a valid street block
 * @param {Object} way
 * @param {[Object]} way.features
 * @param {Object} node
 * @param {[Object]} node node.features
 * @param {Object} waysByNodeId object keyed by node id and valued by the ways of the node
 * @return {Result<Object>} Result.Ok if the data is valid, else Result.Error with an error message and
 * the input features
 * @private
 */
const _validateOsmResults = ({way, node, waysByNodeId}) => {
  return R.ifElse(
    // If _predicate passes
    ({way: wayFeatures, node: nodeFeatures}) => _predicate({wayFeatures, nodeFeatures}),
    // All good, return the responses
    () => Result.Ok({
      node,
      way,
      waysByNodeId
    }),
    // Predicate fails, return a Result.Error with useful info.
    ({way: wayFeatures, node: nodeFeatures}) => Result.Error({
      error: `Found ${R.length(nodeFeatures)} nodes and ${R.length(wayFeatures)} ways`,
      way,
      node,
      waysByNodeId
    })
  )(R.map(reqStrPathThrowing('response.features'), {node, way}));
};

/**
 * Creates OSM Overpass query syntax to declare ways for a give OSM area id.
 * @param {Object} osmConfig
 * @param {Number} areaId Represents an OSM neighborhood or city
 * @param {[String]} [explicitWayIds] Way ids if known ahead of time. Otherwise we'll query by the ordered blocks
 * @param {Object} [explicitExtraWayIds] Extra way ids if known ahead of time to add to the ways that the query finds.
 * Object can have any of 3 keys 'blockname', 'intersection1', 'intersection2' where each contains a list of extra
 * way ids to use for that street
 * @param {[[String]]} [orderedBlocks] Two pairs of street intersections used if we don't have way ids.
 * These are optional if geojson points will be used to instead find the nodes of all possible ways
 * @returns {String} Overpass query syntax string that declares the way variables, or an empty string
 * if no ways or orderedBlocks are specified
 * @private
 */
const _createIntersectionQueryWaysDeclarations = (osmConfig, areaId, explicitWayIds, explicitExtraWayIds, orderedBlocks) => {
  // Convert extra ways to a 3 item array, each containing a list of extra way ids
  // The extraBlockname accounts for the rare case where the blockname is different for each intersection,
  // like E Main St to W Main St
  const extraWaysForBlocks = R.props(['blockname', 'intersection1', 'intersection2', 'extraBlockname'], R.defaultTo({}, explicitExtraWayIds));
  return R.cond([
    // We have hard-coded way ids, just set the first and last to a variable, we don't need w3 because
    // we know for sure that these two ways touch our intersection nodes
    [R.always(R.length(explicitWayIds)), () => R.join('\n',
      R.addIndex(R.map)(
        (wayId, i) => `way(${wayId})->.w${i + 1};`,
        [R.head(explicitWayIds), R.last(explicitWayIds)]
      )
    )],
    // We don't have ordered blocks, we must have geojsonPoints. Do nothing with the ways
    [R.isNil, () => ''],

    // We don't have hard-coded way ids, so search for these values by querying
    [R.T, () => R.join('\n',
      R.addIndex(R.zipWith)(
        (block, extraWaysForBlock, i) => {
          const wayQuery = `way(area:${areaId})${osmEquals('name', block)}${configuredHighwayWayFilters(osmConfig)}`;
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
 * Construct a query for Overpass when we optionally know the node and/or way ids ahead of time.
 * Explicit OSM ids are required when the regular resolution using intersections would return the wrong data because of duplicate street names
 * @param {Object} osmConfig
 * @param type
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
 * @returns {string} The complete Overpass query string
 */
const _constructInstersectionsQuery = (osmConfig, {type}, {intersections, osmId, data}, geojsonPoints) => {

  if (R.and(R.isNil(intersections), R.isNil(geojsonPoints))) {
    throw Error("Improper configuration. One or both of intersections and geojsonPoints must be non-nil");
  }

  // The Overpass Area Id is based on the osm id plus this Overpass magic number
  // Don't calculate this if we didn't pass an osmId
  const areaId = R.when(R.identity, osmIdToAreaId)(osmId);
  // If we have hard-coded node and/or ways
  const explicitNodeIds = R.view(R.lensPath(['osmOverrides', 'nodes']), data);
  const explicitWayIds = R.view(R.lensPath(['osmOverrides', 'ways']), data);
  // If we want to add nodes or ways to what Overpass find itself they are in these structures extraNodes and extraWays
  // Object of nodes to add. Keyed with 'intersection1' and 'intersection2' to add nodes to the respective intersection that
  // OSM can't find itself. 0, 1, or both of the keys can be specified
  const explictExtraNodeIds = R.view(R.lensPath(['osmOverrides', 'extraNodes']), data);
  // Object of ways to add. Keyed with 'blockname', 'intersection1' and 'intersection2' to add ways to the respective
  // roads that OSM can't find itself. 0, 1, or both of the keys can be specified. This was created because sometimes
  // at an intersection two different streets are the meeting and often one is an unnamed road like a service road
  // or foot path. Since our data collection only supports one street name for an intersection, this allows us to
  // specify the way of the other side of the intersection and add it to the way of the named street
  const explicitExtraWayIds = R.view(R.lensPath(['osmOverrides', 'extraWays']), data);
  // Get the ordered blocks, unless we have hard-coded way ids
  // This normally produces 3 blocks: The main block and the two intersecting blocks
  // If there is no common block it returns 4 blocks where the first two are intersections and the second two are intersections
  const orderedBlocks = R.cond([
    // If we have geojson points, we don't need ordered blocks
    [R.always(geojsonPoints), R.always(null)],
    // If we have hard-coded ways, we have no ordered blocks
    [R.always(R.length(explicitWayIds)), R.always(null)],
    // Convert intersections to ordered blocks
    [R.T, _extractOrderedStreetsFromIntersections]
  ])(intersections);

  // We generate different queries based on the parameters.
  // Rather than documenting the generated queries here it's better to run the tests and look at the log
  const query = `
    ${
    // Declare the way variables if needed
    _createIntersectionQueryWaysDeclarations(osmConfig, areaId, explicitWayIds, explicitExtraWayIds, orderedBlocks)
  }
    ${
    // Declare the node variables
    // We pass the optional intersections to help limit what ways can be selected
    _createIntersectionQueryNodesDeclarations(osmConfig, explicitNodeIds, explictExtraNodeIds, orderedBlocks, geojsonPoints, intersections)
  }
    ${
    // Constrain the declared ways to the declared nodes, producing the .ways variable
    _createIntersectionQueryConstrainWaysToNodes(osmConfig, explicitWayIds, orderedBlocks)
  } 
    ${
    _createIntersectionQueryOutput(type, orderedBlocks)
  }
    ${
    _createIntersectionQueryEndingIfNeeded(explicitNodeIds, orderedBlocks)
  }`;
  return query;
};


/**
 * Given a pair of adjacent street intersections, return the 3 street names of the two intersections. First the main
 * intersection they both have in common, then the other two blocks
 * @returns {[String]} The three street names
 * @private
 */
export const _extractOrderedStreetsFromIntersections = intersections => {

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


const _createIntersectionQueryNodesDeclarations = function (osmConfig, nodes, explicitExtraNodeIds, orderedBlocks, geojsonPoints, intersections) {

  // If geojsonPoints are given we can use them to constrain the 2 nodes
  const [around1, around2] = R.ifElse(
    R.complement(R.isNil),
    () => R.map(
      // The 5 indicates 5 meters from the point. I'm assuming that Google and OSM are within AROUND_LAT_LON_TOLERANCE meters
      // otherwise we can't trust they are the same intersection
      // Extracts the coordinates from the geojson point. Reverse since lat, lng is expected
      geojsonPoint => aroundPointDeclaration(AROUND_LAT_LON_TOLERANCE, geojsonPoint),
      geojsonPoints
    ),
    R.always(['', ''])
  )(geojsonPoints);

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
      return `${_filterForIntersectionNodesAroundPoint(osmConfig, strPathOr(null, '0', intersections), around1, 'nodes1', true)}
      ${_filterForIntersectionNodesAroundPoint(osmConfig, strPathOr(null, '1', intersections), around2, 'nodes2', true)}
(.nodes1; .nodes2;)->.nodes;`;
    }],
    // If we have 4 different blocks we change the query to accommodate them
    // TODO Review this and clarify cases where we have exactly 4 blocks
    [R.always(R.compose(R.equals(4), R.length)(orderedBlocks)), () => {
      return `(node(w.w1)(w.w2)${highwayNodeFilters}${around1};
      node(w.w3)(w.w4)${highwayNodeFilters}${around2};
    )->.nodes;`;
    }],
    // Otherwise search for the nodes by searching for the nodes contained in both w1 and w2 and both w1 and w3
    [R.T, () => {
      return `(node(w.w1)(w.w2)${highwayNodeFilters}${around1};
      node(w.w1)(w.w3)${highwayNodeFilters}${around2};
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

const _createIntersectionQueryConstrainWaysToNodes = (osmConfig, ways, orderedBlocks) => {
  return R.cond([
    // We have hard-coded ways, just return these as our final ways
    [R.length, ways => `(${R.map(way => `way(${way});`, ways)})->.ways;`],
    // We have no orderedBlocks but have geojsonPoints, search for all ways matching our nodes
    [R.always(R.isNil(orderedBlocks)), () => `way${configuredHighwayWayFilters(osmConfig)}(bn.nodes)->.ways;`],
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
    // Get the nodes from each intersection that are near the way. We do this instead of finding
    // nodes that are on the way (e.g. node.nodes1(w.singleway)) because area ways such as pedestrian areas
    // won't have a node that is one of our intersection nodes. TODO we could code this to only allow
    // area ways to do fuzzy queries and 
    // TODO this == 'yes' should work if the area tag equals yes. But it always evaluates false.
    // Thus I use != so the top block is always true, sigh
    if (.singleway.t[area] != 'yes') { 
     node.nodes1(around.singleway:10)->.nodes1OfSingleWay;
     node.nodes2(around.singleway:10)->.nodes2OfSingleWay;
    } else {
     node.nodes1(w.singleway)->.nodes1OfSingleWay;
     node.nodes2(w.singleway)->.nodes2OfSingleWay;
    }
       // See if there is a node that joins both way sets, but not the same way of both sets nor a node that
       // is an intersection node
       // This only happens when a way changes between the two interseection nodes
     (.waysOfOneOfnodes2Possible; - .waysOfOneOfnodes1Possible;)->.waysOfOneOfnodes2Sans1Possible;
      node(w.waysOfOneOfnodes1Possible)(w.waysOfOneOfnodes2Sans1Possible)->.maybeJoiningNode;
      (.maybeJoiningNode; - .nodes;)->.joiningNode;
      // Put the intersection nodes together with the possible joining node
 (.nodes1OfSingleWay; .nodes2OfSingleWay; .joiningNode;)-> .nodesOfSingleWay;          
      if (joiningNode.count(nodes) > 0) {
         way.singleway(bn.nodes1OfSingleWay)(bn.joiningNode)(if:nodes1OfSingleWay.count(nodes) == 1)(if:joiningNode.count(nodes) == 1)->.matching1Ways;
                 way.singleway(bn.nodes2OfSingleWay)(bn.joiningNode)(if:nodes2OfSingleWay.count(nodes) == 1)(if:joiningNode.count(nodes) == 1)->.matching2Ways;
        (.matching1Ways; .matching2Ways;) -> .matchingWays;
      // Now overwrite .nodesOfSingleWay to remove the join node
      // If we have matchingWays, we can assume the nodes1OfSingleWay and nodes2OfSingleWay are the two intersection nodes
        (.nodes1OfSingleWay; .nodes2OfSingleWay;)->.nodesWithoutJoiningNode;
        node.nodesWithoutJoiningNode(if:matchingWays.count(ways) > 0) -> .matchingNodes;
      }
      else {
 way.singleway(bn.nodesOfSingleWay)(if:nodes1OfSingleWay.count(nodes) == 1)(if:nodes2OfSingleWay.count(nodes) == 1)->.matchingWays;
 node.nodesOfSingleWay(if:nodes1OfSingleWay.count(nodes) == 1)(if:nodes2OfSingleWay.count(nodes) == 1)->.matchingNodes;
  }
  
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
