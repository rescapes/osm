import * as R from 'ramda';
import buffer from '@turf/buffer';
import {point} from '@turf/helpers';
import {
  addressPair,
  addressStringForBlock,
  addressStrings,
  aggregateLocation,
  featuresOfOsmType,
  fixWordsThatTripUpGoogle,
  geojsonFeaturesHaveRadii,
  intersectionsByNodeIdToSortedIntersections,
  isResolvableAllBlocksLocation,
  locationWithIntersectionInBothOrders,
  locationWithLocationPoints,
  mapGeojsonFeaturesHaveRadiiToPolygon,
  normalizedIntersectionNames, oldIntersectionUpgrade,
  osmFeaturesOfLocationForType
} from './locationHelpers.js';
import {bufferAndUnionGeojson} from '@rescapes/helpers'
import {defaultRunConfig, mergeDeepWithConcatArrays, reqStrPathThrowing} from '@rescapes/ramda';
import {blocksToGeojson, locationsToGeojson} from './overpassBlockHelpers.js';
import {bufferedFeaturesToOsmAllBlocksQueryResultsTask} from './overpassAllBlocks.js';
import sampleStreetLocationsAndBlocks from './samples/hongKongStreetLocationsAndBlocks.json';

const sampleCityLocations = [
  {
    "city": "Kampala",
    "country": "Uganda"
  },
  {
    "city": "Yerevan",
    "country": "Armenia"
  },
  {
    "city": "Phnom Penh",
    "country": "Cambodia"
  },
  {
    "city": "Siem Reap",
    "country": "Cambodia"
  },
  {
    "city": "Sihanoukville",
    "country": "Cambodia"
  },
  {
    "city": "Hong Kong",
    "country": "Hong Kong"
  },
  {
    "city": "Fukuoka",
    "country": "Japan"
  },
  {
    "city": "Hiroshima",
    "country": "Japan"
  },
  {
    "city": "Kanazawa",
    "country": "Japan"
  }
];

