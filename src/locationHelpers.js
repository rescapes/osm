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
import {compactEmpty} from 'rescape-ramda';
import * as R from 'ramda';

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