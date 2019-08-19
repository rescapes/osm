/**
 * Created by Andy Likuski on 2017.04.03
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */


const {
  PARIS_BOUNDS,
  LA_BOUNDS,
  PARIS_SAMPLE,
  LA_SAMPLE,
  FERNIE_NODES,
  FERNIE_WAYS
} = require('../src/samples/queryOverpass.sample');
const {fromJS, Map} = require('immutable');

// Use Map for equality matching of keys
const responses = Map([
  [fromJS(PARIS_BOUNDS), PARIS_SAMPLE],
  [fromJS(LA_BOUNDS), LA_SAMPLE],
  [fromJS({
    "type": "way",
    "country": "Canada",
    "state": "BC",
    "city": "Fernie",
    "bbox": [
      49.4749668,
      -115.0907209,
      49.5284394,
      -115.0326362
    ],
    "osmId": 2221420,
    "placeId": 198308070
  }), FERNIE_WAYS],
  [fromJS({
    "type": "node",
    "country": "Canada",
    "state": "BC",
    "city": "Fernie",
    "bbox": [
      49.4749668,
      -115.0907209,
      49.5284394,
      -115.0326362
    ],
    "osmId": 2221420,
    "placeId": 198308070
  }), FERNIE_NODES]
]);
const getResponse = (json) => responses.get(fromJS(json));

/**
 * Mocks the query_overpass method,
 * accepting an extra options.bounds argument to save parsing the bounds from the query
 * @param query
 * @param cb
 * @param options
 * @param options.testMockJsonToKey Required for testing
 * @return {Promise}
 */
module.exports = (query, cb, options) => {
  const response = getResponse(options.testMockJsonToKey);
  process.nextTick(
    () => response ?
      cb(undefined, response) :
      cb({
        message: "Bounds don't match any mock response",
        statusCode: 404
      })
  );
};
