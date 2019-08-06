import {queryLocationForOsmBlockResultsTask, getFeaturesOfBlock} from './overpassBlocks';
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

describe('overpassBlocks', () => {

  test('getFeaturesOfBlockOakland', () => {
    const wayFeatures = [
      {
        "type": "Feature",
        "geometry": {
          "type": "LineString",
          "coordinates": [[-122.2580835, 37.8092141], [-122.257981, 37.8091867], [-122.2577852, 37.8091401], [-122.2575979, 37.8091048], [-122.257577, 37.8091017], [-122.2574704, 37.8090861], [-122.2574204, 37.8090787], [-122.2573292, 37.8090675], [-122.2572367, 37.8090558]]
        },
        "id": "way/219356290"
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "LineString",
          "coordinates": [[-122.2561562, 37.8089674], [-122.2560488, 37.8089587], [-122.2554333, 37.8089066]]
        },
        "id": "way/416168249"
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "LineString",
          "coordinates": [[-122.2572367, 37.8090558], [-122.2571472, 37.8090462], [-122.2568482, 37.8090196]]
        },
        "id": "way/417728789"
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "LineString",
          "coordinates": [[-122.2568482, 37.8090196], [-122.2565037, 37.8089952], [-122.2562804, 37.8089775], [-122.2561562, 37.8089674]]
        },
        "id": "way/417728790"
      }
    ];
    const nodeFeatures = [
      {
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [
            -122.2561562,
            37.8089674
          ]
        },
        "id": "node/53049873"
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [
            -122.2572367,
            37.8090558
          ]
        },
        "id": "node/53119610"
      }
    ];
    const features = getFeaturesOfBlock(wayFeatures, nodeFeatures);
    // Expect only 2 way features between the block
    expect(R.length(R.prop('ways', features))).toEqual(2);
  });

  test('getFeaturesOfBlockOslo', () => {
    const wayFeatures = [
      {
        "type": "Feature",
        "id": "way/5089101",
        "geometry": {
          "type": "LineString",
          "coordinates": [[10.741472, 59.909751], [10.7408729, 59.9091401], [10.7406481, 59.9089025],
            [10.7401699, 59.9084086]]
        }
      },
      {
        "type": "Feature",
        "id": "way/35356123",
        "geometry": {
          "type": "LineString",
          "coordinates": [[10.7382301, 59.9050395], [10.73823, 59.9051366], [10.7382295, 59.9057173],
            [10.7382682, 59.9061974], [10.738318, 59.9063885], [10.7383382, 59.9064661],
            [10.7384607, 59.9067405], [10.7387876, 59.907108], [10.7394072, 59.9077427],
            [10.7398879, 59.9082376], [10.7399744, 59.9083267], [10.7401699, 59.9084086]]
        }
      }
    ];
    const nodeFeatures = [
      {
        "type": "Feature",
        "id": "node/79565",
        "geometry": {
          "type": "Point",
          "coordinates": [10.7401699, 59.9084086]
        }
      },
      {
        "type": "Feature",
        "id": "node/26630363",
        "geometry": {
          "type": "Point",
          "coordinates": [10.7406481, 59.9089025]
        }
      }
    ];
    const features = getFeaturesOfBlock(wayFeatures, nodeFeatures);
    // Expect only one feature between the block
    expect(R.length(R.prop('ways', features))).toEqual(1);
    // Expect the feature is sliced down two 2 points
    expect(R.length(reqStrPathThrowing('ways.0.geometry.coordinates', features))).toEqual(2);
  });

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

