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
import booleanWithin from '@turf/boolean-within';
import {
  compactEmpty,
  reqStrPathThrowing,
  strPathOr,
  toNamedResponseAndInputs,
  mapKeys,
  toArrayIfNot, compact, strPath
} from 'rescape-ramda';
import {locationToTurfPoint} from 'rescape-helpers';
import * as R from 'ramda';
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {point} from '@turf/helpers';
import circle from '@turf/circle';
import buffer from '@turf/buffer';
import union from '@turf/union';

// The following countries should have their states, provinces, cantons, etc left out of Google geolocation searches
// Switzerland for example doesn't resolve correctly if the canton abbreviation is included
const EXCLUDE_STATES_FROM_COUNTRIES = ['Switzerland'];

// List of partial functions that replace words in streetname
// Normally our data already has the correct abbreviation for Google, but exceptions happen for street like
// N North St which google can't handle. However Google can handle N N St
const GOOGLE_STREET_REPLACEMENTS = [
  R.replace(/Northwest/g, 'NW'),
  R.replace(/Southwest/g, 'SW'),
  R.replace(/Northeast/g, 'NE'),
  R.replace(/Southeast/g, 'SE'),

  R.replace(/North/g, 'N'),
  R.replace(/South/g, 'S'),
  R.replace(/East/g, 'E'),
  R.replace(/West/g, 'W'),
  // OpenStreetMap uses full namessc, Google likes abbreviations
  R.replace(/\sRoad/g, ' Rd'),
  R.replace(/\sStreet/g, ' St'),
  R.replace(/\sAvenue/g, ' Ave'),
  R.replace(/\sLane/g, ' Ln')
];

/***
 * True if the given address is a lat,lng. If address is an array because it is 2 street names this returns false
 * @param address
 * @returns {Boolean}
 */
