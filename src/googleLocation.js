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
import {task, of, waitAll} from 'folktale/concurrency/task';
import rhumbDistance from '@turf/rhumb-distance';
import {featureCollection} from '@turf/helpers';
import {Ok, Error} from 'folktale/result';
import center from '@turf/center';
import {
  reqStrPath,
  reqStrPathThrowing,
  traverseReduce,
  traverseReduceWhile,
  mapMDeep,
  mapToNamedResponseAndInputs, reqPathThrowing
} from 'rescape-ramda';
import googleMapsClient from './googleMapsClient';
import {
  googleLocationToLocation,
  googleLocationToTurfPoint, locationToTurfPoint, originDestinationToLatLngString, turfPointToLocation
} from 'rescape-helpers';
import {
  addressString,
  addressStringInBothDirectionsOfLocation,
  addressStrings,
  isLatLng,
  oneLocationIntersectionsFromLocation,
  removeStateFromSomeCountriesForSearch
} from './locationHelpers';
import * as Result from 'folktale/result';
import {lineString} from '@turf/helpers';
import {loggers} from 'rescape-log';

const log = loggers.get('rescapeDefault');

// Make sure that the key here is enabled to convert addresses to geocode and to use streetview
// https://log.developers.google.com/apis/api/geocoding_backend?project=_
// https://log.developers.google.com/apis/api/directions_backend?project=_
const apiKey = process.env.GOOGLE_API_KEY;
const googleMaps = googleMapsClient(apiKey);
// HTTP OK response
const OK_STATUS = 200;

const addGeojsonToGoogleResult = result => {
  return R.set(
    R.lensProp('geojson'),
    // Convert result.geometry.location to a turf point.
    googleLocationToTurfPoint(result.geometry.location),
    result
  );
};
/**
 * Resolves the lat/lon from the given address
 * @param {Object} location Location object gives us context about the address. In the future we might just
 * accept a location an not an address, since we can derive the address from the location.
 * The location must be a single item array containing a lat,lon string
 * we are resolving
 * @param {String} address Street address
 * @return {Task<Result<Object>} resolves with response in a Result if the status is OK,
 * else an Error with the error. Failed geocoding should be expected and handled. The Result
 * contains a geojson that is a Turf Point. Other info from Google like formatted_address is returned
 * if the request goes through Google. If the address is already a lat,lon Google isn't used
 */
export const geocodeAddressTask = R.curry((location, address) => {
  // Since we are starting to remove address in favor of location, allow it to be null
  // address is useful if we need to choose which intersection of the location we need when their are two
  address = address || R.head(addressStringInBothDirectionsOfLocation(location));
  // If the address is a lat/lon  don't bother to call Google's geocoder
  return task(resolver => {
    let promise = null;
    if (isLatLng(address)) {
      promise = googleMaps.reverseGeocode({
        latlng: address
      }).asPromise();
    } else {
      promise = googleMaps.geocode({
        address
      }).asPromise();
    }
    promise.then(
      // Only accept exact results, not approximate, if the location search involves intersections
      response => {
        const results = R.ifElse(
          R.always(isLatLng(address)),
          // If we had a lat/lon use the reverse geocoding to get country, state, city, neighborhood
          // if we don't already have them
          results => {
            return {
              // Just use our lat lon for the geojson, not what Google found, which might be less accurate
              geojson: locationToTurfPoint(R.map(parseFloat, R.split(',', address))),
              // Add this special property that can be used to modify our location later with
              // the jurisdictions found by Google
              locationWithJurisdictions: resolveJurisdictionFromGeocodeResult(location, results)
            };
          },
          // Otherwise find the best result from the geocoding
          results => R.filter(
              result => R.when(
                R.always(R.and(
                  R.has('intersections', location),
                  R.length(R.prop('intersections', location))
                )),
                r => R.allPass([
                  // The first address component must be 'intersection'
                  r => reqStrPath('address_components.0.types.0', r).matchWith({
                    Ok: ({value}) => R.equals('intersection', value),
                    Error: R.F
                  }),
                  // If 1 or more intersections are defined, insist on a GEOMETRIC_CENTER, not APPROXIMATE location
                  r => R.contains(r.geometry.location_type, ['GEOMETRIC_CENTER']),
                  // No partial matches allowed. TODO this seems to give ok results
                  // r => R.not(R.prop('partial_match', r)),
                  // It must be an intersection, thus have & in the address
                  r => R.contains('&', r.formatted_address)
                ])(r)
              )(result),
              results
            )
        )(response.json.results);

        if (isLatLng(address)) {
          // Always resolve lat lons
          resolver.resolve(Result.of(results))
        }
        else if (R.equals(1, R.length(results))) {
          const result = R.head(results);
          // Result to indicate success
          log.debug(`Successfully geocoded location ${R.propOr('(no id given)', 'id', location)}, ${address}`);
          // If an error occurs here Google swallows it, so catch it
          resolver.resolve(
            Result.of(addGeojsonToGoogleResult(result))
          );
        } else {
          // Ambiguous or no results. We can potentially resolve ambiguous ones
          log.warn(`Failed to exact geocode location ${R.propOr('(no id given)', 'id', location)}, ${address}. ${R.length(results)} results`);
          resolver.resolve(Result.Error({
            error: 'Did not receive exactly one location',
            results: R.map(
              result => addGeojsonToGoogleResult(result),
              results
            ),
            response
          }));
        }
      },
      err => {
        // Handle error
        // Error to give up
        log.warn(`Failed to geocode ${R.propOr('(no id given)', 'id', location)}, ${address}. Error ${err.json.error_message}`);
        resolver.resolve(Result.Error({error: err.json.error_message, response: err}));
      }
    );
  });
});

