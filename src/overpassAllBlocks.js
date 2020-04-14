import {loggers} from 'rescape-log';
import {
  composeWithChain,
  composeWithChainMDeep, composeWithMapExceptChainDeepestMDeep, composeWithMapMDeep,
  mapMDeep,
  mapToNamedResponseAndInputsMDeep, mergeDeepWithConcatArrays,
  pickDeepPaths,
  reqStrPathThrowing,
  resultToTaskWithResult,
  strPathOr,
  toArrayIfNot, traverseReduce,
  traverseReduceDeep
} from 'rescape-ramda';
import distance from '@turf/distance';
import {extractSquareGridFeatureCollectionFromGeojson, turfBboxToOsmBbox, turfPointToLocation} from 'rescape-helpers';
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
import {_queryLocationVariationsUntilFoundResultTask} from './overpassBlockHelpers';
import {nominatimLocationResultTask, nominatimReverseGeocodeToLocationResultTask} from './nominatimLocationSearch';
import {
  geojsonFeaturesHaveRadii,
  geojsonFeaturesHaveShape,
  geojsonFeaturesHaveShapeOrRadii,
  geojsonFeaturesIsPoint,
  isNominatimEligible, isOsmType,
  locationAndOsmBlocksToLocationWithGeojson
} from './locationHelpers';
import {v} from 'rescape-validate';
import PropTypes from 'prop-types';
import {geocodeJursidictionResultTask} from './googleLocation';
import {_queryOverpassForAllBlocksResultsTask} from './overpassAllBlocksHelpers';
import buffer from '@turf/buffer';
import {_constructStreetQuery} from './overpassStreet';

