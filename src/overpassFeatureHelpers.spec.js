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

import {
  cleanGeojson, _intersectionStreetNamesFromWaysAndNodes, _linkedFeatures
} from './overpassFeatureHelpers';
import * as R from 'ramda';

describe('overpassFeatureHelpers', () => {

  test('cleanGeojson', () => {
    const feature =
      {
        type: "Feature",
        id: "way/24461945",
        properties: {
          type: "way",
          id: 24461945,
          tags: {
            highway: "tertiary",
            maxspeed: "30",
            // Offending tag. This needs to be converted
            'maxspeed:type': "sign",
            name: "Hospitalsgata",
            surface: "asphalt"
          },
          relations: [],
          meta: {}
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [
              5.7362284,
              58.9702788
            ],
            [
              5.7356397,
              58.9703641
            ]
          ]
        }
      };
    expect(cleanGeojson(feature)).toEqual(
      R.over(
        R.lensPath(['properties', 'tags']),
        obj => R.set(R.lensProp('maxspeed__type'), 'sign', R.omit(['maxspeed:type'], obj)),
        feature
      )
    );
  });

  test('_intersectionStreetNamesFromWaysAndNodes', () => {
      const wayFeatures = [
        {
          "type": "Feature",
          "id": "way/5707230",
          "properties": {
            "type": "way",
            "id": 5707230,
            "tags": {
              "name": "134th Street"
            }
          }
        }
      ];
      const nodeFeatures = [
        {
          "id": "node/42875319"
        },
        {
          "id": "node/42901997"
        }
      ];
      const nodeIdToWaysOfNodeFeatures = {
        "node/42875319": [
          {
            "type": "Feature",
            "id": "way/5707230",
            "properties": {
              "type": "way",
              "id": 5707230,
              "tags": {
                "name": "134th Street"
              }
            }
          },
          {
            "type": "Feature",
            "id": "way/122633464",
            "properties": {
              "type": "way",
              "id": 122633464,
              "tags": {
                "name": "South Conduit Avenue"
              }
            }
          },
          {
            "type": "Feature",
            "id": "way/220107105",
            "properties": {
              "type": "way",
              "id": 220107105,
              "tags": {
                "name": "South Conduit Avenue"
              }
            }
          }
        ],
        "node/42901997": [
          {
            "type": "Feature",
            "id": "way/5707230",
            "properties": {
              "type": "way",
              "id": 5707230,
              "tags": {
                "name": "134th Street"
              }
            }
          },
          {
            "type": "Feature",
            "id": "way/219610989",
            "properties": {
              "type": "way",
              "id": 219610989,
              "tags": {
                "name": "149th Avenue"
              }
            }
          },
          {
            "type": "Feature",
            "id": "way/219610991",
            "properties": {
              "type": "way",
              "id": 219610991,
              "tags": {
                "name": "134th Street"
              }
            }
          }
        ]
      };
      expect(
        _intersectionStreetNamesFromWaysAndNodes(wayFeatures, nodeFeatures, nodeIdToWaysOfNodeFeatures)
      ).toEqual(
        {"node/42875319": ["134th Street", "South Conduit Avenue"], "node/42901997": ["134th Street", "149th Avenue"]}
      );
    }
  );

  test('_linkedFeatures', () => {
    const lookup = {
      "-77.123609:38.8975095": {
        "head": [
          {
            "type": "Feature",
            "id": "way/468503472",
            "properties": {
              "type": "way",
              "id": 468503472,
              "tags": {
                "NHS": "yes",
                "highway": "primary",
                "lanes": "3",
                "maxspeed": "30 mph",
                "name": "Lee Highway",
                "oneway": "yes",
                "ref": "US 29",
                "surface": "asphalt",
                "tiger__cfcc": "A21",
                "tiger__county": "Arlington, VA",
                "tiger__name_base": "Lee",
                "tiger__name_base_1": "United States Highway 29",
                "tiger__name_direction_prefix": "N",
                "tiger__name_type": "Hwy",
                "tiger__zip_left": "22205",
                "tiger__zip_right": "22205",
                "turn__lanes": "left||"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.123609,
                  38.8975095
                ],
                [
                  -77.1236981,
                  38.8974765
                ],
                [
                  -77.1239772,
                  38.8973729
                ],
                [
                  -77.1244713,
                  38.8971897
                ]
              ]
            },
            "__reversed__": true
          },
          {
            "type": "Feature",
            "id": "way/334234297",
            "properties": {
              "type": "way",
              "id": 334234297,
              "tags": {
                "NHS": "yes",
                "highway": "primary",
                "lanes": "2",
                "maxspeed": "30 mph",
                "name": "Lee Highway",
                "oneway": "yes",
                "ref": "US 29",
                "surface": "asphalt",
                "tiger__cfcc": "A21",
                "tiger__county": "Arlington, VA",
                "tiger__name_base": "Lee",
                "tiger__name_base_1": "United States Highway 29",
                "tiger__name_direction_prefix": "N",
                "tiger__name_type": "Hwy",
                "tiger__zip_left": "22205",
                "tiger__zip_right": "22205"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.123609,
                  38.8975095
                ],
                [
                  -77.123521,
                  38.8975378
                ],
                [
                  -77.1234245,
                  38.8975696
                ],
                [
                  -77.1231191,
                  38.8976728
                ],
                [
                  -77.1228855,
                  38.8977518
                ],
                [
                  -77.122325,
                  38.8979461
                ],
                [
                  -77.1219987,
                  38.8980516
                ],
                [
                  -77.1217955,
                  38.8981221
                ],
                [
                  -77.1215767,
                  38.8981991
                ],
                [
                  -77.1213853,
                  38.8982661
                ],
                [
                  -77.1210952,
                  38.8983707
                ],
                [
                  -77.1209758,
                  38.8984144
                ]
              ]
            }
          }
        ]
      },
      "-77.1244713:38.8971897": {
        "last": [
          {
            "type": "Feature",
            "id": "way/468503472",
            "properties": {
              "type": "way",
              "id": 468503472,
              "tags": {
                "NHS": "yes",
                "highway": "primary",
                "lanes": "3",
                "maxspeed": "30 mph",
                "name": "Lee Highway",
                "oneway": "yes",
                "ref": "US 29",
                "surface": "asphalt",
                "tiger__cfcc": "A21",
                "tiger__county": "Arlington, VA",
                "tiger__name_base": "Lee",
                "tiger__name_base_1": "United States Highway 29",
                "tiger__name_direction_prefix": "N",
                "tiger__name_type": "Hwy",
                "tiger__zip_left": "22205",
                "tiger__zip_right": "22205",
                "turn__lanes": "left||"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.123609,
                  38.8975095
                ],
                [
                  -77.1236981,
                  38.8974765
                ],
                [
                  -77.1239772,
                  38.8973729
                ],
                [
                  -77.1244713,
                  38.8971897
                ]
              ]
            },
            "__reversed__": true
          }
        ],
        "head": [
          {
            "type": "Feature",
            "id": "way/8797308",
            "properties": {
              "type": "way",
              "id": 8797308,
              "tags": {
                "highway": "residential",
                "name": "North Buchanan Street",
                "tiger__cfcc": "A41",
                "tiger__county": "Arlington, VA",
                "tiger__name_base": "Buchanan",
                "tiger__name_direction_prefix": "N",
                "tiger__name_type": "St",
                "tiger__reviewed": "no",
                "tiger__zip_left": "22207",
                "tiger__zip_right": "22207"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.1244713,
                  38.8971897
                ],
                [
                  -77.124542,
                  38.8972655
                ],
                [
                  -77.1247111,
                  38.8974501
                ],
                [
                  -77.1248055,
                  38.8975532
                ],
                [
                  -77.1249056,
                  38.8976625
                ],
                [
                  -77.1249311,
                  38.8976904
                ],
                [
                  -77.1251277,
                  38.897905
                ],
                [
                  -77.1256942,
                  38.8986197
                ]
              ]
            }
          }
        ]
      },
      "-77.1256942:38.8986197": {
        "last": [
          {
            "type": "Feature",
            "id": "way/8797308",
            "properties": {
              "type": "way",
              "id": 8797308,
              "tags": {
                "highway": "residential",
                "name": "North Buchanan Street",
                "tiger__cfcc": "A41",
                "tiger__county": "Arlington, VA",
                "tiger__name_base": "Buchanan",
                "tiger__name_direction_prefix": "N",
                "tiger__name_type": "St",
                "tiger__reviewed": "no",
                "tiger__zip_left": "22207",
                "tiger__zip_right": "22207"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.1244713,
                  38.8971897
                ],
                [
                  -77.124542,
                  38.8972655
                ],
                [
                  -77.1247111,
                  38.8974501
                ],
                [
                  -77.1248055,
                  38.8975532
                ],
                [
                  -77.1249056,
                  38.8976625
                ],
                [
                  -77.1249311,
                  38.8976904
                ],
                [
                  -77.1251277,
                  38.897905
                ],
                [
                  -77.1256942,
                  38.8986197
                ]
              ]
            }
          }
        ]
      },
      "-77.1209758:38.8984144": {
        "last": [
          {
            "type": "Feature",
            "id": "way/334234297",
            "properties": {
              "type": "way",
              "id": 334234297,
              "tags": {
                "NHS": "yes",
                "highway": "primary",
                "lanes": "2",
                "maxspeed": "30 mph",
                "name": "Lee Highway",
                "oneway": "yes",
                "ref": "US 29",
                "surface": "asphalt",
                "tiger__cfcc": "A21",
                "tiger__county": "Arlington, VA",
                "tiger__name_base": "Lee",
                "tiger__name_base_1": "United States Highway 29",
                "tiger__name_direction_prefix": "N",
                "tiger__name_type": "Hwy",
                "tiger__zip_left": "22205",
                "tiger__zip_right": "22205"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.123609,
                  38.8975095
                ],
                [
                  -77.123521,
                  38.8975378
                ],
                [
                  -77.1234245,
                  38.8975696
                ],
                [
                  -77.1231191,
                  38.8976728
                ],
                [
                  -77.1228855,
                  38.8977518
                ],
                [
                  -77.122325,
                  38.8979461
                ],
                [
                  -77.1219987,
                  38.8980516
                ],
                [
                  -77.1217955,
                  38.8981221
                ],
                [
                  -77.1215767,
                  38.8981991
                ],
                [
                  -77.1213853,
                  38.8982661
                ],
                [
                  -77.1210952,
                  38.8983707
                ],
                [
                  -77.1209758,
                  38.8984144
                ]
              ]
            }
          }
        ]
      },
      "-77.1235902:38.8976161": {
        "head": [
          {
            "type": "Feature",
            "id": "way/334233260",
            "properties": {
              "type": "way",
              "id": 334233260,
              "tags": {
                "NHS": "yes",
                "highway": "primary",
                "lanes": "2",
                "maxspeed": "30 mph",
                "name": "Lee Highway",
                "oneway": "yes",
                "ref": "US 29",
                "surface": "asphalt",
                "tiger__cfcc": "A21",
                "tiger__county": "Arlington, VA",
                "tiger__name_base": "Lee",
                "tiger__name_base_1": "United States Highway 29",
                "tiger__name_direction_prefix": "N",
                "tiger__name_type": "Hwy",
                "tiger__zip_left": "22205",
                "tiger__zip_right": "22205"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.1235902,
                  38.8976161
                ],
                [
                  -77.1236787,
                  38.8975868
                ],
                [
                  -77.1237648,
                  38.8975562
                ],
                [
                  -77.124542,
                  38.8972655
                ],
                [
                  -77.1246824,
                  38.8972149
                ],
                [
                  -77.1247677,
                  38.8971842
                ],
                [
                  -77.1251166,
                  38.8970584
                ],
                [
                  -77.1252867,
                  38.8969923
                ],
                [
                  -77.125515,
                  38.8969035
                ],
                [
                  -77.1257014,
                  38.896831
                ],
                [
                  -77.1259747,
                  38.8967465
                ],
                [
                  -77.1260261,
                  38.896731
                ],
                [
                  -77.126258,
                  38.8966612
                ]
              ]
            }
          }
        ],
        "last": [
          {
            "type": "Feature",
            "id": "way/563505119",
            "properties": {
              "type": "way",
              "id": 563505119,
              "tags": {
                "highway": "primary",
                "lanes": "2",
                "maxspeed": "30 mph",
                "name": "North Glebe Road",
                "oneway": "yes",
                "ref": "VA 120",
                "surface": "asphalt"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.123075,
                  38.8970315
                ],
                [
                  -77.1232821,
                  38.897265
                ],
                [
                  -77.1234738,
                  38.8974829
                ],
                [
                  -77.123521,
                  38.8975378
                ],
                [
                  -77.1235902,
                  38.8976161
                ]
              ]
            }
          }
        ]
      },
      "-77.126258:38.8966612": {
        "last": [
          {
            "type": "Feature",
            "id": "way/334233260",
            "properties": {
              "type": "way",
              "id": 334233260,
              "tags": {
                "NHS": "yes",
                "highway": "primary",
                "lanes": "2",
                "maxspeed": "30 mph",
                "name": "Lee Highway",
                "oneway": "yes",
                "ref": "US 29",
                "surface": "asphalt",
                "tiger__cfcc": "A21",
                "tiger__county": "Arlington, VA",
                "tiger__name_base": "Lee",
                "tiger__name_base_1": "United States Highway 29",
                "tiger__name_direction_prefix": "N",
                "tiger__name_type": "Hwy",
                "tiger__zip_left": "22205",
                "tiger__zip_right": "22205"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.1235902,
                  38.8976161
                ],
                [
                  -77.1236787,
                  38.8975868
                ],
                [
                  -77.1237648,
                  38.8975562
                ],
                [
                  -77.124542,
                  38.8972655
                ],
                [
                  -77.1246824,
                  38.8972149
                ],
                [
                  -77.1247677,
                  38.8971842
                ],
                [
                  -77.1251166,
                  38.8970584
                ],
                [
                  -77.1252867,
                  38.8969923
                ],
                [
                  -77.125515,
                  38.8969035
                ],
                [
                  -77.1257014,
                  38.896831
                ],
                [
                  -77.1259747,
                  38.8967465
                ],
                [
                  -77.1260261,
                  38.896731
                ],
                [
                  -77.126258,
                  38.8966612
                ]
              ]
            }
          }
        ]
      },
      "-77.123075:38.8970315": {
        "head": [
          {
            "type": "Feature",
            "id": "way/563505119",
            "properties": {
              "type": "way",
              "id": 563505119,
              "tags": {
                "highway": "primary",
                "lanes": "2",
                "maxspeed": "30 mph",
                "name": "North Glebe Road",
                "oneway": "yes",
                "ref": "VA 120",
                "surface": "asphalt"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  -77.123075,
                  38.8970315
                ],
                [
                  -77.1232821,
                  38.897265
                ],
                [
                  -77.1234738,
                  38.8974829
                ],
                [
                  -77.123521,
                  38.8975378
                ],
                [
                  -77.1235902,
                  38.8976161
                ]
              ]
            }
          }
        ]
      }
    };
    const nodeFeatures = [
      {
        "type": "Feature",
        "id": "node/63333051",
        "properties": {
          "type": "node",
          "id": 63333051,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -77.123521,
            38.8975378
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/63347179",
        "properties": {
          "type": "node",
          "id": 63347179,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -77.1244713,
            38.8971897
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/2503303972",
        "properties": {
          "type": "node",
          "id": 2503303972,
          "tags": {
            "crossing": "uncontrolled",
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -77.123609,
            38.8975095
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3413343984",
        "properties": {
          "type": "node",
          "id": 3413343984,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -77.1235902,
            38.8976161
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3413343980",
        "properties": {
          "type": "node",
          "id": 3413343980,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -77.124542,
            38.8972655
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3413343983",
        "properties": {
          "type": "node",
          "id": 3413343983,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -77.1236787,
            38.8975868
          ]
        }
      }
    ];
    const results = _linkedFeatures(lookup, nodeFeatures)
    expect(results).toEqual(results)
  });
});