/**
 * Given a pair of locations that represents two intersections of a block,
 * Returns then geocode locations of the pair. This is different than
 * geocoding each of the two locations separately because it can resolve
 * ambiguous locations by finding the two locations that are closest together.
 * Thus one or both locations of the locationPair might resolve ambiguously
 * but we can almost always guess the correct block intersections.
 * This is needed for locations that didn't specifies cardinal directions like
 * NW, SW and thus result to two different places.
 * @param {object} location The location of the locationPair. In the future we might get rid of locationPair
 * and simply derive it from location
 * @returns {Task<[Result<Object>]>} Task to return the two matching geolocations
 * in a Result. Each object contains a geojson property which is a point. Other information might be in the
 * object if the address was resolved through Google, but don't count on it. If either intersection cannot
 * be goecoded by Google, a Task<Result.Error> is returned
 */
export const geocodeBlockAddressesResultTask = location => {
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
        // If responseResult is a Result.Ok, the response is the one result.
        // Chain it to produce a new Result that combines previousResult (if any) with result
        // If there is no previousResults, this will return [result]
        // If there is a previousResultsResult, this will return the [closest previousResult, closest result],
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
          () => {
            log.warn(`Failed to geocode 1 or both of ${R.join(', ', addressStrings(location))}`);
            return Result.Error(response);
          }
        )(R.propOr([], 'results', response))
      );
    },
    // Initial accumulation is an empty Result
    of(Result.of()),
    // Each location is resolved to a Task<Result>, where the Result if a Ok if a single address was
    // resolved and an Error otherwise
    R.map(
      locationWithOneIntersection => geocodeAddressWithBothIntersectionOrdersTask(locationWithOneIntersection),
      oneLocationIntersectionsFromLocation(location)
    )
  );
};

/**
 * Geocodes the location with the intersection streets in each order until one returns a result
 * @param {Object} locationWithOneIntersectionPair Location with only one intersection pair
 * @param {[[String]|String]} locationWithOneIntersectionPair.intersections one item array with a pair of
 * intersections names or just a lat/lon string
 * @return {Task<Result>} Result.Ok if one ordering succeeds. Result.Error if neither succeeds
 */
