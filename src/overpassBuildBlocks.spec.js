import {loggers} from 'rescape-log';
import {_resolveIncompleteWayResultTask} from './overpassBuildBlocks';
import {defaultRunToResultConfig} from 'rescape-ramda';
import * as R from 'ramda'

const log = loggers.get('rescapeDefault');

const partialBlocks = [
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9856985,
              40.7440046
            ],
            [
              -73.9841296,
              40.7433448
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445888",
        "properties": {
          "type": "node",
          "id": 42445888,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9856985,
            40.7440046
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9841296,
              40.7433448
            ],
            [
              -73.9856985,
              40.7440046
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668030",
        "properties": {
          "type": "node",
          "id": 4597668030,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9841296,
            40.7433448
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9841296,
              40.7433448
            ],
            [
              -73.9840243,
              40.7433005
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668030",
        "properties": {
          "type": "node",
          "id": 4597668030,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9841296,
            40.7433448
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9840243,
              40.7433005
            ],
            [
              -73.9841296,
              40.7433448
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446266",
        "properties": {
          "type": "node",
          "id": 42446266,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9840243,
            40.7433005
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9840243,
              40.7433005
            ],
            [
              -73.9829542,
              40.7428505
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446266",
        "properties": {
          "type": "node",
          "id": 42446266,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9840243,
            40.7433005
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9829542,
              40.7428505
            ],
            [
              -73.9840243,
              40.7433005
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/5481897722",
        "properties": {
          "type": "node",
          "id": 5481897722,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9829542,
            40.7428505
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9829542,
              40.7428505
            ],
            [
              -73.9825719,
              40.7426898
            ],
            [
              -73.9824628,
              40.7426439
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/5481897722",
        "properties": {
          "type": "node",
          "id": 5481897722,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9829542,
            40.7428505
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9824628,
              40.7426439
            ],
            [
              -73.9825719,
              40.7426898
            ],
            [
              -73.9829542,
              40.7428505
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446270",
        "properties": {
          "type": "node",
          "id": 42446270,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9824628,
            40.7426439
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9824628,
              40.7426439
            ],
            [
              -73.9823601,
              40.7426007
            ],
            [
              -73.9819175,
              40.7424146
            ],
            [
              -73.9810008,
              40.7420291
            ],
            [
              -73.9808564,
              40.7419683
            ],
            [
              -73.9807166,
              40.7419095
            ],
            [
              -73.979841,
              40.7415413
            ],
            [
              -73.9796647,
              40.7414671
            ],
            [
              -73.9786353,
              40.7410343
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446270",
        "properties": {
          "type": "node",
          "id": 42446270,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9824628,
            40.7426439
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5672487",
        "properties": {
          "type": "way",
          "id": 5672487,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 27th Street",
            "name_1": "East 27 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "27th",
            "tiger:name_base_1": "27",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9829135,
              40.7420239
            ],
            [
              -73.9828095,
              40.74198
            ],
            [
              -73.9818297,
              40.7415656
            ],
            [
              -73.9818191,
              40.7415611
            ],
            [
              -73.9814618,
              40.74141
            ],
            [
              -73.9813061,
              40.7413442
            ],
            [
              -73.9811797,
              40.7412907
            ],
            [
              -73.9796089,
              40.7406264
            ],
            [
              -73.9790893,
              40.7404067
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446932",
        "properties": {
          "type": "node",
          "id": 42446932,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9829135,
            40.7420239
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5672487",
        "properties": {
          "type": "way",
          "id": 5672487,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 27th Street",
            "name_1": "East 27 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "27th",
            "tiger:name_base_1": "27",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9829135,
              40.7420239
            ],
            [
              -73.9830181,
              40.7420682
            ],
            [
              -73.984021,
              40.7424923
            ],
            [
              -73.984473,
              40.7426835
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446932",
        "properties": {
          "type": "node",
          "id": 42446932,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9829135,
            40.7420239
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5672487",
        "properties": {
          "type": "way",
          "id": 5672487,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 27th Street",
            "name_1": "East 27 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "27th",
            "tiger:name_base_1": "27",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.984473,
              40.7426835
            ],
            [
              -73.984021,
              40.7424923
            ],
            [
              -73.9830181,
              40.7420682
            ],
            [
              -73.9829135,
              40.7420239
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42454522",
        "properties": {
          "type": "node",
          "id": 42454522,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.984473,
            40.7426835
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5672487",
        "properties": {
          "type": "way",
          "id": 5672487,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 27th Street",
            "name_1": "East 27 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "27th",
            "tiger:name_base_1": "27",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.984473,
              40.7426835
            ],
            [
              -73.9845789,
              40.7427282
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42454522",
        "properties": {
          "type": "node",
          "id": 42454522,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.984473,
            40.7426835
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5672487",
        "properties": {
          "type": "way",
          "id": 5672487,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 27th Street",
            "name_1": "East 27 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "27th",
            "tiger:name_base_1": "27",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9845789,
              40.7427282
            ],
            [
              -73.984473,
              40.7426835
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668031",
        "properties": {
          "type": "node",
          "id": 4597668031,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9845789,
            40.7427282
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5672487",
        "properties": {
          "type": "way",
          "id": 5672487,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 27th Street",
            "name_1": "East 27 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "27th",
            "tiger:name_base_1": "27",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9845789,
              40.7427282
            ],
            [
              -73.9861457,
              40.7433908
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668031",
        "properties": {
          "type": "node",
          "id": 4597668031,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9845789,
            40.7427282
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5672487",
        "properties": {
          "type": "way",
          "id": 5672487,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 27th Street",
            "name_1": "East 27 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "27th",
            "tiger:name_base_1": "27",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9861457,
              40.7433908
            ],
            [
              -73.9845789,
              40.7427282
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445885",
        "properties": {
          "type": "node",
          "id": 42445885,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9861457,
            40.7433908
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/5672487",
        "properties": {
          "type": "way",
          "id": 5672487,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 27th Street",
            "name_1": "East 27 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "27th",
            "tiger:name_base_1": "27",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9861457,
              40.7433908
            ],
            [
              -73.9877451,
              40.7440672
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445885",
        "properties": {
          "type": "node",
          "id": 42445885,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9861457,
            40.7433908
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117042",
        "properties": {
          "type": "way",
          "id": 196117042,
          "tags": {
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Madison Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Madison",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10037",
            "wikidata": "Q109849",
            "wikipedia": "en:Madison Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9861457,
              40.7433908
            ],
            [
              -73.9865977,
              40.7427711
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445885",
        "properties": {
          "type": "node",
          "id": 42445885,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9861457,
            40.7433908
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117042",
        "properties": {
          "type": "way",
          "id": 196117042,
          "tags": {
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Madison Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Madison",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10037",
            "wikidata": "Q109849",
            "wikipedia": "en:Madison Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9861457,
              40.7433908
            ],
            [
              -73.9856985,
              40.7440046
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445885",
        "properties": {
          "type": "node",
          "id": 42445885,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9861457,
            40.7433908
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117042",
        "properties": {
          "type": "way",
          "id": 196117042,
          "tags": {
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Madison Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Madison",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10037",
            "wikidata": "Q109849",
            "wikipedia": "en:Madison Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9856985,
              40.7440046
            ],
            [
              -73.9861457,
              40.7433908
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445888",
        "properties": {
          "type": "node",
          "id": 42445888,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9856985,
            40.7440046
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117042",
        "properties": {
          "type": "way",
          "id": 196117042,
          "tags": {
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Madison Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Madison",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10037",
            "wikidata": "Q109849",
            "wikipedia": "en:Madison Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9856985,
              40.7440046
            ],
            [
              -73.9852457,
              40.7446233
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445888",
        "properties": {
          "type": "node",
          "id": 42445888,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9856985,
            40.7440046
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117042",
        "properties": {
          "type": "way",
          "id": 196117042,
          "tags": {
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Madison Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Madison",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10037",
            "wikidata": "Q109849",
            "wikipedia": "en:Madison Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9852457,
              40.7446233
            ],
            [
              -73.9856985,
              40.7440046
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436746",
        "properties": {
          "type": "node",
          "id": 42436746,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9852457,
            40.7446233
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117051",
        "properties": {
          "type": "way",
          "id": 196117051,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.984473,
              40.7426835
            ],
            [
              -73.9847197,
              40.7423443
            ],
            [
              -73.9849234,
              40.7420643
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42454522",
        "properties": {
          "type": "node",
          "id": 42454522,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.984473,
            40.7426835
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117051",
        "properties": {
          "type": "way",
          "id": 196117051,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.984473,
              40.7426835
            ],
            [
              -73.9840243,
              40.7433005
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42454522",
        "properties": {
          "type": "node",
          "id": 42454522,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.984473,
            40.7426835
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117051",
        "properties": {
          "type": "way",
          "id": 196117051,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9840243,
              40.7433005
            ],
            [
              -73.984473,
              40.7426835
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446266",
        "properties": {
          "type": "node",
          "id": 42446266,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9840243,
            40.7433005
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117051",
        "properties": {
          "type": "way",
          "id": 196117051,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9840243,
              40.7433005
            ],
            [
              -73.9835731,
              40.7439209
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446266",
        "properties": {
          "type": "node",
          "id": 42446266,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9840243,
            40.7433005
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/196117051",
        "properties": {
          "type": "way",
          "id": 196117051,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9835731,
              40.7439209
            ],
            [
              -73.9840243,
              40.7433005
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436748",
        "properties": {
          "type": "node",
          "id": 42436748,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9835731,
            40.7439209
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040992",
        "properties": {
          "type": "way",
          "id": 226040992,
          "tags": {
            "bicycle": "yes",
            "cycleway:left": "track",
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 29th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "29th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9852457,
              40.7446233
            ],
            [
              -73.986846,
              40.745301
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436746",
        "properties": {
          "type": "node",
          "id": 42436746,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9852457,
            40.7446233
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040993",
        "properties": {
          "type": "way",
          "id": 226040993,
          "tags": {
            "bicycle": "yes",
            "cycleway:left": "track",
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 29th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "29th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.982012,
              40.7432609
            ],
            [
              -73.9819126,
              40.7432189
            ],
            [
              -73.9809217,
              40.7428015
            ],
            [
              -73.9806394,
              40.7426825
            ],
            [
              -73.9805555,
              40.7426471
            ],
            [
              -73.9804102,
              40.7425859
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436751",
        "properties": {
          "type": "node",
          "id": 42436751,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.982012,
            40.7432609
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040993",
        "properties": {
          "type": "way",
          "id": 226040993,
          "tags": {
            "bicycle": "yes",
            "cycleway:left": "track",
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 29th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "29th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.982012,
              40.7432609
            ],
            [
              -73.9821215,
              40.743307
            ],
            [
              -73.9835731,
              40.7439209
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436751",
        "properties": {
          "type": "node",
          "id": 42436751,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.982012,
            40.7432609
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040993",
        "properties": {
          "type": "way",
          "id": 226040993,
          "tags": {
            "bicycle": "yes",
            "cycleway:left": "track",
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 29th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "29th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9835731,
              40.7439209
            ],
            [
              -73.9821215,
              40.743307
            ],
            [
              -73.982012,
              40.7432609
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436748",
        "properties": {
          "type": "node",
          "id": 42436748,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9835731,
            40.7439209
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040996",
        "properties": {
          "type": "way",
          "id": 226040996,
          "tags": {
            "bicycle": "yes",
            "cycleway": "shared_lane",
            "highway": "tertiary",
            "maxspeed": "25 mph",
            "name": "East 30th Street",
            "name_1": "East 30 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "30th",
            "tiger:name_base_1": "30",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9847977,
              40.745239
            ],
            [
              -73.9832306,
              40.7445784
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445404",
        "properties": {
          "type": "node",
          "id": 42445404,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9847977,
            40.745239
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040996",
        "properties": {
          "type": "way",
          "id": 226040996,
          "tags": {
            "bicycle": "yes",
            "cycleway": "shared_lane",
            "highway": "tertiary",
            "maxspeed": "25 mph",
            "name": "East 30th Street",
            "name_1": "East 30 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "30th",
            "tiger:name_base_1": "30",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9832306,
              40.7445784
            ],
            [
              -73.9847977,
              40.745239
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668033",
        "properties": {
          "type": "node",
          "id": 4597668033,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9832306,
            40.7445784
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040996",
        "properties": {
          "type": "way",
          "id": 226040996,
          "tags": {
            "bicycle": "yes",
            "cycleway": "shared_lane",
            "highway": "tertiary",
            "maxspeed": "25 mph",
            "name": "East 30th Street",
            "name_1": "East 30 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "30th",
            "tiger:name_base_1": "30",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9832306,
              40.7445784
            ],
            [
              -73.9831267,
              40.7445346
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668033",
        "properties": {
          "type": "node",
          "id": 4597668033,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9832306,
            40.7445784
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040996",
        "properties": {
          "type": "way",
          "id": 226040996,
          "tags": {
            "bicycle": "yes",
            "cycleway": "shared_lane",
            "highway": "tertiary",
            "maxspeed": "25 mph",
            "name": "East 30th Street",
            "name_1": "East 30 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "30th",
            "tiger:name_base_1": "30",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9831267,
              40.7445346
            ],
            [
              -73.9832306,
              40.7445784
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445409",
        "properties": {
          "type": "node",
          "id": 42445409,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9831267,
            40.7445346
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040998",
        "properties": {
          "type": "way",
          "id": 226040998,
          "tags": {
            "bicycle": "yes",
            "cycleway:right": "lane",
            "highway": "tertiary",
            "maxspeed": "25 mph",
            "name": "East 30th Street",
            "name_1": "East 30 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "30th",
            "tiger:name_base_1": "30",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9831267,
              40.7445346
            ],
            [
              -73.9815614,
              40.7438801
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445409",
        "properties": {
          "type": "node",
          "id": 42445409,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9831267,
            40.7445346
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040998",
        "properties": {
          "type": "way",
          "id": 226040998,
          "tags": {
            "bicycle": "yes",
            "cycleway:right": "lane",
            "highway": "tertiary",
            "maxspeed": "25 mph",
            "name": "East 30th Street",
            "name_1": "East 30 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "30th",
            "tiger:name_base_1": "30",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9815614,
              40.7438801
            ],
            [
              -73.9831267,
              40.7445346
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445411",
        "properties": {
          "type": "node",
          "id": 42445411,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9815614,
            40.7438801
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/226040998",
        "properties": {
          "type": "way",
          "id": 226040998,
          "tags": {
            "bicycle": "yes",
            "cycleway:right": "lane",
            "highway": "tertiary",
            "maxspeed": "25 mph",
            "name": "East 30th Street",
            "name_1": "East 30 Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "30th",
            "tiger:name_base_1": "30",
            "tiger:name_direction_prefix": "E",
            "tiger:name_direction_prefix_1": "E",
            "tiger:name_type": "St",
            "tiger:name_type_1": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9815614,
              40.7438801
            ],
            [
              -73.9801,
              40.7432693
            ],
            [
              -73.9799506,
              40.7432068
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445411",
        "properties": {
          "type": "node",
          "id": 42445411,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9815614,
            40.7438801
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/420514148",
        "properties": {
          "type": "way",
          "id": 420514148,
          "tags": {
            "bicycle": "yes",
            "cycleway:left": "lane",
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 29th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "29th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9835731,
              40.7439209
            ],
            [
              -73.9836777,
              40.7439648
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436748",
        "properties": {
          "type": "node",
          "id": 42436748,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9835731,
            40.7439209
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/420514148",
        "properties": {
          "type": "way",
          "id": 420514148,
          "tags": {
            "bicycle": "yes",
            "cycleway:left": "lane",
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 29th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "29th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9836777,
              40.7439648
            ],
            [
              -73.9835731,
              40.7439209
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668043",
        "properties": {
          "type": "node",
          "id": 4597668043,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9836777,
            40.7439648
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/420514148",
        "properties": {
          "type": "way",
          "id": 420514148,
          "tags": {
            "bicycle": "yes",
            "cycleway:left": "lane",
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 29th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "29th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9836777,
              40.7439648
            ],
            [
              -73.9852457,
              40.7446233
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668043",
        "properties": {
          "type": "node",
          "id": 4597668043,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9836777,
            40.7439648
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/420514148",
        "properties": {
          "type": "way",
          "id": 420514148,
          "tags": {
            "bicycle": "yes",
            "cycleway:left": "lane",
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 29th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "29th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9852457,
              40.7446233
            ],
            [
              -73.9836777,
              40.7439648
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436746",
        "properties": {
          "type": "node",
          "id": 42436746,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9852457,
            40.7446233
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/420514149",
        "properties": {
          "type": "way",
          "id": 420514149,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9835731,
              40.7439209
            ],
            [
              -73.9831267,
              40.7445346
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436748",
        "properties": {
          "type": "node",
          "id": 42436748,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9835731,
            40.7439209
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/420514149",
        "properties": {
          "type": "way",
          "id": 420514149,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9831267,
              40.7445346
            ],
            [
              -73.9835731,
              40.7439209
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445409",
        "properties": {
          "type": "node",
          "id": 42445409,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9831267,
            40.7445346
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/420514149",
        "properties": {
          "type": "way",
          "id": 420514149,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9831267,
              40.7445346
            ],
            [
              -73.9826751,
              40.7451555
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445409",
        "properties": {
          "type": "node",
          "id": 42445409,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9831267,
            40.7445346
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/447001272",
        "properties": {
          "type": "way",
          "id": 447001272,
          "tags": {
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Madison Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Madison",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10037",
            "wikidata": "Q109849",
            "wikipedia": "en:Madison Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9852457,
              40.7446233
            ],
            [
              -73.9847977,
              40.745239
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436746",
        "properties": {
          "type": "node",
          "id": 42436746,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9852457,
            40.7446233
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/447001272",
        "properties": {
          "type": "way",
          "id": 447001272,
          "tags": {
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Madison Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Madison",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10037",
            "wikidata": "Q109849",
            "wikipedia": "en:Madison Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9847977,
              40.745239
            ],
            [
              -73.9852457,
              40.7446233
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445404",
        "properties": {
          "type": "node",
          "id": 42445404,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9847977,
            40.745239
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/447001272",
        "properties": {
          "type": "way",
          "id": 447001272,
          "tags": {
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Madison Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Madison",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10037",
            "wikidata": "Q109849",
            "wikipedia": "en:Madison Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9847977,
              40.745239
            ],
            [
              -73.9846353,
              40.7454616
            ],
            [
              -73.9843476,
              40.7458561
            ],
            [
              -73.9839604,
              40.7463997
            ],
            [
              -73.9838963,
              40.7464898
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445404",
        "properties": {
          "type": "node",
          "id": 42445404,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9847977,
            40.745239
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/458166896",
        "properties": {
          "type": "way",
          "id": 458166896,
          "tags": {
            "hgv": "local",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Lexington Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Lexington",
            "tiger:name_type": "Ave",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10035",
            "wikidata": "Q109739",
            "wikipedia": "en:Lexington Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9815614,
              40.7438801
            ],
            [
              -73.9811089,
              40.7444982
            ],
            [
              -73.980654,
              40.7451327
            ],
            [
              -73.9802079,
              40.7457355
            ],
            [
              -73.979724,
              40.746402
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445411",
        "properties": {
          "type": "node",
          "id": 42445411,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9815614,
            40.7438801
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/458166896",
        "properties": {
          "type": "way",
          "id": 458166896,
          "tags": {
            "hgv": "local",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Lexington Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Lexington",
            "tiger:name_type": "Ave",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10035",
            "wikidata": "Q109739",
            "wikipedia": "en:Lexington Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9815614,
              40.7438801
            ],
            [
              -73.9819667,
              40.7433231
            ],
            [
              -73.982012,
              40.7432609
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42445411",
        "properties": {
          "type": "node",
          "id": 42445411,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9815614,
            40.7438801
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/458166896",
        "properties": {
          "type": "way",
          "id": 458166896,
          "tags": {
            "hgv": "local",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Lexington Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Lexington",
            "tiger:name_type": "Ave",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10035",
            "wikidata": "Q109739",
            "wikipedia": "en:Lexington Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.982012,
              40.7432609
            ],
            [
              -73.9819667,
              40.7433231
            ],
            [
              -73.9815614,
              40.7438801
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436751",
        "properties": {
          "type": "node",
          "id": 42436751,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.982012,
            40.7432609
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/458166896",
        "properties": {
          "type": "way",
          "id": 458166896,
          "tags": {
            "hgv": "local",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Lexington Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Lexington",
            "tiger:name_type": "Ave",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10035",
            "wikidata": "Q109739",
            "wikipedia": "en:Lexington Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.982012,
              40.7432609
            ],
            [
              -73.9820502,
              40.7432086
            ],
            [
              -73.9824166,
              40.7427071
            ],
            [
              -73.9824628,
              40.7426439
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42436751",
        "properties": {
          "type": "node",
          "id": 42436751,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.982012,
            40.7432609
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/458166896",
        "properties": {
          "type": "way",
          "id": 458166896,
          "tags": {
            "hgv": "local",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Lexington Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Lexington",
            "tiger:name_type": "Ave",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10035",
            "wikidata": "Q109739",
            "wikipedia": "en:Lexington Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9824628,
              40.7426439
            ],
            [
              -73.9824166,
              40.7427071
            ],
            [
              -73.9820502,
              40.7432086
            ],
            [
              -73.982012,
              40.7432609
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446270",
        "properties": {
          "type": "node",
          "id": 42446270,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9824628,
            40.7426439
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/458166896",
        "properties": {
          "type": "way",
          "id": 458166896,
          "tags": {
            "hgv": "local",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Lexington Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Lexington",
            "tiger:name_type": "Ave",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10035",
            "wikidata": "Q109739",
            "wikipedia": "en:Lexington Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9824628,
              40.7426439
            ],
            [
              -73.9825005,
              40.742592
            ],
            [
              -73.9828643,
              40.7420916
            ],
            [
              -73.9829135,
              40.7420239
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446270",
        "properties": {
          "type": "node",
          "id": 42446270,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9824628,
            40.7426439
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/458166896",
        "properties": {
          "type": "way",
          "id": 458166896,
          "tags": {
            "hgv": "local",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Lexington Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Lexington",
            "tiger:name_type": "Ave",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10035",
            "wikidata": "Q109739",
            "wikipedia": "en:Lexington Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9829135,
              40.7420239
            ],
            [
              -73.9828643,
              40.7420916
            ],
            [
              -73.9825005,
              40.742592
            ],
            [
              -73.9824628,
              40.7426439
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446932",
        "properties": {
          "type": "node",
          "id": 42446932,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9829135,
            40.7420239
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/458166896",
        "properties": {
          "type": "way",
          "id": 458166896,
          "tags": {
            "hgv": "local",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Lexington Avenue",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Lexington",
            "tiger:name_type": "Ave",
            "tiger:zip_left": "10037",
            "tiger:zip_right": "10035",
            "wikidata": "Q109739",
            "wikipedia": "en:Lexington Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9829135,
              40.7420239
            ],
            [
              -73.9829498,
              40.7419741
            ],
            [
              -73.9833169,
              40.7414699
            ],
            [
              -73.9833636,
              40.7414058
            ],
            [
              -73.9834022,
              40.7413528
            ],
            [
              -73.9838144,
              40.7407867
            ],
            [
              -73.9842643,
              40.7401675
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/42446932",
        "properties": {
          "type": "node",
          "id": 42446932,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9829135,
            40.7420239
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/464683339",
        "properties": {
          "type": "way",
          "id": 464683339,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9836777,
              40.7439648
            ],
            [
              -73.9841296,
              40.7433448
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668043",
        "properties": {
          "type": "node",
          "id": 4597668043,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9836777,
            40.7439648
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/464683339",
        "properties": {
          "type": "way",
          "id": 464683339,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9841296,
              40.7433448
            ],
            [
              -73.9836777,
              40.7439648
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668030",
        "properties": {
          "type": "node",
          "id": 4597668030,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9841296,
            40.7433448
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/464683339",
        "properties": {
          "type": "way",
          "id": 464683339,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9841296,
              40.7433448
            ],
            [
              -73.9845789,
              40.7427282
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668030",
        "properties": {
          "type": "node",
          "id": 4597668030,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9841296,
            40.7433448
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/464683339",
        "properties": {
          "type": "way",
          "id": 464683339,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9845789,
              40.7427282
            ],
            [
              -73.9841296,
              40.7433448
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668031",
        "properties": {
          "type": "node",
          "id": 4597668031,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9845789,
            40.7427282
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/464683339",
        "properties": {
          "type": "way",
          "id": 464683339,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9845789,
              40.7427282
            ],
            [
              -73.9850299,
              40.7421093
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668031",
        "properties": {
          "type": "node",
          "id": 4597668031,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9845789,
            40.7427282
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/464683341",
        "properties": {
          "type": "way",
          "id": 464683341,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9832306,
              40.7445784
            ],
            [
              -73.9827785,
              40.7451988
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668033",
        "properties": {
          "type": "node",
          "id": 4597668033,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9832306,
            40.7445784
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/464683341",
        "properties": {
          "type": "way",
          "id": 464683341,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9832306,
              40.7445784
            ],
            [
              -73.9836777,
              40.7439648
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668033",
        "properties": {
          "type": "node",
          "id": 4597668033,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9832306,
            40.7445784
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/464683341",
        "properties": {
          "type": "way",
          "id": 464683341,
          "tags": {
            "FIXME": "verify that trucks are allowed",
            "hgv": "destination",
            "highway": "secondary",
            "maxspeed": "25 mph",
            "name": "Park Avenue South",
            "name:en": "Park Avenue South",
            "name:ru": "Парк-Авеню-Саут",
            "old_name": "4th Avenue",
            "oneway": "yes",
            "sidewalk": "both",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "Park",
            "tiger:name_direction_suffix": "S",
            "tiger:name_type": "Ave",
            "tiger:reviewed": "no",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016",
            "wikidata": "Q109711",
            "wikipedia": "en:Park Avenue"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9836777,
              40.7439648
            ],
            [
              -73.9832306,
              40.7445784
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4597668043",
        "properties": {
          "type": "node",
          "id": 4597668043,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9836777,
            40.7439648
          ]
        }
      }
    ]
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/570156527",
        "properties": {
          "type": "way",
          "id": 570156527,
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
              -73.9829542,
              40.7428505
            ],
            [
              -73.9828241,
              40.7430404
            ],
            [
              -73.9830257,
              40.7431197
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/5481897722",
        "properties": {
          "type": "node",
          "id": 5481897722,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9829542,
            40.7428505
          ]
        }
      }
    ]
  }
];
describe('overpassBuildBlocks', () => {
  test('_resolveIncompleteWayResultTask', done => {
    const ways = [
      {
        "type": "Feature",
        "id": "way/5671401",
        "properties": {
          "type": "way",
          "id": 5671401,
          "tags": {
            "highway": "residential",
            "maxspeed": "25 mph",
            "name": "East 28th Street",
            "oneway": "yes",
            "tiger:cfcc": "A41",
            "tiger:county": "New York, NY",
            "tiger:name_base": "28th",
            "tiger:name_direction_prefix": "E",
            "tiger:name_type": "St",
            "tiger:zip_left": "10016",
            "tiger:zip_right": "10016"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.9856985,
              40.7440046
            ],
            [
              -73.9873007,
              40.7446783
            ]
          ]
        }
      }
    ];
    const nodes = [
      {
        "type": "Feature",
        "id": "node/42445888",
        "properties": {
          "type": "node",
          "id": 42445888,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            -73.9856985,
            40.7440046
          ]
        }
      }
    ];
    const errors = []
    _resolveIncompleteWayResultTask({}, partialBlocks, {nodes, ways}).run().listen(defaultRunToResultConfig({
      onResolved: ({block, remainingPartialBlocks, nodeIdToWays}) => {
        expect(R.length(R.keys(nodeIdToWays))).toEqual(1)
      }
    }, errors, done));
  }, 200000);
});
