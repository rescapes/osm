/**
 * Created by Andy Likuski on 2017.04.03
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {queryLocationOsm} from './overpass';
import {defaultRunConfig, reqStrPathThrowing} from 'rescape-ramda';
import * as R from 'ramda';

// Integration testing. Unmocked tests
// requires are used below since the jest includes aren't available at compile time
describe('overpassIntegration', () => {
  if (!process.env.ENABLE_INTEGRATION_TESTS) {
    test('No tests enabled', () => {
    });
    return;
  }

  test('fetchOsmOaklandBlock', done => {
    expect.assertions(1);
    queryLocationOsm({
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      // Intentionally put Grand Ave a different positions
      intersections: [['Grand Ave', 'Perkins St'], ['Lee St', 'Grand Ave']]
    }).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.map(
          ({results, location}) => {
            // Expect it to be two ways
            expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/417728789', 'way/417728790']);
            done();
          }
        )
      }));
  }, 1000000);

  test('fetchOsmBlockOslo', done => {
    expect.assertions(1);
    queryLocationOsm({
      country: 'Norway',
      city: 'Oslo',
      neighborhood: 'Sentrum',
      intersections: [['Kongens gate', 'Myntgata'], ['Kongens gate', 'Revierstredet']]
    }).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.map(
          ({results, location}) => {
            // Expect it to be one way
            expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/5089101']);
            done();
          }
        )
      }));
  }, 50000);

  test('fetchOsmBlockStavangerBadStreetnameRelyOnGooglePoints', done => {
    // This fails on the intersection match because OSM uses Nytorget instead of Pedersgata
    // However Google geocoding gives us points so we eventually resolve the way
    expect.assertions(1);
    queryLocationOsm({
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
      intersections: [['Pedersgata', 'A. B. C. Gata'], ['Pedersgata', 'Vinkelgata"']]
    }).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.map(
          ({results, location}) => {
            expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/24382524']);
            done();
          }
        )
      }));
  }, 20000);

  test('fetschOsmBlockStavangerError', done => {

    // This fails on the intersection match because OSM uses Nytorget instead of Pedersgata
    // Even Google can't save us
    expect.assertions(1);
    queryLocationOsm({
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
      intersections: [['Pedersgata', 'Nykirkebakken'], ['Pedersgata', 'A.B.C Gata']]
    }).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.mapError(
          ({errors, location}) => {
            expect(errors).toBeTruthy();
            done();
          }
        )
      }));
  }, 20000);

  test('fetchOsmBlockStavanger', done => {
    expect.assertions(1);
    queryLocationOsm({
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
      intersections: [['Langgata', 'Pedersgata'], ['Vinkelgata', 'Pedersgata']],
      data: {
        osmOverrides: {
          // We have to override OSM names because they differ from Google
          intersections: [['Langgata', 'Nytorget'], ['Vinkelgata', 'Nytorget']],
          // Hard code node ids because there are two Nytorget streets that intersect
          nodes: [351103238, 367331193]
        }
      }
    }).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.map(
          ({results, location}) => {
            expect(
              R.length(reqStrPathThrowing('ways', results))
            ).toEqual(1);
            done();
          }
        )
      }));
  }, 10000);
});

