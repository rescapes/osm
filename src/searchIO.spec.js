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
import {nominatimTask, mapboxGeocodeTask} from './searchIO';
import {defaultRunConfig, removeDuplicateObjectsByProp} from 'rescape-ramda';
import * as R from 'ramda';

describe('searchIO', () => {
  test('something', () => {
  });

  test('nominatimTask', done => {
    nominatimTask({country: 'USA', state: 'New York', city: 'New York City'}).run().listen(defaultRunConfig(
      {
        onResolved:
          result => result.map(value => {
            expect(
              R.props(['osm_id', 'osm_type'], value)
            ).toEqual(
              ['175905', 'relation']
            );
            done();
          })
      })
    );
  }, 100000);

  test('nominatimTaskNoState', done => {
    nominatimTask({country: 'Norway', city: 'Stavanger'}).run().listen(defaultRunConfig(
      {
        onResolved:
          result => result.map(value => {
            expect(
              R.props(['osm_id', 'osm_type'], value)
            ).toEqual(
              ['384615', 'relation']
            );
            done();
          })
      })
    );
  }, 100000);

  test('mapboxGeocodeTask', done => {
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
      })
    );
  });
});

