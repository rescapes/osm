import {queryLocationForOsmBlockResultsTask} from './overpassSingleBlock';
import {defaultRunToResultConfig, reqStrPathThrowing} from 'rescape-ramda';
import * as R from 'ramda';

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


// TODO no mock data ready. It can be added to samples/queryOverpass and __mocks__/query-overpass
jest.unmock('query-overpass');

describe('overpassBlocks', () => {

  test('fetchLatLonOnyLocation', done => {
    const errors = [];
    expect.assertions(3);
    queryLocationForOsmBlockResultsTask({
      intersections: ['40.6660816,-73.8057879', '40.66528,-73.80604']
    }).run().listen(defaultRunToResultConfig(
      {
        onResolved: ({results, location}) => {
          // Expect it to be two ways
          expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/5707230']);
          expect(R.map(R.prop('id'), R.prop('nodes', results))).toEqual(['node/42875319', 'node/42901997']);
          // Expect our intersection names
          expect(reqStrPathThrowing('intersections', results)).toEqual({
            "node/42875319": [
              "134th Street",
              "South Conduit Avenue"
            ],
            "node/42901997": [
              "134th Street",
              "149th Avenue"
            ]
          });
        }
      }, errors, done));
  }, 20000);

  test('fetchLatLonOnyLocationForPedestrianArea', done => {
    // This is where the block is a pedestrian area, not a simple line.
    const errors = [];
    expect.assertions(3);
    queryLocationForOsmBlockResultsTask({
      intersections: ['59.952305, 11.047053', '59.952248, 11.045588']
    }).run().listen(defaultRunToResultConfig(
      {
        onResolved: ({results, location}) => {
          // Expect it to be two ways
          expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/570781859']);
          expect(R.map(R.prop('id'), R.prop('nodes', results))).toEqual(['node/706705268', 'node/1287797787']);
          // Expect our intersection names
          expect(reqStrPathThrowing('intersections', results)).toEqual({
            "node/706705268": [
              "Tærudgata",
              "way/570781859"
            ],
            "node/1287797787": [
              "way/570781859",
              "way/703449786"
            ]
          });
        }
      }, errors, done));
  }, 50000);

  /*
  test('getFeaturesOfBlock', done => {
    // Weird case where on way is a loop
    // I don't know how to handle this but I don't want it to err
    const features = getFeaturesOfBlock(
      [
        {
          "type": "Feature",
          "id": "way/101143037",
          "properties": {
            "type": "way",
            "id": 101143037,
            "tags": {
              "highway": "residential",
              "name": "Oriental Boulevard"
            },
            "relations": [],
            "meta": {}
          },
          "geometry": {
            "type": "LineString",
            "coordinates": [
              [
                -73.9340603,
                40.5785096
              ],
              [
                -73.935648,
                40.5784685
              ],
              [
                -73.9357333,
                40.5784663
              ]
            ]
          },
          "__reversed__": true
        },
        {
          "type": "Feature",
          "id": "way/101144614",
          "properties": {
            "type": "way",
            "id": 101144614,
            "tags": {
              "highway": "tertiary",
              "name": "Oriental Boulevard",
              "oneway": "yes"
            },
            "relations": [],
            "meta": {}
          },
          "geometry": {
            "type": "LineString",
            "coordinates": [
              [
                -73.9357333,
                40.5784663
              ],
              [
                -73.9357655,
                40.5785193
              ],
              [
                -73.9358191,
                40.578556
              ],
              [
                -73.9358932,
                40.5785762
              ],
              [
                -73.9360391,
                40.5785804
              ],
              [
                -73.9361571,
                40.5785573
              ],
              [
                -73.9362107,
                40.5785234
              ],
              [
                -73.9362269,
                40.578485
              ],
              [
                -73.9362268,
                40.5784011
              ],
              [
                -73.9361903,
                40.5783516
              ],
              [
                -73.9361034,
                40.5783214
              ],
              [
                -73.9359001,
                40.5783225
              ],
              [
                -73.9358161,
                40.5783407
              ],
              [
                -73.9357494,
                40.578393
              ],
              [
                -73.9357333,
                40.5784663
              ]
            ]
          }
        }
      ],
      [
        {
          "type": "Feature",
          "id": "node/1167626042",
          "properties": {
            "type": "node",
            "id": 1167626042,
            "tags": {},
            "relations": [],
            "meta": {}
          },
          "geometry": {
            "type": "Point",
            "coordinates": [
              -73.9357333,
              40.5784663
            ]
          }
        },
        {
          "type": "Feature",
          "id": "node/1167626042",
          "properties": {
            "type": "node",
            "id": 1167626042,
            "tags": {},
            "relations": [],
            "meta": {}
          },
          "geometry": {
            "type": "Point",
            "coordinates": [
              -73.9357333,
              40.5784663
            ]
          }
        }
      ]
    );
    expect(R.length(R.prop('ways', features))).toEqual(0);
  });
   */


});

