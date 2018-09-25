/**
 * Created by Andy Likuski on 2018.09.19
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {strPathOr, compact, reqStrPath} from 'rescape-ramda';
import {compactEmpty} from 'rescape-ramda'
import {geojsonCenterOfBlockAddress, geocodeAddress, geocodeBlockAddresses} from './googleLocation'
import {turfPointToLocation, googleLocationToLocation, googleLocationToTurfLineString} from 'rescape-helpers';
import * as Result from 'folktale/result';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';

/**
 * Creates an address string for geolocation resolution
 * @param {String} country The country
 * @param {String} state Optional state or province
 * @param {String} city The city
 * @param {String} neighborhood Optional the neighborhood
 * @param {String} blockname Optional specify if there is a blockname but not intersections yet known
 * @param {[String]} intersectionPair Optional array of two street names representing an intersection
 * If intersectinoPair is specified neighborhood is omitted form the search, since the former is more precise
 * @param {[String]} intersections Optional array of one pair of street names. This is the same
 * as intersections but in the form [pair] to match our Location object when it only has one of its
 * two intersections resolved
 * If intersectionPair is specified neighborhood is omitted form the search, since the former is more precise
 * @returns {String} The address string with neighborhood and state optional
 * Example: Main St and Chestnut St, Anytown, Anystate, USA which will resolve to an intersection
 * or Downtown District, Anytown, Anystate, USA, which will resolve to a district/neighborhood center point
 */
export const addressString = ({country, state, city, neighborhood, blockname, intersections, intersectionPair}) => {
  // Take either value. Only one should ever be specified
  const resolvedIntersectionPair = intersectionPair || R.head(intersections || []);
  return R.compose(
    R.join(', '),
    // Remove nulls and empty strings
    compactEmpty
  )([
    R.ifElse(
      // Check if the intersection pair exists
      R.complement(R.isNil),
      // If so we can put it between and, like 'Maple St and Chestnut St'
      R.join(' and '),
      // Otherwise put the blockname and/or neighborhood. If this is null it's filtered out
      R.always(blockname ? `${blockname}, ${neighborhood}` : neighborhood)
    )(resolvedIntersectionPair),
    city,
    state,
    country]
  );
};


/**
 * Resolves the geolocation of a Location
 * @param {Object} location
 * @param {Object} location.country
 * @param {String} location.state Optional
 * @param {String} location.city
 * @param {[[String]]} location.intersections Zero, one or two arrays of two-item intersections:
 * e.g. [['Main St', 'Chestnut St'], ['Main St', 'Elm St']] or 0 or 1 of theses
 * @return {Task<Result>} The resolved center latitude and longitude of the location in a Result
 * If nothing or too many results occur an Error is returned instead of a Result
 */
export const resolveGeoLocationTask = location => {
  const latLng = R.props(['latitude', 'longitude'], location);
  // If we have a lat/lon predefined on the location, just return it as a Task<Result> to match the other return values
  if (R.all(R.is(Number), latLng)) {
    return of(Result.Ok(latLng));
  }
  // If we have both intersection pairs, resolve the center point between them.
  // Call the API, returning an Task<Result.Ok> if the resolution succeeds or Task<Result.Error> if it fails
  else if (R.equals(2, R.length(location.intersections))) {
    return geojsonCenterOfBlockAddress(addressPair(location)).map(
      centerResult => centerResult.map(center => turfPointToLocation(center))
    );
  }
  // Otherwise create the most precise address string tha is possible
  else
    return geocodeAddress(addressString(location)).map(responseResult => {
      // Chain the either to a new Result that resolves geometry.location
      return responseResult.chain(response =>
        // This returns a Maybe
        reqStrPath('geometry.location', response)
      ).map(
        // Map the Maybe value
        googleLocationToLocation
      )
    });
};


/**
 * Resolves the geojson for complete locations.
 * This primitively makes a geojson line between the two intersections.
 * Obviously we must do better by using OpenStreetMap
 * @param location
 * @return {Task<Result>} Result.Ok containing the geojson, or a Result.Error
 */
export const resolveGeojsonTask = location => {
  // Already done
  if (R.prop('geojson', location)) {
    return of(Result.Ok(location.geojson));
  }
  // Call the API, returning an Task<Result.Ok> if the resolution succeeds or Task<Result.Error> if it fails
  return geocodeBlockAddresses(addressPair(location)).map(
    responsesResult => {
      // Map each response in result to a simple lat, lon
      // We chain the Result with two responses by traversing the two
      // responses to map them to simple [lat, lon]
      // In the end we get a single Result containing a Turf LineString or an Error
      return responsesResult.chain(responses => R.composeK(
        // Map the two locations to a Turf LineString
        locations => Result.of(googleLocationToTurfLineString(locations)),
        // Produces a Result of two locations
        R.traverse(Result.of, reqStrPath('geometry.location'))
        )(responses)
      )
    }
  );
};


/**
 * Given a location returns a pair of address strings representing both ends of the block
 * @param {Object} location The location object
 * @returns {[String]} Two address strings for the location
 */
export const addressPair = location => {
  const locationProps = R.pick(['country', 'state', 'city', 'neighborhood'], location);
  // Create two address strings from the intersection pair
  return R.map(
    intersectionPair => addressString(R.merge(locationProps, {intersectionPair})),
    location.intersections
  );
};