export const isLatLng = address => {
  if (!R.is(String, address)) {
    return false;
  }
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
    location => R.includes(
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
 * Converts the street names of an intersection to Google compatible names using GOOGLE_STREET_REPLACEMENTS
 * @param {[String]} intersection Streets of an intersection
 * @returns {[String]} the same streets with problematic words changed
 */
export const normalizedIntersectionNames = intersection => {
  return R.over(
    R.lensPath(['data', 'streets']),
    intersection => {
      return R.unless(
        intersection => R.either(
          R.isNil,
          R.compose(R.equals(0), R.length)
        )(intersection),
        intersection => R.map(fixWordsThatTripUpGoogle, intersection)
      )(intersection);
    },
    intersection
  );
};

/**
 * Given a location  with one intersection. Returns the location with the intersection in both directions because sometimes Google
 * give different results for each order.
 * Example: [[Main St, Chestnut St], [Chestnut St, Main St]]
 * @param location
 * @returns {[Object]} Two locations, one with the first intersection streets reversed
 */
export const locationWithIntersectionInBothOrders = location => {
  return [
    location,
    R.over(
      R.lensPath(['intersections', 0, 'data', 'streets']),
      streets => R.reverse(streets),
      location
    )
  ];
};

/**
 * Extracts a 'lat, lon' string from an intersection already in the form 'lat, lon' or 'Main St & lat, lon'
 * @param {Object} intersection
 * @param {[String]} intersection.streets All streets of the intersections
 * @returns {String}
 */
export const locationIntersectionAsLatLng = intersection => {
  // TODO why is this expecting address strings instead of arrays?
  return R.cond([
    [address => isLatLng(address), R.identity],
    [
      // If the street
      address => R.both(
        address => R.is(String, address),
        address => R.any(
          eitherStreet => isLatLng(eitherStreet),
          R.map(
            str => str.trim(),
            R.split('&', address)
          )
        )
      )(address),
      address => R.find(
        eitherStreet => isLatLng(eitherStreet),
        R.map(
          str => str.trim(),
          R.split('&', address)
        )
      )
    ],
    [R.T, () => null]
  ])(strPathOr([], 'data.streets', intersection));
};

/**
 * Creates an address string for geolocation resolution
 * @param {String} country The country
 * @param {String} state Optional state or province
 * @param {String} city The city
 * @param {String} neighborhood Optional the neighborhood
 * @param {String} street Optional specify if there is a street but not intersections yet known
 * @param {[Object]} intersections Optional array of one intersection in the form {streets: [streets]}
 * where streets contain all streets of the intersection including the block name (i.e. the value of the street param)
 * This matches the Location object when it only has one of its locations
 * If intersections is specified neighborhood is omitted from the search, since the former is more precise
 * @returns {String} The address string with neighborhood and state optional
 * Example: Main St and Chestnut St, Anytown, Anystate, USA which will resolve to an intersection
 * or Downtown District, Anytown, Anystate, USA, which will resolve to a district/neighborhood center point
 */
export const addressString = ({country, state, city, neighborhood, street, intersections}) => {

  const intersection = R.when(
    R.length,
    intersections => normalizedIntersectionNames(R.head(intersections))
  )(intersections);

  return R.compose(
    R.join(', '),
    // Remove nulls and empty strings
    compactEmpty
  )([
    addressForIntersection({street, neighborhood}, intersection),
    city,
    state,
    country]
  );
};

/**
 * Creates an address string for a street block
 * @param {String} country The country
 * @param {String} state Optional state or province
 * @param {String} city The city
 * @param {String} neighborhood The neighborhood
 * @param {String} street Optional specify if there is a street but not intersections yet known
 * @param {Object} intersections Array of two pairs of street names in the form of a two item array containing
 * two {streets=[intersection street names]}. The street of the block must be the first street in streets.
 * If intersections are specified neighborhood is omitted from the search, since the former is more precise
 * @returns {String} The address string with neighborhood and state optional
 * Example: Main St & Chestnut St to Main St & Elm St, Anytown, Anystate, USA which will resolve to an intersection
 */
export const addressStringForBlock = ({country, state, city, neighborhood, street, intersections}) => {
  return R.compose(
    R.join(', '),
    // Remove nulls and empty strings
    compactEmpty,
    address => [address, city, state, country],
    // If we have intersections with different first street names, list the street
    address => R.when(
      () => R.complement(R.equals)(...R.map(
        intersection => strPathOr('none', 'data.streets.0', intersection),
        intersections || [])
      ),
      // List the street after
      address => `${address || 'Intersections N/A'} (Street Name: ${street})`
    )(address),
    intersections => R.join(' <-> ', intersections),
    // Use the intersections or the street and neighborhood if they aren't available
    intersections => R.map(
      intersection => {
        return addressForIntersection({street, neighborhood}, intersection);
      },
      intersections || []
    )
  )(intersections);
};

/**
 * Create a string representing the intersection, or failing that list the street and maybe neighborhood
 * @param street
 * @param neighborhood
 * @param intersection
 * @return {*}
 */
const addressForIntersection = ({street, neighborhood}, intersection) => {
  return R.compose(
    R.ifElse(
      // Check if the intersection pair exists and has length
      intersection => R.length(
        strPathOr([], 'data.streets', intersection) || []
      ),
      // If so we can put it between &, like 'Maple St & Chestnut St'
      intersection => R.join(' & ', strPath('data.streets', intersection)),
      // Otherwise put the street and/or neighborhood. If this is null it's filtered out
      R.always(street ? `${street}, ${neighborhood}` : neighborhood)
    ),
    // Normalize street names
    intersection => {
      return normalizedIntersectionNames(intersection);
    }
  )(intersection);
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
    intersection => ({
      intersections: [intersection],
      ...R.omit(['intersections'], location)
    }),
    location.intersections
  );
};

/**
 * Returns the jurisdiction with optional street e.g. Perkins Ave, Oakland, CA, USA
 * @param {String} country Required, the country
 * @param {String} state Optional depending on the country
 * @param {String} city Required
 * @param {String} street Required, the street to create the address for
 * @return {String} street, city, [state], country
 */
export const jurisdictionString = ({country, state, city, street}) => {
  return R.compose(
    R.join(', '),
    // Remove nulls and empty strings
    compactEmpty
  )([
    street,
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
        feature => isOsmType('way', feature),
        strPathOr([], 'geojson.features', location)
      );
      // Use the name of the way or failing that the id
      // This will probably always match one the names in each intersection, unless the way is super weird
      // If there is no wayFeature default to the first common or 'Unknown'
      return R.ifElse(
        R.identity,
        wayFeature => wayFeatureName(wayFeature),
        () => R.head(common) || 'Unknown'
      )(wayFeature);
    },
    common => R.head(common)
  )(common);
};