export const geocodeAddressWithBothIntersectionOrdersTask = locationWithOneIntersectionPair => {
  return R.composeK(
    result => of(result.mapError(errorObj => {
      // Augment the error from the geocoding, which only accounts for the failure of the second ordering
      const modifiedErrorObj = R.over(
        R.lensProp('error'),
        error => R.join('\n', [
          error,
          `For location ${JSON.stringify(R.pick(['country', 'state', 'city', 'neighborhood'], locationWithOneIntersectionPair))} Failed to resolve the intersection after trying both orderings ${
            R.join(' and ', reqStrPathThrowing('intersections.0', locationWithOneIntersectionPair))
            } and ${
            R.join(' and ', R.reverse(reqStrPathThrowing('intersections.0', locationWithOneIntersectionPair)))
            }`,
          `To resolve, set the intersection lat/lons manually for location ${locationWithOneIntersectionPair.id}`
        ]),
        errorObj);
      log.warn(modifiedErrorObj.error);
      return modifiedErrorObj;
    })),
    locationAddressStrings => traverseReduceWhile(
      {
        // Return false when it's not an error to stop
        predicate: (accumulated, value) => Result.Error.hasInstance(value),
        // After a task returns false still add it to the accumulation since it's the answer we want
        accumulateAfterPredicateFail: true
      },
      // Always the lastest returned value, either the Result.Ok or last Result.Error
      // TODO we could combine the two errors here (when both directions fail) if it mattered
      (accum, value) => value,
      of(),
      R.map(
        // Seek the geocode of each intersection ordering if we have named intersections
        // Since this creates 2 tasks we only run as many as are needed to get a definitive answer from Google
        locationAddress => geocodeAddressTask(locationWithOneIntersectionPair, locationAddress),
        locationAddressStrings
      )
    ),
    // Produce the two intersection name orderings if the intersections are named and we don't have lat/lons
    locationWithOneIntersectionPair => of(addressStringInBothDirectionsOfLocation(locationWithOneIntersectionPair))
  )(locationWithOneIntersectionPair);
};


/**
 * Returns the geographical center point of a location pair, meaning the center
 * point between the two interesections of a block. This is probably only used for map
 * centering
 * @param {object} location Location object of the location pair. Provides context for resolving the pair. In
 * the future we might just pass the location and derive the locationPair from it
 * @returns {Task<Result>} Task to return the center points
 */
export const geojsonCenterOfBlockAddress = location => R.composeK(
  // Find the center of the two points
  featureCollectionResult => of(featureCollectionResult.map(featureCollection => {
    return center(featureCollection);
  })),
  // Create a FeatureCollection from the two Turf Points
  featuresResult => of(featuresResult.map(features => {
    return featureCollection(features);
  })),
  // If Result continue by taking the geojson of each
  resultsResult => of(resultsResult.map(
    results => R.map(
      result => result.geojson,
      results
    )
  )),
  // First resolve the geocode for the two ends fo the block.
  // This returns and a Result for success, Error for failure
  location => geocodeBlockAddressesResultTask(location)
)(location);


/**
 * Given two sets of ambiguous geocode results, find the two closest to
 * each other from each set and accept those two as the correct answer.
 * Since we always geocode a block, we can usually figure out the correct addresses
 * even if one or both are ambigous. Each ResultSet contains objects containing a geosjon property.
 * This is a geojson point, and this is what is tested for the closest point of each set
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
            return result.geojson;
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
 * @return {Task} resolves with Google Directions Route Response if the status is OK, else rejects
 */
export const calculateRouteTask = R.curry((directionsService, origin, destination) => {
  return task(resolver => {
    directionsService({
      origin: originDestinationToLatLngString(origin),
      destination: originDestinationToLatLngString(destination),
      mode: 'walking'
    }, (error, response) => {
      if (response && response.status === OK_STATUS) {
        log.debug(`Successfully resolved ${origin.formatted_address} to ${destination.formatted_address} to
        ${R.length(response.json.routes)} route(s)`);
        resolver.resolve(response);
      } else {
        log.warn(`Failed to resolve ${origin.formatted_address} to ${destination.formatted_address}`);
        resolver.reject(Result.Error({error: error.json.error_message}));
      }
    });
    // Wrap the response in a Result.Ok
  }).map(routeResponse => Result.of(routeResponse));
});

/**
 * Create two tasks, one directions from the origin to destination and the reverse directions.
 * This matters for wide streets that have streetviews taken from both sides.
 * @param {Object} directionsService Google API direction service
 * @param {Object} origin The origin location object
 * @param {Object} origin.geometry The origin geometry object
 * @param {Object} origin.geometry.location The lat, lon origin
 * @param {Object} destination The destination location object
 * @param {Object} origin.geometry The destination geometry object
 * @param {Object} destination.geometry.location The lat, lon origin
 * @return {Task<Result<[Object]>>} resolves with two Google Directions Route Responses
 * if the status is OK. The response is wrapped in a Result.Ok. Task rejections send a Result.Error
 */
