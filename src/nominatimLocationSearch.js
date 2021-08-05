/**
 * Created by Andy Likuski on 2017.06.19
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import xhr from 'xhr';
import T from 'folktale/concurrency/task/index.js';
const {task, waitAll, of} = T;
import * as R from 'ramda';
import {
  traverseReduceWhile,
  mapObjToValues,
  camelCase,
  compactEmpty,
  promiseToTask,
  traverseReduceDeepResults,
  taskToResultTask,
  mapMDeep,
  renameKey,
  duplicateKey,
  transformKeys,
  filterWithKeys,
  composeWithChainMDeep, toNamedResponseAndInputs, strPathOr, compact, composeWithChain
} from '@rescapes/ramda';
import {locationToTurfPoint} from '@rescapes/helpers';
import Nominatim from 'nominatim-geocoder';
import mapbox from 'mapbox-geocoding';
import Result from 'folktale/result/index.js';
import {addressString, featuresByOsmType, featuresOfOsmType, stateCodeLookup} from './locationHelpers.js';
import area from '@turf/area';
import bboxPolygon from '@turf/bbox-polygon';
import {loggers} from '@rescapes/log';
import {fetchOsmRawTask, nominatimServers, osmResultTask, roundRobinNoimnatimServers} from './overpassHelpers.js';

const log = loggers.get('rescapeDefault');

/**
 * Uses Mapbox to resolve locations based on a search string
 * @param {String} endpoint The Endpoint
 * @param {String} source The source
 * @param {String} accessToken The accessToken
 * @param {String} proximity The proximity
 * @param {String} query The query
 * @returns {Object} A Task to query for the search results
 */
