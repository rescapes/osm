/**
 * Created by Andy Likuski on 2018.03.27
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import * as R from 'ramda';
import {task, of} from 'folktale/concurrency/task';
import rhumbDistance from '@turf/rhumb-distance';
import {featureCollection} from '@turf/helpers';
import center from '@turf/center';
import {reqStrPath, reqStrPathThrowing, traverseReduce} from 'rescape-ramda';
import googleMapsClient from './googleMapsClient';
import {
  googleLocationToLocation,
  googleLocationToTurfLineString,
  googleLocationToTurfPoint, locationToTurfPoint, originDestinationToLatLngString, turfPointToLocation
} from 'rescape-helpers';
import {addressPair, addressString} from './locationHelpers';
import * as Result from 'folktale/result';

// Make sure that the key here is enabled to convert addresses to geocode and to use streetview
// https://console.developers.google.com/apis/api/geocoding_backend?project=_
// https://console.developers.google.com/apis/api/directions_backend?project=_
const apiKey = 'AIzaSyD_M7p8y3-3PUMgodb-9SJ4TtoJFLKDj6U';
const googleMaps = googleMapsClient(apiKey);
// HTTP OK response
const OK_STATUS = 200;

/**
 * Resolves the lat/lon from the given address
 * @param {String} address Street address
 * @return {Task<Result>} resolves with response in a Result if the status is OK,
 * else an Error with the error. Failed geocoding should be expected and handled
 */
export const geocodeAddress = address => {
  return task(resolver => {
    const promise = googleMaps.geocode({
      address
    }).asPromise();
    promise.then(response => {
        const results = response.json.results;
        if (R.equals(1, R.length(results))) {
          const result = R.head(results);
          // Result to indicate success
          console.debug(`Successfully geocoded ${address}`);
          // If an error occurs here Google swallows it, so catch it
          resolver.resolve(Result.of(result));
        }
        else {
          // Error so we can give up on the address
          console.warn(`Failed to geocode ${address}. ${R.length(results)} results`);
          resolver.resolve(Result.Error({
            error: 'Did not receive exactly one location', results, response
          }));
        }
      },
      err => {
        // Handle error
        // Error to give up
        console.warn(`Failed to geocode ${address}. Error ${err.json.error_message}`);
        resolver.resolve(Result.Error({error: err.json.error_message, response: err}));
      });
  });
};

/**
 * Given a pair of locations that represents two intersections of a block,
 * Returns then geocode locations of the pair. This is different that
 * geocoding each of the two locations separately because it can resolve
 * ambiguous locations by finding the two locations that are closest together.
 * Thus one or both locations of the locationPair might resolve ambiguously
 * but we can almost always guess the correct block intersections.
 * This is needed for locations that didn't specifies cardinal directions like
 * NW, SW and thus result to two different places.
 * @param {[String]} locationPair Two address strings
 * @returns {Task<[Result]>} Task to return the two matching geolocations
 * in a Result. If either doesn't resolve at all then return Result.Error
 */
export const geocodeBlockAddresses = locationPair => {
  const handleResults = (previousResults, currentResults) => R.ifElse(
    R.identity,
    // The second time through we have results from both, so find closest
    results => {
      return findClosest(results, currentResults);
    },
    // The first time through we have no previous results, so just return response.results
    () => currentResults
  )(previousResults);

  return traverseReduce(
    // The first time through previousResultsResult will have a null value
    (previousResultsResult, responseResult) => {
      return responseResult.chain(
        // If responseResult is a Result, the response is the one result.
        // Chain it to produce a new Result that combines previousResult (if any) with result
        // If there is no previousResults, this will return [result]
        // If there is a previousResults, this will return the [closest previousResult, closest result],
        // i.e. a 2 element array of the closest points from the previous and current result
        result => previousResultsResult.map(previousResults => {
          return handleResults(previousResults, R.of(result));
        })
      ).orElse(
        // If responseResult is an Error, we either have too many or zero results.
        // Accept too many, but reject zero
        response => R.ifElse(
          results => R.length(results),
          // Multiple results, figure out the closest to the the closest of the previous,
          // or if this is the origin there won't be any previous yet
          results => previousResultsResult.chain(previousResults => Result.of(handleResults(previousResults, results))),
          () => Result.Error(response)
        )(R.propOr([], 'results', response))
      );
    },
    // Initial accumulation is an empty Result
    of(Result.of()),
    // Each location is resolved to a Task<Result>, where the Result if a Ok if a single address was
    // resolved and an Error otherwise
    R.map(geocodeAddress, locationPair)
  );
};

/**
 * Returns the geographical center point of a location pair, meaning the center
 * point between the two interesections of a block. This is probably only used for map
 * centering
 * @param {[String]} locationPair Two address strings
 * @returns {Task<Result>} Task to return the center points
 */
export const geojsonCenterOfBlockAddress = locationPair => R.composeK(
  // Find the center of the two points
  featureCollectionResult => of(featureCollectionResult.map(featureCollection => {
    return center(featureCollection);
  })),
  // Create a FeatureCollection from the two Turf Points
  featuresResult => of(featuresResult.map(features => {
    return featureCollection(features);
  })),
  // If Result continue by converting eatch location to a Turf Point
  resultsResult => of(resultsResult.map(
    results => R.map(
      result => locationToTurfPoint(R.props(['lat', 'lng'], result.geometry.location)),
      results
    )
  )),
  // First resolve the geocode for the two ends fo the block.
  // This returns and a Result for success, Error for failure
  geocodeBlockAddresses
)(locationPair);


