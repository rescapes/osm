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
import {task} from 'folktale/concurrency/task';
import * as R from 'ramda';
import {compactEmpty, promiseToTask} from 'rescape-ramda';
import Nominatim from 'nominatim-geocoder';
import mapbox from 'mapbox-geocoding';
import * as Result from 'folktale/result';
import {loggers} from 'rescape-log'
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


/***
 * Resolves a city's OSM boundary relation
 * @param {Object} location. Contains location props
 * @param {String} location.country Required country
 * @param {String} location.state Optional. The state, province, canton, etc
 * @param {String} location.city Required city
 * @param {String} location.neighborhood Optional. It's quicker to resolve a relation for a neighborhood and
 * then query within a neighborhood. However if there is no neighborhood or nothing is found it can be omitted
 * @return {Task<Result>} A Task that resolves the relation id in a Result.Ok or returns a Result.Error if no
 * qualifying results are found. Task rejects with a Result.Error() if the query fails
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
        return(Result.Ok(R.head(matches)));
      }
      else {
        return(Result.Error({error: "No qualifying results", results, query}));
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
        }
        else {
          resolve(geoData);
        }
      }
    );
  });
});