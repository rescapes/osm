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

const _unmocked = require('../node_modules/query-overpass')
import {loggers} from 'rescape-log';
const log = loggers.get('rescapeDefault');
const {
  LILLESTROM_PEDESTRIAN_AREA_NODES,
  LILLESTROM_PEDESTRIAN_AREA_WAYS,
  LILLESTROM_PEDESTRIAN_AREA_WAYS_OF_NODE_1287797787,
  LILLESTROM_PEDESTRIAN_AREA_WAYS_OF_NODE_706705268,
  QUEENS_NODES,
  QUEENS_WAYS,
  QUEENS_WAYS_OF_NODE_42875319, QUEENS_WAYS_OF_NODE_42901997,
  PARIS_BOUNDS,
  LA_BOUNDS,
  PARIS_SAMPLE,
  LA_SAMPLE,
  FERNIE_NODES,
  FERNIE_WAYS,
} = require('../src/samples/queryOverpass.sample');
const {
  flattenObj
} = require('rescape-ramda');

const R = require('ramda');


// Use Map for equality matching of keys
const responses = R.map(
  R.over(
    R.lensIndex(0),
    flattenObj
  ),
  [
    [PARIS_BOUNDS, PARIS_SAMPLE],
    [LA_BOUNDS, LA_SAMPLE],
    [{
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
    }, FERNIE_WAYS],
    [{
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
    }, FERNIE_NODES],
    [{
      "type": "way",
      "googleIntersectionObjs":
        [
          {
            "intersection": "40.6660816,-73.8057879"
          },
          {
            "intersection": "40.66528,-73.80604"
          }
        ]
    }, QUEENS_WAYS],
    [{
      "type": "node",
      "googleIntersectionObjs":
        [
          {
            "intersection": "40.6660816,-73.8057879"
          },
          {
            "intersection": "40.66528,-73.80604"
          }
        ]
    }, QUEENS_NODES],
    [{
      "nodeId": "node/42901997",
      "type": "waysOfNode"
    }, QUEENS_WAYS_OF_NODE_42901997],
    [{
      "nodeId": "node/42875319",
      "type": "waysOfNode"
    }, QUEENS_WAYS_OF_NODE_42875319],
    [{
      "type": "way",
      "googleIntersectionObjs": [
        {
          "intersection": "59.952305, 11.047053"
        },
        {
          "intersection": "59.952248, 11.045588"
        }
      ]
    }, LILLESTROM_PEDESTRIAN_AREA_WAYS],
    [{
      "type": "node",
      "googleIntersectionObjs":
        [
          {
            "intersection": "59.952305, 11.047053"
          },
          {
            "intersection": "59.952248, 11.045588"
          }
        ]
    }, LILLESTROM_PEDESTRIAN_AREA_NODES],
    [{
      "nodeId": "node/706705268",
      "type": "waysOfNode"
    }, LILLESTROM_PEDESTRIAN_AREA_WAYS_OF_NODE_706705268],
    [{
      "nodeId": "node/1287797787",
      "type": "waysOfNode"
    }, LILLESTROM_PEDESTRIAN_AREA_WAYS_OF_NODE_1287797787],
  ]
);

/**
 * Looks at the response pairs trying to match the incoming request context with the
 * flatted first item of one of the pairs
 * @param {Object} mockRequestContext Must fully match one of the items in responses.
 * It can have additional items as well but they will be ignored
 */
const getResponse = (mockRequestContext) => {
  const flatMockRequestContext = flattenObj(mockRequestContext);
  const found = R.find(
    ([match]) => {
      const flatJsonKeys = R.keys(match);
      return R.equals(match, R.pick(flatJsonKeys, flatMockRequestContext));
    },
    responses
  );
  if (found) {
    return R.last(found);
  } else {
    log.warn(`Problem with the unit test. query-overpass request flattend to ${JSON.stringify(flatMockRequestContext)} didn't match any responses. Will query server. Record the output and add it to responses in the query-overpass.js mock`)
    return null;
  }
};

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
  // We can't mock nodesOfWay queries, there are too many
  if (R.propEq('type', 'nodesOfWay', options.testMockJsonToKey)) {
    return _unmocked(query, cb, options);
  }
  const response = getResponse(options.testMockJsonToKey);
  // If our mock doesn't have the right data it gives a warning and we query for real
  if (!response) {
    return _unmocked(query, cb, options)
  }
  process.nextTick(
    () => response ?
      cb(undefined, response) :
      cb({
        message: "Bounds don't match any mock response",
        statusCode: 404
      })
  );
};
