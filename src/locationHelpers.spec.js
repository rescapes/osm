import * as R from 'ramda';
import {
  addressPair,
  addressStrings,
  intersectionsByNodeIdToSortedIntersections,
  fixWordsThatTripUpGoogle,
  aggregateLocation,
  locationWithIntersectionInBothOrders,
  isResolvableAllBlocksLocation,
  normalizedIntersectionNames, addressStringForBlock
} from './locationHelpers';

describe('LocationSelector', () => {
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
      'Monroe St & 13th NE to Political St & Correctness St, Washington, DC, USA',
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
      "blockname": "High St",
      "intersections": [],
      "street": "High St",
      "osmId": 665064256
    };
    const componentLocationWithoutGeojson = [{
      "id": 2229946,
      "state": "",
      "city": "Auckland",
      "country": "New Zealand",
      "neighborhood": "Viaduct Basin",
      "blockname": "High St",
      "intersc1": "Durham St E",
      "intersc2": "Victoria St E",
      "geojson": null,
      "intersections": ["-36.848499, 174.766344", "-36.849247, 147.766100"],
      "street": "High St"
    }, {
      "id": 2229955,
      "state": "",
      "city": "Auckland",
      "country": "New Zealand",
      "neighborhood": "Viaduct Basin",
      "blockname": "High St",
      "intersc1": "Durham St E",
      "intersc2": "Victoria St E",
      "geojson": null,
      "intersections": ["-36.848499, 174.766344", "-36.849247, 174.766100'"],
      "street": "High St"
    }, {
      "id": 2229945,
      "state": "",
      "city": "Auckland",
      "country": "New Zealand",
      "neighborhood": "Viaduct Basin",
      "blockname": "High St",
      "intersc1": "Shortland St",
      "intersc2": "Vulcan Ln",
      "point_of_interest": "",
      "point_of_interest_location": "",
      "geojson": null,
      "intersections": ["-36.846571, 174.766872", "-36.847199, 174.766720"],
      "street": "High St"
    }, {
      "id": 2229947,
      "state": "",
      "city": "Auckland",
      "country": "New Zealand",
      "neighborhood": "Viaduct Basin",
      "blockname": "High St",
      "intersc1": "Vulcan Ln",
      "intersc2": "Durham St E",
      "geojson": null,
      "intersections": ["-36.847199, 174.766720", "-36.848499, 174.766344"],
      "street": "High St"
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
      "blockname": "High St",
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
      "blockname": "High St",
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
      ['Northwest Mammoth Avenue', 'Southwest Penguin Plaza'],
    )).toEqual(
      ['NW Mammoth Ave', 'SW Penguin Plaza']
    )
  })
});
