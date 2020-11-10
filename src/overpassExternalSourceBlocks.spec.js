import * as R from 'ramda';
import {defaultRunConfig, moveToKeys} from 'rescape-ramda';
import {locationsToGeojson} from './overpassBlockHelpers';
import philly from './samples/philly.json';
import california from './samples/californiaBlocks.json';
import {nonOsmGeojsonLinesToLocationBlocksResultsTask} from './overpassExternalSourceBlocks';
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


describe('overpassAllBlocksPhilly', () => {
  test('Process geojson derived from shapefile', done => {
    const nameProp = props => `${R.prop('ST_NAME', props)} ${R.prop('ST_TYPE', props)}`;
    const location = {country: 'USA', state: 'PA', city: 'Philadelphia'};
    const geojsonLines = philly;
    const osmConfig = {};
    const errors = [];
    nonOsmGeojsonLinesToLocationBlocksResultsTask({osmConfig}, {location, nameProp}, geojsonLines).run().listen(
      defaultRunConfig({
        onResolved: ({Ok: locationBlocks, Error: errorBlocks}) => {
          expect(R.length(locationBlocks)).toBeGreaterThan(50);
        }
      }, errors, done)
    );
  }, 100000);
});

describe('overpassAllBlocksCalifornia', () => {
  test('Process geojson derived from shapefile', done => {
    const nameProp = props => R.prop('FULLNAME', props);
    const jurisdictionFunc = props => {
      return R.compose(
        props => moveToKeys(R.lensPath([]), 'Nearby_City___to_help_approxima', ['city'], props),
        props => R.pick(['Nearby_City___to_help_approxima'], props)
      )(props);
    };
    const location = {country: 'USA', state: 'CA'};
    const geojsonLines = california;
    const osmConfig = {};
    const errors = [];
    nonOsmGeojsonLinesToLocationBlocksResultsTask({osmConfig}, {
      location,
      nameProp,
      jurisdictionFunc
    }, geojsonLines).run().listen(
      defaultRunConfig({
        onResolved: ({Ok: locationBlocks, Error: errorBlocks}) => {
          expect(R.length(locationBlocks)).toEqual(12)
          expect(R.all(R.propOr(false, 'city'), locationBlocks))
        }
      }, errors, done)
    );
  }, 100000);
});
