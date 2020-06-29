import * as R from 'ramda';
import {composeWithChain, defaultRunConfig, defaultRunToResultConfig, traverseReduce} from 'rescape-ramda';
import {
  locationToOsmAllBlocksQueryResultsTask,
  locationToOsmAllBlocksThenBufferedMoreBlocksResultsTask
} from './overpassAllBlocks';
import {
  blocksToGeojson,
  blocksWithLengths,
  blockToGeojson,
  locationsToGeojson,
  locationsToGeojsonFileResultTask
} from './overpassBlockHelpers';
import {queryLocationForOsmBlockOrAllResultsTask} from './overpassSingleOrAllBlocks';
import {_recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask} from './overpassBuildBlocks';
import {processParamsFromJsonOrJsToList} from './scripts/scriptHelpers';

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


describe('overpassAllBlocks', () => {
  // This mocks the overall response but has to go to the server to get node dead end queries.
  // There are too many of the latter to bother mocking and they run fast on the server
  test('locationToOsmAllBlocksQueryResultsTask', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'Canada',
      state: 'BC',
      city: 'Fernie'
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toEqual(1030);
        }
      }, errors, done)
    );
  }, 1000000);

  test('smallLocationToOsmAllBlocksQueryResultsTask', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'USA',
      state: 'North Carolina',
      city: 'Durham',
      neighborhood: 'Old North Durham'
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results f this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toEqual(131);
        }
      }, errors, done)
    );
  }, 1000000);

  test('Remove blocks that are too short', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      geojson: {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "properties": {},
            "geometry": {
              "type": "Polygon",
              "coordinates": [
                [
                  [
                    34.791855812072754,
                    31.236389550690053
                  ],
                  [
                    34.793561697006226,
                    31.236389550690053
                  ],
                  [
                    34.793561697006226,
                    31.23777474374497
                  ],
                  [
                    34.791855812072754,
                    31.23777474374497
                  ],
                  [
                    34.791855812072754,
                    31.236389550690053
                  ]
                ]
              ]
            }
          }
        ]
      }
    };
    queryLocationForOsmBlockOrAllResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          blocksWithLengths(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toEqual(16);
        }
      }, errors, done)
    );
  }, 2000000);

  test('Test PointBuffer locations', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: "Feature",
            properties: {
              radius: 100
            },
            geometry: {
              type: "Point",
              coordinates: [
                -80.18231999999999,
                26.098829
              ]
            }
          }
        ]
      }
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toEqual(9);
        }
      }, errors, done)
    );
  }, 1000000);

  test('Test Jurisdiction Point Buffer locations', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'Norway',
      city: 'Oslo',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: "Feature",
            properties: {
              radius: 50,
              jurisdictionCenterPoint: true
            }
          }
        ]
      }
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toEqual(9);
        }
      }, errors, done)
    );
  }, 1000000);

  test('_recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTaskTestLoopCase', done => {
    expect.assertions(1);
    const errors = [];
    const blockContext = {
      "nodeIdToWays": {
        "node/423778205": [
          {
            "type": "Feature",
            "id": "way/219858936",
            "properties": {
              "type": "way",
              "id": 219858936,
              "tags": {
                "highway": "tertiary",
                "oneway": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3548663,
                  43.0624698
                ],
                [
                  141.354914,
                  43.0623093
                ],
                [
                  141.3551373,
                  43.0614186
                ],
                [
                  141.3551655,
                  43.0613066
                ],
                [
                  141.3552131,
                  43.0611175
                ],
                [
                  141.3552897,
                  43.0607852
                ],
                [
                  141.3553333,
                  43.0606009
                ],
                [
                  141.3553629,
                  43.0604666
                ],
                [
                  141.3554786,
                  43.0600025
                ],
                [
                  141.3556005,
                  43.0595267
                ],
                [
                  141.3556278,
                  43.0594204
                ],
                [
                  141.355666,
                  43.0592823
                ],
                [
                  141.3557865,
                  43.0588463
                ],
                [
                  141.3559062,
                  43.0583796
                ],
                [
                  141.3559331,
                  43.0582747
                ],
                [
                  141.3559609,
                  43.0581661
                ],
                [
                  141.3560332,
                  43.0578838
                ],
                [
                  141.356082,
                  43.0576956
                ],
                [
                  141.3561991,
                  43.0572225
                ],
                [
                  141.3562219,
                  43.0571306
                ],
                [
                  141.3562457,
                  43.0570343
                ],
                [
                  141.3563639,
                  43.0565561
                ],
                [
                  141.3564344,
                  43.0562904
                ],
                [
                  141.3564633,
                  43.0561669
                ],
                [
                  141.3564951,
                  43.056016
                ],
                [
                  141.3565284,
                  43.0558758
                ],
                [
                  141.3566451,
                  43.0554067
                ],
                [
                  141.3567645,
                  43.0549304
                ],
                [
                  141.3567862,
                  43.0548376
                ],
                [
                  141.3568162,
                  43.0547138
                ],
                [
                  141.3569331,
                  43.0542608
                ],
                [
                  141.3570485,
                  43.0538043
                ],
                [
                  141.3570771,
                  43.053691
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/758815711",
            "properties": {
              "type": "way",
              "id": 758815711,
              "tags": {
                "highway": "tertiary",
                "name": "大通",
                "name:en": "Odori",
                "name:ja": "大通",
                "name:ja_rm": "Ōdōri",
                "oneway": "yes",
                "source": "Bing"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3519378,
                  43.060859
                ],
                [
                  141.352076,
                  43.0608776
                ],
                [
                  141.3522264,
                  43.0608976
                ],
                [
                  141.3534138,
                  43.0610728
                ],
                [
                  141.3535637,
                  43.061094
                ],
                [
                  141.3537295,
                  43.0611149
                ],
                [
                  141.3543645,
                  43.0611964
                ],
                [
                  141.3549645,
                  43.0612734
                ],
                [
                  141.3551655,
                  43.0613066
                ],
                [
                  141.3553423,
                  43.0613348
                ],
                [
                  141.3566173,
                  43.0615128
                ],
                [
                  141.3567482,
                  43.0615253
                ],
                [
                  141.3568279,
                  43.061526
                ],
                [
                  141.3571024,
                  43.0615596
                ],
                [
                  141.3572071,
                  43.0615544
                ]
              ]
            }
          }
        ],
        "node/3348121417": [
          {
            "type": "Feature",
            "id": "way/480228203",
            "properties": {
              "type": "way",
              "id": 480228203,
              "tags": {
                "highway": "footway"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3537113,
                  43.0609214
                ],
                [
                  141.3550648,
                  43.0610976
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/490556141",
            "properties": {
              "type": "way",
              "id": 490556141,
              "tags": {
                "highway": "footway"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3537113,
                  43.0609214
                ],
                [
                  141.3537507,
                  43.0610008
                ],
                [
                  141.3549947,
                  43.0611592
                ],
                [
                  141.3550101,
                  43.0611612
                ],
                [
                  141.3550396,
                  43.0611487
                ],
                [
                  141.3550535,
                  43.061128
                ],
                [
                  141.3550648,
                  43.0610976
                ]
              ]
            }
          }
        ],
        "node/4732344755": [
          {
            "type": "Feature",
            "id": "way/480228203",
            "properties": {
              "type": "way",
              "id": 480228203,
              "tags": {
                "highway": "footway"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3537113,
                  43.0609214
                ],
                [
                  141.3550648,
                  43.0610976
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/490556141",
            "properties": {
              "type": "way",
              "id": 490556141,
              "tags": {
                "highway": "footway"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3537113,
                  43.0609214
                ],
                [
                  141.3537507,
                  43.0610008
                ],
                [
                  141.3549947,
                  43.0611592
                ],
                [
                  141.3550101,
                  43.0611612
                ],
                [
                  141.3550396,
                  43.0611487
                ],
                [
                  141.3550535,
                  43.061128
                ],
                [
                  141.3550648,
                  43.0610976
                ]
              ]
            }
          }
        ],
        "node/5810824029": [
          {
            "type": "Feature",
            "id": "way/614277426",
            "properties": {
              "type": "way",
              "id": 614277426,
              "tags": {
                "highway": "service"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3546595,
                  43.0617798
                ],
                [
                  141.3542574,
                  43.0617228
                ],
                [
                  141.3542389,
                  43.0616856
                ],
                [
                  141.3543496,
                  43.0612518
                ],
                [
                  141.3543645,
                  43.0611964
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/758815711",
            "properties": {
              "type": "way",
              "id": 758815711,
              "tags": {
                "highway": "tertiary",
                "name": "大通",
                "name:en": "Odori",
                "name:ja": "大通",
                "name:ja_rm": "Ōdōri",
                "oneway": "yes",
                "source": "Bing"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3519378,
                  43.060859
                ],
                [
                  141.352076,
                  43.0608776
                ],
                [
                  141.3522264,
                  43.0608976
                ],
                [
                  141.3534138,
                  43.0610728
                ],
                [
                  141.3535637,
                  43.061094
                ],
                [
                  141.3537295,
                  43.0611149
                ],
                [
                  141.3543645,
                  43.0611964
                ],
                [
                  141.3549645,
                  43.0612734
                ],
                [
                  141.3551655,
                  43.0613066
                ],
                [
                  141.3553423,
                  43.0613348
                ],
                [
                  141.3566173,
                  43.0615128
                ],
                [
                  141.3567482,
                  43.0615253
                ],
                [
                  141.3568279,
                  43.061526
                ],
                [
                  141.3571024,
                  43.0615596
                ],
                [
                  141.3572071,
                  43.0615544
                ]
              ]
            }
          }
        ],
        "node/5909114111": [
          {
            "type": "Feature",
            "id": "way/625872474",
            "properties": {
              "type": "way",
              "id": 625872474,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3552133,
                  43.0608711
                ],
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3550591,
                  43.0614676
                ],
                [
                  141.3550441,
                  43.0615256
                ],
                [
                  141.3549044,
                  43.0620662
                ],
                [
                  141.3547449,
                  43.0626832
                ],
                [
                  141.3547394,
                  43.0627047
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/625873371",
            "properties": {
              "type": "way",
              "id": 625873371,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3547046,
                  43.0613141
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/625873372",
            "properties": {
              "type": "way",
              "id": 625873372,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3554438,
                  43.0614138
                ]
              ]
            }
          }
        ],
        "node/5909110323": [
          {
            "type": "Feature",
            "id": "way/625872474",
            "properties": {
              "type": "way",
              "id": 625872474,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3552133,
                  43.0608711
                ],
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3550591,
                  43.0614676
                ],
                [
                  141.3550441,
                  43.0615256
                ],
                [
                  141.3549044,
                  43.0620662
                ],
                [
                  141.3547449,
                  43.0626832
                ],
                [
                  141.3547394,
                  43.0627047
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/625872475",
            "properties": {
              "type": "way",
              "id": 625872475,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550591,
                  43.0614676
                ],
                [
                  141.3549177,
                  43.0614496
                ],
                [
                  141.3548929,
                  43.0615536
                ]
              ]
            }
          }
        ],
        "node/5909110325": [
          {
            "type": "Feature",
            "id": "way/625872474",
            "properties": {
              "type": "way",
              "id": 625872474,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3552133,
                  43.0608711
                ],
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3550591,
                  43.0614676
                ],
                [
                  141.3550441,
                  43.0615256
                ],
                [
                  141.3549044,
                  43.0620662
                ],
                [
                  141.3547449,
                  43.0626832
                ],
                [
                  141.3547394,
                  43.0627047
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/625872476",
            "properties": {
              "type": "way",
              "id": 625872476,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550441,
                  43.0615256
                ],
                [
                  141.3552916,
                  43.0615617
                ],
                [
                  141.3552634,
                  43.0616667
                ]
              ]
            }
          }
        ]
      },
      "wayIdToNodes": {
        "way/219858936": [
          {
            "type": "Feature",
            "id": "node/423778205",
            "properties": {
              "type": "node",
              "id": 423778205,
              "tags": {
                "highway": "traffic_signals"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3551655,
                43.0613066
              ]
            }
          }
        ],
        "way/480228203": [
          {
            "type": "Feature",
            "id": "node/3348121417",
            "properties": {
              "type": "node",
              "id": 3348121417,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3537113,
                43.0609214
              ]
            }
          },
          {
            "type": "Feature",
            "id": "node/4732344755",
            "properties": {
              "type": "node",
              "id": 4732344755,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550648,
                43.0610976
              ]
            }
          }
        ],
        "way/490556141": [
          {
            "type": "Feature",
            "id": "node/3348121417",
            "properties": {
              "type": "node",
              "id": 3348121417,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3537113,
                43.0609214
              ]
            }
          },
          {
            "type": "Feature",
            "id": "node/4732344755",
            "properties": {
              "type": "node",
              "id": 4732344755,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550648,
                43.0610976
              ]
            }
          }
        ],
        "way/614277426": [
          {
            "type": "Feature",
            "id": "node/5810824029",
            "properties": {
              "type": "node",
              "id": 5810824029,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3543645,
                43.0611964
              ]
            }
          }
        ],
        "way/625872474": [
          {
            "type": "Feature",
            "id": "node/5909114111",
            "properties": {
              "type": "node",
              "id": 5909114111,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550845,
                43.0613655
              ]
            }
          },
          {
            "type": "Feature",
            "id": "node/5909110323",
            "properties": {
              "type": "node",
              "id": 5909110323,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550591,
                43.0614676
              ]
            }
          },
          {
            "type": "Feature",
            "id": "node/5909110325",
            "properties": {
              "type": "node",
              "id": 5909110325,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550441,
                43.0615256
              ]
            }
          }
        ],
        "way/625872475": [
          {
            "type": "Feature",
            "id": "node/5909110323",
            "properties": {
              "type": "node",
              "id": 5909110323,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550591,
                43.0614676
              ]
            }
          }
        ],
        "way/625872476": [
          {
            "type": "Feature",
            "id": "node/5909110325",
            "properties": {
              "type": "node",
              "id": 5909110325,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550441,
                43.0615256
              ]
            }
          }
        ],
        "way/625873371": [
          {
            "type": "Feature",
            "id": "node/5909114111",
            "properties": {
              "type": "node",
              "id": 5909114111,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550845,
                43.0613655
              ]
            }
          }
        ],
        "way/625873372": [
          {
            "type": "Feature",
            "id": "node/5909114111",
            "properties": {
              "type": "node",
              "id": 5909114111,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550845,
                43.0613655
              ]
            }
          }
        ],
        "way/758815711": [
          {
            "type": "Feature",
            "id": "node/5810824029",
            "properties": {
              "type": "node",
              "id": 5810824029,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3543645,
                43.0611964
              ]
            }
          },
          {
            "type": "Feature",
            "id": "node/423778205",
            "properties": {
              "type": "node",
              "id": 423778205,
              "tags": {
                "highway": "traffic_signals"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3551655,
                43.0613066
              ]
            }
          }
        ]
      },
      "wayEndPointToDirectionalWays": {
        "141.3548663:43.0624698": [
          {
            "type": "Feature",
            "id": "way/219858936",
            "properties": {
              "type": "way",
              "id": 219858936,
              "tags": {
                "highway": "tertiary",
                "oneway": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3548663,
                  43.0624698
                ],
                [
                  141.354914,
                  43.0623093
                ],
                [
                  141.3551373,
                  43.0614186
                ],
                [
                  141.3551655,
                  43.0613066
                ],
                [
                  141.3552131,
                  43.0611175
                ],
                [
                  141.3552897,
                  43.0607852
                ],
                [
                  141.3553333,
                  43.0606009
                ],
                [
                  141.3553629,
                  43.0604666
                ],
                [
                  141.3554786,
                  43.0600025
                ],
                [
                  141.3556005,
                  43.0595267
                ],
                [
                  141.3556278,
                  43.0594204
                ],
                [
                  141.355666,
                  43.0592823
                ],
                [
                  141.3557865,
                  43.0588463
                ],
                [
                  141.3559062,
                  43.0583796
                ],
                [
                  141.3559331,
                  43.0582747
                ],
                [
                  141.3559609,
                  43.0581661
                ],
                [
                  141.3560332,
                  43.0578838
                ],
                [
                  141.356082,
                  43.0576956
                ],
                [
                  141.3561991,
                  43.0572225
                ],
                [
                  141.3562219,
                  43.0571306
                ],
                [
                  141.3562457,
                  43.0570343
                ],
                [
                  141.3563639,
                  43.0565561
                ],
                [
                  141.3564344,
                  43.0562904
                ],
                [
                  141.3564633,
                  43.0561669
                ],
                [
                  141.3564951,
                  43.056016
                ],
                [
                  141.3565284,
                  43.0558758
                ],
                [
                  141.3566451,
                  43.0554067
                ],
                [
                  141.3567645,
                  43.0549304
                ],
                [
                  141.3567862,
                  43.0548376
                ],
                [
                  141.3568162,
                  43.0547138
                ],
                [
                  141.3569331,
                  43.0542608
                ],
                [
                  141.3570485,
                  43.0538043
                ],
                [
                  141.3570771,
                  43.053691
                ]
              ]
            }
          }
        ],
        "141.3570771:43.053691": [
          {
            "type": "Feature",
            "id": "way/219858936",
            "properties": {
              "type": "way",
              "id": 219858936,
              "tags": {
                "highway": "tertiary",
                "oneway": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3548663,
                  43.0624698
                ],
                [
                  141.354914,
                  43.0623093
                ],
                [
                  141.3551373,
                  43.0614186
                ],
                [
                  141.3551655,
                  43.0613066
                ],
                [
                  141.3552131,
                  43.0611175
                ],
                [
                  141.3552897,
                  43.0607852
                ],
                [
                  141.3553333,
                  43.0606009
                ],
                [
                  141.3553629,
                  43.0604666
                ],
                [
                  141.3554786,
                  43.0600025
                ],
                [
                  141.3556005,
                  43.0595267
                ],
                [
                  141.3556278,
                  43.0594204
                ],
                [
                  141.355666,
                  43.0592823
                ],
                [
                  141.3557865,
                  43.0588463
                ],
                [
                  141.3559062,
                  43.0583796
                ],
                [
                  141.3559331,
                  43.0582747
                ],
                [
                  141.3559609,
                  43.0581661
                ],
                [
                  141.3560332,
                  43.0578838
                ],
                [
                  141.356082,
                  43.0576956
                ],
                [
                  141.3561991,
                  43.0572225
                ],
                [
                  141.3562219,
                  43.0571306
                ],
                [
                  141.3562457,
                  43.0570343
                ],
                [
                  141.3563639,
                  43.0565561
                ],
                [
                  141.3564344,
                  43.0562904
                ],
                [
                  141.3564633,
                  43.0561669
                ],
                [
                  141.3564951,
                  43.056016
                ],
                [
                  141.3565284,
                  43.0558758
                ],
                [
                  141.3566451,
                  43.0554067
                ],
                [
                  141.3567645,
                  43.0549304
                ],
                [
                  141.3567862,
                  43.0548376
                ],
                [
                  141.3568162,
                  43.0547138
                ],
                [
                  141.3569331,
                  43.0542608
                ],
                [
                  141.3570485,
                  43.0538043
                ],
                [
                  141.3570771,
                  43.053691
                ]
              ]
            }
          }
        ],
        "141.3546595:43.0617798": [
          {
            "type": "Feature",
            "id": "way/614277426",
            "properties": {
              "type": "way",
              "id": 614277426,
              "tags": {
                "highway": "service"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3546595,
                  43.0617798
                ],
                [
                  141.3542574,
                  43.0617228
                ],
                [
                  141.3542389,
                  43.0616856
                ],
                [
                  141.3543496,
                  43.0612518
                ],
                [
                  141.3543645,
                  43.0611964
                ]
              ]
            }
          }
        ],
        "141.3552133:43.0608711": [
          {
            "type": "Feature",
            "id": "way/625872474",
            "properties": {
              "type": "way",
              "id": 625872474,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3552133,
                  43.0608711
                ],
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3550591,
                  43.0614676
                ],
                [
                  141.3550441,
                  43.0615256
                ],
                [
                  141.3549044,
                  43.0620662
                ],
                [
                  141.3547449,
                  43.0626832
                ],
                [
                  141.3547394,
                  43.0627047
                ]
              ]
            }
          }
        ],
        "141.3547394:43.0627047": [
          {
            "type": "Feature",
            "id": "way/625872474",
            "properties": {
              "type": "way",
              "id": 625872474,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3552133,
                  43.0608711
                ],
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3550591,
                  43.0614676
                ],
                [
                  141.3550441,
                  43.0615256
                ],
                [
                  141.3549044,
                  43.0620662
                ],
                [
                  141.3547449,
                  43.0626832
                ],
                [
                  141.3547394,
                  43.0627047
                ]
              ]
            }
          }
        ],
        "141.3548929:43.0615536": [
          {
            "type": "Feature",
            "id": "way/625872475",
            "properties": {
              "type": "way",
              "id": 625872475,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550591,
                  43.0614676
                ],
                [
                  141.3549177,
                  43.0614496
                ],
                [
                  141.3548929,
                  43.0615536
                ]
              ]
            }
          }
        ],
        "141.3552634:43.0616667": [
          {
            "type": "Feature",
            "id": "way/625872476",
            "properties": {
              "type": "way",
              "id": 625872476,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550441,
                  43.0615256
                ],
                [
                  141.3552916,
                  43.0615617
                ],
                [
                  141.3552634,
                  43.0616667
                ]
              ]
            }
          }
        ],
        "141.3547046:43.0613141": [
          {
            "type": "Feature",
            "id": "way/625873371",
            "properties": {
              "type": "way",
              "id": 625873371,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3547046,
                  43.0613141
                ]
              ]
            }
          }
        ],
        "141.3554438:43.0614138": [
          {
            "type": "Feature",
            "id": "way/625873372",
            "properties": {
              "type": "way",
              "id": 625873372,
              "tags": {
                "highway": "footway",
                "layer": "-1",
                "tunnel": "yes"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550845,
                  43.0613655
                ],
                [
                  141.3554438,
                  43.0614138
                ]
              ]
            }
          }
        ],
        "141.3519378:43.060859": [
          {
            "type": "Feature",
            "id": "way/758815711",
            "properties": {
              "type": "way",
              "id": 758815711,
              "tags": {
                "highway": "tertiary",
                "name": "大通",
                "name:en": "Odori",
                "name:ja": "大通",
                "name:ja_rm": "Ōdōri",
                "oneway": "yes",
                "source": "Bing"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3519378,
                  43.060859
                ],
                [
                  141.352076,
                  43.0608776
                ],
                [
                  141.3522264,
                  43.0608976
                ],
                [
                  141.3534138,
                  43.0610728
                ],
                [
                  141.3535637,
                  43.061094
                ],
                [
                  141.3537295,
                  43.0611149
                ],
                [
                  141.3543645,
                  43.0611964
                ],
                [
                  141.3549645,
                  43.0612734
                ],
                [
                  141.3551655,
                  43.0613066
                ],
                [
                  141.3553423,
                  43.0613348
                ],
                [
                  141.3566173,
                  43.0615128
                ],
                [
                  141.3567482,
                  43.0615253
                ],
                [
                  141.3568279,
                  43.061526
                ],
                [
                  141.3571024,
                  43.0615596
                ],
                [
                  141.3572071,
                  43.0615544
                ]
              ]
            }
          }
        ],
        "141.3572071:43.0615544": [
          {
            "type": "Feature",
            "id": "way/758815711",
            "properties": {
              "type": "way",
              "id": 758815711,
              "tags": {
                "highway": "tertiary",
                "name": "大通",
                "name:en": "Odori",
                "name:ja": "大通",
                "name:ja_rm": "Ōdōri",
                "oneway": "yes",
                "source": "Bing"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3519378,
                  43.060859
                ],
                [
                  141.352076,
                  43.0608776
                ],
                [
                  141.3522264,
                  43.0608976
                ],
                [
                  141.3534138,
                  43.0610728
                ],
                [
                  141.3535637,
                  43.061094
                ],
                [
                  141.3537295,
                  43.0611149
                ],
                [
                  141.3543645,
                  43.0611964
                ],
                [
                  141.3549645,
                  43.0612734
                ],
                [
                  141.3551655,
                  43.0613066
                ],
                [
                  141.3553423,
                  43.0613348
                ],
                [
                  141.3566173,
                  43.0615128
                ],
                [
                  141.3567482,
                  43.0615253
                ],
                [
                  141.3568279,
                  43.061526
                ],
                [
                  141.3571024,
                  43.0615596
                ],
                [
                  141.3572071,
                  43.0615544
                ]
              ]
            }
          }
        ]
      },
      "nodeIdToNodePoint": {
        "node/423778205": "141.3551655:43.0613066",
        "node/3348121417": "141.3537113:43.0609214",
        "node/4732344755": "141.3550648:43.0610976",
        "node/5810824029": "141.3543645:43.0611964",
        "node/5909110323": "141.3550591:43.0614676",
        "node/5909110325": "141.3550441:43.0615256",
        "node/5909114111": "141.3550845:43.0613655"
      },
      "hashToPartialBlocks": {
        "{nodes:[], wayPoints:[141.3548663:43.0624698,141.354914:43.0623093,141.3551373:43.0614186,141.3551655:43.0613066]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/219858936",
                "properties": {
                  "type": "way",
                  "id": 219858936,
                  "tags": {
                    "highway": "tertiary",
                    "oneway": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3551655,
                      43.0613066
                    ],
                    [
                      141.3551373,
                      43.0614186
                    ],
                    [
                      141.354914,
                      43.0623093
                    ],
                    [
                      141.3548663,
                      43.0624698
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/423778205",
                "properties": {
                  "type": "node",
                  "id": 423778205,
                  "tags": {
                    "highway": "traffic_signals"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3551655,
                    43.0613066
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3551655:43.0613066,141.3552131:43.0611175,141.3552897:43.0607852,141.3553333:43.0606009,141.3553629:43.0604666,141.3554786:43.0600025,141.3556005:43.0595267,141.3556278:43.0594204,141.355666:43.0592823,141.3557865:43.0588463,141.3559062:43.0583796,141.3559331:43.0582747,141.3559609:43.0581661,141.3560332:43.0578838,141.356082:43.0576956,141.3561991:43.0572225,141.3562219:43.0571306,141.3562457:43.0570343,141.3563639:43.0565561,141.3564344:43.0562904,141.3564633:43.0561669,141.3564951:43.056016,141.3565284:43.0558758,141.3566451:43.0554067,141.3567645:43.0549304,141.3567862:43.0548376,141.3568162:43.0547138,141.3569331:43.0542608,141.3570485:43.0538043,141.3570771:43.053691]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/219858936",
                "properties": {
                  "type": "way",
                  "id": 219858936,
                  "tags": {
                    "highway": "tertiary",
                    "oneway": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3551655,
                      43.0613066
                    ],
                    [
                      141.3552131,
                      43.0611175
                    ],
                    [
                      141.3552897,
                      43.0607852
                    ],
                    [
                      141.3553333,
                      43.0606009
                    ],
                    [
                      141.3553629,
                      43.0604666
                    ],
                    [
                      141.3554786,
                      43.0600025
                    ],
                    [
                      141.3556005,
                      43.0595267
                    ],
                    [
                      141.3556278,
                      43.0594204
                    ],
                    [
                      141.355666,
                      43.0592823
                    ],
                    [
                      141.3557865,
                      43.0588463
                    ],
                    [
                      141.3559062,
                      43.0583796
                    ],
                    [
                      141.3559331,
                      43.0582747
                    ],
                    [
                      141.3559609,
                      43.0581661
                    ],
                    [
                      141.3560332,
                      43.0578838
                    ],
                    [
                      141.356082,
                      43.0576956
                    ],
                    [
                      141.3561991,
                      43.0572225
                    ],
                    [
                      141.3562219,
                      43.0571306
                    ],
                    [
                      141.3562457,
                      43.0570343
                    ],
                    [
                      141.3563639,
                      43.0565561
                    ],
                    [
                      141.3564344,
                      43.0562904
                    ],
                    [
                      141.3564633,
                      43.0561669
                    ],
                    [
                      141.3564951,
                      43.056016
                    ],
                    [
                      141.3565284,
                      43.0558758
                    ],
                    [
                      141.3566451,
                      43.0554067
                    ],
                    [
                      141.3567645,
                      43.0549304
                    ],
                    [
                      141.3567862,
                      43.0548376
                    ],
                    [
                      141.3568162,
                      43.0547138
                    ],
                    [
                      141.3569331,
                      43.0542608
                    ],
                    [
                      141.3570485,
                      43.0538043
                    ],
                    [
                      141.3570771,
                      43.053691
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/423778205",
                "properties": {
                  "type": "node",
                  "id": 423778205,
                  "tags": {
                    "highway": "traffic_signals"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3551655,
                    43.0613066
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3537113:43.0609214,141.3550648:43.0610976]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/480228203",
                "properties": {
                  "type": "way",
                  "id": 480228203,
                  "tags": {
                    "highway": "footway"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3537113,
                      43.0609214
                    ],
                    [
                      141.3550648,
                      43.0610976
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/3348121417",
                "properties": {
                  "type": "node",
                  "id": 3348121417,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3537113,
                    43.0609214
                  ]
                }
              }
            ]
          },
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/480228203",
                "properties": {
                  "type": "way",
                  "id": 480228203,
                  "tags": {
                    "highway": "footway"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550648,
                      43.0610976
                    ],
                    [
                      141.3537113,
                      43.0609214
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/4732344755",
                "properties": {
                  "type": "node",
                  "id": 4732344755,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550648,
                    43.0610976
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3537113:43.0609214,141.3537507:43.0610008,141.3549947:43.0611592,141.3550101:43.0611612,141.3550396:43.0611487,141.3550535:43.061128,141.3550648:43.0610976]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/490556141",
                "properties": {
                  "type": "way",
                  "id": 490556141,
                  "tags": {
                    "highway": "footway"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3537113,
                      43.0609214
                    ],
                    [
                      141.3537507,
                      43.0610008
                    ],
                    [
                      141.3549947,
                      43.0611592
                    ],
                    [
                      141.3550101,
                      43.0611612
                    ],
                    [
                      141.3550396,
                      43.0611487
                    ],
                    [
                      141.3550535,
                      43.061128
                    ],
                    [
                      141.3550648,
                      43.0610976
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/3348121417",
                "properties": {
                  "type": "node",
                  "id": 3348121417,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3537113,
                    43.0609214
                  ]
                }
              }
            ]
          },
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/490556141",
                "properties": {
                  "type": "way",
                  "id": 490556141,
                  "tags": {
                    "highway": "footway"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550648,
                      43.0610976
                    ],
                    [
                      141.3550535,
                      43.061128
                    ],
                    [
                      141.3550396,
                      43.0611487
                    ],
                    [
                      141.3550101,
                      43.0611612
                    ],
                    [
                      141.3549947,
                      43.0611592
                    ],
                    [
                      141.3537507,
                      43.0610008
                    ],
                    [
                      141.3537113,
                      43.0609214
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/4732344755",
                "properties": {
                  "type": "node",
                  "id": 4732344755,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550648,
                    43.0610976
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3542389:43.0616856,141.3542574:43.0617228,141.3543496:43.0612518,141.3543645:43.0611964,141.3546595:43.0617798]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/614277426",
                "properties": {
                  "type": "way",
                  "id": 614277426,
                  "tags": {
                    "highway": "service"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3543645,
                      43.0611964
                    ],
                    [
                      141.3543496,
                      43.0612518
                    ],
                    [
                      141.3542389,
                      43.0616856
                    ],
                    [
                      141.3542574,
                      43.0617228
                    ],
                    [
                      141.3546595,
                      43.0617798
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5810824029",
                "properties": {
                  "type": "node",
                  "id": 5810824029,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3543645,
                    43.0611964
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3550845:43.0613655,141.3552133:43.0608711]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625872474",
                "properties": {
                  "type": "way",
                  "id": 625872474,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550845,
                      43.0613655
                    ],
                    [
                      141.3552133,
                      43.0608711
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909114111",
                "properties": {
                  "type": "node",
                  "id": 5909114111,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550845,
                    43.0613655
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3550591:43.0614676,141.3550845:43.0613655]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625872474",
                "properties": {
                  "type": "way",
                  "id": 625872474,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550845,
                      43.0613655
                    ],
                    [
                      141.3550591,
                      43.0614676
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909114111",
                "properties": {
                  "type": "node",
                  "id": 5909114111,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550845,
                    43.0613655
                  ]
                }
              }
            ]
          },
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625872474",
                "properties": {
                  "type": "way",
                  "id": 625872474,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550591,
                      43.0614676
                    ],
                    [
                      141.3550845,
                      43.0613655
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909110323",
                "properties": {
                  "type": "node",
                  "id": 5909110323,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550591,
                    43.0614676
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3550441:43.0615256,141.3550591:43.0614676]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625872474",
                "properties": {
                  "type": "way",
                  "id": 625872474,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550591,
                      43.0614676
                    ],
                    [
                      141.3550441,
                      43.0615256
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909110323",
                "properties": {
                  "type": "node",
                  "id": 5909110323,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550591,
                    43.0614676
                  ]
                }
              }
            ]
          },
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625872474",
                "properties": {
                  "type": "way",
                  "id": 625872474,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550441,
                      43.0615256
                    ],
                    [
                      141.3550591,
                      43.0614676
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909110325",
                "properties": {
                  "type": "node",
                  "id": 5909110325,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550441,
                    43.0615256
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3547394:43.0627047,141.3547449:43.0626832,141.3549044:43.0620662,141.3550441:43.0615256]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625872474",
                "properties": {
                  "type": "way",
                  "id": 625872474,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550441,
                      43.0615256
                    ],
                    [
                      141.3549044,
                      43.0620662
                    ],
                    [
                      141.3547449,
                      43.0626832
                    ],
                    [
                      141.3547394,
                      43.0627047
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909110325",
                "properties": {
                  "type": "node",
                  "id": 5909110325,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550441,
                    43.0615256
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3548929:43.0615536,141.3549177:43.0614496,141.3550591:43.0614676]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625872475",
                "properties": {
                  "type": "way",
                  "id": 625872475,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550591,
                      43.0614676
                    ],
                    [
                      141.3549177,
                      43.0614496
                    ],
                    [
                      141.3548929,
                      43.0615536
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909110323",
                "properties": {
                  "type": "node",
                  "id": 5909110323,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550591,
                    43.0614676
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3550441:43.0615256,141.3552634:43.0616667,141.3552916:43.0615617]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625872476",
                "properties": {
                  "type": "way",
                  "id": 625872476,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550441,
                      43.0615256
                    ],
                    [
                      141.3552916,
                      43.0615617
                    ],
                    [
                      141.3552634,
                      43.0616667
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909110325",
                "properties": {
                  "type": "node",
                  "id": 5909110325,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550441,
                    43.0615256
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3547046:43.0613141,141.3550845:43.0613655]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625873371",
                "properties": {
                  "type": "way",
                  "id": 625873371,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550845,
                      43.0613655
                    ],
                    [
                      141.3547046,
                      43.0613141
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909114111",
                "properties": {
                  "type": "node",
                  "id": 5909114111,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550845,
                    43.0613655
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3550845:43.0613655,141.3554438:43.0614138]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/625873372",
                "properties": {
                  "type": "way",
                  "id": 625873372,
                  "tags": {
                    "highway": "footway",
                    "layer": "-1",
                    "tunnel": "yes"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3550845,
                      43.0613655
                    ],
                    [
                      141.3554438,
                      43.0614138
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5909114111",
                "properties": {
                  "type": "node",
                  "id": 5909114111,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3550845,
                    43.0613655
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3519378:43.060859,141.352076:43.0608776,141.3522264:43.0608976,141.3534138:43.0610728,141.3535637:43.061094,141.3537295:43.0611149,141.3543645:43.0611964]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/758815711",
                "properties": {
                  "type": "way",
                  "id": 758815711,
                  "tags": {
                    "highway": "tertiary",
                    "name": "大通",
                    "name:en": "Odori",
                    "name:ja": "大通",
                    "name:ja_rm": "Ōdōri",
                    "oneway": "yes",
                    "source": "Bing"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3543645,
                      43.0611964
                    ],
                    [
                      141.3537295,
                      43.0611149
                    ],
                    [
                      141.3535637,
                      43.061094
                    ],
                    [
                      141.3534138,
                      43.0610728
                    ],
                    [
                      141.3522264,
                      43.0608976
                    ],
                    [
                      141.352076,
                      43.0608776
                    ],
                    [
                      141.3519378,
                      43.060859
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5810824029",
                "properties": {
                  "type": "node",
                  "id": 5810824029,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3543645,
                    43.0611964
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3543645:43.0611964,141.3549645:43.0612734,141.3551655:43.0613066]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/758815711",
                "properties": {
                  "type": "way",
                  "id": 758815711,
                  "tags": {
                    "highway": "tertiary",
                    "name": "大通",
                    "name:en": "Odori",
                    "name:ja": "大通",
                    "name:ja_rm": "Ōdōri",
                    "oneway": "yes",
                    "source": "Bing"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3543645,
                      43.0611964
                    ],
                    [
                      141.3549645,
                      43.0612734
                    ],
                    [
                      141.3551655,
                      43.0613066
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/5810824029",
                "properties": {
                  "type": "node",
                  "id": 5810824029,
                  "tags": {},
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3543645,
                    43.0611964
                  ]
                }
              }
            ]
          },
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/758815711",
                "properties": {
                  "type": "way",
                  "id": 758815711,
                  "tags": {
                    "highway": "tertiary",
                    "name": "大通",
                    "name:en": "Odori",
                    "name:ja": "大通",
                    "name:ja_rm": "Ōdōri",
                    "oneway": "yes",
                    "source": "Bing"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3551655,
                      43.0613066
                    ],
                    [
                      141.3549645,
                      43.0612734
                    ],
                    [
                      141.3543645,
                      43.0611964
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/423778205",
                "properties": {
                  "type": "node",
                  "id": 423778205,
                  "tags": {
                    "highway": "traffic_signals"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3551655,
                    43.0613066
                  ]
                }
              }
            ]
          }
        ],
        "{nodes:[], wayPoints:[141.3551655:43.0613066,141.3553423:43.0613348,141.3566173:43.0615128,141.3567482:43.0615253,141.3568279:43.061526,141.3571024:43.0615596,141.3572071:43.0615544]}": [
          {
            "ways": [
              {
                "type": "Feature",
                "id": "way/758815711",
                "properties": {
                  "type": "way",
                  "id": 758815711,
                  "tags": {
                    "highway": "tertiary",
                    "name": "大通",
                    "name:en": "Odori",
                    "name:ja": "大通",
                    "name:ja_rm": "Ōdōri",
                    "oneway": "yes",
                    "source": "Bing"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "LineString",
                  "coordinates": [
                    [
                      141.3551655,
                      43.0613066
                    ],
                    [
                      141.3553423,
                      43.0613348
                    ],
                    [
                      141.3566173,
                      43.0615128
                    ],
                    [
                      141.3567482,
                      43.0615253
                    ],
                    [
                      141.3568279,
                      43.061526
                    ],
                    [
                      141.3571024,
                      43.0615596
                    ],
                    [
                      141.3572071,
                      43.0615544
                    ]
                  ]
                }
              }
            ],
            "nodes": [
              {
                "type": "Feature",
                "id": "node/423778205",
                "properties": {
                  "type": "node",
                  "id": 423778205,
                  "tags": {
                    "highway": "traffic_signals"
                  },
                  "relations": [],
                  "meta": {}
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    141.3551655,
                    43.0613066
                  ]
                }
              }
            ]
          }
        ]
      }
    };
    const partialBlocks = [
      {
        "ways": [
          {
            "type": "Feature",
            "id": "way/480228203",
            "properties": {
              "type": "way",
              "id": 480228203,
              "tags": {
                "highway": "footway"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3537113,
                  43.0609214
                ],
                [
                  141.3550648,
                  43.0610976
                ]
              ]
            }
          }
        ],
        "nodes": [
          {
            "type": "Feature",
            "id": "node/3348121417",
            "properties": {
              "type": "node",
              "id": 3348121417,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3537113,
                43.0609214
              ]
            }
          }
        ]
      },
      {
        "ways": [
          {
            "type": "Feature",
            "id": "way/480228203",
            "properties": {
              "type": "way",
              "id": 480228203,
              "tags": {
                "highway": "footway"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550648,
                  43.0610976
                ],
                [
                  141.3537113,
                  43.0609214
                ]
              ]
            }
          }
        ],
        "nodes": [
          {
            "type": "Feature",
            "id": "node/4732344755",
            "properties": {
              "type": "node",
              "id": 4732344755,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550648,
                43.0610976
              ]
            }
          }
        ]
      },
      {
        "ways": [
          {
            "type": "Feature",
            "id": "way/490556141",
            "properties": {
              "type": "way",
              "id": 490556141,
              "tags": {
                "highway": "footway"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3537113,
                  43.0609214
                ],
                [
                  141.3537507,
                  43.0610008
                ],
                [
                  141.3549947,
                  43.0611592
                ],
                [
                  141.3550101,
                  43.0611612
                ],
                [
                  141.3550396,
                  43.0611487
                ],
                [
                  141.3550535,
                  43.061128
                ],
                [
                  141.3550648,
                  43.0610976
                ]
              ]
            }
          }
        ],
        "nodes": [
          {
            "type": "Feature",
            "id": "node/3348121417",
            "properties": {
              "type": "node",
              "id": 3348121417,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3537113,
                43.0609214
              ]
            }
          }
        ]
      },
      {
        "ways": [
          {
            "type": "Feature",
            "id": "way/490556141",
            "properties": {
              "type": "way",
              "id": 490556141,
              "tags": {
                "highway": "footway"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  141.3550648,
                  43.0610976
                ],
                [
                  141.3550535,
                  43.061128
                ],
                [
                  141.3550396,
                  43.0611487
                ],
                [
                  141.3550101,
                  43.0611612
                ],
                [
                  141.3549947,
                  43.0611592
                ],
                [
                  141.3537507,
                  43.0610008
                ],
                [
                  141.3537113,
                  43.0609214
                ]
              ]
            }
          }
        ],
        "nodes": [
          {
            "type": "Feature",
            "id": "node/4732344755",
            "properties": {
              "type": "node",
              "id": 4732344755,
              "tags": {},
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "Point",
              "coordinates": [
                141.3550648,
                43.0610976
              ]
            }
          }
        ]
      }
    ];
    _recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask({}, blockContext, partialBlocks).run().listen(defaultRunToResultConfig(
      {
        onResolved: ({block, partialBlocks}) => {
          // Paste the results of this into a geojson viewer for debugging
          blockToGeojson(block);
          blocksToGeojson(partialBlocks);
          // Expect one unique node because it's a loop
          expect(R.all(
            R.compose(R.equals('node/3348121417'), R.prop('id')),
            R.prop('nodes', block)
          )).toBeTruthy();
        }
      }, errors, done)
    );
  }, 1000000);

  test('locationToOsmAllBlocksThenBufferedMoreBlocksResultsTask', done => {
    expect.assertions(1);
    const errors = [];

    // This calls _constructStreetQuery indirectly
    locationToOsmAllBlocksThenBufferedMoreBlocksResultsTask({osmConfig: {}, bufferConfig: {radius: 50, units: 'meters', unionFeatures: true}}, {
      country: 'China 中国',
      city: '香港 Hong Kong',
      street: 'Des Voeux Road Central'
    }).run().listen(defaultRunConfig({
      onResolved: ({Ok: componentLocationResponses}) => {
        locationsToGeojson(R.map(R.prop('location'), componentLocationResponses));
        expect(R.length(componentLocationResponses)).toEqual(2);
      }
    }, errors, done));
  }, 2000000);

  const sequencedTask = composeWithChain([
    results => {
      return locationsToGeojsonFileResultTask(
        '/tmp',
        `rescapeOsmlocationsToGeojsonFileResultTask_${moment().format('YYYY-MM-DD-HH-mm-SS')}`,
        results
      );
    },
    propSets => traverseReduce(
      // The accumulator
      /***
       * @param {Object} res {Ok:[Object], Error:[Object] Previous or initial results
       * @param {Object} results {Ok:[Object], Error:[Object]} Current results
       * @returns {Object} {Ok:[Object], Error[Object]} The merged results
       */
      (res, results) => {
        return R.mergeWith(R.concat, res, results);
      },
      of({Ok: [], Error: []}),
      R.map(
        location => locationToOsmAllBlocksQueryResultsTask(osmConfig, location),
        propSets
      )
    )])(propSets);

  const errors = [];
  sequencedTask.run().listen(
    defaultRunConfig({
      onResolved: results => {
        // Use Dump results to json streetviewConfig to figure out output dir
        log.debug(`Finished all propsets. Dumping results with processQueryForStreetviewResults`);
      }
    }, errors, () => {
    })
  )


});