const log = loggers.get('rescapeDefault');

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
 * Resolve the locationWithNominatimData and then query for the all of its blocks in overpass.
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
 * @param {Object} locationWithNominatimData A locationWithNominatimData object
 * @returns {Task<{Ok: blocks, Error: errors>}>}
 * In Ok a list of results found in the form [{locationWithNominatimData,  results}]
 * Where each locationWithNominatimData represents a block and the results are the OSM geojson data
 * The results contain nodes and ways and intersections (the street intersections of each node)
 * Error contains Result.Errors in the form {errors: {errors, locationWithNominatimData}, locationWithNominatimData} where the internal
 * locationWithNominatimData are varieties of the original with an osm area id added. result.Error is only returned
 * if no variation of the locationWithNominatimData succeeds in returning a result
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
    // The last step is to assign each locationWithNominatimData jurisdiction information if it doesn't already have it
    // We check country and (city or county) of the locationWithNominatimData and only query for jurisdiction data if it lacks these fields
    result => {
      return resultToTaskWithResult(
        // Process Result Tasks locations, merging in jurisdiction data when needed
        // Task Result [Location] -> Task Result [Location]
        locationAndBlocks => {
          return traverseReduceDeep(2,
            (locations, location) => {return R.concat(locations, [location])},
            of(Result.Ok([])),
            R.map(
              ({block, location}) => {
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
                  // Reverse geocode and combine block, favoring keys already in locationWithNominatimData
                  ({block, location}) => {
                    // Convert the geojson line into a {lat, lon} center point
                    const searchLatLon = R.compose(
                      latLon => R.fromPairs(R.zip(['lat', 'lon'], latLon)),
                      point => turfPointToLocation(point),
                      geojson => center(geojson),
                      location => R.prop('geojson', location)
                    )(location);
                    // Task Result Object -> Task Result Object
                    return composeWithChainMDeep(2, [
                      nominatimProperties => {
                        // If we didn't get a street name from OSM, use that from nominatim
                        const checkStreet = reqStrPathThrowing('intersections.0.0', location);
                        const updatedStreet = R.when(
                          checkStreet => isOsmType('way', {id: checkStreet}),
                          checkStreet => strPathOr(checkStreet, 'street', nominatimProperties)
                        )(checkStreet);
                        // Update the nodesToIntersectingStreets
                        const updatedBlock = R.over(
                          R.lensProp('nodesToIntersectingStreets'),
                          obj => R.map(
                            obj => R.over(
                              R.lensIndex(0),
                              () => updatedStreet,
                              obj
                            ),
                            obj
                          ),
                          block
                        );
                        // Update the location.intersections
                        const updatedLocation = R.over(
                          R.lensProp('intersections'),
                          obj => R.map(
                            obj => R.over(
                              R.lensIndex(0),
                              () => updatedStreet,
                              obj
                            )
                          )(obj),
                          location
                        );
                        // Merge the block of the reverse goecoding. We'll keep our geojson since it represents
                        // the block and the reverse geocode just represents the center point
                        return of(Result.Ok({
                          block: updatedBlock,
                          location: R.merge(nominatimProperties, updatedLocation)
                        }));
                      },
                      // Reverse geocode the center of the block to get missing jurisdiction data
                      location => nominatimReverseGeocodeToLocationResultTask(
                        searchLatLon
                      )
                    ])(location);
                  }
                )({block, location});
              },
              locationAndBlocks
            )
          );
        }
      )(result);
    },
    // Use the results to create geojson for the locationWithNominatimData
    // Task Result [<results, locationWithNominatimData>] -> Task Result [<results, locationWithNominatimData>]
    locationBlocksResult => {
      return of(mapMDeep(2,
        ({block, location}) => {
          return {
            block,
            location: locationAndOsmBlocksToLocationWithGeojson(location, block)
          };
        }
      )(locationBlocksResult));
    },

    // Process the nominatim or google response(s) if any
    resultToTaskWithResult(
      locationVariationsWithOsm => {
        return processJurisdictionOrGeojsonResponsesResultTask(osmConfig, location, locationVariationsWithOsm);
      }
    ),

    // Nominatim query on the place search string or ready for querying because of geojson.
    location => {
      return R.cond([
        // If it's a geojson shape or has a radius, it's already prime for querying
        [
          location => geojsonFeaturesHaveShapeOrRadii(strPathOr(null, 'geojson', location)),
          location => of(Result.Ok([location]))
        ],
        // If it's got jurisdiction info, query nominatim to resolve the area
        [
          location => isNominatimEligible(location),
          location => nominatimOrGoogleJurisdictionGeojsonResultTask(osmConfig, location)
        ],
        [R.T, location => of(Result.Error({
          error: 'Location not eligible for nominatim query and does not have a geojson shape or radius',
          location
        }))]
      ])(location);
    }
  )(location);
}, [
  ['osmConfig', PropTypes.shape().isRequired],
  ['location', PropTypes.shape().isRequired]
], 'locationToOsmAllBlocksQueryResultsTask');

/**
 * Given 1 or more locationVariationsWithOsm returns a result task to query those places in order until
 * osm results are found. If 0 locationVariationsWithOsm are specified, returns a Result.Error
 * @param {Object} osmConfig
 * @param {Object} location The original locationWithNominatimData
 * @param {[Object]} locationVariationsWithOsm
 * @return {Task<Result<<Object>>} A task resolving to a Result.Ok with the successful locationWithNominatimData query or Result.Error
 * with the unsuccessful result;
 */
export const processJurisdictionOrGeojsonResponsesResultTask = (osmConfig, location, locationVariationsWithOsm) => {
  return R.cond([
    [R.length,
      // If we have variations, query then in order until a positive result is returned
      locationVariationsWithOsm => _queryLocationVariationsUntilFoundResultTask(
        osmConfig,
        (osmConfig, locationWithOsm) => {
          return R.map(
            // _queryOverpassWithLocationForAllBlocksResultsTask returns a {Ok: [block locations], Error: [Error]}
            // We need to reduce this: If anything is in error, we know the query failed, so we pass a Result.Error
            results => {
              return R.ifElse(
                R.compose(R.length, R.prop('Error')),
                // Put in a Result.Error so this result is skipped
                results => Result.Error(R.prop('Error', results)),
                // Put in a Result.Ok so this result is processed
                results => Result.Ok(R.prop('Ok', results))
              )(results);
            },
            _queryOverpassWithLocationForAllBlocksResultsTask(osmConfig, locationWithOsm)
          );
        },
        locationVariationsWithOsm
      )
    ],
    // If no query produced results return a Result.Error so we can give up gracefully
    [R.T,
      () => of(Result.Error({
        errors: ({
          errors: ['This locationWithNominatimData lacks jurisdiction or geojson properties to allow querying. The locationWithNominatimData must either have a country and city or geojson whose features all are shapes or have a radius property'],
          location
        }),
        location
      }))
    ]
  ])(locationVariationsWithOsm);
};