/**
 * Returns the wayFeature street name or failing that the way id. Used to identify a street by its common name when possible
 * Used to assist queries and identify fake intersections where wayFeatures change ids
 * @param {Object} wayFeature Looks for wayFeature.properties.tag.name to get the street name
 * @param {String} The name or wayFeature.id
 */
export const wayFeatureName = wayFeature => {
  return wayFeatureNameOrDefault(R.prop('id', wayFeature), wayFeature);
};


/**
 * Like wayFeatureName but defaults to defaultTo instead of wayFeature.id
 * @param {String} defaultTo A string to default to
 * @param {Object} wayFeature Looks for wayFeature.properties.tag.name to get the street name
 * @param {String} The name or the default
 */
export const wayFeatureNameOrDefault = (defaultTo, wayFeature) => {
  return strPathOr(defaultTo, 'properties.tags.name', wayFeature);
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
  const originalStreetIntersectionSets = R.values(nodesToIntersectingStreets);
  // If we only have one originalStreetIntersectionSets, we probably have a loop, so double it
  // TODO do more verification that this is a loop
  // TODO we should never get nodesToIntersectingStreets missing an intersections. Do this earlier
  const modifiedStreetIntersectionSets = R.when(
    R.compose(R.equals(1), R.length),
    originalStreetIntersectionSets => R.concat(originalStreetIntersectionSets, originalStreetIntersectionSets)
  )(originalStreetIntersectionSets);

  const street = commonStreetOfLocation(location, modifiedStreetIntersectionSets);

  // If we only have one node in streetIntersectionSets then we need to add the dead-end
  const streetIntersectionSets = R.when(
    R.compose(R.equals(1), R.length),
    streetIntersectionSets => R.append(
      // Find the location geojson feature node that doesn't occur in nodesToIntersectingStreets.
      // This must be our dead-end node. Grab it's id and use that as it's street name
      [
        street,
        // dead-end node id
        R.find(
          featureId => R.both(
            R.includes('node'),
            // node id doesn't equal the real intersection's node
            R.complement(R.equals)(
              R.compose(R.head, R.keys)(nodesToIntersectingStreets)
            )
          )(featureId),
          R.map(R.prop('id'), reqStrPathThrowing('geojson.features', location))
        )
      ],
      streetIntersectionSets
    )
  )(modifiedStreetIntersectionSets);

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

  const streetThenAlphabetical = [
    // First sort by the common street
    R.ascend(
      R.ifElse(
        s => R.equals(street, s),
        R.always(0),
        R.always(1)
      )
    ),
    // Then alphabetically
    R.ascend(R.identity)
  ];
  return R.sortWith(
    // Sort the sets by which has the most alphabetical non-street street(s)
    ascends,
    R.map(
      // Sort each set placing the street first followed by alphabetical
      R.sortWith(streetThenAlphabetical),
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
 * at that 1) country and city be specified, 2) A geosjson 'Polygon' or 'MultiPolygon' 3) any geojson with a geojson.property.radius
 * @param {Object} location Location props
 * @returns {Boolean} True if resolvable, else false
 */
export const isResolvableAllBlocksLocation = location => {
  if (isResolvableSingleBlockLocation(location)) {
    return false;
  }
  return R.cond([
    [location => isNominatimEligible(location), () => true],
    // At least one geojson feature and al either have a shape or has a radius property
    [location => R.and(
      R.compose(R.length, strPathOr([], 'geojson.features'))(location),
      geojsonFeaturesHaveShapeOrRadii(strPathOr(null, 'geojson', location))
    ), () => true],
    [R.T, () => false]
  ])(location);
};

/**
 * Returns true if the location is eligible for a nominatim
 * @param location
 * @returns {f1}
 */
export const isNominatimEligible = location => {
  return R.all(prop => R.prop(prop, location), ['country', 'city']);
};

/**
 * Returns true if the given location's features have a shape or has a feature.properties.radius
 * @param {Object} geojson FeatureCollection or similar
 * @returns {Boolean} True if all features have either a shape or a properties.radius amount, otherwise false
 */
export const geojsonFeaturesHaveShapeOrRadii = geojson => R.either(
  geojsonFeaturesHaveShape,
  geojsonFeaturesHaveRadii
)(geojson);

