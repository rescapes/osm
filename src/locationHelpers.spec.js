import * as R from 'ramda';
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
  normalizedIntersectionNames,
  osmFeaturesOfLocationForType
} from './locationHelpers';
import {defaultRunConfig, reqStrPathThrowing} from 'rescape-ramda';
import {blocksToGeojson} from './overpassBlockHelpers';
import {bufferedFeaturesToOsmAllBlocksQueryResultsTask} from './overpassAllBlocks';

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
        intersections: [
          [
            'Main St',
            'First St'
          ],
          [
            'Main St',
            'Second St'
          ]
        ]
      })
    )).toEqual([
      "Main St & First St, Anytown, Anystate, USA",
      "Main St & Second St, Anytown, Anystate, USA"
    ]);
  });

  test('addressPair with a lan,lng', () => {
    expect(addressPair(
      R.merge(location, {
        intersections: [
          "54,-120",
          [
            'Main St',
            'Second St'
          ]
        ]
      })
    )).toEqual([
      "54,-120",
      "Main St & Second St, Anytown, Anystate, USA"
    ]);
  });

  test('addressStrings', () =>
    expect(addressStrings({
      country: 'USA',
      state: 'DC',
      city: 'Washington',
      intersections: [['Monroe St', '13th NE'], ['Political St', 'Correctness St']]
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
      intersections: [['Monroe St', '13th NE'], ['Political St', 'Correctness St']]
    })).toEqual(
      'Monroe St & 13th NE to Political St & Correctness St, Washington, DC, USA'
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
        ['node/idological']: ['CantEscape Corral', 'Purpose St', 'Quagmire Ct'],
        ['node/idation']: ['Ataboy Alley', 'Purpose St', 'Quirky Dock', 'Zebra Steps']
      }
    )).toEqual([
        ['Purpose St', 'Ataboy Alley', 'Quirky Dock', 'Zebra Steps'],
        ['Purpose St', 'CantEscape Corral', 'Quagmire Ct']
      ]
    );
  });
  test('intersectionsByNodeIdToSortedIntersectionsLocationDecides', () => {
    // Case where same way leaves and comes back to a main one.
    // We need to make sure the main one is treated as the block using locationWithNominatimData's context
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
        ['node/4896277399']: ['CantEscape Corral', 'Purpose St', 'Quagmire Ct'],
        ['node/4896277397']: ['Ataboy Alley', 'Purpose St', 'Quagmire Ct', 'Zebra Steps']
      }
    )).toEqual([
        ['Purpose St', 'Ataboy Alley', 'Quagmire Ct', 'Zebra Steps'],
        ['Purpose St', 'CantEscape Corral', 'Quagmire Ct']
      ]
    );
  });
  test('intersectionsByNodeForWayWithDeadEnd', () => {
    const location = {
      "country": "Canada",
      "state": "BC",
      "city": "Fernie",
      "intersections": [
        [
          "Cokato Road",
          "Earle Road"
        ]
      ],
      "geojson": {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "id": "node/1859551276",
            "properties": {
              "type": "node",
              "id": 1859551276
            }
          },
          {
            "type": "Feature",
            "id": "node/4505199830",
            "properties": {
              "type": "node",
              "id": 4505199830
            }
          },
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
          }
        ]
      }
    };
    const nodesToIntersectingStreets = {
      "node/1859551276": [
        "Cokato Road",
        "Earle Road"
      ]
    };
    expect(intersectionsByNodeIdToSortedIntersections(location, nodesToIntersectingStreets)).toEqual([
      ["Cokato Road", "Earle Road"],
      ["Cokato Road", "node/4505199830"]
    ]);
  });

  test('fixWordsThatTripUpGoogle', () => {
    expect(fixWordsThatTripUpGoogle('Pokstein Street')).toEqual('Pokstein St');
  });

  test('aggregateLocationsWithNoGeojson', () => {
    const location = {
      "country": "New Zealand",
      "state": "",
      "city": "Auckland",
      "neighborhood": "Viaduct Basin",
      "street": "High St",
      "intersections": [],
      "osmId": 665064256
    };
    const componentLocationWithoutGeojson = [{
      "id": 2229946,
      "state": "",
      "city": "Auckland",
      "country": "New Zealand",
      "neighborhood": "Viaduct Basin",
      "street": "High St",
      "intersc1": "Durham St E",
      "intersc2": "Victoria St E",
      "geojson": null,
      "intersections": ["-36.848499, 174.766344", "-36.849247, 147.766100"]
    }, {
      "id": 2229955,
      "state": "",
      "city": "Auckland",
      "country": "New Zealand",
      "neighborhood": "Viaduct Basin",
      "street": "High St",
      "intersc1": "Durham St E",
      "intersc2": "Victoria St E",
      "geojson": null,
      "intersections": ["-36.848499, 174.766344", "-36.849247, 174.766100'"]
    }, {
      "id": 2229945,
      "state": "",
      "city": "Auckland",
      "country": "New Zealand",
      "neighborhood": "Viaduct Basin",
      "street": "High St",
      "intersc1": "Shortland St",
      "intersc2": "Vulcan Ln",
      "point_of_interest": "",
      "point_of_interest_location": "",
      "geojson": null,
      "intersections": ["-36.846571, 174.766872", "-36.847199, 174.766720"]
    }, {
      "id": 2229947,
      "state": "",
      "city": "Auckland",
      "country": "New Zealand",
      "neighborhood": "Viaduct Basin",
      "street": "High St",
      "intersc1": "Vulcan Ln",
      "intersc2": "Durham St E",
      "geojson": null,
      "intersections": ["-36.847199, 174.766720", "-36.848499, 174.766344"]
    }];

    expect(aggregateLocation({}, location, componentLocationWithoutGeojson)).toEqual(
      R.merge(
        location,
        {
          "geojson": {

            "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
            "features": [],
            "generator": "overpass-turbo",
            "type": "FeatureCollection"
          }
        }
      )
    );
  });

  test('addressStringInBothDirectionsOfLocation', () => {
    expect(locationWithIntersectionInBothOrders({
      "intersections": [
        "-36.849247, 174.766100"
      ],
      "id": 2229955,
      "street": "High St",
      "intersc1": "Durham St E",
      "intersc2": "Victoria St E",
      "intersection1Location": "-36.848499, 174.766344",
      "intersection2Location": "-36.849247, 174.766100'",
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
    })).toEqual(["-36.849247, 174.766100"]);

    expect(locationWithIntersectionInBothOrders({
      "intersections": [
        ['High St', 'Durham St E'], ['High St', 'Victoria St E']
      ],
      "id": 2229955,
      "street": "High St",
      "intersc1": "Durham St E",
      "intersc2": "Victoria St E",
      "intersection1Location": "-36.848499, 174.766344",
      "intersection2Location": "-36.849247, 174.766100'",
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
    })).toEqual([
      "High St & Durham St E, Auckland, New Zealand",
      "Durham St E & High St, Auckland, New Zealand"]);
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
      ['Northwest Mammoth Avenue', 'Southwest Penguin Plaza']
    )).toEqual(
      ['NW Mammoth Ave', 'SW Penguin Plaza']
    );
  });

  test('TestLoopHandlingInintersectionsByNodeIdToSortedIntersections', () => {
    const nodesToIntersectingStreetsWithNull = {
      "node/4437341913": [
        "way/665350226",
        "Victoria Avenue",
        "way/446472694"
      ]
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
    expect(intersectionsByNodeIdToSortedIntersections(location, nodesToIntersectingStreetsWithNull)).toEqual(
      [["way/665350226", "Victoria Avenue", "way/446472694"], ["way/665350226", "Victoria Avenue", "way/446472694"]]
    );
    const normalNodesToIntersectingStreets = {
      "node/4437341913": [
        "way/665350226",
        "Victoria Avenue",
        "way/446472694"
      ],
      "node/4437341413": [
        "way/665350226",
        "Jasper St"
      ]
    };
    expect(intersectionsByNodeIdToSortedIntersections(location, normalNodesToIntersectingStreets)).toEqual(
      [["way/665350226", "Jasper St"], ["way/665350226", "Victoria Avenue", "way/446472694"]]
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

  test('bufferedFeaturesToOsmAllBlocksQueryResultsTask', done => {
    const geojson = {
      "type": "FeatureCollection",
      "name": "Untitled layer",
      "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
      "features": [
        /* Commented out to save time {
          "type": "Feature",
          "properties": {"Name": "Line 1", "description": null, "tessellate": 1},
          "geometry": {"type": "LineString", "coordinates": [[-114.1412794, 51.0378554], [-114.1134703, 51.0378015]]}
        },
        {
          "type": "Feature",
          "properties": {"Name": "Line 2", "description": null, "tessellate": 1},
          "geometry": {"type": "LineString", "coordinates": [[-114.1412756, 51.0451478], [-114.1412756, 51.0224241]]}
        },
        {
          "type": "Feature",
          "properties": {"Name": "Line 3", "description": null, "tessellate": 1},
          "geometry": {
            "type": "LineString",
            "coordinates": [[-114.1708005, 51.0773893], [-114.1677535, 51.0753401], [-114.1651356, 51.075421], [-114.1639769, 51.0751244], [-114.1542351, 51.0678976]]
          }
        },
        {
          "type": "Feature",
          "properties": {"Name": "Line 4", "description": null, "tessellate": 1},
          "geometry": {"type": "LineString", "coordinates": [[-114.117886, 51.0239661], [-114.0947546, 51.0239931]]}
        },
         */
        {
          "type": "Feature",
          "properties": {"Name": "Line 5", "description": null, "tessellate": 1},
          "geometry": {"type": "LineString", "coordinates": [[-114.0517016, 51.0532901], [-114.0450283, 51.0532699]]}
        }
      ]
    };
    const errors = [];
    const resultsTask = bufferedFeaturesToOsmAllBlocksQueryResultsTask({radius: 50, units: 'meters'}, geojson);

    resultsTask.run().listen(
      defaultRunConfig({
        onResolved: ({Error, Ok}) => {
          blocksToGeojson(R.map(R.prop('block'), Ok));
          expect(Ok).toBeTruthy();
        }
      }, errors, done)
    );
  }, 10000000);
});