/**
 * Resolves the jurisdiction geojson of a locationWithNominatimData.geojson.features[0] where a jurisdication is not specified
 * @param {Object} osmConfig
 * @param {Object} location
 * @return {Task<Result<[Object]>>}  Returns 1 or more versions of the locationWithNominatimData, depending on whether nominatim
 * was allowed to fallback from a neighborhood query to a city query.
 */
export const nominatimOrGoogleJurisdictionGeojsonResultTask = (osmConfig, location) => {
  return composeWithChainMDeep(2, [
    ({nominatimLocations, googleLocation}) => {
      // If we get a googleLocation that is more than 100 meters from the nominatim point,
      // use the Google center point for the geojson
      const nominatimLocation = R.head(nominatimLocations || []);
      const dist = (nominatimLocationGeojson, googleLocationGeojson) => distance(
        nominatimLocationGeojson,
        googleLocationGeojson,
        {units: 'meters'}
      );
      const resolvedLocations = R.cond([
        // nominatimLocation, googleLocation both exist and are far apart. Prefer google
        [
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
              // Replace just the geometry of the only feature. We don't want to replace properties like radius
              R.lensPath(['geojson', 'features', 0, 'geometry']),
              // Replaces the single feature
              reqStrPathThrowing('geojson.geometry', googleLocation),
              nominatimLocation
            ));
          }
        ],
        // nominatimLocation doesn't exist but googleLocation does. Use Google to set the feature of the
        // original locationWithNominatimData, since we don't have an nominatimLocation
        [
          ({nominatimLocation, googleLocation}) => R.and(R.not(nominatimLocation), googleLocation),
          ({googleLocation}) => {
            return Array.of(R.set(
              // Replace just the geometry of the only feature. We don't want to replace properties like radius
              R.lensPath(['geojson', 'features', 0, 'geometry']),
              // Replaces the single feature
              reqStrPathThrowing('geojson.geometry', googleLocation),
              location
            ));
          }
        ],
        [R.T,
          () => {
            return nominatimLocations;
          }
        ]
      ])({nominatimLocation, googleLocation});
      log.info(`Resolved the following jurisdiction locations ${JSON.stringify(resolvedLocations)}`);
      return of(Result.Ok(resolvedLocations));
    },
    // If nominatimLocationResultTask gives us a center point back or no result, ask Google for it's center point
    // for the Jurisdiction. If Google's is really different, use Google's which usually has better
    // center points in terms of what is the activity center of the city
    mapToNamedResponseAndInputsMDeep(2, 'googleLocation',
      ({nominatimLocations}) => {
        return R.ifElse(
          R.either(
            R.complement(R.length),
            nominatimLocations => R.allPass([
              R.length,
              strPathOr(false, '0.geojson.features'),
              nominatimLocations => {
                return geojsonFeaturesIsPoint(reqStrPathThrowing('geojson', R.head(nominatimLocations)));
              }
            ])(nominatimLocations)
          ),
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
  ])({location});
};

