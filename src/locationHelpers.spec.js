import * as R from 'ramda';
import {mergeDeep, reqStrPathThrowing} from 'rescape-ramda';
import {resolveGeoLocationTask, resolveGeojsonTask } from './locationHelpers';
import {turfPointToLocation, googleLocationToTurfLineString} from 'rescape-helpers';


describe('LocationSelector', () => {

  test('resolveGeoLocationTask with lat/lon', done => {
    const location = {
      id: 1,
      latitude: 47,
      longitude: 1
    };
    // Resolves synchronously, but returns a Task nevertheless
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(response => {
        expect(response).toEqual([47, 1]);
        done();
      }).mapError(reject => {
        throw new Error(reject);
      })
    });
  });


  test('resolveGeoLocationTask with 2 intersections', done => {
    const location = {
      id: 1,
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point',
      locations: [
        ['Grand Ave', 'Bay Pl'],
        ['Grand Ave', 'Harrison St']
      ],
    };
    // Resolves synchronously, but returns a Task nevertheless
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(response => {
        expect(response).toEqual([47, 1]);
        done();
      }).mapError(reject => {
        throw new Error(reject);
      })
    });
  });

  test('resolveGeoLocationFromApi', (done) => {
    // Goes to the api to resolve
    // Resolves synchronously
    const location = {
      id: 1,
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point',
      locations: [
        ['Grand Ave', 'Bay Pl'],
        ['Grand Ave', 'Harrison St']
      ]
    };
    // Resolves asynchronously
    const theLocation = R.unless(R.has('intersections'), locationWithIntersections)(location);
    resolveGeoLocationTask(theLocation).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(
        response => {
          expect(turfPointToLocation(response)).toEqual([37.8109508, -122.2616811]);
          done();
        }
      ).mapError(
        error => {
          throw new Error(error);
        },
      )
    });
  }, 2000);

  test('resolveGeojsonFromApi', (done) => {
    // Goes to the api to resolve
    // Resolves synchronously
    const location = {
      id: 1,
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point',
      locations: [
        ['Grand Ave', 'Bay Pl'],
        ['Grand Ave', 'Harrison St']
      ]
    };
    // Resolves asynchronously
    resolveGeojsonTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(
        response => {
          expect(reqStrPathThrowing('geometry.coordinates', response)).toEqual([
            [-122.2604457, 37.8105194],
            [-122.2622932, 37.8109488]
          ]);
          done();
        }
      ).mapError(error => {
          throw new Error(error);
        }
      )
    });
  }, 20000)

});
