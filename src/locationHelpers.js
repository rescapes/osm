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
import {compactEmpty, mapMDeep, reqStrPathThrowing} from 'rescape-ramda';
import * as R from 'ramda';

// The following countries should have their states, provinces, cantons, etc left out of Google geolocation searches
// Switzerland for example doesn't resolve correctly if the canton abbreviation is included
const EXCLUDE_STATES_FROM_COUNTRIES = ['Switzerland'];

// List of partial functions that replace words in streetname
// Normally our data already has the correct abbreviation for Google, but exceptions happen for street like
// N North St which google can't handle. However Google can handle N N St
const GOOGLE_STREET_REPLACEMENTS = [
  R.replace(/North/g, 'N'),
  R.replace(/South/g, 'S'),
  R.replace(/East/g, 'E'),
  R.replace(/West/g, 'W')
];

const latLngRegExp = /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;
/***
 * True if the given address is a lat,lng
 * @param address
 * @returns {f1}
 */
export const isLatLng = address => {
  return R.lt(0, R.length(R.match(latLngRegExp, address)));
};

/**
 * True if either location intersection is a lat,lng, not a pair of streets
 * @param {Object} location
 * @returns {Boolean}
 */
export const hasLatLngIntersections = location => R.any(
  R.is(String),
  R.prop('intersections', location)
);

/***
 * Some countries don't resolve locations well in Google with their states, provinces, cantons, etc
 * @param {Object} location The location from which to remove the state if its country is in the
 * EXCLUDE_STATES_FROM_COUNTRIES list
 * @return {Object} The location with the state possibly removed
 */
export const removeStateFromSomeCountriesForSearch = location => {
  return R.when(
    location => R.contains(
      R.prop('country', location),
      EXCLUDE_STATES_FROM_COUNTRIES
    ),
    R.omit(['state'])
  )(location);
};

/**
 * Replaces words in streetnames that Google can't handle, like 'North'
 * @param streetName
 * @return {*}
 */
const fixWordsThatTripUpGoogle = streetName => {
  return R.reduce((name, r) => r(name), streetName, GOOGLE_STREET_REPLACEMENTS);
};

/**
 * Given a location with one intersection. Returns them in both directions because sometimes Google
 * give different results for each order.
 * Example: [[Main St, Chestnut St], [Chestnut St, Main St]]
 * @param locationWithOneIntersectionPair
 * @returns {[String]} Two arrays of two streets or if the intersection are a lat/lon just a one item
 * array with the lat/lon
 */
export const addressStringInBothDirectionsOfLocation = locationWithOneIntersectionPair => R.ifElse(
  location => R.both(R.is(String), isLatLng)(reqStrPathThrowing('intersections.0', location)),
  // If the intersection is a lat/lon, just use that for the address
  location => [reqStrPathThrowing('intersections.0', location)],
  // Else create two addresses with the intersection names ordered in both ways
  // Google can sometimes only handle one ordering
  location => [
    addressString(location),
    addressString(R.over(R.lensPath(['intersections', '0']), R.reverse, location))
  ]
)(locationWithOneIntersectionPair);

/**
 * Creates an address string for geolocation resolution
 * @param {String} country The country
 * @param {String} state Optional state or province
 * @param {String} city The city
 * @param {String} neighborhood Optional the neighborhood
 * @param {String} blockname Optional specify if there is a blockname but not intersections yet known
 * @param {[[String]]} intersections Optional array of one pair of street names.
 * This matches the Location object when it only has one of its locations
 * If intersections is specified neighborhood is omitted from the search, since the former is more precise
 * @returns {String} The address string with neighborhood and state optional
 * Example: Main St and Chestnut St, Anytown, Anystate, USA which will resolve to an intersection
 * or Downtown District, Anytown, Anystate, USA, which will resolve to a district/neighborhood center point
 */
export const addressString = ({country, state, city, neighborhood, blockname, intersections}) => {
  // Extract the one intersection pair with corrections for Google if it exists
  const resolvedIntersectionPair = R.unless(
    R.either(
      R.isNil,
      R.compose(R.equals(0), R.length)
    ),
    R.compose(R.map(fixWordsThatTripUpGoogle), R.head)
  )(intersections);

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
 * Given a location with 2 pairs of intersections, returns the address string for each intersection
 * @param {Object} location The location
 * @param {[[String]]} location.intersections Two pairs of intersection names
 */
export const addressStrings = location => {
  return R.map(addressString, oneLocationIntersectionsFromLocation(location));
};

/**
 * Given a location with 2 paris of intersections, returns two locations that each have a one element intersections array.
 * Each of the two locations has one of the intersections
 * @param location
 * @return {*}
 */
export const oneLocationIntersectionsFromLocation = location => R.map(
  intersection => ({intersections: [intersection], ...R.omit(['intersections'], location)}),
  location.intersections
);

/**
 * Just returns the street "address" e.g. Perkins Ave, Oakland, CA, USA
 * @param {String} country Required, the country
 * @param {String} state Optional depending on the country
 * @param {String} city Required
 * @param {String} blockname Required, the street to create the address for
 * @return {String} blockname, city, [state], country
 */
export const streetAddressString = ({country, state, city, blockname}) => {
  return R.compose(
    R.join(', '),
    // Remove nulls and empty strings
    compactEmpty
  )([
    blockname,
    city,
    state,
    country]
  );
};

/**
 * Given a location returns a pair of address strings representing both ends of the block. If
 * @param {Object} location The location object
 * @param {[[String]|String]} location.intersections. Two pairs of streets used for the two intersections.
 * Each of these pairs can alternatively be a lat,lon string for more precise resolution
 * @returns {[String]} Two address strings for the location
 */
export const addressPair = location => {
  const locationProps = R.pick(['country', 'state', 'city', 'neighborhood'], location);
  // Create two address strings from the intersection pair
  return R.map(
    // Create the address from intersectionPair. Or, less commonly, if intersectionPair is a lat,lng string,
    // Just skip address creation and use the lat,lng.
    R.unless(
      R.is(String),
      intersectionPair => addressString(removeStateFromSomeCountriesForSearch(R.merge(locationProps, {intersections: [intersectionPair]})))
    ),
    location.intersections
  );
};