/**
 * Queries for all blocks matching the Osm area id in the given locationWithNominatimData
 * @param {Object} osmConfig The osm config
 * @param {Object} osmConfig.minimumWayLength. The minimum lengths of way features to return. Defaults to 20 meters.
 * @param {Object} locationWithOsm Location object with  bbox, osmId, placeId from
 * @private
 * @returns  {Task<Object>} { Ok: locationWithNominatimData blocks, Error: []
 * Each locationWithNominatimData block, and results containing: {node, way, nodesToIntersectingStreets} in the Ok array
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
    // Build an OSM query for the locationWithNominatimData. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    locationWithOsm => {
      return of(
        R.fromPairs(
          R.map(
            type => [
              type,
              R.ifElse(
                // If the location has a street but no intersections, we want to query for all streets matching the name
                ({locationWithOsm}) => {
                  return R.both(
                    l => R.propOr(false, 'street', l),
                    l => R.compose(R.equals(0), R.length, R.propOr([], 'intersections'))(l)
                  )(locationWithOsm);
                },
                ({locationWithOsm}) => {
                  // Street query
                  return R.compose(
                    Array.of,
                    locationWithOsm => {
                      return _constructStreetQuery(
                        osmConfig,
                        {type},
                        locationWithOsm
                      );
                    }
                  )(locationWithOsm);
                },
                ({locationWithOsm}) => {
                  // Shape query, radius query, or area query
                  return _constructHighwayQueriesForType(
                    osmConfig,
                    {type},
                    // These are the only properties we might need from the locationWithOsm
                    pickDeepPaths(['osmId', 'osmType', 'geojson'], locationWithOsm)
                  );
                }
              )({locationWithOsm})
            ],
            ['way', 'node']
          )
        )
      );
    }
  )(locationWithOsm);
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
 * If center point is specified there must be a feature present in the locationWithNominatimData.geojson.features that defines
 * a radius to search
 * It can only be left undefined if geojson features are defined
 * @param {Object} [location.geojson] The locationWithNominatimData geojson features to query individually if the query is not based on jurisdiction
 * @param {Object} [location.osmOverrides] Optional overrides to force certain OSM way and node ids
 * @param {Object} [location.country] For radius queries based on jurisdiction
 * @returns {[string]} The queries for each feature of the locationWithNominatimData, or possibly more if the locationWithNominatimData features
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
    // Just put the locationWithNominatimData in an array since we'll search for it by areaId
    [({areaId}) => areaId, Array.of],
    // This should never happen
    [R.T, () => {
      throw new Error('Cannot query for a locationWithNominatimData that lacks both an areaId and geojson features with shapes or radii');
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

/**
 * Given geojson buffers all features by the given radius and units and queries OSM to create blocks.
 * @param {Number} radius The radius of the buffer
 * @param {String} units Any unit supported by turf, such as 'meters'
 * @param {Object} geojson Any geojson supported by buffer. The features that result from buffering are put into
 * a FeatureCollection that is then used to query for OSM blocks. Duplicate blocks returned due to overlapping
 * features are removed as well as possible
 * @return {Task<{Ok: [], Error: []}>} A task that resolves to a list of Ok items. Each item is {location, block}
 * where location is the location object respresenting the block and the block is the same geojson
 * at location.geojson. TODO block will probably go away in the future since it is redundant
 */
export const bufferedFeaturesToOsmAllBlocksQueryResultsTask = ({radius, units}, geojson) => {
  const result = buffer(geojson, radius, {units});
  // TODO can we create an intersection of each feature's buffer to prevent redundant querying
  const featureCollections = R.map(feature => ({type: 'FeatureCollection', features: [feature]}), result.features);
  return composeWithMapMDeep(1, [
    results => {
      return R.over(
        R.lensProp('Ok'),
        ok => {
          // Unique the blocks by the first way id
          return R.uniqBy(
            blockAndLocation => R.compose(
              R.join(':'),
              R.map(id => id.toString()),
              R.sortBy(R.identity),
              R.map(way => R.prop('id', way)),
              blockAndLocation => R.chain(type => strPathOr([], `block.${type}`, blockAndLocation), ['ways', 'nodes'])
            )(blockAndLocation),
            ok
          );
        },
        results
      );
    },
    featureCollections => {
      return traverseReduce(
        (acc, results) => {
          return mergeDeepWithConcatArrays(acc, results);
        },
        of({Ok: [], Error: []}),
        R.map(featureCollection => locationToOsmAllBlocksQueryResultsTask({}, {geojson: featureCollection}), featureCollections)
      );
    }
  ])(featureCollections);
};