export const calculateOpposingRoutesTask = R.curry((directionsService, origin, destination) => {
  return waitAll(
    R.map(
      odPair => calculateRouteTask(directionsService, ...odPair),
      [[origin, destination], [destination, origin]]
    )
  ).map(
    // Combine the Results into a single Result.Ok or Result.Error
    // [Result] -> Result.Ok<[Object]> | Result.Error<[Object]>
    routeResponseResults => R.ifElse(
      R.all(R.is(Result.Ok)),
      R.sequence(Result.of),
      R.sequence(Result.Error)
    )(routeResponseResults)
  );
});


/***
 * Given an origin and destination street address, calculates a route using the Google API
 * @param {object} directionService Google Direction Service
 * @param {object} location The location to use as context. This is currently just used to help resolve the addresses.
 * If the origin destination pair spans more than a single location just specify minimum info like the country,
 * state, city or a blank object.
 * @param {[String]} originDestinationPair
 * @return {Task<Result>} resolves with a Result of the calculated route if both
 * origin and destination address geocode. Otherwise returns an Result.Error with one or both
 * Result.Error geocode results
 */
export const createOpposingRoutesFromOriginAndDestination = R.curry((directionService, location) => {
  // geocode the pair. By coding together we can resolve ambiguous locations by finding the closest
  // two locations between the ambiguous results in the origin and destination
  const geocodeTask = geocodeBlockAddressesResultTask(location);
  // chain the Task sending the two lat/lng locations to calculateRouteTask, which itself returns a Task
  return R.chain(
    // geocodePairResult is a Result that we chain to call calculateRouteTask
    // calculateRouteTask returns a Task whose value we convert to a Result, yielding Task<Result>
    geocodePairResult => {
      return geocodePairResult.chain(
        ([originGeocode, destinationGeocode]) => calculateOpposingRoutesTask(
          directionService,
          originGeocode,
          destinationGeocode
        )
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
export const routeFromOriginAndDestination = createOpposingRoutesFromOriginAndDestination(initDirectionsService());


/**
 * Get the intersection data from Google including the long names of streets
 * @param location
 * @return {Result<[[String]]|Result.Error} Two arrays containing the long names of each intersection.
 * If either intersection can't be resolved a Result.Error is returned
 */
export const googleIntersectionTask = location => {
  return R.composeK(
    // results is a Result.Ok/Error. Result.Ok contains two address objects
    responsesResult => of(
      responsesResult.map(
        // Result has two values, each address
        responses => R.addIndex(R.map)(
          (response, i) => R.merge({
            // Only parse the address_components if we have a real response
            // We'll have a real response unless we had a lat/lon intersection and didn't bother to geocode
            // Otherwise just use each intersection from location that we already have
            intersection: R.ifElse(
              response => R.propOr(false, 'address_components', response),
              // Get the long name version
              // Split at &
              response => R.split(' & ', reqStrPathThrowing('address_components.0.long_name', response)),
              // Use the intersection from location instead
              () => reqPathThrowing(['intersections', i], location)
            )(response)
          }, response),
          responses
        )
      )
    ),
    // Geocode the location
    location => geocodeBlockAddressesResultTask(location)
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
  // TODO We should get rid of this because a location is never a single point, rather two intersections
  if (R.all(R.is(Number), latLng)) {
    return of(Result.Ok(latLng));
  }
  // If we have both intersection pairs, resolve the center point between them.
  // Call the API, returning an Task<Result.Ok> if the resolution succeeds or Task<Result.Error> if it fails
  else if (R.equals(2, R.length(location.intersections))) {
    // Task Result -> Task Result
    return mapMDeep(2,
      center => turfPointToLocation(center),
      geojsonCenterOfBlockAddress(location)
    );
  } else {
    return R.composeK(
      // Map the Result value
      // Task Result Object -> Task Result Object
      locationResult => of(R.map(
        location => googleLocationToLocation(location),
        locationResult
      )),
      // Task Result Object -> Task Result Object.
      responseResult => of(R.chain(
        response => reqStrPath('geometry.location', response),
        responseResult
      )),
      // Task Object -> Task Result Object
      ({location, address}) => {
        return R.ifElse(
          // If we have 1 intersection pair, resolve that intersection.
          // We try the intersection name with both name orderings because sometimes Google only knows one
          // Call the API, returning an Task<Result.Ok> if the resolution succeeds or Task<Result.Error> if it fails
          ({location}) => R.equals(2, R.length(location.intersections)),
          // Otherwise take whatever is in the location, maybe just country or also state, city, neighborhood, etc
          // and give a center point. If we have a named intersection this task will try to resolve the intersection
          // by trying names in both orders until one resolves. E.g. it tries Main St and Elm St and then Elm St and Main St
          // if the former fails
          ({location}) => geocodeAddressWithBothIntersectionOrdersTask(location),
          ({location, address}) => geocodeAddressTask(location, address)
        )({location, address});
      },
      // Task Object -> Task Object
      mapToNamedResponseAndInputs('address',
        ({location}) => of(addressString(location))
      ),
      // Remove states from some countries like Switzerland that mess up the search
      // Object -> Task Object
      location => of({location: removeStateFromSomeCountriesForSearch(location)})
    )(location);
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
  return geocodeBlockAddressesResultTask(location).map(
    responsesResult => {
      // Map each response in result to a simple lat, lon
      // We chain the Result with two responses by traversing the two
      // responses to map them to simple [lat, lon]
      // In the end we get a single Result containing a Turf LineString or an Error
      return responsesResult.chain(
        // Map the two locations to a Turf LineString
        responses => Result.of(lineString(R.map(
          response => reqStrPathThrowing('geojson.geometry.coordinates', response),
          responses
        )))
      );
    }
  );
};

/**
 * For new locations resolved with OSM and Google geocoding, this applies the geocoding address components
 * to the location to set country, (state), city, and neighborhood. There are some overrides below for
 * special cases that should be extracted to an overrides file or similar
 * @param {OBject} location Location object needing country, state, city, and neighborhood
 * @param {[Object]} googleGeocodeResults The resolved Google geocode object for each intersection of the location
 * @param {Result Object} Result.Ok with the location with country, (state), city, and neighborhood. Or Result.Error
 * if either country or city are missing. state and neighborhood are optional unless overrides require them
 */
export const resolveJurisdictionFromGeocodeResult = (location, googleGeocodeResults) => {
  const addressComponents = reqStrPathThrowing('0.address_components', googleGeocodeResults);

  // If we already have a country and city, assume the jurisdiction is resolved
  if (R.both(R.prop('country'), R.prop('city'))(location)) {
    return Result.Ok(location)
  }

  // Match the current naming convention for these countries
  // TODO update database to use long name and remove this
  const countryAliasMap = {'United States': 'USA', 'United Kingdom': 'UK'};
  const mapToName = {
    country: obj => R.compose(name => R.propOr(name, name, countryAliasMap), R.prop('long_name'))(obj),
    state: obj => R.prop('short_name', obj),
    neighborhood: obj => R.prop('long_name', obj),
    city: obj => {
      return R.cond([
        // For some reason New York cities locations don't return New York, I guess because the state equals the city
        // Seems like a bug
        [
          obj => R.both(
            R.compose(R.isNil, R.prop('city')),
            R.compose(R.equals('New York'), R.prop('state'))
          )(obj),
          R.always('New York')
        ],
        [R.T, obj => R.prop('long_name', obj)]
      ])(obj);
    }
  };
  return R.compose(
    // If country and city are non-null return a Result.Ok. Else a Result.Error
    location => R.ifElse(
      location => R.all(
        prop => R.prop(prop, location),
        ['country', 'city']
      ),
      location => Ok(location),
      location => Error({error: 'Could not extract country and/or city from Google geocode results', location})
    )(location),
    R.merge(location),
    R.mapObjIndexed((value, key) => mapToName[key](value)),
    keyToAddressComponentType => R.map(
      type => R.find(
        ({types}) => R.contains(
          type,
          types
        ),
        addressComponents
      ),
      keyToAddressComponentType
    )
  )({neighborhood: 'neighborhood', city: 'locality', state: 'administrative_area_level_1', country: 'country'});
};