/**
 * Returns true if the given geojson's features have a shape. There must be at least one feature or false is returned
 * @param {Object} geojson FeatureCollection or similar
 * @returns {Boolean} True if all features have either a shape and there is at least one feature, otherwise false
 */
export const geojsonFeaturesHaveShape = geojson => R.and(
  R.compose(R.length, strPathOr([], 'features'))(geojson),
  R.all(
    feature => R.includes(strPathOr(false, 'geometry.type', feature), ['Polygon', 'MultiPolygon']),
    strPathOr([], 'features', geojson)
  )
);

/**
 * Returns true if the given geojson's features all have a point.
 * There must be at least one feature or false is returned
 * @param {Object} geojson FeatureCollection or similar
 * @returns {Boolean} True if all features have a point and there is at least one feature, otherwise false
 */
export const geojsonFeaturesIsPoint = geojson => R.and(
  R.compose(R.length, strPathOr([], 'features'))(geojson),
  R.all(
    feature => R.includes(strPathOr(false, 'geometry.type', feature), ['Point']),
    strPathOr([], 'features', geojson)
  )
);

/**
 * Returns true if all the features of the geojson have a radius property, indicating that the feature
 * should be used as a filter along with a radius. This is normally used with a geojson point.
 * @param {Object} geojson Geojson featurecollection or similar
 * @returns {boolean} True if all features have a properties.radius amount, otherwise false
 */
export const geojsonFeaturesHaveRadii = geojson => {
  return R.both(
    features => {
      return R.length(features);
    },
    features => {
      return R.all(
        feature => {
          return featureRepresentsCircle(feature);
        },
        features
      );
    }
  )(strPathOr([], 'features', geojson));
};

/**
 * Returns geojson features with radii mapped to polygons features, since radii aren't part of the geojson spec.
 * Features that don't have radii are left alone
 * @param {Object} geojson
 * @param {[Object]} geojson.features The features to map
 * @return {Object} geojson with modified features, if any
 */
export const mapGeojsonFeaturesHaveRadiiToPolygon = geojson => {
  return R.over(
    R.lensProp('features'),
    features => R.and(
      features,
      R.map(
        feature => {
          return featureWithRadiusToCirclePolygon(feature);

        },
        features
      )
    )
  )(geojson);
};

/**
 * Returns true if the feature has a properties.radius property and the feature is a point
 * @param {Object} feature Feature to test
 * @return {Boolean} True if both conditions are met, else false
 */
export const featureRepresentsCircle = feature => {
  return R.both(
    feature => strPathOr(false, 'properties.radius', feature),
    // There must be a point defined
    feature => R.includes(strPathOr(false, 'geometry.type', feature), ['Point'])
  )(feature);
};

/**
 * Does the location have at least one geojson features
 * @param {Object} location
 * @param {Object} location.geojson
 * @param {Object} location.geojson.features
 * @return {Boolean} True if there is at least one feature
 */
export const locationHasGeojsonFeatures = location => {
  return R.both(
    features => R.length(features),
    features => R.all(
      feature => {
        return R.any(
          type => isOsmType(type, feature),
          ['way', 'node', 'rel']
        );
      },
      features
    )
  )(strPathOr([], 'geojson.features', location));
};

/**
 * Combines a location with the ways and nodes that came back from OSM queries, putting them in the location's
 * geojson property as a FeatureCollection
 * @param {Object} location A location object with intersections set matching the given ways and nodes
 * @param {Object} block OSM features. Must contain ways and nodes keys, relations are optional
 * @param {[Object]} block.ways List of one or more ways of the block
 * @param {[Object]} block.nodes List of two or more nodes of the block
 * @param {[Object]} [block.relations] Optional list of relation features of the block, currently never used
 * @returns {f2|f1}
 */
export const locationAndOsmBlocksToLocationWithGeojson = v((location, block) => {
  const {ways, nodes, relations} = block;
  return R.set(
    R.lensProp('geojson'),
    {
      // Default geojson properties since we are combining multiple geojson results
      type: 'FeatureCollection',
      generator: 'overpass-turbo',
      copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.',
      features: R.chain(R.defaultTo([]), [ways, nodes, relations])
    },
    location
  );
}, [
  ['location', PropTypes.shape().isRequired],
  ['block', PropTypes.shape({
    ways: PropTypes.arrayOf(PropTypes.shape()).isRequired,
    nodes: PropTypes.arrayOf(PropTypes.shape()).isRequired
  }).isRequired]
], 'locationAndOsmBlocksToLocationWithGeojson');