/**
 * Given two sets of ambiguous geocode results, find the two closest to
 * each other from each set and accept those two as the correct answer.
 * Since we always geocode a block, we can usually figure out the correct addresses
 * even if one or both are ambigous
 * @param {[Object]} firstResultSet One or more geocode results
 * @param {[Object]} secondResultSet One or more geocode results
 * @return {[Object]} The two locations that are closest together
 */
export const findClosest = (firstResultSet, secondResultSet) => {
  const results = R.chain(
    firstResult => R.map(
      // Given a result from each set, calculate the distance between them
      secondResult => {
        const points = R.map(
          result => {
            return googleLocationToTurfPoint(result.geometry.location);
          },
          [firstResult, secondResult]
        );
        const distance = rhumbDistance(...points);
        return {
          firstResult,
          secondResult,
          distance
        };
      },
      secondResultSet
    ),
    firstResultSet
  );
  // Pick the shortest distance results
  return R.compose(
    R.props(['firstResult', 'secondResult']),
    R.head,
    R.sortBy(R.prop('distance'))
  )(results);
};

/**
 * Calculates the route using the Google API
 * @param {Object} directionsService Google API direction service
 * @param {Object} origin The origin location object
 * @param {Object} origin.geometry The origin geometry object
 * @param {Object} origin.geometry.location The lat, lon origin
 * @param {Object} destination The destination location object
 * @param {Object} origin.geometry The destination geometry object
 * @param {Object} destination.geometry.location The lat, lon origin
 * @return {Task} resolves with response if the status is OK, else rejects
 */
export const calculateRoute = R.curry((directionsService, origin, destination) => {
  return task(resolver => {
    directionsService({
      origin: originDestinationToLatLngString(origin),
      destination: originDestinationToLatLngString(destination),
      mode: 'walking'
    }, (error, response) => {
      if (response && response.status === OK_STATUS) {
        console.debug(`Successfully resolved ${origin.formatted_address} to ${destination.formatted_address} to
        ${R.length(response.json.routes)} route(s)`);
        resolver.resolve(R.head(response.json.routes));
      } else {
        console.warn(`Failed to resolve ${origin.formatted_address} to ${destination.formatted_address}`);
        resolver.reject({error: error.json.error_message});
      }
    });
  });
});


/***
 * Given an origin and destination street address, calculates a route using the Google API
 * @param {[String]} originDestinationPair
 * @return {Task<Result>} resolves with a Result of the calculated route if both
 * origin and destination address geocode. Otherwise returns an Result.Error with one or both
 * Result.Error geocode results
 */
export const createRouteFromOriginAndDestination = R.curry((directionService, originDestinationPair) => {
  // geocode the pair. By coding together we can resolve ambiguous locations by finding the closest
  // two locations between the ambiguous results in the origin and destination
  const geocodeTask = geocodeBlockAddresses(originDestinationPair);
  // chain the Task sending the two lat/lng locations to calculateRoute, which itself returns a Task
  return R.chain(
    // geocodePairResult is a Result that we chain to call calculateRoute
    // calculateRoute returns a Task whose value we convert to a Result, yielding Task<Result>
    geocodePairResult => {
      return geocodePairResult.chain(
        ([originGeocode, destinationGeocode]) => calculateRoute(
          directionService, originGeocode, destinationGeocode
        ).map(result => Result.of(result))
      ).orElse(
        // If we have a Result.Error just wrap it in a Task to match the Result.Ok condition
        errorValue => {
          console.warn(`Skipping ${R.join(' and ', originDestinationPair)} because geocode resolve failed on one or both`);
          // This is filtered out later
          return of(Result.Error(errorValue));
        }
      );
    },
    geocodeTask
  );
});

/**
 * Inits the Google Directions Service
 * @return {Object} Directions service
 */
export const initDirectionsService = () => {
  return googleMaps.directions;
};

/**
 * Shortcut to create a route from origin and destination with a predefined Google directions service
 */
export const routeFromOriginAndDestination = createRouteFromOriginAndDestination(initDirectionsService());


/**
 * Get the long names of the intersections of location
 * @param location
 * @return {[[String]]} Two arrays containing the long names of each intersection
 */
export const fullStreetNamesOfLocationTask = location => {
  return R.composeK(
    // result is a Result.Ok/Error, so chain them if Result.Ok
    results => of(
      results.chain(
        // Result has two values, each address
        values => R.map(
          R.compose(
            // Split at &
            longName => R.split(' & ', longName),
            // Get the long name version
            value => reqStrPathThrowing('address_components.0.long_name', value)
          ),
          values
        )
      )
    ),
    // Geocode the intersection
    addresses => geocodeBlockAddresses(addresses),
    // Create the intersection address string
    location => of(addressPair(location))
  )(location);
};


/**
 * Resolves the geolocation of a Location
 * @param {Object} location
 * @param {Object} location.country
 * @param {String} location.state Optional
 * @param {String} location.city
 * @param {[[String]]} location.intersections Zero, one or two arrays of two-item intersections:
 * e.g. [['Main St', 'Chestnut St'], ['Main St', 'Elm St']] or 0 or 1 of theses
 * @return {Task<Result<[Number, Number]>>} The resolved center latitude and longitude of the location in a Result
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
  else {
    return geocodeAddress(addressString(location)).map(responseResult => {
      // Chain the either to a new Result that resolves geometry.location
      return responseResult.chain(response =>
        // This returns a Maybe
        reqStrPath('geometry.location', response)
      ).map(
        // Map the Maybe value
        googleLocationToLocation
      );
    });
  }
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
      );
    }
  );
};