describe('LocationHeleprs', () => {
  const location = {
    country: 'USA',
    state: 'Anystate',
    city: 'Anytown',
    neighborhood: 'Downtown'
  };
  test('addressPair', () => {
    expect(addressPair(
      R.merge(location, {
        street: 'Main St',
        intersections: [
          {
            data: {
              streets: [
                'Main St',
                'First St'
              ]
            }
          },
          {
            data: {
              streets: [
                'Main St',
                'Second St'
              ]
            }
          }
        ]
      })
    )).toEqual([
      "Main St & First St, Anytown, Anystate, USA",
      "Main St & Second St, Anytown, Anystate, USA"
    ]);
  });

  test('addressStrings', () =>
    expect(addressStrings({
      country: 'USA',
      state: 'DC',
      city: 'Washington',
      street: 'Monroe St',
      intersections: [
        {
          data: {streets: ['Monroe St', '13th NE']}
        },
        {
          data: {streets: ['Political St', 'Correctness St']}
        }
      ]
    })).toEqual(
      ['Monroe St & 13th NE, Washington, DC, USA',
        'Political St & Correctness St, Washington, DC, USA']
    )
  );

  test('addressStringForBlock', () =>
    expect(addressStringForBlock({
      country: 'USA',
      state: 'DC',
      city: 'Washington',
      street: 'Monroe St',
      // Street changes name at the intersection
      intersections: [{data: {streets: ['Monroe St', '13th NE']}}, {data: {streets: ['Political St', 'Correctness St']}}]
    })).toEqual(
      'Monroe St & 13th NE <-> Political St & Correctness St (Street Name: Monroe St), Washington, DC, USA'
    )
  );

  test('addressStringForBlockNoIntersections', () =>
    expect(addressStringForBlock({
      country: 'USA',
      state: 'DC',
      city: 'Washington',
      street: 'Monroe St'
    })).toEqual(
      'Intersections N/A (Street Name: Monroe St), Washington, DC, USA'
    )
  );


  test('intersectionsByNodeIdToSortedIntersections', () => {
    expect(intersectionsByNodeIdToSortedIntersections(
      {
        geojson: {
          features: [
            {
              "type": "Feature",
              "id": "node/4896277399"
            },
            {
              "type": "Feature",
              "id": "node/4896277397"
            },
            {
              "type": "Feature",
              "id": "way/498142936",
              "properties": {
                "type": "way",
                "id": "way/498142936",
                "name": 'Purpose St'
              }
            }
          ]
        }
      },
      {
        ['node/idological']: {data: {streets: ['CantEscape Corral', 'Purpose St', 'Quagmire Ct']}},
        ['node/idation']: {data: {streets: ['Ataboy Alley', 'Purpose St', 'Quirky Dock', 'Zebra Steps']}}
      }
    )).toEqual([
        {data: {streets: ['Purpose St', 'Ataboy Alley', 'Quirky Dock', 'Zebra Steps']}},
        {data: {streets: ['Purpose St', 'CantEscape Corral', 'Quagmire Ct']}}
      ]
    );
  });
  test('intersectionsByNodeIdToSortedIntersectionsLocationDecides', () => {
    // Case where same way leaves and comes back to a main one.
    // We need to make sure the main one is treated as the block using location's context
    expect(intersectionsByNodeIdToSortedIntersections({
        "country": "Canada",
        "state": "BC",
        "city": "Fernie",
        "geojson": {
          "features": [
            {
              "type": "Feature",
              "id": "node/4896277399"
            },
            {
              "type": "Feature",
              "id": "node/4896277397"
            },
            {
              "type": "Feature",
              "id": "way/498142936",
              "properties": {
                "type": "way",
                "id": 498142936,
                "tags": {
                  "name": "Purpose St"
                }
              }
            }
          ]
        }
      },
      {
        ['node/4896277399']: {data: {streets: ['CantEscape Corral', 'Purpose St', 'Quagmire Ct']}},
        ['node/4896277397']: {data: {streets: ['Ataboy Alley', 'Purpose St', 'Quagmire Ct', 'Zebra Steps']}}
      }
    )).toEqual([
        {data: {streets: ['Purpose St', 'Ataboy Alley', 'Quagmire Ct', 'Zebra Steps']}},
        {data: {streets: ['Purpose St', 'CantEscape Corral', 'Quagmire Ct']}}
      ]
    );
  });

  test('intersectionsByNodeForWayWithDeadEnd', () => {
    const location = {
      "country": "Canada",
      "state": "BC",
      "city": "Fernie",
      "street": "Cokato Road",
      "intersections": [{
        data: {
          streets: [
            [
              "Cokato Road",
              "Earle Road"
            ]
          ]
        },
        geojson: {
          "type": "Feature",
          "id": "node/1859551276",
          "properties": {
            "type": "node",
            "id": 1859551276
          }
        }
      }],
      "geojson": {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "id": "way/486651906",
            "properties": {
              "type": "way",
              "id": 486651906,
              "tags": {
                "name": "Cokato Road"
              }
            }
          },
          {
            "type": "Feature",
            "id": "node/1859551276",
            "properties": {
              "type": "node",
              "id": 1859551276
            }
          }
        ]
      }
    };
    const nodesToIntersections = {
      "node/1859551276": {
        data: {
          streets: [
            "Cokato Road",
            "Earle Road"
          ]
        },
        geojson: {
          "type": "Feature",
          "id": "node/1859551276",
          "properties": {
            "type": "node",
            "id": 1859551276
          }
        }
      }
    };
    expect(intersectionsByNodeIdToSortedIntersections(location, nodesToIntersections)).toEqual([
      {
        data: {streets: ["Cokato Road", "Earle Road"]}, geojson: {
          "type": "Feature",
          "id": "node/1859551276",
          "properties": {
            "type": "node",
            "id": 1859551276
          }
        }
      },
      {
        data: {streets: ["Cokato Road", "Earle Road"]}, geojson: {
          "type": "Feature",
          "id": "node/1859551276",
          "properties": {
            "type": "node",
            "id": 1859551276
          }
        }
      }
    ]);
  });


  test('intersectionsByNodeForWayWithLoop', () => {
    const location = {
      "country": "Canada",
      "state": "BC",
      "city": "Fernie",
      "street": "Cokato Road",
      "intersections": [{
        data: {
          streets: [
            [
              "Cokato Road",
              "Earle Road"
            ]
          ]
        },
        geojson: {
          "type": "Feature",
          "id": "node/1859551276",
          "properties": {
            "type": "node",
            "id": 1859551276
          }
        }
      }],
      "geojson": {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "id": "way/486651906",
            "properties": {
              "type": "way",
              "id": 486651906,
              "tags": {
                "name": "Cokato Road"
              }
            }
          },
          {
            "type": "Feature",
            "id": "node/1859551276",
            "properties": {
              "type": "node",
              "id": 1859551276
            }
          }
        ]
      }
    };
    const nodesToIntersections = {
      "node/1859551276": {
        data: {
          streets: [
            "Cokato Road",
            "Earle Road"
          ]
        },
        geojson: {
          "type": "Feature",
          "id": "node/1859551276",
          "properties": {
            "type": "node",
            "id": 1859551276
          }
        }
      }
    };
    expect(intersectionsByNodeIdToSortedIntersections(location, nodesToIntersections)).toEqual([
      {
        data: {streets: ["Cokato Road", "Earle Road"]}, geojson: {
          "type": "Feature",
          "id": "node/1859551276",
          "properties": {
            "type": "node",
            "id": 1859551276
          }
        }
      },
      {
        data: {streets: ["Cokato Road", "Earle Road"]}, geojson: {
          "type": "Feature",
          "id": "node/1859551276",
          "properties": {
            "type": "node",
            "id": 1859551276
          }
        }
      }
    ]);
  });

  test('fixWordsThatTripUpGoogle', () => {
    expect(fixWordsThatTripUpGoogle('Pokstein Street')).toEqual('Pokstein St');
  });

  test('aggregateLocationsWithNoGeojson', () => {
    const neighborhoodLocation = {
      "country": "New Zealand",
      "state": "",
      "city": "Auckland",
      "neighborhood": "Viaduct Basin",
      "street": "High St",
      "intersections": [],
      "osmId": 665064256,
      "geojson": {
        "features": [],
        "type": "FeatureCollection"
      }
    };
    const highShortland = {
      data: {streets: ['High St', 'Shortland St']},
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Point',
            id: 'node/0',
            geometry: {
              coordinates: [174.766872, -36.846571]
            }
          }
        ]
      }
    };
    const highVulcan = {
      data: {streets: ['High St', 'Vulcan Ln']},
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: 'Point',
            id: 'node/1',
            geometry: {
              coordinates: [174.766720, -36.847199]
            }
          }
        ]
      }
    };
    const highDurham = {
      data: {streets: ['High St', 'Durham St E']},
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: 'Point',
            id: 'node/2',
            geometry: {
              coordinates: [174.766344, -36.848499]
            }
          }
        ]
      }
    };
    const highVictoria = {
      data: {streets: ['High St', 'Victoria St E']},
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: 'Point',
            id: 'node/3',
            geometry: {
              coordinates: [174.766100, -36.849247]
            }
          }
        ]
      }
    };
    // Create a fake way from the nodes
    const addWay = (id, nodes) => {
      return R.concat([
          {
            type: 'LineString',
            id: `way/${id}`,
            geometry: {
              coordinates: R.map(
                node => node.geojson.features[0].geometry.coordinates,
                nodes
              )
            }
          }],
        R.map(node => node.geojson.features[0], nodes)
      );
    };
    const streetLocations = [
      {
        "id": 2229946,
        "state": "",
        "city": "Auckland",
        "country": "New Zealand",
        "neighborhood": "Viaduct Basin",
        "street": "High St",
        intersections: [highDurham, highVictoria],
        "geojson": {
          type: 'FeatureCollection',
          features: addWay(1, [highDurham, highVictoria])
        }
      },
      , {
        "id": 2229945,
        "state": "",
        "city": "Auckland",
        "country": "New Zealand",
        "neighborhood": "Viaduct Basin",
        "street": "High St",
        intersections: [highShortland, highVulcan],
        "geojson": {
          type: 'FeatureCollection',
          features: addWay(2, [highShortland, highVulcan])
        }
      }, {
        "id": 2229947,
        "state": "",
        "city": "Auckland",
        "country": "New Zealand",
        "neighborhood": "Viaduct Basin",
        "street": "High St",
        intersections: [highVulcan, highDurham],
        "geojson": {
          type: 'FeatureCollection',
          features: addWay(3, [highVulcan, highDurham])
        }
      }];

    expect(
      aggregateLocation({}, neighborhoodLocation, streetLocations)
    ).toEqual(
      R.merge(
        neighborhoodLocation,
        {
          "geojson": {
            type: 'FeatureCollection',
            copyright: "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
            features:
              R.concat(
                [
                  addWay(1, [highDurham, highVictoria])[0],
                  addWay(2, [highShortland, highVulcan])[0],
                  addWay(3, [highVulcan, highDurham])[0]
                ],
                R.map(intersection => intersection.geojson.features[0], [highShortland, highVulcan, highDurham, highVictoria])
              )
          }
        }
      )
    );
  });

  test('addressStringInBothDirectionsOfLocation', () => {
    expect(R.length(locationWithIntersectionInBothOrders({
      "id": 2229955,
      "street": "High St",
      intersections: [
        {
          data: {streets: ['High St', 'Durham St E']},
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                coordinates: [174.766344, -36.848499]
              }
            ]
          }
        },
        {
          data: {streets: ['High St', 'Durham St E']},
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                coordinates: [174.766100, -36.848499]
              }
            ]
          }
        }
      ],
      "neighborhood": "Viaduct Basin",
      "city": "Auckland",
      "state": "",
      "country": "New Zealand",
      "data": {},
      "dataComplete": true,
      "geojson": {
        "type": null,
        "features": null,
        "generator": null,
        "copyright": null
      }
    }))).toEqual(2);
  });

  test('isResolvableAllBlocksLocation', () => {
    expect(isResolvableAllBlocksLocation({country: 'Cowboy', city: 'Giddyup'})).toEqual(true);
    // No city, no service
    expect(isResolvableAllBlocksLocation({country: 'Cowboy', state: 'Denied'})).toEqual(false);
    expect(isResolvableAllBlocksLocation({
      geojson: {
        features: []
      }
    })).toEqual(false);
    expect(isResolvableAllBlocksLocation({
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              radius: 10
            },
            geometry: {
              type: 'Point',
              coordinates: [
                -78.89350891113281,
                35.99884078388202
              ]
            }
          }
        ]
      }
    })).toEqual(true);
    expect(isResolvableAllBlocksLocation({
        geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [
                      -78.87805938720703,
                      36.0153656546386
                    ],
                    [
                      -78.8902473449707,
                      36.009672602871746
                    ],
                    [
                      -78.88423919677734,
                      36.00800626603582
                    ],
                    [
                      -78.87411117553711,
                      36.00856171556128
                    ],
                    [
                      -78.87805938720703,
                      36.01133890448606
                    ],
                    [
                      -78.87805938720703,
                      36.0153656546386
                    ]
                  ]
                ]
              }
            }
          ]
        }
      }
    )).toEqual(true);
  });

  test('normalizedIntersectionNames', () => {
    expect(normalizedIntersectionNames(
      {data: {streets: ['Northwest Mammoth Avenue', 'Southwest Penguin Plaza']}}
    )).toEqual(
      {data: {streets: ['NW Mammoth Ave', 'SW Penguin Plaza']}}
    );
  });

  test('TestLoopHandlingInintersectionsByNodeIdToSortedIntersections', () => {
    const nodesToIntersectionsWithNull = {
      "node/4437341913": {
        data: {
          streets: [
            "way/665350226",
            "Victoria Avenue",
            "way/446472694"
          ]
        }
      }
    };
    const location = {
      country: 'Kenya',
      city: 'Nairobi',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: "Feature",
            properties: {
              radius: 200,
              jurisdictionCenterPoint: true
            }
          }
        ]
      }
    };
    // TODO, should the location in context here always be the block location?
    // If we are generating blocks, why wouldn't we have the block location at this point?
    expect(intersectionsByNodeIdToSortedIntersections(location, nodesToIntersectionsWithNull)).toEqual(
      [
        {data: {streets: ["Victoria Avenue", "way/446472694", "way/665350226"]}},
        {data: {streets: ["Victoria Avenue", "way/446472694", "way/665350226"]}}
      ]
    );
    const normalnodesToIntersections = {
      "node/4437341913": {
        data: {
          streets: [
            "way/665350226",
            "Victoria Avenue",
            "way/446472694"
          ]
        }
      },
      "node/4437341413": {
        data: {
          streets: [
            "way/665350226",
            "Jasper St"
          ]
        }
      }
    };
    expect(intersectionsByNodeIdToSortedIntersections(location, normalnodesToIntersections)).toEqual(
      [
        {data: {streets: ["way/665350226", "Jasper St"]}},
        {data: {streets: ["way/665350226", "Victoria Avenue", "way/446472694"]}}
      ]
    );
  });

  test('osmFeaturesByType', () => {
    const location = {
      geojson: {
        features: [
          {
            "type": "Feature",
            "id": "node/4896277399"
          },
          {
            "type": "Feature",
            "id": "node/4896277397"
          },
          {
            "type": "Feature",
            "id": "way/498142936",
            "properties": {
              "type": "way",
              "id": "way/498142936",
              "name": 'Purpose St'
            }
          }
        ]
      }
    };
    expect(R.length(osmFeaturesOfLocationForType('node', location))).toEqual(2);
  });

  test('locationWithLocationPoints', () => {
    const location = {
      geojson: {
        features: [
          {
            "type": "Feature",
            "id": "node/4896277399"
          },
          {
            "type": "Feature",
            "id": "node/4896277397"
          },
          {
            "type": "Feature",
            "id": "way/498142936",
            "properties": {
              "type": "way",
              "id": "way/498142936",
              "name": 'Purpose St'
            }
          }
        ]
      }
    };
    expect(R.compose(R.length, R.prop('locationPoints'), locationWithLocationPoints)(location)).toEqual(2);
  });

  test('geojsonFeaturesHaveRadii', () => {
    // Create locations that all have radius features
    const locations = R.map(
      location => {
        return R.merge(
          {
            geojson: {
              type: 'FeatureCollection',
              features: [
                {
                  type: "Feature",
                  properties: {
                    radius: 80
                  },
                  geometry: {
                    type: "Point",
                    // Fake
                    coordinates: [
                      -80.18231999999999,
                      26.098829
                    ]
                  }
                }
              ]
            }
          },
          location
        );
      },
      sampleCityLocations
    );
    const geojson = {features: R.chain(reqStrPathThrowing('geojson.features'), locations)};
    expect(
      geojsonFeaturesHaveRadii(geojson)
    ).toBeTruthy();
  });

  test('mapGeojsonFeaturesHaveRadii', () => {
    // Create locations that all have radius features
    const locations = R.map(
      location => {
        return R.merge(
          {
            geojson: {
              type: 'FeatureCollection',
              features: [
                {
                  type: "Feature",
                  properties: {
                    radius: 80
                  },
                  geometry: {
                    type: "Point",
                    // Fake
                    coordinates: [
                      -80.18231999999999,
                      26.098829
                    ]
                  }
                }
              ]
            }
          },
          location
        );
      },
      sampleCityLocations
    );
    const geojson = {features: R.chain(reqStrPathThrowing('geojson.features'), locations)};
    expect(
      R.all(
        feature => R.compose(R.equals('Polygon'), reqStrPathThrowing('geometry.type'))(feature),
        reqStrPathThrowing('features', mapGeojsonFeaturesHaveRadiiToPolygon(geojson))
      )
    ).toBeTruthy();
  });

  test('featuresOfOsmType', () => {
    const location = {
      geojson: {
        features: [
          {id: 'way/1'},
          {id: 'way/2'},
          {id: 'way/3'},
          {id: 'node/1'}
        ]
      }
    };
    expect(R.length(featuresOfOsmType('way', location.geojson.features))).toEqual(3);
  });

  test('bufferedFeaturesToOsmAllBlocksQueryResultsTaskForLines', done => {
    const geojson = {
      "type": "FeatureCollection",
      "name": "Untitled layer",
      "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
      "features": [
        {
          "type": "Feature",
          "properties": {"Name": "Line 5", "description": null, "tessellate": 1},
          "geometry": {"type": "LineString", "coordinates": [[-114.0517016, 51.0532901], [-114.050221, 51.053310]]}
        }
      ]
    };
    const errors = [];
    const radius = 2;
    const units = 'meters';
    const resultsTask = bufferedFeaturesToOsmAllBlocksQueryResultsTask({
      osmConfig: {},
      bufferConfig: {radius, units}
    }, geojson);

    resultsTask.run().listen(
      defaultRunConfig({
        onResolved: ({Error, Ok}) => {
          mergeDeepWithConcatArrays(
            buffer(geojson, radius, {units}),
            blocksToGeojson(R.map(
              res => R.compose(
                r => R.prop('block', r),
                r => R.over(R.lensProp('block'), ({ways}) => ({ways}), r)
              )(res)
            )(Ok))
          );
          expect(Ok).toBeTruthy();
        }
      }, errors, done)
    );
  }, 10000000);

  test('bufferedFeaturesToOsmAllBlocksQueryResultsTaskForPoints', done => {
    const radius = 50;
    const units = 'meters';
    const circleFeatures = R.map(
      pnt => point(R.reverse(pnt)),
      [
        [22.369978, 114.113525]
        //[22.246151, 114.169610]
      ]);

    const geojson = {
      "type": "FeatureCollection",
      "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
      "features": circleFeatures
    };
    const resultsTask = bufferedFeaturesToOsmAllBlocksQueryResultsTask({
      osmConfig: {},
      bufferConfig: {radius, units}
    }, geojson);
    const errors = [];

    resultsTask.run().listen(
      defaultRunConfig({
        onResolved: ({Error, Ok}) => {
          mergeDeepWithConcatArrays(
            {features: R.map(f => buffer(f, radius, {units}), circleFeatures)},
            blocksToGeojson(R.map(
              res => R.compose(
                r => R.prop('block', r),
                r => R.over(
                  R.lensProp('block'),
                  ({ways}) => ({ways}),
                  r
                )
              )(res)
            )(Ok))
          );
          expect(Ok).toBeTruthy();
        }
      }, errors, done)
    );
  }, 10000000);

  /*
  // Takes too long
  test('bufferedFeaturesToOsmAllBlocksQueryResultsTaskFromStreetResults', done => {
    const radius = 12;
    const units = 'meters';

    const locationGeojson = locationsToGeojson(R.map(reqStrPathThrowing('location'), sampleStreetLocationsAndBlocks));
    const resultsTask = bufferedFeaturesToOsmAllBlocksQueryResultsTask({
      osmConfig: {},
      bufferConfig: {radius, units, unionFeatures: true}
    }, locationGeojson);
    const errors = [];

    resultsTask.run().listen(
      defaultRunConfig({
        onResolved: ({Error, Ok, bufferedGeojson}) => {
          mergeDeepWithConcatArrays(
            bufferedGeojson,
            blocksToGeojson(R.map(
              res => R.compose(
                r => R.prop('block', r),
                r => R.over(
                  R.lensProp('block'),
                  ({ways}) => ({ways}),
                  r
                )
              )(res)
            )(Ok))
          );
          expect(Ok).toBeTruthy();
        }
      }, errors, done)
    );
  }, 10000000);
   */

  test('bufferAndUnionGeojson', () => {
    const featuresAndCollections = [
      {
        "type": "FeatureCollection",
        "generator": "overpass-ide",
        "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
        "timestamp": "",
        "features": [
          {
            "type": "Feature",
            "id": "way/28069950",
            "properties": {
              "stroke": "#1f77b4",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 28069950,
              "tags": {
                "carriageway_ref:kmb": "W",
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "ref:kmb": "DE02",
                "surface": "concrete",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1513186,
                  22.2866901
                ],
                [
                  114.1520691,
                  22.2864926
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/28069950",
            "properties": {
              "stroke": "#ff7f0e",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 28069950,
              "tags": {
                "carriageway_ref:kmb": "W",
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "ref:kmb": "DE02",
                "surface": "concrete",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1513186,
                  22.2866901
                ],
                [
                  114.15048,
                  22.286905
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141431",
            "properties": {
              "stroke": "#2ca02c",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141431,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1574109,
                  22.2823977
                ],
                [
                  114.1574439,
                  22.2823561
                ],
                [
                  114.1574786,
                  22.2823142
                ],
                [
                  114.1574965,
                  22.282292
                ],
                [
                  114.157565,
                  22.2822064
                ],
                [
                  114.1576684,
                  22.2820771
                ],
                [
                  114.1577479,
                  22.2819825
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141431",
            "properties": {
              "stroke": "#d62728",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141431,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1574109,
                  22.2823977
                ],
                [
                  114.1573604,
                  22.2824585
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141431",
            "properties": {
              "stroke": "#9467bd",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141431,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1573604,
                  22.2824585
                ],
                [
                  114.1572586,
                  22.2825923
                ],
                [
                  114.1571743,
                  22.2826963
                ],
                [
                  114.1570566,
                  22.2828391
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141431",
            "properties": {
              "stroke": "#8c564b",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141431,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1570566,
                  22.2828391
                ],
                [
                  114.1570343,
                  22.2828663
                ],
                [
                  114.1570257,
                  22.2828783
                ],
                [
                  114.1569472,
                  22.2829772
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141431",
            "properties": {
              "stroke": "#e377c2",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141431,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1569472,
                  22.2829772
                ],
                [
                  114.1569383,
                  22.2829891
                ],
                [
                  114.1568661,
                  22.2830855
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141431",
            "properties": {
              "stroke": "#7f7f7f",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141431,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1568661,
                  22.2830855
                ],
                [
                  114.1566516,
                  22.2833569
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141431",
            "properties": {
              "stroke": "#bcbd22",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141431,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1566516,
                  22.2833569
                ],
                [
                  114.156573,
                  22.2834555
                ],
                [
                  114.1564983,
                  22.2835494
                ],
                [
                  114.1564452,
                  22.2836135
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141477",
            "properties": {
              "stroke": "#17becf",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141477,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1562342,
                  22.2838698
                ],
                [
                  114.1564147,
                  22.2836514
                ],
                [
                  114.1564452,
                  22.2836135
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141477",
            "properties": {
              "stroke": "#1f77b4",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141477,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1562342,
                  22.2838698
                ],
                [
                  114.15602,
                  22.28413
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141644",
            "properties": {
              "stroke": "#ff7f0e",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141644,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1552346,
                  22.2850392
                ],
                [
                  114.1553093,
                  22.2849854
                ],
                [
                  114.1553802,
                  22.284899
                ],
                [
                  114.1556257,
                  22.2845981
                ],
                [
                  114.1556834,
                  22.2845264
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141644",
            "properties": {
              "stroke": "#2ca02c",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141644,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1552346,
                  22.2850392
                ],
                [
                  114.1551527,
                  22.2850893
                ],
                [
                  114.1551096,
                  22.2851149
                ],
                [
                  114.1550535,
                  22.2851493
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141644",
            "properties": {
              "stroke": "#d62728",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141644,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1550535,
                  22.2851493
                ],
                [
                  114.1548713,
                  22.2852538
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141644",
            "properties": {
              "stroke": "#9467bd",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141644,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1548713,
                  22.2852538
                ],
                [
                  114.1547532,
                  22.2853248
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141644",
            "properties": {
              "stroke": "#8c564b",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141644,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1547532,
                  22.2853248
                ],
                [
                  114.1546815,
                  22.2853661
                ],
                [
                  114.1546078,
                  22.2854087
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141644",
            "properties": {
              "stroke": "#e377c2",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141644,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1546078,
                  22.2854087
                ],
                [
                  114.1543793,
                  22.2855377
                ],
                [
                  114.1543222,
                  22.2855716
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/151226287",
            "properties": {
              "stroke": "#7f7f7f",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 151226287,
              "tags": {
                "highway": "secondary",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "asphalt",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.15253,
                  22.286488
                ],
                [
                  114.1520932,
                  22.2865969
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/151226287",
            "properties": {
              "stroke": "#bcbd22",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 151226287,
              "tags": {
                "highway": "secondary",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "asphalt",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.15253,
                  22.286488
                ],
                [
                  114.1530189,
                  22.2863674
                ],
                [
                  114.1531533,
                  22.2863281
                ],
                [
                  114.153237,
                  22.2862987
                ],
                [
                  114.1532924,
                  22.2862764
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/492436535",
            "properties": {
              "stroke": "#17becf",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 492436535,
              "tags": {
                "highway": "secondary",
                "lanes": "2",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1565303,
                  22.2836752
                ],
                [
                  114.1565026,
                  22.2837096
                ],
                [
                  114.1562843,
                  22.2839807
                ],
                [
                  114.1561125,
                  22.2841941
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/492436535",
            "properties": {
              "stroke": "#1f77b4",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 492436535,
              "tags": {
                "highway": "secondary",
                "lanes": "2",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1565303,
                  22.2836752
                ],
                [
                  114.1565539,
                  22.2836442
                ],
                [
                  114.1568593,
                  22.2832566
                ],
                [
                  114.1570288,
                  22.2830415
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/492436535",
            "properties": {
              "stroke": "#ff7f0e",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 492436535,
              "tags": {
                "highway": "secondary",
                "lanes": "2",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1570288,
                  22.2830415
                ],
                [
                  114.1574891,
                  22.2824532
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/28069952",
            "properties": {
              "stroke": "#2ca02c",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 28069952,
              "tags": {
                "carriageway_ref:left:kmb": "W",
                "carriageway_ref:right:kmb": "E",
                "highway": "residential",
                "lanes": "2",
                "lanes:backward": "1",
                "lanes:forward": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "ref:kmb": "DE02",
                "surface": "asphalt",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.15048,
                  22.286905
                ],
                [
                  114.15025,
                  22.286956
                ],
                [
                  114.15022,
                  22.28697
                ],
                [
                  114.15018,
                  22.287
                ],
                [
                  114.15015,
                  22.28705
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/88695241",
            "properties": {
              "stroke": "#d62728",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 88695241,
              "tags": {
                "bus": "yes",
                "highway": "tertiary",
                "lanes": "1",
                "motor_vehicle": "no",
                "motor_vehicle:conditional": "yes @ (PH 07:00-24:00)",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1587308,
                  22.2809705
                ],
                [
                  114.1587932,
                  22.2809397
                ],
                [
                  114.1588375,
                  22.2809257
                ],
                [
                  114.1594192,
                  22.2807802
                ],
                [
                  114.1596308,
                  22.280723
                ],
                [
                  114.1596577,
                  22.2807157
                ],
                [
                  114.1599281,
                  22.2806449
                ],
                [
                  114.1599888,
                  22.2806269
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/88695251",
            "properties": {
              "stroke": "#d62728",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 88695251,
              "tags": {
                "bus": "yes",
                "highway": "tertiary",
                "lanes": "1",
                "motor_vehicle": "no",
                "motor_vehicle:conditional": "yes @ (PH 07:00-24:00)",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1599888,
                  22.2806269
                ],
                [
                  114.1603005,
                  22.2805498
                ],
                [
                  114.1603486,
                  22.2805276
                ],
                [
                  114.1603967,
                  22.2804929
                ],
                [
                  114.1604436,
                  22.2804476
                ],
                [
                  114.1604841,
                  22.2803953
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/242113654",
            "properties": {
              "stroke": "#d62728",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 242113654,
              "tags": {
                "bus": "yes",
                "highway": "tertiary",
                "lanes": "1",
                "motor_vehicle": "no",
                "motor_vehicle:conditional": "yes @ (PH 07:00-24:00)",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1604841,
                  22.2803953
                ],
                [
                  114.1605579,
                  22.2802247
                ],
                [
                  114.1606004,
                  22.28016
                ],
                [
                  114.1606473,
                  22.280114
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/88695246",
            "properties": {
              "stroke": "#9467bd",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 88695246,
              "tags": {
                "highway": "unclassified",
                "lanes": "1",
                "motor_vehicle": "destination",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1606708,
                  22.2799489
                ],
                [
                  114.1605834,
                  22.2800187
                ],
                [
                  114.1605372,
                  22.2800612
                ],
                [
                  114.1604947,
                  22.2801179
                ],
                [
                  114.1604426,
                  22.280217
                ],
                [
                  114.16041,
                  22.2802986
                ],
                [
                  114.1603514,
                  22.2803843
                ],
                [
                  114.1602923,
                  22.2804278
                ],
                [
                  114.1602401,
                  22.280447
                ],
                [
                  114.160021,
                  22.2804969
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/88695249",
            "properties": {
              "stroke": "#8c564b",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 88695249,
              "tags": {
                "bus": "yes",
                "highway": "service",
                "lanes": "1",
                "motor_vehicle": "no",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "note": "bus road",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1586707,
                  22.2808668
                ],
                [
                  114.1586325,
                  22.2808959
                ],
                [
                  114.1585997,
                  22.280931
                ],
                [
                  114.15842,
                  22.2811563
                ],
                [
                  114.1581087,
                  22.2815409
                ],
                [
                  114.158092,
                  22.2815598
                ],
                [
                  114.1578747,
                  22.2818196
                ],
                [
                  114.1578356,
                  22.2818704
                ],
                [
                  114.1577479,
                  22.2819825
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141458",
            "properties": {
              "stroke": "#e377c2",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141458,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.15602,
                  22.28413
                ],
                [
                  114.1560149,
                  22.2841364
                ],
                [
                  114.1558826,
                  22.2842883
                ],
                [
                  114.1557938,
                  22.2843902
                ],
                [
                  114.1557842,
                  22.2844026
                ],
                [
                  114.1557813,
                  22.2844064
                ],
                [
                  114.1556834,
                  22.2845264
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141466",
            "properties": {
              "stroke": "#7f7f7f",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141466,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1532694,
                  22.2861779
                ],
                [
                  114.1531898,
                  22.28621
                ],
                [
                  114.1531396,
                  22.2862259
                ],
                [
                  114.1526626,
                  22.2863417
                ],
                [
                  114.1525135,
                  22.2863801
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141490",
            "properties": {
              "stroke": "#bcbd22",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141490,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1525135,
                  22.2863801
                ],
                [
                  114.1523315,
                  22.2864249
                ],
                [
                  114.152294,
                  22.286435
                ],
                [
                  114.1521456,
                  22.2864742
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/322844634",
            "properties": {
              "stroke": "#bcbd22",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 322844634,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "asphalt",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1521456,
                  22.2864742
                ],
                [
                  114.1520691,
                  22.2864926
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/89141509",
            "properties": {
              "stroke": "#17becf",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 89141509,
              "tags": {
                "carriageway_ref:kmb": "W",
                "direction:kmb": "W",
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "ref:kmb": "DE02",
                "sidewalk": "left",
                "surface": "concrete",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1540076,
                  22.2857594
                ],
                [
                  114.1536666,
                  22.2859584
                ],
                [
                  114.1534241,
                  22.2860999
                ],
                [
                  114.1533871,
                  22.2861202
                ],
                [
                  114.1533418,
                  22.2861437
                ],
                [
                  114.1532694,
                  22.2861779
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/131023317",
            "properties": {
              "stroke": "#1f77b4",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 131023317,
              "tags": {
                "highway": "secondary",
                "lanes": "1",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1543222,
                  22.2855716
                ],
                [
                  114.1541254,
                  22.2856891
                ],
                [
                  114.1540076,
                  22.2857594
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/242113655",
            "properties": {
              "stroke": "#ff7f0e",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 242113655,
              "tags": {
                "bus": "yes",
                "highway": "service",
                "lanes": "1",
                "motor_vehicle": "no",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "note": "bus road",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.160021,
                  22.2804969
                ],
                [
                  114.1599645,
                  22.2805119
                ],
                [
                  114.1592208,
                  22.2807095
                ],
                [
                  114.1590955,
                  22.2807413
                ],
                [
                  114.1590021,
                  22.2807648
                ],
                [
                  114.1587627,
                  22.2808281
                ],
                [
                  114.1587265,
                  22.2808375
                ],
                [
                  114.1586985,
                  22.2808492
                ],
                [
                  114.1586707,
                  22.2808668
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/308827001",
            "properties": {
              "stroke": "#2ca02c",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 308827001,
              "tags": {
                "carriageway_ref:kmb": "E",
                "direction:kmb": "E",
                "highway": "secondary",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "ref:kmb": "DE02",
                "sidewalk": "left",
                "surface": "asphalt",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1532924,
                  22.2862764
                ],
                [
                  114.1533881,
                  22.2862265
                ],
                [
                  114.1534123,
                  22.2862135
                ],
                [
                  114.1534303,
                  22.2862034
                ],
                [
                  114.1536037,
                  22.2861116
                ],
                [
                  114.1537689,
                  22.2860191
                ],
                [
                  114.1540719,
                  22.2858483
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/319674133",
            "properties": {
              "stroke": "#d62728",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 319674133,
              "tags": {
                "carriageway_ref:kmb": "E",
                "highway": "secondary",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "ref:kmb": "DE02",
                "surface": "asphalt",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1504941,
                  22.2869863
                ],
                [
                  114.1505246,
                  22.2869791
                ],
                [
                  114.1512847,
                  22.2867985
                ],
                [
                  114.1513407,
                  22.2867852
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/319712184",
            "properties": {
              "stroke": "#9467bd",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 319712184,
              "tags": {
                "highway": "secondary",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1548193,
                  22.2854157
                ],
                [
                  114.1551066,
                  22.2852448
                ],
                [
                  114.1552709,
                  22.2851456
                ],
                [
                  114.1553438,
                  22.2850947
                ],
                [
                  114.1554137,
                  22.2850392
                ],
                [
                  114.155449,
                  22.2850042
                ],
                [
                  114.1557212,
                  22.2846714
                ],
                [
                  114.1557799,
                  22.2845999
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/492424410",
            "properties": {
              "stroke": "#8c564b",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 492424410,
              "tags": {
                "bus": "yes",
                "highway": "tertiary",
                "lanes": "1",
                "motor_vehicle": "no",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "concrete"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1578685,
                  22.2819794
                ],
                [
                  114.15862,
                  22.2810678
                ],
                [
                  114.1586833,
                  22.2810059
                ],
                [
                  114.1587308,
                  22.2809705
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/492431185",
            "properties": {
              "stroke": "#e377c2",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 492431185,
              "tags": {
                "highway": "secondary",
                "lanes": "2",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1578283,
                  22.2820331
                ],
                [
                  114.1578685,
                  22.2819794
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/526329771",
            "properties": {
              "stroke": "#7f7f7f",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 526329771,
              "tags": {
                "carriageway_ref:kmb": "E",
                "highway": "secondary",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "ref:kmb": "DE02",
                "surface": "asphalt",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1513407,
                  22.2867852
                ],
                [
                  114.1513979,
                  22.2867709
                ],
                [
                  114.1519945,
                  22.2866216
                ],
                [
                  114.1520932,
                  22.2865969
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/636547284",
            "properties": {
              "stroke": "#bcbd22",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 636547284,
              "tags": {
                "highway": "secondary",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
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
                  114.1557799,
                  22.2845999
                ],
                [
                  114.1558767,
                  22.2844827
                ],
                [
                  114.1558891,
                  22.2844677
                ],
                [
                  114.1559295,
                  22.2844185
                ],
                [
                  114.1559922,
                  22.2843428
                ],
                [
                  114.156096,
                  22.2842138
                ],
                [
                  114.1561125,
                  22.2841941
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/776750569",
            "properties": {
              "stroke": "#17becf",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 776750569,
              "tags": {
                "highway": "secondary",
                "lanes": "2",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "surface": "asphalt",
                "turn:lanes": "left;slight_left|slight_left;through"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1574891,
                  22.2824532
                ],
                [
                  114.1576591,
                  22.2822427
                ],
                [
                  114.1578283,
                  22.2820331
                ]
              ]
            }
          },
          {
            "type": "Feature",
            "id": "way/783005137",
            "properties": {
              "stroke": "#1f77b4",
              "stroke-width": 2,
              "stroke-opacity": 1,
              "type": "way",
              "id": 783005137,
              "tags": {
                "carriageway_ref:kmb": "E",
                "direction:kmb": "E",
                "highway": "secondary",
                "name": "德輔道中 Des Voeux Road Central",
                "name:en": "Des Voeux Road Central",
                "name:zh": "德輔道中",
                "oneway": "yes",
                "ref:kmb": "DE02",
                "sidewalk": "left",
                "surface": "asphalt",
                "wikidata": "Q13163706"
              },
              "relations": [],
              "meta": {}
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [
                  114.1540719,
                  22.2858483
                ],
                [
                  114.1542962,
                  22.2857231
                ],
                [
                  114.1547414,
                  22.2854616
                ],
                [
                  114.1548193,
                  22.2854157
                ]
              ]
            }
          }
        ]
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.113525,
            22.369978
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.131184,
            22.363055
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.16186,
            22.330248
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.205306,
            22.336194
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.226496,
            22.312118
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.213462,
            22.287143
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.18405,
            22.278962
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.154,
            22.282346
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            114.16961,
            22.246151
          ]
        }
      }
    ];
    expect(R.map(f => bufferAndUnionGeojson({radius: 50, units: 'meters'}, f), featuresAndCollections)).toBeTruthy();
  });

  test('oldIntersectionUpgrade', () => {
    const osloLocation = {
      country: 'Norway',
      city: 'Oslo',
      ...oldIntersectionUpgrade({
        blockname: 'Thorvald Meyers gate',
        intersc1: 'Korsgata',
        intersc2: 'Grüners gate',
        intersection1Location: '59.920102940929, 10.759324799918932',
        intersection2Location: '59.92339707200017, 10.759251080434533'
      })
    };
    expect(osloLocation).toEqual({
      "country": "Norway",
      "city": "Oslo",
      "blockname": "Thorvald Meyers gate",
      "intersections": [
        {
          "data": {
            "streets": [
              "Thorvald Meyers gate",
              "Korsgata"
            ]
          },
          "geojson": {
            "type": "FeatureCollection",
            "features": [
              {
                "id": "node/fake10.759324799918932,59.920102940929",
                "type": "Feature",
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    10.759324799918932,
                    59.920102940929
                  ]
                },
                "properties": {
                  "id": "node/fake10.759324799918932,59.920102940929",
                  "meta": {},
                  "tags": {
                    "highway": "crossing",
                    "crossing": "traffic_signals"
                  },
                  "type": "node",
                  "relations": []
                }
              }
            ]
          }
        },
        {
          "data": {
            "streets": [
              "Thorvald Meyers gate",
              "Grüners gate"
            ]
          },
          "geojson": {
            "type": "FeatureCollection",
            "features": [
              {
                "id": "node/fake10.759251080434533,59.92339707200017",
                "type": "Feature",
                "geometry": {
                  "type": "Point",
                  "coordinates": [
                    10.759251080434533,
                    59.92339707200017
                  ]
                },
                "properties": {
                  "id": "node/fake10.759251080434533,59.92339707200017",
                  "meta": {},
                  "tags": {
                    "highway": "crossing",
                    "crossing": "traffic_signals"
                  },
                  "type": "node",
                  "relations": []
                }
              }
            ]
          }
        }
      ],
      "geojson": {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "id": "node/fake10.759324799918932,59.920102940929",
            "properties": {},
            "geometry": {
              "type": "Point",
              "coordinates": [
                10.759324799918932,
                59.920102940929
              ]
            }
          },
          {
            "type": "Feature",
            "id": "node/fake10.759251080434533,59.92339707200017",
            "properties": {},
            "geometry": {
              "type": "Point",
              "coordinates": [
                10.759251080434533,
                59.92339707200017
              ]
            }
          }
        ]
      }
    })
  })
});
