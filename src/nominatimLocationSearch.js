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
import {task, waitAll, of} from 'folktale/concurrency/task';
import * as R from 'ramda';
import {compactEmpty, promiseToTask, compact, resultToTaskNeedingResult, traverseReduce} from 'rescape-ramda';
import Nominatim from 'nominatim-geocoder';
import mapbox from 'mapbox-geocoding';
import * as Result from 'folktale/result';
import {loggers} from 'rescape-log';

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

/**
 * Uses the nomitatim service to find a relation representing the given location.
 * Currently this supports neighborhoods and cities. If a neighborhood is specified in the location and that
 * query fails, the city without the neighborhood is queried. So this query is as precise as possible but
 * will not give up until it fails at the city-wide level. TODO in the future we can support other jurisdictions
 * like counties
 * @param {Object} location Must contain country, city, and optionally state and neighborhood
 * @param {Object} location.country Required the country to search in
 * @param {Object} [location.state] Optional state of state, provinces, etc.
 * @param {Object} [location.neighborhood] Optional neighborhood to search for the neighborhood relation
 * @returns {Task<Result<Object>} A task containing a Result.Ok or a Result.Error. If the query finds a relation
 * The Result.Ok returns that an object with bbox (the bounding box), osmId (the OSM relation id), osmType (always 'relation')
 * and placeId (unused). If it doesn't a Result.Ok([]) is returned for further processing. If there's a problem
 * connecting to the server a Result.Error returns
 */
export const nominatimLocationResultTask = location => R.composeK(
  results => of(traverseReduce(
    // Accept the non-null results
    (previousResultValues, resultValue) => R.concat(previousResultValues, compact([resultValue])),
    Result.Ok([]),
    results
  )),
  location => waitAll(R.map(
    keys => {
      const locationProps = R.pick(keys, location);
      log.debug(`Nomanitim query for the following values ${JSON.stringify(locationProps)}`);
      return nominatimResultTask(locationProps)
        .map(responseResult => responseResult.map(value => {
            // bounding box comes as two lats, then two lon, so fix
            return R.merge(location, {
              // We're not using the bbox, but note it anyway
              bbox: R.map(str => parseFloat(str), R.props([0, 2, 1, 3], value.boundingbox)),
              osmId: value.osm_id,
              placeId: value.place_id
            });
          }).mapError(value => {
            // If no results are found, just return null. Hopefully the other nominatin query will return something
            log.debug(`For location query ${JSON.stringify(locationProps)}, no results found from OSM: ${JSON.stringify(value)}`);
            return null;
          })
        ).mapRejected(
          // If the query fails to excute
          errorResult => errorResult.map(error => {
            log.warn(`Giving up. Nominatim query failed with error message: ${error}`);
            return error;
          })
        );
    },
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
  ))
)(location);

/***
 * Resolves a city or neighborhood OSM boundary relation
 * @param {Object} location. Contains location props
 * @param {String} location.country Required country
 * @param {String} location.state Optional. The state, province, canton, etc
 * @param {String} location.city Required city
 * @param {String} location.neighborhood Optional. It's quicker to resolve a relation for a neighborhood and
 * then query within a neighborhood. However if there is no neighborhood or nothing is found it can be omitted
 * @return {Task<Result<Object>>} A Task that resolves the relation id in a Result.Ok or returns a Result.Error if no
 * qualifying results are found. Task rejects with a Result.Error() if the query fails. The returned value
 * has the following props:
 *  osm_id: The OSM id of the relation.
 *  osm_type: This should always be 'relation'
 *  bbox: The bounding box of the relation
 *  placeId: Internal nominatim id, ignore
 */
export const nominatimResultTask = location => {
  // Create a location string with the country, state (if exists), and city
  // Note I tried to pass city, state, country to the API but it doesn't work, New York City returns York
  // So leaving this as a query string which does work
  const query = R.compose(
    R.join(','),
    compactEmpty,
    R.props(['neighborhood', 'city', 'state', 'country'])
  )(location);
  const host = 'nominatim.openstreetmap.org';
  const geocoder = new Nominatim({
    secure: true, // enables ssl
    host
  });
  log.debug(`Nominatim query: http://${host}?q=${query}&addressDetails=1&format=json&limit=3`);
  return promiseToTask(geocoder.search({q: query, addressDetails: 1}).then(
    results => {
      const matches = R.filter(
        // We must find a relation, not a node
        R.propEq('osm_type', 'relation'),
        results
      );
      if (R.length(matches)) {
        // Assume the first match is the best since results are ordered by importance
        return (Result.Ok(R.head(matches)));
      } else {
        return (Result.Error({error: "No qualifying results", results, query}));
      }
    }
    ).catch(error => Result.Error({error}))
  );
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