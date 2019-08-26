import * as R from 'ramda';
import {
  resolveGeoLocationTask, resolveGeojsonTask, addressPair, intersectionsFromLocation,
  locationWithIntersections, addressStrings, sortedIntersections, intersectionsByNodeIdToSortedIntersections
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
      "Main St and First St, Anytown, Anystate, USA",
      "Main St and Second St, Anytown, Anystate, USA"
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
      "Main St and Second St, Anytown, Anystate, USA"
    ]);
  });

  test('addressStrings', () =>
    expect(addressStrings({
      country: 'USA',
      state: 'DC',
      city: 'Washington',
      intersections: [['Monroe St', '13th NE'], ['Political St', 'Correctness St']]
    })).toEqual(
      ['Monroe St and 13th NE, Washington, DC, USA',
        'Political St and Correctness St, Washington, DC, USA']
    )
  );

  test('  intersectionsByNodeIdToSortedIntersections', () => {
    expect(intersectionsByNodeIdToSortedIntersections({
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
      ["Cokato Road", "node/4505199830"],
    ])
  });
});