export const searchLocation = (endpoint, source, accessToken, proximity, query) => dispatch => {
  return task(({reject, resolve}) => {
    const uri = `${endpoint}/geocoding/v5/${source}/${encodeURIComponent(query)}.json?access_token=${accessToken}${(proximity ? '&proximity=' + proximity : '')}`;
    xhr({
      uri: uri,
      json: true
    }, function (err, res, body) {
      if (err) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
};

const nominatimResultTaskTries = ({tries, name}, taskFunc) => {
  const attempts = tries || R.length(nominatimServers);
  return traverseReduceWhile(
    {
      // Fail the _predicate to stop searching when we have a Result.Ok
      predicate: (previousResult, result) => R.complement(Result.Ok.hasInstance)(result),
      // Take the the last accumulation after the _predicate fails
      accumulateAfterPredicateFail: true
    },

    // If we get a Result.Ok, just return it. The first Result.Ok we get is our final value
    // When we get Result.Errors, concat them for reporting
    (previousResult, result) => result.matchWith({
      Error: ({value}) => {
        log.warn(`Osm query failed on server ${value.server} with ${JSON.stringify(value.value)}`);
        return previousResult.mapError(R.append(value));
      },
      Ok: R.identity
    }),
    // Starting condition is failure
    of(Result.Error([])),
    // Create the task with each function. We'll only run as many as needed to get a result
    R.times(attempt => {
      const server = roundRobinNoimnatimServers();
      // Convert rejected tasks to Result.Error and resolved tasks to Result.Ok.
      // For errors wrap the server into the value so we can't report the erring server
      return taskToResultTask(
        //taskFunc({overpassUrl: server})
        task(({resolve}) => {
          log.debug(`Starting Nominatim task ${name} attempt ${attempt + 1} of ${attempts} on server ${server}`);
          return resolve(server);
        }).chain(server => taskFunc({nominatimUrl: server}))
      ).map(v => {
        return v.mapError(
          e => ({value: e, server})
        );
      });
    }, attempts)
  );
};

/*
 * Uses the nominatim service to find a relation representing the given locationWithNominatimData.
 * Currently this supports neighborhoods and cities. If a neighborhood is specified in the locationWithNominatimData and that
 * query fails, the city without the neighborhood is queried. So this query is as precise as possible but
 * will not give up until it fails at the city-wide level. TODO in the future we can support other jurisdictions
 * like counties
 * @param {Object} config
 * @param {Object} [config.allowFallbackToCity] Default true. Allows Nomanatim to return city-wide results if
 * the neighborhood relation isn't found. This is useful when trying to find a block, but not to find the osmId
 * of a neighborhood. Set false to avoid fallback
 * @param {Object} [config.listSuccessfulResult] When true, returns the first successful result as a Result.Ok
 * with a single item list. Otherwise the Result.Ok is an empty array. If false, the default, returns the
 * first success Result.Ok or the errors array as a Result.Error
 * @param {Object} locationWithNominatimData Must contain country, city, and optionally state and neighborhood
 * @param {Object} locationWithNominatimData.country Required the country to search in
 * @param {Object} [locationWithNominatimData.state] Optional state of state, provinces, etc.
 * @param {Object} [locationWithNominatimData.neighborhood] Optional neighborhood to search for the neighborhood relation
 * @returns {Task<Result<[Object]>} A task containing a Result.Ok or a Result.Error. If the query finds a relation
 * The Result.Ok returns that an and array with a single object with bbox (the bounding box), osmId (the OSM relation id), osmType (always 'relation')
 * and placeId (unused). If it doesn't a Result.Ok([]) is returned for further processing. If there's a problem
 * connecting to the server a Result.Error returns
 */
export const nominatimLocationResultTask = ({listSuccessfulResult, allowFallbackToCity}, location) => {
  return composeWithChain([
    // Convert the list of good results to a Result.Ok and discard the Errors
    results => of(R.ifElse(
      () => listSuccessfulResult,
      results => Result.Ok(results.Ok),
      // By default, the first Ok result or last Error
      R.ifElse(
        r => R.length(R.prop('Ok', r)),
        r => Result.Ok(R.head(R.prop('Ok', r))),
        r => Result.Error(R.prop('Error', r))
      )
    )(results)),

    results => of(traverseReduceDeepResults(1,
      // The accumulator
      (res, okObj) => R.concat(
        res,
        [okObj]
      ),
      // The accumulator of errors
      (res, errorObj) => R.concat(
        res,
        [errorObj]
      ),
      // Our initial value is a Task with an object can contain Result.Ok and Result.Error results
      {Ok: [], Error: []},
      results
    )),
    location => {
      const keySets = compactEmpty(R.concat(
        // Query with neighborhood (if given)
        // We'll only actually use the first one that resolves
        R.ifElse(
          R.prop('neighborhood'),
          R.always([['country', 'state', 'city', 'neighborhood']]),
          R.always([])
        )(location),
        // This will either have country, state, city or country, city or nothing if it's a locationWithNominatimData
        // with just a lot/long
        // If we have don't have a neighbhorhood or have one and allow fallback to city, this
        // gives us a query for the country, state, and, city
        R.ifElse(
          location => R.either(R.complement(R.prop)('neighborhood'), () => R.defaultTo(true, allowFallbackToCity))(location),
          location => [
            R.filter(prop => R.propOr(false, prop, location), ['country', 'state', 'city'])
          ],
          // Otherwise no query
          () => []
        )(location)
      ));
      return waitAll(R.map(
        keys => {
          const locationProps = R.pick(keys, location);
          log.debug(
            `Nomanatim query for the following values ${
              JSON.stringify(locationProps)
            }`
          );
          return nominatimResultTask(locationProps).map(responseResult => responseResult.map(nominatimResponse => {
              // bounding box comes as two lats, then two lon, so fix
              return R.merge(
                // Create a geojson center point feature for the locationWithNominatimData if it has
                // features with properties but no geometry
                // TODO this is a special case of filling in empty features that might be replaced in the future
                R.compose(
                  ({nominatimResponse, location}) => {
                    // Unless the we got features below, merge nominatimResponse.geojson into location.
                    // Nominatim only returns geojson when it finds a relation for a jurisdiction
                    return R.unless(
                      location => {
                        return R.compose(R.length, compact, strPathOr([], 'geojson.features'))(location);
                      },
                      location => {
                        return R.merge(
                          location, {
                            geojson: R.compose(
                              geojson => R.unless(R.compose(R.length, strPathOr('features')), () => null)(geojson),
                              geojson => R.over(
                                R.lensProp('features'),
                                features => featuresOfOsmType('relation', features || []),
                                geojson
                              )
                            )(R.propOr({}, 'geojson', nominatimResponse))
                          }
                        );
                      }
                    )(location);
                  },
                  toNamedResponseAndInputs('location',
                    ({nominatimResponse}) => R.over(
                      R.lensPath(['geojson', 'features']),
                      features => R.when(
                        R.identity,
                        features => R.map(
                          feature => {
                            return R.when(
                              // If there is no feature.geometry
                              f => R.complement(R.propOr)(false, 'geometry', f),
                              f => R.merge(f, {
                                // Set the geometry to the lat, lon
                                geometry: locationToTurfPoint(R.props(['lat', 'lon'], nominatimResponse)).geometry
                              })
                            )(feature);
                          },
                          features
                        )
                      )(features),
                      location
                    )
                  )
                )({nominatimResponse}),
                {
                  // We're not using the bbox, but note it anyway
                  bbox: R.map(str => parseFloat(str), R.props([0, 2, 1, 3], nominatimResponse.boundingbox)),
                  osmId: R.propOr(null, 'osm_id', nominatimResponse),
                  placeId: R.propOr(null, 'placie_id', nominatimResponse)
                });
            }).mapError(value => {
              // If no results are found, just return null. Hopefully the other nominatin query will return something
              log.debug(`For Nominatim query ${addressString(locationProps)}, no results found from OSM: ${JSON.stringify(value)}`);
              return value;
            })
          ).mapRejected(
            // If the query fails to excute
            errorResult => errorResult.map(error => {
              log.warn(`Giving up. Nominatim query failed with error message: ${error}`);
              return error;
            })
          );
        },
        keySets
      ));
    }
  ])(location);
};

/***
 * Resolves a city or neighborhood OSM boundary relation
 * @param {Object} location. Contains locationWithNominatimData props
 * @param {String} location.country Required country
 * @param {String} location.state Optional. The state, province, canton, etc
 * @param {String} location.city Required city
 * @param {String} location.neighborhood Optional. It's quicker to resolve a relation for a neighborhood and
 * @return {Task<Result<Object>>} A Task that resolves the relation id in a Result.Ok or returns a Result.Error if no
 * qualifying results are found. Task rejects with a Result.Error() if the query fails. The returned value has the
 * following props:
 *  osm_id: The OSM id of the relation.
 *  osm_type: This should always be 'relation'
 *  bbox: The bounding box of the relation
 *  placeId: Internal nominatim id, ignore
 */
export const nominatimResultTask = location => {
  // Create a locationWithNominatimData string with the country, state (if exists), and city
  // Note I tried to pass city, state, country to the API but it doesn't work, New York City returns York
  // So leaving this as a query string which does work
  const query = R.compose(
    R.join(','),
    compactEmpty,
    R.props(['neighborhood', 'city', 'state', 'country'])
  )(location);

  // Task Result
  return composeWithChainMDeep(2, [
    response => {
      return responseWithOsmRelationToResponseWithGeojsonResultTask(response).map(x => x);
    },
    // Object -> Task Result [Object]
    responses => {
      // If we have a country, state, city, neighborhood, accept a relation or a city/town point
      const filter = value => R.both(
        value => R.compose(
          value => R.includes(value, ['administrative', 'village', 'suburb', 'town', 'city', 'island']),
          value => R.propOr(null, 'type', value)
        )(value),
        // The boundary or center point,
        // The boundary will be preferred over the center point.
        value => R.compose(
          value => R.includes(value, ['relation', 'node']),
          value => R.propOr(null, 'osm_type', value)
        )(value)
      )(value);
      const matches = R.filter(
        filter,
        responses
      );
      if (R.length(matches)) {
        log.debug(`Nominatim query response ${JSON.stringify(matches)}`);
        const typeRating = {relation: 2, point: 1};
        // Assume the first match is the best since responses are ordered by importance
        // Prefer relationships over points, and prefer the relatonship with the smallest bounding box
        return R.compose(
          of,
          Result.Ok,
          R.head,
          R.sortWith([
            // Prefer relationship over node
            R.descend(match => R.propOr(0, R.prop('osm_type', match), typeRating)),
            // Prefer small areas
            R.ascend(match => R.compose(
              area.default,
              nominatimBbox => bboxPolygon.default(
                R.map(
                  i => parseFloat(nominatimBbox[i]), [2, 0, 3, 1]
                )
              ),
              R.prop('boundingbox')
              )(match)
            )
          ])
        )(matches);
      } else {
        log.debug(`Nominatim no matches for query ${query}`);
        return of(Result.Error({error: "No qualifying respones", results: responses, query}));
      }
    },
    // Query nominatim, this us a Result.Ok with responses or a Result.Error if the query failes
    // Object -> Task (Result.Ok [Object]) | Result.Error
    query => {
      return nominatimResultTaskTries({tries: 2, name: 'nominatimQueryResultTask'}, ({nominatimUrl}) => {
        return nominatimQueryResultTask({nominatimUrl}, 'search', {q: query, addressDetails: 1});
      });
    }
  ])(query);
};

/**
 * Reverse geocode and flatten the address segment to match our locationWithNominatimData format.
 * This function is designed to resolve to the granularity of a single block, not a single point
 * TODO if we want this information fro point-based reverse geocoding, we should have another function
 * TODO The OSM format is better than our locationWithNominatimData format because it separates address, so we should copy
 * the OSM format and get rid of our flat address format
 * @param lat
 * @param lon
 * @returns {Task<Result<Object>>} location with the osm top level keys and address object flattened. We change
 * the name of road to street to match our format
 */
export const nominatimReverseGeocodeToLocationResultTask = ({lat, lon}) => {
  return mapMDeep(2,
    location => {
      // Merge the address object with the top-level object
      return R.merge(
        // Compose changes to the top-level object
        R.compose(
          // Remove point specific data that we don't care about
          obj => R.omit(['boundingbox', 'displayName', 'osmType', 'licence', 'fastFood'], obj),
          // Convert underscore keys to camel case
          obj => transformKeys(key => camelCase(key), obj),
          // Convert the lat lon to a geojson property
          obj => R.omit(['lat', 'lon'], obj),
          obj => R.set(R.lensProp('geojson'), locationToTurfPoint(R.props(['lat', 'lon'], obj)), obj),
          R.omit(['address'])
        )(location),
        // Compose changes to the address object
        R.compose(
          // If OSM doesn't have a city, build it. In the future we'll use all the jurisdiction level, but for
          // now we require a city
          obj => {
            return R.unless(
              obj => R.propOr(false, 'city', obj),
              obj => R.set(
                R.lensProp('city'),
                // Find the first of county, region, or state to serve as the city
                // Other values exist: https://github.com/osm-search/Nominatim/blob/6c1977b448e8b195bf96b6144674ffe0527e79de/lib/lib.php#L63
                R.head(compact(R.map(
                  str => R.propOr(null, str, obj),
                  ['county', 'region', 'state']
                ))),
                obj
              )
            )(obj)
          },
          // Remove point specific data that we don't care about
          obj => R.omit(['houseNumber', 'building', 'fastFood'], obj),
          // Convert underscore keys to camel case
          obj => transformKeys(key => camelCase(key), obj),
          // Remove failed state code lookups
          compactEmpty,
          // TODO We should use the long name for state and state_code for the code
          R.over(
            R.lensProp('state'),
            // Returns null if there isn't a code
            state => stateCodeLookup(state)
          ),
          duplicateKey(R.lensPath([]), 'state', 'state_long'),
          // TODO we should use road not street
          renameKey(R.lensPath([]), 'road', 'street'),
          // Remove address* keys
          obj => filterWithKeys((value, key) => R.complement(R.startsWith)('address', key), obj),
          R.prop('address')
        )(location)
      );
    },
    nominatimResultTaskTries({tries: 2, name: 'nominatimQueryResultTaskRevers'}, ({nominatimUrl}) => {
      return nominatimQueryResultTask(
        {nominatimUrl},
        'reverse',
        {lat, lon}
      );
    })
  );
};

export const nominatimReverseGeocodeResultTask = ({lat, lon}) => {
  return nominatimResultTaskTries({tries: 2, name: 'nominatimQueryResultTaskRevers'}, ({nominatimUrl}) => {
    return nominatimQueryResultTask(
      {nominatimUrl},
      'reverse',
      {lat, lon}
    );
  });
};

/**
 * Converts flat json to url params a=b&d=e ...
 * @param {Object} json single level json
 * @return {String} the url params
 */
export const jsonToUrlParams = json => {
  return R.join(
    '&',
    mapObjToValues(
      (value, key) => R.join('=', [key, value]),
      json
    )
  );
};

/**
 * Query nominatim for a place or lat/lon
 * @param {Object} config
 * @param {String} config.nominatimUrl The nominatim host url
 * @param {String} host default to 'nominatim.openstreetmap.org';
 * @param method
 * @param queryArgs
 * @returns {Task<Result<[Object]>>} A task that resolves to a Result.Ok containing response values or
 * Result.Error if the query fails
 */
export const nominatimQueryResultTask = ({nominatimUrl}, method, queryArgs) => {
  nominatimUrl = nominatimUrl || 'nominatim.openstreetmap.org';
  log.debug(`Nominatim query: http://${nominatimUrl}/${method}?${
    jsonToUrlParams(queryArgs)
  }&addressDetails=1&format=json&limit=1000`);
  const geocoder = new Nominatim({
      secure: true, // enables ssl
      nominatimUrl
    },
    {
      // No effective limit
      limit: 1000
    }
  );
  return taskToResultTask(promiseToTask(geocoder[method](queryArgs)));
};

/***
 * Uses mapbox to resolve to geocode.
 * Very limited, only works on cities and full addresses. Not interesecionts, streets
 */
export const mapboxGeocodeTask = R.curry((accessToken, address) => {
  mapbox.setAccessToken(accessToken);

  // Geocode an address to coordinates
  return task(({reject, resolve}) => {
    mapbox.geocode(
      'mapbox.places',
      address,
      (err, geoData) => {
        if (err) {
          reject(err);
        } else {
          resolve(geoData);
        }
      }
    );
  });
});

export const osmIdToGeojsonQuery = osmId => {
  return `(relation(${osmId}););out body;>;out skel qt;`;
};

/**
 * Adds the geojson to the given responses that return osmIds. We need the geojson of the relationship
 * to donated by osmId to query OSM. Querying for blocks by the osmId times our for big places, but
 * with the geojson we can break the query down into squares
 * @param responses
 * @return {*}
 */
export const responseWithOsmRelationToResponseWithGeojsonResultTask = response => {
  const osmId = R.propOr(null, 'osm_id', response);
  const osmType = R.propOr(null, 'osm_type', response);
  if (osmType !== 'relation' || !osmId) {
    return of(Result.Ok(response));
  }
  const geojsonQuery = osmIdToGeojsonQuery(osmId);
  return mapMDeep(2, geojson => {
      // set the geojson that is returned
      return R.set(R.lensProp('geojson'), geojson, response);
    },
    osmResultTask({
        name: `osmIdToGeojsonQueryResultTask: ${osmId}`,
        context: {osmId}
      },
      options => {
        return fetchOsmRawTask(options, geojsonQuery);
      }
    )
  );
};
