import * as R from 'ramda';
import {reqStrPathThrowing} from 'rescape-ramda';
import {resolveGeoLocationTask, resolveGeojsonTask, addressPair} from './locationHelpers';

describe('LocationSelector', () => {
;
  test('addressPair', () => {
    const location = {
      country: 'USA',
      state: 'Anystate',
      city: 'Anytown',
      neighborhood: 'Downtown',
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
    };
    expect(addressPair(location)).toEqual([
      "Main St and First St, Anytown, Anystate, USA",
      "Main St and Second St, Anytown, Anystate, USA"
    ]);
  });
});
