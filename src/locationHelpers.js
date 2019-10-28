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
import {compactEmpty, reqStrPathThrowing, strPathOr, toNamedResponseAndInputs} from 'rescape-ramda';
import {locationToTurfPoint} from 'rescape-helpers';
import * as R from 'ramda';
import {locationAndOsmResultsToLocationWithGeojson} from './overpassHelpers';
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {point} from '@turf/helpers';

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
  R.replace(/West/g, 'W'),
  // OpenStreetMap uses full names, Google likes abbreviations
  R.replace(/\sRoad/g, ' Rd'),
  R.replace(/\sStreet/g, ' St'),
  R.replace(/\sAvenue/g, ' Ave'),
  R.replace(/\sLane/g, ' Ln')
];

/***
 * True if the given address is a lat,lng
 * @param address
 * @returns {Boolean}
 */
export const isLatLng = address => {
  try {
    return R.compose(
      coordinates => R.none(Number.isNaN, coordinates),
      point => strPathOr([NaN], 'geometry.coordinates', point),
      floats => point(R.reverse(floats)),
      strs => R.map(str => parseFloat(str), strs),
      address => R.split(',', address)
    )(address);
  } catch {
    return false;
  }
};

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
export const fixWordsThatTripUpGoogle = streetName => {
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

  // If it's a lat/lon return it
  if (isLatLng(R.head(intersections)))
  {
    return R.head(intersections);
  }

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
      // Check if the intersection pair exists and has length
      intersectionPair => R.length(intersectionPair || []),
      // If so we can put it between &, like 'Maple St & Chestnut St'
      R.join(' & '),
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
export const oneLocationIntersectionsFromLocation = location => {
  return R.map(
    intersection => ({intersections: [intersection], ...R.omit(['intersections'], location)}),
    location.intersections
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

/**
 * Extracts the common street of all given intersection sets
 * @param {Object} location
 * @param streetIntersectionSets
 * @returns {f1}
 */
export const commonStreetOfLocation = (location, streetIntersectionSets) => {
  // Extract the common street from the set. There might be weird cases with a street intersecting
  // the same street twice meaning we have two common streets
  const common = R.reduce(
    (intersecting, b) => R.intersection(intersecting, b),
    // Start with all eligible
    R.compose(R.uniq, R.flatten)(streetIntersectionSets),
    streetIntersectionSets
  );

  return R.ifElse(
    common => R.compose(R.not, R.equals(1), R.length)(common),
    () => {
      // If there's a question about who's the main block, consult location
      const wayFeature = R.find(
        feature => R.contains('way', R.prop('id', feature)),
        reqStrPathThrowing('geojson.features', location)
      );
      // Use the name of the way or failing that the id
      // This will probably always match one the names in each intersection, unless the way is super weird
      return strPathOr(wayFeature.id, 'properties.tags.name', wayFeature);
    },
    common => R.head(common)
  )(common);
};

/**
 * Finds the common street of the intersections then sorts the intersections alphabetically based on the second street.
 * The streets at each intersection are listed alphabetically following the street that represents the block.
 * If a node represents a dead-end rather than an intersection then the one intersection is returned along
 * with a pseudo intersection that is the block name and the dead-end node id.
 * @param {Object} location location.geojson.features are used to help pick the main street
 * @param {Object} nodesToIntersectingStreets Keyed by node id and valued by an array of 2 or more street names
 * @returns {[[String]]} Two intersections (where one might be a pseudo dead-end intersection). Each has a list
 * of two or more street names. The block name is always first followed by the others alphabetically
 * @private
 */
export const intersectionsByNodeIdToSortedIntersections = (location, nodesToIntersectingStreets) => {
  let streetIntersectionSets = R.values(nodesToIntersectingStreets);

  const blockname = commonStreetOfLocation(location, streetIntersectionSets);

  // If we only have one node in streetIntersectionSets then we need to add the dead-end
  streetIntersectionSets = R.when(
    R.compose(R.equals(1), R.length),
    streetIntersectionSets => R.append(
      // Find the location geojson feature node that doesn't occur in nodesToIntersectingStreets.
      // This must be our dead-end node. Grab it's id and use that as it's street name
      [
        blockname,
        // dead-end node id
        R.find(
          featureId => R.both(
            R.contains('node'),
            // node id doesn't equal the real intersection's node
            R.complement(R.equals)(
              R.compose(R.head, R.keys)(nodesToIntersectingStreets)
            )
          )(featureId),
          R.map(R.prop('id'), location.geojson.features)
        )
      ],
      streetIntersectionSets
    )
  )(streetIntersectionSets);

  const ascends = R.compose(
    // Map that something to R.ascend for each index of the intersections
    times => R.addIndex(R.map)((_, i) => R.ascend(R.view(R.lensIndex(i))), times),
    // Create that many of something
    n => R.times(R.identity, n),
    // Get the shortest length
    R.reduce((r, n) => R.min(r, n), Infinity),
    // Get the length of each list of streets
    R.map(R.length)
  )(streetIntersectionSets);

  const blocknameThenAlphabetical = [
    // First sort by the common street
    R.ascend(
      R.ifElse(
        s => R.equals(blockname, s),
        R.always(0),
        R.always(1)
      )
    ),
    // Then alphabetically
    R.ascend(R.identity)
  ];
  return R.sortWith(
    // Sort the sets by which has the most alphabetical non-blockname street(s)
    ascends,
    R.map(
      // Sort each set placing the blockname first followed by alphabetical
      R.sortWith(blocknameThenAlphabetical),
      streetIntersectionSets
    )
  );
};


/**
 * Resolvable block locations are currently limited to those that have explicit intersections
 * or node overrides to allow us to find the single block in OpenStreetMap
 * @param {Object} location Location props
 * @returns {Boolean} True if resolvable, else false
 */
export const isResolvableSingleBlockLocation = location => R.either(
  location => R.compose(R.equals(2), R.length, R.propOr([], 'intersections'))(location),
  location => R.compose(R.equals(2), R.length, strPathOr([], 'osmOverrides.nodes'))(location)
)(location);

/**
 * Resolvable to all blocks in an OSM area, like a city or neighborhood requires that
 * at least a country and city be specified
 * TODO support geojson bounds in the future
 * @param {Object} location Location props
 * @returns {Boolean} True if resolvable, else false
 */
export const isResolvableAllBlocksLocation = location => {
  const requiredProps = ['country', 'city'];
  return R.all(prop => R.prop(prop, location), requiredProps);
};

/**
 * Given a location and componentLocations that are locations geospatially within location, create a single
 * location with the unique geojson of the componentLocations. The geojson of the given location can be optionally
 * preserved and combined with the components. For instance if location is a neighborhood represented by
 * OSM relation geojson, it can be optionally combined with the ways and nodes of all componentLocations or omitted
 * @param {Object} config
 * @param {Object} config.preserveLocationGeojson Keeps the geojson of the location and adds the componentLocations
 * unique geojson
 * @param {Object} location Location emcompassing the componentLocations
 * @param {[Object]} componentLocations any number of locations that are geospatailly within location
 */
export const aggregateLocation = ({preserveLocationGeojson}, location, componentLocations) => {
  return R.compose(
    featuresByType => locationAndOsmResultsToLocationWithGeojson(location, featuresByType),
    // Get rid of duplicate nodes. We don't want to remove duplicate way ids because
    // we chop ways into individual blocks, so they have the same id but different points
    featuresByType => R.over(R.lensProp('nodes'), nodes => R.uniqBy(R.prop('id'), nodes || []), featuresByType),
    features => featuresByOsmType(features),
    // Get features of each location and chain them together
    R.chain(
      blockLocation => strPathOr([], 'geojson.features', blockLocation)
    )
  )(componentLocations);
};

/**
 * Organizes features by their types into 'ways', 'nodes', and 'relationships'
 * @param features
 * @returns {Object}
 */
export const featuresByOsmType = v(features => {
  // Bucket the features by type, 'ways', or 'nodes'
  return R.reduceBy(
    R.flip(R.append),
    [],
    feature => R.compose(R.flip(R.concat)('s'), R.head, R.split('/'), R.prop('id'))(feature),
    features
  );
}, [['features', PropTypes.arrayOf(PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
})).isRequired]], 'featuresByOsmType');

/**
 * Indicates if loction has an array intersectionLocations with values, meaning it has lat/lon points which
 * tell us where the block location is
 * @param blockLocation
 */
export const locationHasLocationPoints = blockLocation => R.compose(
  R.lt(0),
  R.length,
  location => strPathOr([], 'locationPoints', location)
)(blockLocation);

/**
 * Gets locationPoints from the blockLocation from blockLocation.locationPoints or from googleIntersectionObjects
 * @param blockLocation
 */
export const locationWithLocationPoints = blockLocation => {
  return R.over(
    R.lensProp('locationPoints'),
    locationPoints => {
      return R.compose(
        // Failing that try to get them from google results
        ({blockLocation, locationPoints}) => R.unless(
          R.length,
          () => R.map(
            reqStrPathThrowing('geojson'),
            R.propOr([], 'googleIntersectionObjs', blockLocation)
          )
        )(locationPoints),

        // Then see if the intersections are lat/lons. If so convert it to geojson points
        toNamedResponseAndInputs('locationPoints',
          ({blockLocation}) => R.unless(
            R.length,
            () => R.ifElse(
              intersections => R.all(isLatLng)(intersections),
              strs => R.map(
                R.compose(
                  floats => locationToTurfPoint(floats),
                  R.map(s => parseFloat(s)),
                  R.split(','))
              )(strs),
              () => null
            )(strPathOr(null, 'intersections', blockLocation))
          )(locationPoints)
        ),

        // First see if it's already set
        toNamedResponseAndInputs('locationPoints',
          ({locationPoints}) => locationPoints || []
        )
      )({blockLocation, locationPoints});
    },
    blockLocation);
};