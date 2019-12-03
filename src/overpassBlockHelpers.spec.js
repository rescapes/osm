/**
 * Created by Andy Likuski on 2019.08.14
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {reqStrPathThrowing, defaultRunToResultConfig} from 'rescape-ramda';
import * as R from 'ramda';
import {getFeaturesOfBlock, nodesAndInteresectionNodesByWayIdResultTask} from './overpassBlockHelpers';


describe('overpassBlockHelpers', () => {

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

  test('nodesOfWaysTask', done => {
    const errors = [];
    expect.assertions(1);
    nodesAndInteresectionNodesByWayIdResultTask(
      {
        country: 'Canada',
        state: 'BC',
        city: 'Fernie'
      },
      {
        way: {
          response: {
            "features": [
              {
                "type": "Feature",
                "properties": {
                  "@id": "way/498142930",
                  "highway": "track"
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      -115.0482484,
                      49.516364
                    ],
                    [
                      -115.0483759,
                      49.5164119
                    ],
                    [
                      -115.0486471,
                      49.5163319
                    ],
                    [
                      -115.0491092,
                      49.5162759
                    ],
                    [
                      -115.0497378,
                      49.5160359
                    ],
                    [
                      -115.0502923,
                      49.5158919
                    ],
                    [
                      -115.0505573,
                      49.5156958
                    ],
                    [
                      -115.0509578,
                      49.5155118
                    ],
                    [
                      -115.0511181,
                      49.5153238
                    ],
                    [
                      -115.0518021,
                      49.5150277
                    ],
                    [
                      -115.0523505,
                      49.5148477
                    ]
                  ]
                },
                "id": "way/498142930"
              }
            ]
          }
        }
      }).run().listen(defaultRunToResultConfig({
        onResolved: response => {
          // Expect it to be two ways
          expect(
            reqStrPathThrowing('nodesByWayId', response)
          ).toEqual({
            "way/498142930": {
              "query": "\n    way(id:498142930)[area = \"yes\"]->.matchingAreaWay;\n    way(id:498142930)[area != \"yes\"]->.matchingWay;\n    // Find nodes within 10 meters of the node for ways with area==\"yes\" and ways containing the node otherwise\n    (node(around.w.matchingAreaWay:10)[\"traffic_signals\" != \"signal\"];\n    node(w.matchingWay)[\"traffic_signals\" != \"signal\"];\n    )->.matchingNodes;\n    .matchingNodes out geom;\n  ",
              "response": {
                "type": "FeatureCollection",
                "features": [
                  {
                    "type": "Feature",
                    "id": "node/249511565",
                    "properties": {
                      "type": "node",
                      "id": 249511565,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0482484,
                        49.516364
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277336",
                    "properties": {
                      "type": "node",
                      "id": 4896277336,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0483759,
                        49.5164119
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277337",
                    "properties": {
                      "type": "node",
                      "id": 4896277337,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0486471,
                        49.5163319
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277338",
                    "properties": {
                      "type": "node",
                      "id": 4896277338,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0491092,
                        49.5162759
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277339",
                    "properties": {
                      "type": "node",
                      "id": 4896277339,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0497378,
                        49.5160359
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277340",
                    "properties": {
                      "type": "node",
                      "id": 4896277340,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0502923,
                        49.5158919
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277341",
                    "properties": {
                      "type": "node",
                      "id": 4896277341,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0505573,
                        49.5156958
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277342",
                    "properties": {
                      "type": "node",
                      "id": 4896277342,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0509578,
                        49.5155118
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277343",
                    "properties": {
                      "type": "node",
                      "id": 4896277343,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0511181,
                        49.5153238
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277344",
                    "properties": {
                      "type": "node",
                      "id": 4896277344,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0518021,
                        49.5150277
                      ]
                    }
                  },
                  {
                    "type": "Feature",
                    "id": "node/4896277345",
                    "properties": {
                      "type": "node",
                      "id": 4896277345,
                      "tags": {},
                      "relations": [],
                      "meta": {}
                    },
                    "geometry": {
                      "type": "Point",
                      "coordinates": [
                        -115.0523505,
                        49.5148477
                      ]
                    }
                  }
                ]
              }
            }
          });
          done();
        }
      }, errors, done)
    );
  }, 50000);
});