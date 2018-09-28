/**
 * Created by Andy Likuski on 2017.04.03
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {fetchOsm, osmAlways, osmNotEqual, fetchOsmRawTask, queryLocation} from './overpassIO';
import {defaultRunConfig, removeDuplicateObjectsByProp} from 'rescape-ramda';
import {LA_SAMPLE, LA_BOUNDS} from './queryOverpass.sample';
import {nominatimTask} from './searchIO';
import {of} from 'folktale/concurrency/task';
import * as R from 'ramda';
import {fullStreetNamesOfLocationTask} from './googleLocation';

const mock = false;
jest.unmock('query-overpass');
//jest.mock('query-overpass');


const conditions = [
  osmAlways("railway"),
  osmNotEqual("service", "siding"),
  osmNotEqual("service", "spur")
];
const types = [
  'node', 'way', 'relation'
];

// requires are used below since the jest includes aren't available at compile time
describe('overpassHelpersUnmocked', () => {
  if (mock) {
    return;
  }
  const realBounds = [-118.24031352996826, 34.04298753935195, -118.21018695831297, 34.065209887879476];

  test('unmockedFetchTransit', done => {
    expect.assertions(1);
    // Unmocked integration test
    // We expect over 500 results. I'll leave it fuzzy in case the source dataset changes
    fetchOsm(
      {},
      {bounds: realBounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            expect(response.features.length).toBeGreaterThan(500);
            done();
          }
      }
    ));
  }, 1000000);

  test('unmockedFetchTransitCelled', done => {
    expect.assertions(1);
    // Wrap the Task in a Promise for jest's sake
    fetchOsm({
        // 1 meter cells!
        cellSize: 1,
        sleepBetweenCalls: 1000
      },
      {bounds: realBounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            expect(response.features.length).toBeGreaterThan(500);
            done();
          }
      }
    ));
  }, 1000000);


  test('fetchOsmOaklandBlock', done => {
    expect.assertions(1);
    queryLocation({
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      // Intentionally put Grand Ave a different positions
      intersections: [['Grand Ave', 'Perkins St'], ['Lee St', 'Grand Ave']]
    }).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            // Expect it to be two ways
            expect(R.map(R.prop('id'), response)).toEqual(['way/417728789', 'way/417728790']);
            done();
          }
      }));
  }, 1000000);

  test('fetchOsmBlockOslo', done => {
    expect.assertions(1);
    queryLocation({
      country: 'Norway',
      city: 'Oslo',
      neighborhood: 'Sentrum',
      intersections: [['Kongens gate', 'Myntgata'], ['Kongens gate', 'Revierstredet']]
    }).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            // Expect it to be two ways
            expect(R.map(R.prop('id'), response)).toEqual(['way/417728789', 'way/417728790']);
            done();
          }
      }));
  }, 1000000);
});

describe('overpassHelpers', () => {
  if (!mock) {
    return;
  }

  const bounds = LA_BOUNDS;
  test('fetchOsm', done => {
    expect.assertions(1);
    // Pass bounds in the options. Our mock query-overpass uses is to avoid parsing the query
    fetchOsm(
      {
        // Used by the mock
        testBounds: bounds
      },
      {bounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            expect(response).toEqual(LA_SAMPLE);
            done();
          }
      })
    );
  });

  test('fetchOsm in cells', done => {
    expect.assertions(1);
    fetchOsm(
      {
        cellSize: 200,
        // Used by the mock
        testBounds: bounds
      },
      {bounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            // the sample can have duplicate ids
            expect(response.features).toEqual(removeDuplicateObjectsByProp('id', LA_SAMPLE.features));
            done();
          }
      })
    );
  });
});
