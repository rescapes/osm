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

import {fetchOsm, osmAlways, osmNotEqual, fetchOsmRawTask, queryLocation, sortFeatures} from './overpassIO';
import {defaultRunConfig, removeDuplicateObjectsByProp, reqStrPathThrowing} from 'rescape-ramda';
import {LA_SAMPLE, LA_BOUNDS} from './queryOverpass.sample';
import * as R from 'ramda';

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
        onResolved: responseResult => responseResult.map(
          response => {
            // Expect it to be two ways
            expect(R.map(R.prop('id'), R.prop('ways', response))).toEqual(['way/5089101']);
            done();
          }
        )
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

describe('otherOverpassHelpers', () => {

  test('sortFeatures', () => {
    const wayFeatures = [
      {
        "type": "Feature",
        "id": "way/5089101",
        "geometry": {
          "type": "LineString",
          "coordinates": [ [ 10.741472, 59.909751 ], [ 10.7408729, 59.9091401 ], [ 10.7406481, 59.9089025 ],
            [ 10.7401699, 59.9084086 ] ]
        }
      },
      {
        "type": "Feature",
        "id": "way/35356123",
        "geometry": {
          "type": "LineString",
          "coordinates": [ [ 10.7382301, 59.9050395 ], [ 10.73823, 59.9051366 ], [ 10.7382295, 59.9057173 ],
            [ 10.7382682, 59.9061974 ], [ 10.738318, 59.9063885 ], [ 10.7383382, 59.9064661 ],
            [ 10.7384607, 59.9067405 ], [ 10.7387876, 59.907108 ], [ 10.7394072, 59.9077427 ],
            [ 10.7398879, 59.9082376 ], [ 10.7399744, 59.9083267 ], [ 10.7401699, 59.9084086 ] ]
        }
      }
    ];
    const nodeFeatures = [
      {
        "type": "Feature",
        "id": "node/79565",
        "geometry": {
          "type": "Point",
          "coordinates": [ 10.7401699, 59.9084086 ]
        }
      },
      {
        "type": "Feature",
        "id": "node/26630363",
        "geometry": {
          "type": "Point",
          "coordinates": [ 10.7406481, 59.9089025 ]
        }
      }
    ];
    const features = sortFeatures(wayFeatures, nodeFeatures);
    // Expect only one feature between the block
    expect(R.length(features)).toEqual(1)
    // Expect the feature is sliced down two 2 points
    expect(R.length(reqStrPathThrowing('0.geometry.coordinates', features))).toEqual(2)
  });
});
