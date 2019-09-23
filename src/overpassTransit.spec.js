import {LA_BOUNDS, LA_SAMPLE} from './samples/queryOverpass.sample';
import {osmAlways, osmNotEqual} from './overpassHelpers';
import {defaultRunConfig, removeDuplicateObjectsByProp} from 'rescape-ramda';
import {fetchTransitOsm} from './overpassTransit';

/**
 * Created by Andy Likuski on 2019.06.14
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

jest.mock('query-overpass');
const conditions = [
  osmAlways("railway"),
  osmNotEqual("service", "siding"),
  osmNotEqual("service", "spur")
];

const types = [
  'node', 'way', 'relation'
];

describe('overpassTransit', () => {
  const bounds = LA_BOUNDS;
  test('fetchTransitOsm', done => {
    expect.assertions(1);
    const errors = [];
    // Pass bounds in the options. Our mock query-overpass uses is to avoid parsing the query
    fetchTransitOsm(
      {
        // Used by the mock
        testMockJsonToKey: bounds
      },
      {bounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            expect(response).toEqual(LA_SAMPLE);
          }
      }, errors, done)
    );
  });

  test('fetchTransitOsm in cells', done => {
    expect.assertions(1);
    const errors = [];
    fetchTransitOsm(
      {
        cellSize: 200,
        // Used by the mock
        testMockJsonToKey: bounds
      },
      {bounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            // the sample can have duplicate ids
            expect(response.features).toEqual(removeDuplicateObjectsByProp('id', LA_SAMPLE.features));
          }
      }, errors, done)
    );
  });
});
