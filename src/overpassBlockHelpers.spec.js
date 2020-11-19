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

import moment from 'moment';
import {reqStrPathThrowing, defaultRunToResultConfig, omitDeep, chainObjToValues} from '@rescapes/ramda';
import * as R from 'ramda';
import {
  blocksToGeojson,
  getFeaturesOfBlock,
  locationsToGeojson, locationsToGeojsonFileResultTask, locationsToGeojsonWaysAndBoth,
  nodesAndIntersectionNodesForIncompleteWayResultTask
} from './overpassBlockHelpers.js';

const blocks = [
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/24839331",
        "properties": {
          "type": "way",
          "id": 24839331,
          "tags": {
            "bridge": "yes",
            "highway": "primary",
            "lanes": "2",
            "layer": "1",
            "name": "Margarethenbrücke",
            "ref": "2",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5847489,
              47.5473742
            ],
            [
              7.5849158,
              47.5475614
            ],
            [
              7.5850444,
              47.5477099
            ],
            [
              7.5857096,
              47.5485058
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/24839329",
        "properties": {
          "type": "way",
          "id": 24839329,
          "tags": {
            "highway": "primary",
            "lanes": "2",
            "maxspeed": "50",
            "name": "Margarethenbrücke",
            "ref": "2",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5857096,
              47.5485058
            ],
            [
              7.585893,
              47.5487681
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/19380819",
        "properties": {
          "type": "node",
          "id": 19380819,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5847489,
            47.5473742
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1506798194",
        "properties": {
          "type": "node",
          "id": 1506798194,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing",
            "tactile_paving": "no"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.585893,
            47.5487681
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/19380819": [
        "Margarethenbrücke",
        "Margarethenstrasse"
      ],
      "node/1506798194": [
        "Margarethenbrücke",
        "node/1506798194"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/25336497",
        "properties": {
          "type": "way",
          "id": 25336497,
          "tags": {
            "access": "no",
            "bicycle": "yes",
            "cycleway:left": "opposite",
            "foot": "yes",
            "highway": "unclassified",
            "motor_vehicle": "destination",
            "name": "Heumattstrasse",
            "oneway": "yes",
            "source": "survey",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5913029,
              47.5472548
            ],
            [
              7.5911494,
              47.5483086
            ],
            [
              7.5911223,
              47.5484947
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/276067693",
        "properties": {
          "type": "node",
          "id": 276067693,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5913029,
            47.5472548
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/276067709",
        "properties": {
          "type": "node",
          "id": 276067709,
          "tags": {
            "bicycle": "no",
            "crossing": "traffic_signals",
            "crossing_ref": "pelican",
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5911223,
            47.5484947
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/276067693": [
        "Heumattstrasse",
        "Centralbahnstrasse"
      ],
      "node/276067709": [
        "Heumattstrasse",
        "node/276067709"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/26623769",
        "properties": {
          "type": "way",
          "id": 26623769,
          "tags": {
            "bicycle": "yes",
            "cycleway": "no",
            "highway": "tertiary",
            "maxspeed": "50",
            "name": "Solothurnerstrasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.591337,
              47.5452834
            ],
            [
              7.5914743,
              47.5454446
            ],
            [
              7.5916189,
              47.5456186
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/208521585",
        "properties": {
          "type": "node",
          "id": 208521585,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.591337,
            47.5452834
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/107717351",
        "properties": {
          "type": "node",
          "id": 107717351,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5916189,
            47.5456186
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/208521585": [
        "Solothurnerstrasse",
        "Meret Oppenheim-Strasse"
      ],
      "node/107717351": [
        "Solothurnerstrasse",
        "node/107717351"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/107707744",
        "properties": {
          "type": "node",
          "id": 107707744,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5877635,
            47.5454243
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/2971278550",
        "properties": {
          "type": "node",
          "id": 2971278550,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing",
            "tactile_paving": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5904359,
            47.5443739
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/26623771",
        "properties": {
          "type": "way",
          "id": 26623771,
          "tags": {
            "highway": "unclassified",
            "lit": "yes",
            "maxspeed": "30",
            "name": "Güterstrasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5877635,
              47.5454243
            ],
            [
              7.5880935,
              47.5452961
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/29312264",
        "properties": {
          "type": "way",
          "id": 29312264,
          "tags": {
            "bicycle": "yes",
            "cycleway": "no",
            "highway": "unclassified",
            "lit": "yes",
            "maxspeed": "30",
            "name": "Güterstrasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5880935,
              47.5452961
            ],
            [
              7.5887525,
              47.5450413
            ],
            [
              7.5888558,
              47.5449981
            ],
            [
              7.5904359,
              47.5443739
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/107707744": [
        "Güterstrasse",
        "Gempenstrasse"
      ],
      "node/2971278550": [
        "Güterstrasse",
        "way/377476967"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/1255373471",
        "properties": {
          "type": "node",
          "id": 1255373471,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing",
            "tactile_paving": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5876778,
            47.5454576
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/19388646",
        "properties": {
          "type": "node",
          "id": 19388646,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5867807,
            47.5458062
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/26623772",
        "properties": {
          "type": "way",
          "id": 26623772,
          "tags": {
            "bicycle": "yes",
            "cycleway": "no",
            "highway": "unclassified",
            "lit": "yes",
            "maxspeed": "30",
            "name": "Güterstrasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5876778,
              47.5454576
            ],
            [
              7.5867807,
              47.5458062
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/1255373471": [
        "Güterstrasse",
        "way/84594809"
      ],
      "node/19388646": [
        "Güterstrasse",
        "Frobenstrasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/19388646",
        "properties": {
          "type": "node",
          "id": 19388646,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5867807,
            47.5458062
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1255386528",
        "properties": {
          "type": "node",
          "id": 1255386528,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.585606,
            47.5462626
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/26623772",
        "properties": {
          "type": "way",
          "id": 26623772,
          "tags": {
            "bicycle": "yes",
            "cycleway": "no",
            "highway": "unclassified",
            "lit": "yes",
            "maxspeed": "30",
            "name": "Güterstrasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5867807,
              47.5458062
            ],
            [
              7.585606,
              47.5462626
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/19388646": [
        "Güterstrasse",
        "Frobenstrasse"
      ],
      "node/1255386528": [
        "Güterstrasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/1255386528",
        "properties": {
          "type": "node",
          "id": 1255386528,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.585606,
            47.5462626
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1506797983",
        "properties": {
          "type": "node",
          "id": 1506797983,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing",
            "tactile_paving": "no"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5844841,
            47.5466984
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/26623772",
        "properties": {
          "type": "way",
          "id": 26623772,
          "tags": {
            "bicycle": "yes",
            "cycleway": "no",
            "highway": "unclassified",
            "lit": "yes",
            "maxspeed": "30",
            "name": "Güterstrasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.585606,
              47.5462626
            ],
            [
              7.5844841,
              47.5466984
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/1255386528": [
        "Güterstrasse"
      ],
      "node/1506797983": [
        "Güterstrasse",
        "way/377463668"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/26623777",
        "properties": {
          "type": "way",
          "id": 26623777,
          "tags": {
            "cycleway": "no",
            "highway": "residential",
            "maxspeed": "30",
            "name": "Solothurnerstrasse",
            "oneway": "no",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5905322,
              47.5442944
            ],
            [
              7.5896564,
              47.5433076
            ],
            [
              7.5896066,
              47.5432523
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/3808510027",
        "properties": {
          "type": "node",
          "id": 3808510027,
          "tags": {
            "bicycle": "no",
            "crossing": "unmarked",
            "highway": "crossing",
            "tactile_paving": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5905322,
            47.5442944
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/300295123",
        "properties": {
          "type": "node",
          "id": 300295123,
          "tags": {
            "highway": "traffic_signals"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5896066,
            47.5432523
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/3808510027": [
        "Solothurnerstrasse",
        "way/377476967"
      ],
      "node/300295123": [
        "Solothurnerstrasse",
        "node/300295123"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/3808510032",
        "properties": {
          "type": "node",
          "id": 3808510032,
          "tags": {
            "bicycle": "no",
            "crossing": "unmarked",
            "highway": "crossing",
            "tactile_paving": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5905928,
            47.5443668
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/208521585",
        "properties": {
          "type": "node",
          "id": 208521585,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.591337,
            47.5452834
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/26623777",
        "properties": {
          "type": "way",
          "id": 26623777,
          "tags": {
            "cycleway": "no",
            "highway": "residential",
            "maxspeed": "30",
            "name": "Solothurnerstrasse",
            "oneway": "no",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5905928,
              47.5443668
            ],
            [
              7.591337,
              47.5452834
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/3808510032": [
        "Solothurnerstrasse",
        "way/377476967"
      ],
      "node/208521585": [
        "Solothurnerstrasse",
        "Meret Oppenheim-Strasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/276067693",
        "properties": {
          "type": "node",
          "id": 276067693,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5913029,
            47.5472548
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/28676294",
        "properties": {
          "type": "way",
          "id": 28676294,
          "tags": {
            "access": "no",
            "bicycle": "yes",
            "cycleway": "lane",
            "foot": "yes",
            "highway": "unclassified",
            "lanes": "1",
            "motor_vehicle": "permissive",
            "name": "Centralbahnstrasse",
            "oneway": "yes",
            "psv": "yes",
            "surface": "paved"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5913029,
              47.5472548
            ],
            [
              7.5919376,
              47.5469947
            ],
            [
              7.5921041,
              47.547003
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/34807564",
        "properties": {
          "type": "way",
          "id": 34807564,
          "tags": {
            "access": "no",
            "bicycle": "yes",
            "cycleway": "lane",
            "foot": "yes",
            "highway": "unclassified",
            "motor_vehicle": "permissive",
            "name": "Centralbahnstrasse",
            "oneway": "yes",
            "psv": "yes",
            "surface": "paved"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5921041,
              47.547003
            ],
            [
              7.5920489,
              47.5469503
            ],
            [
              7.5919966,
              47.546944
            ],
            [
              7.5919202,
              47.546944
            ],
            [
              7.5917832,
              47.5469838
            ],
            [
              7.5916989,
              47.5470065
            ],
            [
              7.5915689,
              47.5470454
            ],
            [
              7.5909666,
              47.5472798
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/684099399",
        "properties": {
          "type": "way",
          "id": 684099399,
          "tags": {
            "access": "no",
            "bicycle": "yes",
            "cycleway": "lane",
            "foot": "yes",
            "highway": "unclassified",
            "motor_vehicle": "permissive",
            "name": "Centralbahnstrasse",
            "oneway": "yes",
            "psv": "yes",
            "surface": "paved"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5909666,
              47.5472798
            ],
            [
              7.5905537,
              47.5474405
            ],
            [
              7.5904111,
              47.5475114
            ],
            [
              7.5902876,
              47.5475911
            ],
            [
              7.5902571,
              47.5476197
            ],
            [
              7.5902189,
              47.5476585
            ],
            [
              7.5901974,
              47.5476856
            ],
            [
              7.5901726,
              47.5477285
            ],
            [
              7.59016,
              47.5477658
            ],
            [
              7.5901533,
              47.5478034
            ],
            [
              7.59016,
              47.5478398
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/28676294",
        "properties": {
          "type": "way",
          "id": 28676294,
          "tags": {
            "access": "no",
            "bicycle": "yes",
            "cycleway": "lane",
            "foot": "yes",
            "highway": "unclassified",
            "lanes": "1",
            "motor_vehicle": "permissive",
            "name": "Centralbahnstrasse",
            "oneway": "yes",
            "psv": "yes",
            "surface": "paved"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.59016,
              47.5478398
            ],
            [
              7.5901714,
              47.5478603
            ],
            [
              7.5902,
              47.5478913
            ],
            [
              7.5902247,
              47.5479074
            ],
            [
              7.5902449,
              47.5479192
            ],
            [
              7.5902719,
              47.5479271
            ],
            [
              7.5903008,
              47.5479285
            ],
            [
              7.5903339,
              47.5479256
            ],
            [
              7.5903707,
              47.5479165
            ],
            [
              7.5903994,
              47.5478977
            ],
            [
              7.5904183,
              47.5478752
            ],
            [
              7.5904527,
              47.5477747
            ],
            [
              7.5904845,
              47.5476471
            ],
            [
              7.5904982,
              47.5476078
            ],
            [
              7.5905253,
              47.5475721
            ],
            [
              7.5906042,
              47.5475163
            ],
            [
              7.5906987,
              47.5474786
            ],
            [
              7.5913029,
              47.5472548
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/276067693": [
        "Centralbahnstrasse",
        "Heumattstrasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/3798272921",
        "properties": {
          "type": "node",
          "id": 3798272921,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5905043,
            47.5471707
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1615532211",
        "properties": {
          "type": "node",
          "id": 1615532211,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5906393,
            47.5473466
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/28750462",
        "properties": {
          "type": "way",
          "id": 28750462,
          "tags": {
            "bicycle": "yes",
            "covered": "yes",
            "cycleway": "lane",
            "highway": "footway",
            "level": "0",
            "motor_vehicle": "no",
            "tunnel": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5905043,
              47.5471707
            ],
            [
              7.590559,
              47.547242
            ],
            [
              7.5905761,
              47.5472642
            ],
            [
              7.5906393,
              47.5473466
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/3798272921": [
        "way/28750462",
        "way/376392783"
      ],
      "node/1615532211": [
        "way/28750462",
        "Centralbahnstrasse"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/29312264",
        "properties": {
          "type": "way",
          "id": 29312264,
          "tags": {
            "bicycle": "yes",
            "cycleway": "no",
            "highway": "unclassified",
            "lit": "yes",
            "maxspeed": "30",
            "name": "Güterstrasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5906462,
              47.544291
            ],
            [
              7.591304,
              47.5440394
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/2971278549",
        "properties": {
          "type": "node",
          "id": 2971278549,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing",
            "tactile_paving": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5906462,
            47.544291
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/2971278547",
        "properties": {
          "type": "node",
          "id": 2971278547,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing",
            "tactile_paving": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.591304,
            47.5440394
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/2971278549": [
        "Güterstrasse",
        "way/377476967"
      ],
      "node/2971278547": [
        "Güterstrasse",
        "node/2971278547"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/1506798015",
        "properties": {
          "type": "node",
          "id": 1506798015,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5848341,
            47.5472343
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3972984803",
        "properties": {
          "type": "node",
          "id": 3972984803,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5896632,
            47.5458274
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/109731333",
        "properties": {
          "type": "way",
          "id": 109731333,
          "tags": {
            "bicycle": "yes",
            "cycleway": "lane",
            "highway": "tertiary",
            "lanes": "3",
            "lanes:backward": "2",
            "lanes:forward": "1",
            "maxspeed": "50",
            "name": "Meret Oppenheim-Strasse",
            "official_name": "Meret-Oppenheim-Strasse",
            "surface": "asphalt",
            "turn:lanes:backward": "slight_left|slight_right",
            "turn:lanes:forward": "none"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5848341,
              47.5472343
            ],
            [
              7.5853601,
              47.5470633
            ],
            [
              7.5856624,
              47.5470211
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/321723178",
        "properties": {
          "type": "way",
          "id": 321723178,
          "tags": {
            "bicycle": "yes",
            "cycleway": "lane",
            "highway": "tertiary",
            "lanes": "2",
            "maxspeed": "50",
            "name": "Meret Oppenheim-Strasse",
            "official_name": "Meret-Oppenheim-Strasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5856624,
              47.5470211
            ],
            [
              7.5868931,
              47.5466847
            ],
            [
              7.5878605,
              47.5464178
            ],
            [
              7.5886798,
              47.5461568
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/706164905",
        "properties": {
          "type": "way",
          "id": 706164905,
          "tags": {
            "highway": "tertiary",
            "name": "Meret Oppenheim-Strasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5886798,
              47.5461568
            ],
            [
              7.5891133,
              47.5460017
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/423408062",
        "properties": {
          "type": "way",
          "id": 423408062,
          "tags": {
            "highway": "tertiary",
            "name": "Meret Oppenheim-Strasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5891133,
              47.5460017
            ],
            [
              7.5894754,
              47.5458731
            ],
            [
              7.5896632,
              47.5458274
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/1506798015": [
        "Meret Oppenheim-Strasse",
        "way/377463668"
      ],
      "node/3972984803": [
        "Meret Oppenheim-Strasse"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/109733074",
        "properties": {
          "type": "way",
          "id": 109733074,
          "tags": {
            "highway": "service",
            "name": "Güterstrasse"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.585606,
              47.5462626
            ],
            [
              7.5855979,
              47.5462521
            ],
            [
              7.5852961,
              47.5458625
            ],
            [
              7.5851769,
              47.5457697
            ],
            [
              7.5849816,
              47.5457812
            ],
            [
              7.5844608,
              47.5459807
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/1255386528",
        "properties": {
          "type": "node",
          "id": 1255386528,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.585606,
            47.5462626
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/4862507994",
        "properties": {
          "type": "node",
          "id": 4862507994,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5844608,
            47.5459807
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/4862507994",
        "properties": {
          "type": "node",
          "id": 4862507994,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5844608,
            47.5459807
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/1255386528": [
        "Güterstrasse"
      ],
      "node/4862507994": [
        "Güterstrasse",
        "node/4862507994"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/19388646",
        "properties": {
          "type": "node",
          "id": 19388646,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5867807,
            47.5458062
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/19388648",
        "properties": {
          "type": "node",
          "id": 19388648,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5858626,
            47.5447059
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/143768839",
        "properties": {
          "type": "way",
          "id": 143768839,
          "tags": {
            "cycleway": "opposite",
            "highway": "residential",
            "lit": "yes",
            "maxspeed": "30",
            "name": "Frobenstrasse",
            "oneway": "yes",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5867807,
              47.5458062
            ],
            [
              7.5867735,
              47.5457975
            ],
            [
              7.5858626,
              47.5447059
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/19388646": [
        "Frobenstrasse",
        "Güterstrasse"
      ],
      "node/19388648": [
        "Frobenstrasse",
        "Dornacherstrasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/107708936",
        "properties": {
          "type": "node",
          "id": 107708936,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.586829,
            47.5443338
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3808510036",
        "properties": {
          "type": "node",
          "id": 3808510036,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5877347,
            47.5453907
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/143768848",
        "properties": {
          "type": "way",
          "id": 143768848,
          "tags": {
            "cycleway:left": "opposite",
            "highway": "residential",
            "lit": "yes",
            "maxspeed": "30",
            "name": "Gempenstrasse",
            "oneway": "yes",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.586829,
              47.5443338
            ],
            [
              7.5877347,
              47.5453907
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/107708936": [
        "Gempenstrasse",
        "Dornacherstrasse"
      ],
      "node/3808510036": [
        "Gempenstrasse",
        "way/377476967"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/182406490",
        "properties": {
          "type": "way",
          "id": 182406490,
          "tags": {
            "access": "no",
            "bicycle": "no",
            "cycleway": "lane",
            "foot": "yes",
            "highway": "footway",
            "motor_vehicle": "no",
            "name": "Centralbahnstrasse"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5906393,
              47.5473466
            ],
            [
              7.5906516,
              47.5473622
            ],
            [
              7.5916494,
              47.546982
            ],
            [
              7.5917276,
              47.5469553
            ],
            [
              7.5918014,
              47.5469301
            ],
            [
              7.5918871,
              47.5469009
            ],
            [
              7.5919294,
              47.5468864
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/1615532211",
        "properties": {
          "type": "node",
          "id": 1615532211,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5906393,
            47.5473466
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1599869624",
        "properties": {
          "type": "node",
          "id": 1599869624,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5919294,
            47.5468864
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/1615532211": [
        "Centralbahnstrasse",
        "way/28750462"
      ],
      "node/1599869624": [
        "Centralbahnstrasse",
        "node/1599869624"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/193642852",
        "properties": {
          "type": "way",
          "id": 193642852,
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
              7.5877617,
              47.5455573
            ],
            [
              7.5876774,
              47.5455922
            ],
            [
              7.5876367,
              47.5456116
            ],
            [
              7.5878539,
              47.5458089
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/2041669205",
        "properties": {
          "type": "node",
          "id": 2041669205,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5877617,
            47.5455573
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/2041669196",
        "properties": {
          "type": "node",
          "id": 2041669196,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5878539,
            47.5458089
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/2041669196",
        "properties": {
          "type": "node",
          "id": 2041669196,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5878539,
            47.5458089
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/2041669205": [
        "way/193642852",
        "way/84594809"
      ],
      "node/2041669196": [
        "way/193642852",
        "node/2041669196"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/238956472",
        "properties": {
          "type": "way",
          "id": 238956472,
          "tags": {
            "bicycle": "yes",
            "cycleway": "lane",
            "highway": "unclassified",
            "maxspeed": "50",
            "name": "Meret Oppenheim-Strasse",
            "official_name": "Meret-Oppenheim-Strasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5896632,
              47.5458274
            ],
            [
              7.5890799,
              47.5458552
            ],
            [
              7.5889494,
              47.545879
            ],
            [
              7.5888179,
              47.545903
            ],
            [
              7.5886449,
              47.545946
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/673204674",
        "properties": {
          "type": "way",
          "id": 673204674,
          "tags": {
            "bicycle": "yes",
            "cycleway": "lane",
            "highway": "unclassified",
            "maxspeed": "50",
            "name": "Meret Oppenheim-Strasse",
            "official_name": "Meret-Oppenheim-Strasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5886449,
              47.545946
            ],
            [
              7.588621,
              47.545952
            ],
            [
              7.5885346,
              47.5459738
            ],
            [
              7.5884888,
              47.5459854
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/3972984803",
        "properties": {
          "type": "node",
          "id": 3972984803,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5896632,
            47.5458274
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1255373451",
        "properties": {
          "type": "node",
          "id": 1255373451,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5884888,
            47.5459854
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1255373451",
        "properties": {
          "type": "node",
          "id": 1255373451,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5884888,
            47.5459854
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/3972984803": [
        "Meret Oppenheim-Strasse"
      ],
      "node/1255373451": [
        "Meret Oppenheim-Strasse",
        "node/1255373451"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/321723187",
        "properties": {
          "type": "way",
          "id": 321723187,
          "tags": {
            "highway": "primary",
            "lanes": "2",
            "maxspeed": "50",
            "name": "Margarethenstrasse",
            "oneway": "yes",
            "ref": "2",
            "surface": "asphalt",
            "turn:lanes": "slight_left;left|through;right"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5846738,
              47.5472848
            ],
            [
              7.5846105,
              47.5472388
            ],
            [
              7.5845047,
              47.547162
            ],
            [
              7.5844318,
              47.5470994
            ],
            [
              7.5843927,
              47.5470574
            ],
            [
              7.5843656,
              47.5470281
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/208521579",
        "properties": {
          "type": "node",
          "id": 208521579,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5846738,
            47.5472848
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3284890500",
        "properties": {
          "type": "node",
          "id": 3284890500,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5843656,
            47.5470281
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/208521579": [
        "Margarethenstrasse",
        "Meret Oppenheim-Strasse"
      ],
      "node/3284890500": [
        "Margarethenstrasse",
        "node/3284890500"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/107708936",
        "properties": {
          "type": "node",
          "id": 107708936,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.586829,
            47.5443338
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/19388648",
        "properties": {
          "type": "node",
          "id": 19388648,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5858626,
            47.5447059
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/338840629",
        "properties": {
          "type": "way",
          "id": 338840629,
          "tags": {
            "bicycle": "yes",
            "cycleway:right": "share_busway",
            "highway": "secondary",
            "lanes": "2",
            "lanes:psv:forward": "1",
            "maxspeed": "50",
            "name": "Dornacherstrasse",
            "note": "white signed",
            "oneway": "yes",
            "surface": "asphalt",
            "turn:lanes": "left|left;through;right"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.586829,
              47.5443338
            ],
            [
              7.5859193,
              47.5446841
            ],
            [
              7.5858626,
              47.5447059
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/107708936": [
        "Dornacherstrasse",
        "Gempenstrasse"
      ],
      "node/19388648": [
        "Dornacherstrasse",
        "Frobenstrasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/1956285389",
        "properties": {
          "type": "node",
          "id": 1956285389,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5843748,
            47.5467382
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/208521579",
        "properties": {
          "type": "node",
          "id": 208521579,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5846738,
            47.5472848
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/361716884",
        "properties": {
          "type": "way",
          "id": 361716884,
          "tags": {
            "highway": "primary",
            "lanes": "2",
            "maxspeed": "50",
            "name": "Margarethenstrasse",
            "oneway": "yes",
            "ref": "2",
            "surface": "asphalt",
            "turn:lanes": "through|slight_right"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5843748,
              47.5467382
            ],
            [
              7.5844016,
              47.5467763
            ],
            [
              7.5845276,
              47.5469713
            ],
            [
              7.5846624,
              47.5471582
            ],
            [
              7.5846708,
              47.547251
            ],
            [
              7.5846738,
              47.5472848
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/1956285389": [
        "Margarethenstrasse",
        "Güterstrasse"
      ],
      "node/208521579": [
        "Margarethenstrasse",
        "Meret Oppenheim-Strasse"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/376392783",
        "properties": {
          "type": "way",
          "id": 376392783,
          "tags": {
            "bicycle": "yes",
            "covered": "yes",
            "cycleway": "lane",
            "highway": "footway",
            "level": "0",
            "motor_vehicle": "no",
            "tunnel": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5905043,
              47.5471707
            ],
            [
              7.5907918,
              47.5470702
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/3798272921",
        "properties": {
          "type": "node",
          "id": 3798272921,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5905043,
            47.5471707
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1900225304",
        "properties": {
          "type": "node",
          "id": 1900225304,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5907918,
            47.5470702
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/1900225304",
        "properties": {
          "type": "node",
          "id": 1900225304,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5907918,
            47.5470702
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/3798272921": [
        "way/376392783",
        "way/28750462"
      ],
      "node/1900225304": [
        "way/376392783",
        "node/1900225304"
      ]
    }
  },
  {
    "ways": [
      {
        "type": "Feature",
        "id": "way/377463668",
        "properties": {
          "type": "way",
          "id": 377463668,
          "tags": {
            "highway": "footway",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5848341,
              47.5472343
            ],
            [
              7.5848674,
              47.5472764
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/380815412",
        "properties": {
          "type": "way",
          "id": 380815412,
          "tags": {
            "highway": "footway",
            "incline": "down",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5848674,
              47.5472764
            ],
            [
              7.5848486,
              47.5473186
            ],
            [
              7.5848477,
              47.5473524
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/380815413",
        "properties": {
          "type": "way",
          "id": 380815413,
          "tags": {
            "bridge": "yes",
            "highway": "footway",
            "layer": "1",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5848477,
              47.5473524
            ],
            [
              7.5849949,
              47.5475282
            ]
          ]
        }
      }
    ],
    "nodes": [
      {
        "type": "Feature",
        "id": "node/1506798015",
        "properties": {
          "type": "node",
          "id": 1506798015,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5848341,
            47.5472343
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3841103059",
        "properties": {
          "type": "node",
          "id": 3841103059,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5849949,
            47.5475282
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/1506798015": [
        "way/377463668",
        "Meret Oppenheim-Strasse"
      ],
      "node/3841103059": [
        "way/380815413",
        "node/3841103059"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/1506798015",
        "properties": {
          "type": "node",
          "id": 1506798015,
          "tags": {
            "bicycle": "no",
            "crossing": "uncontrolled",
            "crossing_ref": "zebra",
            "highway": "crossing"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5848341,
            47.5472343
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3808370162",
        "properties": {
          "type": "node",
          "id": 3808370162,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5845144,
            47.546734
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/377463668",
        "properties": {
          "type": "way",
          "id": 377463668,
          "tags": {
            "highway": "footway",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5848341,
              47.5472343
            ],
            [
              7.5847982,
              47.5471908
            ],
            [
              7.5848235,
              47.5471174
            ],
            [
              7.5847513,
              47.5470934
            ],
            [
              7.5844891,
              47.5467893
            ],
            [
              7.5845144,
              47.546734
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/1506798015": [
        "way/377463668",
        "Meret Oppenheim-Strasse"
      ],
      "node/3808370162": [
        "way/377463668",
        "way/377464579"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/3808510036",
        "properties": {
          "type": "node",
          "id": 3808510036,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5877347,
            47.5453907
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3808510027",
        "properties": {
          "type": "node",
          "id": 3808510027,
          "tags": {
            "bicycle": "no",
            "crossing": "unmarked",
            "highway": "crossing",
            "tactile_paving": "yes"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5905322,
            47.5442944
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/377476967",
        "properties": {
          "type": "way",
          "id": 377476967,
          "tags": {
            "highway": "footway",
            "lit": "yes",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5877347,
              47.5453907
            ],
            [
              7.5888255,
              47.5449606
            ],
            [
              7.590409,
              47.5443425
            ],
            [
              7.5905322,
              47.5442944
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/3808510036": [
        "way/377476967",
        "Gempenstrasse"
      ],
      "node/3808510027": [
        "way/377476967",
        "Solothurnerstrasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/3808510034",
        "properties": {
          "type": "node",
          "id": 3808510034,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5904711,
            47.5444179
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/4635948531",
        "properties": {
          "type": "node",
          "id": 4635948531,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5891197,
            47.5449416
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/377476969",
        "properties": {
          "type": "way",
          "id": 377476969,
          "tags": {
            "highway": "footway",
            "lit": "yes",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5904711,
              47.5444179
            ],
            [
              7.5891197,
              47.5449416
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/3808510034": [
        "way/377476969",
        "way/377476967"
      ],
      "node/4635948531": [
        "way/377476969",
        "way/469211174"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4635948531",
        "properties": {
          "type": "node",
          "id": 4635948531,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5891197,
            47.5449416
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/3808510043",
        "properties": {
          "type": "node",
          "id": 3808510043,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5877038,
            47.5454885
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/377476969",
        "properties": {
          "type": "way",
          "id": 377476969,
          "tags": {
            "highway": "footway",
            "lit": "yes",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5891197,
              47.5449416
            ],
            [
              7.5881212,
              47.5453285
            ],
            [
              7.5877038,
              47.5454885
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/4635948531": [
        "way/377476969",
        "way/469211174"
      ],
      "node/3808510043": [
        "way/377476969",
        "way/377476968",
        "way/84594809"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4635948533",
        "properties": {
          "type": "node",
          "id": 4635948533,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5897885,
            47.5458162
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/208521585",
        "properties": {
          "type": "node",
          "id": 208521585,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.591337,
            47.5452834
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/394283351",
        "properties": {
          "type": "way",
          "id": 394283351,
          "tags": {
            "bicycle": "yes",
            "cycleway": "lane",
            "highway": "tertiary",
            "lanes": "2",
            "maxspeed": "50",
            "name": "Meret Oppenheim-Strasse",
            "official_name": "Meret-Oppenheim-Strasse",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5897885,
              47.5458162
            ],
            [
              7.5898197,
              47.5458101
            ],
            [
              7.5899147,
              47.5457915
            ],
            [
              7.5904275,
              47.545626
            ],
            [
              7.5912178,
              47.545325
            ],
            [
              7.591337,
              47.5452834
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/4635948533": [
        "Meret Oppenheim-Strasse",
        "way/469211174"
      ],
      "node/208521585": [
        "Meret Oppenheim-Strasse",
        "Solothurnerstrasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/4635948531",
        "properties": {
          "type": "node",
          "id": 4635948531,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5891197,
            47.5449416
          ]
        }
      },
      {
        "type": "Feature",
        "id": "node/4635948533",
        "properties": {
          "type": "node",
          "id": 4635948533,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.5897885,
            47.5458162
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/469211174",
        "properties": {
          "type": "way",
          "id": 469211174,
          "tags": {
            "highway": "footway",
            "surface": "asphalt"
          },
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              7.5891197,
              47.5449416
            ],
            [
              7.5892938,
              47.5452746
            ],
            [
              7.5897885,
              47.5458162
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/4635948531": [
        "way/469211174",
        "way/377476969"
      ],
      "node/4635948533": [
        "way/469211174",
        "Meret Oppenheim-Strasse"
      ]
    }
  },
  {
    "nodes": [
      {
        "type": "Feature",
        "id": "node/5744933918",
        "properties": {
          "type": "node",
          "id": 5744933918,
          "tags": {},
          "relations": [],
          "meta": {}
        },
        "geometry": {
          "type": "Point",
          "coordinates": [
            7.589703,
            47.54724
          ]
        }
      }
    ],
    "ways": [
      {
        "type": "Feature",
        "id": "way/516231720",
        "properties": {
          "type": "way",
          "id": 516231720,
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
              7.589703,
              47.54724
            ],
            [
              7.5898815,
              47.5471799
            ],
            [
              7.5898584,
              47.547147
            ],
            [
              7.589652,
              47.5472148
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "id": "way/516231722",
        "properties": {
          "type": "way",
          "id": 516231722,
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
              7.589652,
              47.5472148
            ],
            [
              7.589703,
              47.54724
            ]
          ]
        }
      }
    ],
    "nodesToIntersections": {
      "node/5744933918": [
        "way/516231720",
        "way/516231722"
      ]
    }
  }
];

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
    const features = getFeaturesOfBlock({}, wayFeatures, nodeFeatures);
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
    const features = getFeaturesOfBlock({}, wayFeatures, nodeFeatures);
    // Expect only one feature between the block
    expect(R.length(R.prop('ways', features))).toEqual(1);
    // Expect the feature is sliced down two 2 points
    expect(R.length(reqStrPathThrowing('ways.0.geometry.coordinates', features))).toEqual(2);
  });

  test('nodesOfWaysTask', done => {
    const errors = [];
    expect.assertions(1);
    nodesAndIntersectionNodesForIncompleteWayResultTask(
      {},
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
            omitDeep(['query'], reqStrPathThrowing('nodesByWayId', response))
          ).toEqual({
            "way/498142930": {
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


  test('blocksToGeojson', () => {
    expect(blocksToGeojson(blocks)).toBeTruthy();
  });

  test('locationsToGeojson', () => {
    const locations = R.map(
      block => {
        return {
          geojson: {
            "type": "FeatureCollection",
            "features": chainObjToValues((feature, type) => feature, R.pick(['ways', 'nodes'], block))
          }
        };
      },
      blocks
    );
    expect(locationsToGeojson(locations)).toBeTruthy();
  });

  test('locationsToGeojsonWaysAndBoth', () => {
    const locations = R.map(
      block => {
        return {
          geojson: {
            "type": "FeatureCollection",
            "features": chainObjToValues((feature, type) => feature, R.pick(['ways', 'nodes'], block))
          }
        };
      },
      blocks
    );
    expect(locationsToGeojsonWaysAndBoth(locations)).toBeTruthy();
  }, 10000);

  test('locationsToGeojsonFileResultTask', done => {
    const locations = R.map(
      block => {
        return {
          geojson: {
            "type": "FeatureCollection",
            "features": chainObjToValues((feature, type) => feature, R.pick(['ways', 'nodes'], block))
          }
        };
      },
      blocks
    );
    const errors = [];
    locationsToGeojsonFileResultTask('/tmp', `test_${moment().format('YYYY-MM-DD-HH-mm-SS')}`, locations).run().listen(defaultRunToResultConfig({
      onResolved: values => {
        expect(values).toBeTruthy();
      }
    }, errors, done));
  }, 10000);
});