/**
 * Given a location and componentLocations that are locations geospatially within location, create a single
 * location with the unique geojson of the componentLocations. The geojson of the given location can be optionally
 * preserved and combined with the components. For instance if location is a neighborhood represented by
 * OSM relation geojson, it can be optionally combined with the ways and nodes of all componentLocations or omitted
 * @param {Object} config
 * @param {Object} config.preserveLocationGeojson Keeps the geojson of the location and adds the componentLocations
 * unique geojson
 * @param {Object} location Location encompassing the componentLocations
 * @param {[Object]} componentLocations any number of locations that are geospatailly within location
 */
export const aggregateLocation = ({preserveLocationGeojson}, location, componentLocations) => {
  return R.compose(
    featuresByType => locationAndOsmBlocksToLocationWithGeojson(location, featuresByType),
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
 * @param {[Object]} features A list of geojson features
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

/***
 * Returns only features of the given OSM type from the feaatures
 * @param {String} osmType 'way' or 'node'
 * @param {[Object]} The features to filter
 * @type {[Object]} The matching features
 */
export const featuresOfOsmType = v((osmType, features) => {
  return R.propOr(
    [],
    // This needs an s
    `${osmType}s`,
    featuresByOsmType(features)
  );
}, [
  ['osmType', PropTypes.string.isRequired],
  ['features', PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    }
  )).isRequired]
], 'featuresOfOsmType');

/**
 * TODO use of locationPoints is deprecated and removed. Use geojson: {type: 'FeatureCollection', features: [
 *   {type: 'Feature', geometry: [location point in geojson order]},
 *   {type: 'Feature', geometry: [location point in geojson order]}
 * ]} instead
 * Indicates if location has an array intersectionLocations with values, meaning it has lat/lon points which
 * tell us where the block location is
 * @param blockLocation
 */
export const locationHasLocationPoints = blockLocation => R.compose(
  R.lt(0),
  R.length,
  location => strPathOr([], 'locationPoints', location)
)(blockLocation);

/**
 * Gets locationPoints from the blockLocation from blockLocation.locationPoints or geojson.feature nodes or
 * from interscections that have lat/lons (they shouldn't but this is legacy) or from googleIntersectionObjects
 * @param {Object} blockLocation contains possibly  locationPoinst, intersections, googleIntersctionPoints, and/or geojson
 * @returns {Object} the location with the locationPoints set to a two element array if anything was found
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
          ({locationPoints, blockLocation}) => R.unless(
            R.length,
            () => R.ifElse(
              intersections => R.all(isLatLng)(intersections),
              strs => R.map(
                R.compose(
                  floats => locationToTurfPoint(floats),
                  R.map(s => parseFloat(s)),
                  R.split(','))
              )(strs),
              () => []
            )(strPathOr(null, 'intersections', blockLocation))
          )(locationPoints)
        ),

        // If we have two geojson nodes use those
        // Failing that try to get them from the geojson nodes
        toNamedResponseAndInputs('locationPoints',
          ({blockLocation, locationPoints}) => R.unless(
            R.length,
            () => R.compose(
              nodeFeatures => {
                // If we have 2 use them. We assume they are in the correct order
                return R.when(
                  R.compose(R.not, R.equals(2), R.length),
                  () => []
                )(nodeFeatures);
              },
              blockLocation => {
                // Get the nodes
                return osmFeaturesOfLocationForType('node', blockLocation);
              }
            )(blockLocation)
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

const stateToStateCode = {
  'Alabama': 'AL',
  'Alaska': 'AK',
  'American Samoa': 'AS',
  'Arizona': 'AZ',
  'Arkansas': 'AR',
  'California': 'CA',
  'Colorado': 'CO',
  'Connecticut': 'CT',
  'Delaware': 'DE',
  'District Of Columbia': 'DC',
  'Federated States Of Micronesia': 'FM',
  'Florida': 'FL',
  'Georgia': 'GA',
  'Guam': 'GU',
  'Hawaii': 'HI',
  'Idaho': 'ID',
  'Illinois': 'IL',
  'Indiana': 'IN',
  'Iowa': 'IA',
  'Kansas': 'KS',
  'Kentucky': 'KY',
  'Louisiana': 'LA',
  'Maine': 'ME',
  'Marshall Islands': 'MH',
  'Maryland': 'MD',
  'Massachusetts': 'MA',
  'Michigan': 'MI',
  'Minnesota': 'MN',
  'Mississippi': 'MS',
  'Missouri': 'MO',
  'Montana': 'MT',
  'Nebraska': 'NE',
  'Nevada': 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  'Northern Mariana Islands': 'MP',
  'Ohio': 'OH',
  'Oklahoma': 'OK',
  'Oregon': 'OR',
  'Palau': 'PW',
  'Pennsylvania': 'PA',
  'Puerto Rico': 'PR',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  'Tennessee': 'TN',
  'Texas': 'TX',
  'Utah': 'UT',
  'Vermont': 'VT',
  'Virgin Islands': 'VI',
  'Virginia': 'VA',
  'Washington': 'WA',
  'West Virginia': 'WV',
  'Wisconsin': 'WI',
  'Wyoming': 'WY',
  'Alberta': 'AB',
  'British Columbia': 'BC',
  'Manitoba': 'MB',
  'New Brunswick': 'NB',
  'Newfoundland and Labrador': 'NL',
  'Nova Scotia': 'NS',
  'Northwest Territories': 'NT',
  'Nunavut': 'NU',
  'Ontario': 'ON',
  'Prince Edward Island': 'PE',
  'Québec': 'QC',
  'Quebec': 'QC',
  'Saskatchewan': 'SK',
  'Yukon': 'YT'
};

/**
 * Returns the abbreviation of the states, provinces. US, Canada to convert nomanatim reverse geocode results
 * Add more as needed.
 * We don't return abbreviations for places that Google doesn't play well with, like cantons in Switzerland
 * @param state
 * @returns {String} The code or null if it doesn't have one
 */
