import * as R from 'ramda';
import {
  resolveGeoLocationTask, resolveGeojsonTask, addressPair, intersectionsFromLocation,
  locationWithIntersections, addressStrings
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
  )
});
