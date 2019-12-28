/**
 * Created by Andy Likuski on 2017.06.19
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {
  nominatimResultTask,
  mapboxGeocodeTask,
  nominatimReverseGeocodeResultTask,
  nominatimReverseGeocodeToLocationResultTask
} from './nominatimLocationSearch';
import {defaultRunConfig, defaultRunToResultConfig, removeDuplicateObjectsByProp} from 'rescape-ramda';
import * as R from 'ramda';
import {rejected} from 'folktale/concurrency/task';

describe('search', () => {
  test('nominatimResultTaskRelation', done => {
    const errors = [];
    nominatimResultTask({country: 'USA', state: 'New York', city: 'New York City'}).orElse(reason => {
      // Our task reject handler takes the reason and pushes it too, then rejects again
      errors.push(reason);
      // This reason is the error that goes to defaultOnRejected
      return rejected(reason);
    }).run().listen(defaultRunToResultConfig(
      {
        onResolved:
          value => {
            expect(
              R.props(['osm_id', 'osm_type'], value)
            ).toEqual(
              [175905, 'relation']
            );
          }
      }, errors, done)
    );
  }, 100000);

  test('nominatimResultTaskBlockname', done => {
    const errors = [];
    nominatimResultTask({
      country: 'USA',
      state: 'New York',
      city: 'New York City',
      neighborhood: 'Battery Park City',
      blockname: '1st Place'
    }).orElse(reason => {
      // Our task reject handler takes the reason and pushes it too, then rejects again
      errors.push(reason);
      // This reason is the error that goes to defaultOnRejected
      return rejected(reason);
    }).run().listen(defaultRunToResultConfig(
      {
        onResolved:
          value => {
            expect(
              R.props(['osm_id', 'osm_type'], value)
            ).toEqual(
              [22927946, 'way']
            );
          }
      }, errors, done)
    );
  }, 100000);

  test('nominatimResultTaskPoint', done => {
    const errors = [];
    nominatimResultTask({country: 'Canada', state: 'Alberta', city: 'Cowley'}).run().listen(defaultRunToResultConfig(
      {
        onResolved:
          value => {
            expect(
              R.props(['osm_id', 'osm_type'], value)
            ).toEqual(
              [51971222, 'noder']
            );
          }
      }, errors, done)
    );
  }, 100000);expect.assertions(1);

  test('nominatimTaskNoState', done => {
    expect.assertions(1);
    const errors = [];
    nominatimResultTask({country: 'Norway', city: 'Stavanger'}).orElse(reason => {
      // Our task reject handler takes the reason and pushes it too, then rejects again
      errors.push(reason);
      // This reason is the error that goes to defaultOnRejected
      return rejected(reason);
    }).run().listen(defaultRunConfig(
      {
        onResolved:
          result => result.map(value => {
            expect(
              R.props(['osm_id', 'osm_type'], value)
            ).toEqual(
              [384615, 'relation']
            );
          })
      }, errors, done)
    );
  }, 100000);

  test('reverseGeocode', done => {
    expect.assertions(1);
    const errors = [];
    nominatimReverseGeocodeResultTask({lon: -74.010865, lat: 40.7071407}).orElse(reason => {
      // Our task reject handler takes the reason and pushes it too, then rejects again
      errors.push(reason);
      // This reason is the error that goes to defaultOnRejected
      return rejected(reason);
    }).run().listen(defaultRunToResultConfig({
        onResolved: obj => {
          expect(obj.placeId).toEqual(140177219);
        }
      },
      errors,
      done
    ));
  }, 100000);

  test('reverseGeocodeCity', done => {
    expect.assertions(1);
    const errors = [];
    nominatimReverseGeocodeToLocationResultTask({lat: 49.465806, lon: -114.192326}).orElse(reason => {
      // Our task reject handler takes the reason and pushes it too, then rejects again
      errors.push(reason);
      // This reason is the error that goes to defaultOnRejected
      return rejected(reason);
    }).run().listen(defaultRunToResultConfig({
        onResolved: obj => {
          expect(obj.placeId).toEqual(141621428);
        }
      },
      errors,
      done
    ));
  }, 100000);

  test('mapboxGeocodeTask', () => {
    const errors = []
    expect.assertions(1);
    const mapboxApiKey = 'pk.eyJ1IjoiY2Fsb2NhbiIsImEiOiJjaXl1aXkxZjkwMG15MndxbmkxMHczNG50In0.07Zu3XXYijL6GJMuxFtvQg';

    mapboxGeocodeTask(
      mapboxApiKey,
      'Industrigata 36, 0357 Oslo, Norway'
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          result => {
            expect(
              result.features[0].id
            ).toEqual(
              'address.8977678114831560'
            );
            done();
          }
      }, errors, done)
    );
  });
});