export const stateCodeLookup = state => {
  return R.propOr(null, state, stateToStateCode);
};

/**
 * Converts intersection1Location and intersection2Location to geojson points
 * @param location
 * @returns {[Object]} To geojson points or null
 */
export const locationIntersectionLocationToTurfPoints = location => {
  return R.compose(
    R.map(
      propValue => R.compose(
        floats => locationToTurfPoint(floats),
        strs => R.map(parseFloat, strs),
        str => R.split(',', str)
      )(propValue)
    ),
    R.props(['intersection1Location', 'intersection2Location'])
  )(location);
};

/**
 * Returns true if the the feature's type matches the osm types 'way', 'node', or 'relation'
 * @param {String} type 'way', 'node', or 'relation'
 * @param {Object} feature geojson feature
 * @return {Boolean} true or false
 */
export const isOsmType = (type, feature) => {
  return R.includes(type, strPathOr('', 'id', feature));
};

/**
 * Returns the matching features of the location
 * @param {String} type 'way', 'node', or 'relation'
 * @param {Object} location
 * @param {Object} location.geojson
 * @param {[Object]} location.geojson.features geojson features
 * @return {[Object]} the matching features
 */
export const osmFeaturesOfLocationForType = (type, location) => {
  return R.filter(
    feature => isOsmType(type, feature),
    strPathOr([], 'geojson.features', location)
  );
};

/**
 * Reverse the coordinates of the geojson feature and returns the coordinates
 * @param feature
 * @return {Object}
 */
export const reverseCoordinatesOfFeature = feature => {
  return R.reverse(R.view(R.lensPath(['geometry', 'coordinates']), feature));
};
/**
 * Reverses the coordinates of the gejson and returns the feature
 * @param feature
 * @return {f2|f1}
 */
export const featureWithReversedCoordinates = feature => {
  return R.over(R.lensPath(['geometry', 'coordinates']), R.reverse, feature);
};

/**
 * Maps the given feature to a polygon using turf.circl
 * @param feature
 * @param {Object} options turf.circle options
 * @param {Number} [options.steps]  Default 100 number of stpes
 * @param {String} [options.units]  Default 'meters'  'kilometers'  miles, kilometers, degrees, or radians
 * @params {Object} [options.properties] Default {}. Properties to give the feature. This will normally be omitted and simply red from
 * feature.properties. The radius property will be converted to _radius to indicate that this is not longer
 * a feature representing a circle
 */
export const featureWithRadiusToCirclePolygon = (feature, options) => {
  return R.when(
    feature => {
      // Is it a circle feature
      return featureRepresentsCircle(feature);
    },
    feature => {
      // Then map it to a polygon
      // Merger given options with defaults
      const mergedOptions = R.merge({
        steps: 100,
        units: 'meters',
        properties: mapKeys(
          prop => R.when(R.equals('radius'), () => '_radius')(prop),
          reqStrPathThrowing('properties', feature)
        )
      }, options);
      const radius = reqStrPathThrowing('properties.radius', feature);
      // Create a polygon circle feature, converting the radius property to _radius
      return circle(
        feature,
        radius,
        mergedOptions
      );
    }
  )(feature);
};

/**
 * Creates a node from the coordinate and context
 * @param {Object} context
 * @param {String } context.id The id of the node. Should be in the format 'node/*' to match OSM
 * @param {[Number]} coordinate The coordinate pair lon, lat
 * @return {{geometry: {coordinates: *, type: string}, id: *, type: string, properties: {}}}
 */
export const nodeFromCoordinate = ({id}, coordinate) => {
  return {
    type: 'Feature',
    id,
    properties: {},
    geometry: {
      type: 'Point',
      // Get the first point of the only line
      coordinates: coordinate
    }
  };
};

/**
 * Given a geojson feature collection, buffer it union each feature from the buffer
 * @param {Object} config
 * @param {Number} config.radius
 * @param {String} config.units
 * @param {Object} geojson Feature Collection to buffer
 * @return {Object} A feature collection  containing one or more features
 */
export const bufferAndUnionGeojson = ({radius, units}, geojson) => {
  const buffered = buffer(geojson, radius, {units});
  const features = R.compose(toArrayIfNot, R.when(R.propEq('type', 'FeatureCollection'), R.prop('features')))(buffered);
  const feature = R.reduce(
    (acc, feature) => {
      return !acc ? feature : union(acc, feature);
    },
    null,
    features
  );
  return {type: 'FeatureCollection', features: [feature]};
};

/**
 * Returns true if the given features are within the given polygon feature
 * @param {Object} polygon A polygon feature
 * @param {[Object]} features Features to test
 * @return {Boolean} returns tru if all features aree within the polygon
 */
export const isWithinPolygon = R.curry((polygon, features) => {
  return R.all(
    line => {
      return booleanWithin(
        line,
        polygon
      );
    },
    R.compose(
      ways => {
        return R.chain(
          way => {
            // Convert multilinstrings to linestring if they are actually linestring
            return R.map(
              coord => {
                // Converts each line to a linestring feature
                return R.compose(
                  way => R.set(R.lensPath(['geometry', 'coordinates']), coord, way),
                  way => R.set(R.lensPath(['geometry', 'type']), 'LineString', way)
                )(way);
              },
              reqStrPathThrowing('geometry.coordinates', way)
            );
          },
          ways
        );
      },
      features => osmFeaturesOfLocationForType('way', {geojson: {features}})
    )(features)
  );
});

/**
 * Temporary function to convert old-school intersection style to new
 * @param blockname
 * @param intersc1
 * @param intersc2
 * @param intersection1Location
 * @param intersection2Location
 * @return {{blockname: *, intersections: [{streets: [*, *]}, {streets: [*, *]}]}}
 */
export const oldIntersectionUpgrade = ({blockname, intersc1, intersc2, intersection1Location, intersection2Location}) => {
  return R.merge(
    {
      blockname,
      intersections: [
        {
          data: {streets: compact([blockname, intersc1])},
        },
        {
          data: {streets: compact([blockname, intersc2])},
        }
      ]
    },
    intersection1Location || intersection2Location ? {
      geojson: {
        type: 'FeatureCollection',
        features: [
          // We don't put in a fake way here. We assume the single block resolution code will find the way from OSM
          // based on these 2 points
          locationToTurfPoint(R.map(s => parseFloat(s), R.split(',', intersection1Location))),
          locationToTurfPoint(R.map(s => parseFloat(s), R.split(',', intersection2Location)))
        ]
      }
    } : {}
  );
};
