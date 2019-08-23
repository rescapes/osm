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

import {queryLocationForOsmSingleBlockResultTask} from './overpassSingleBlock';
import {defaultRunConfig, reqStrPathThrowing, defaultRunToResultConfig} from 'rescape-ramda';
import * as R from 'ramda';
import {loggers} from 'rescape-log';

const log = loggers.get('rescapeDefault');

// Integration testing. Unmocked tests
// TODO make mocks of the results of these tests and then move them to overpassBlockHelpers.spec.js

describe('overpassIntegration', () => {
  if (process.env.ENABLE_INTEGRATION_TESTS == 'false') {
    log.warn("No tests enabled");
    test('No tests enabled', () => {
    });
    return;
  }

  test('fetchOsmOaklandBlock', done => {
    expect.assertions(1);
    const errors = [];
    queryLocationForOsmSingleBlockResultTask({
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point',
      // Intentionally put Grand Ave a different positions
      intersections: [['Grand Ave', 'Perkins St'], ['Lee St', 'Grand Ave']]
    }).run().listen(defaultRunToResultConfig({
        onResolved: ({results, location}) => {
          // Expect it to be two ways
          expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/417728789', 'way/417728790']);
          done();
        }
      }, errors, done)
    );
  }, 50000);

  test('fetchOsmBlockOslo', done => {
    expect.assertions(1);
    queryLocationForOsmSingleBlockResultTask({
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
    const errors = [];
    queryLocationForOsmSingleBlockResultTask({
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
      intersections: [['Pedersgata', 'A. B. C. Gata'], ['Pedersgata', 'Vinkelgata']]
    }).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.map(
          ({results, location}) => {
            expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/24382524']);
          }
        )
      }, errors, done));
  }, 200000);

  test('fetschOsmBlockStavangerFixedError', done => {

    // Although Google uses Pedersgata OSM uses Nytorget. This still works because we revert
    // to querying the lat/lons that came from Google
    const errors = [];
    expect.assertions(1);
    queryLocationForOsmSingleBlockResultTask({
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
      intersections: [['Pedersgata', 'Nykirkebakken'], ['Pedersgata', 'A.B.C Gata']]
    }).run().listen(defaultRunToResultConfig(
      {
        onResolved: ({location, results}) => {
          expect(reqStrPathThrowing('intersections', results)).toEqual(
            {
              "node/264565256": [
                "Nykirkebakken",
                "Nytorget"
              ],
              "node/386234920": [
                "ABCgata",
                "Nytorget"
              ]
            }
          );
        }
      }, errors, done));
  }, 200000);

  test('fetchOsmBlockWithBadWayKeys', done => {

    // Even Google can't save us
    const errors = [];
    expect.assertions(1);
    queryLocationForOsmSingleBlockResultTask({
      country: 'USA',
      // BAD SPELLING
      city: 'Los Angleles',
      neighborhood: 'Boyle Heights',
      intersections: [['East 1st St', 'North Savannah Street'], ['East 1st St', 'North Saratoga Street']]
    }).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.mapError(
          ({errors, location}) => {
            expect(errors).toBeTruthy();
            done();
          }
        )
      }, errors, done));
  }, 20000);

  test('fetchOsmBlockStavanger', done => {
    expect.assertions(1);
    queryLocationForOsmSingleBlockResultTask({
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

  // Make sure we only get nodes back that are intersections, not things like traffic light
  // This road is divided and one side of one intersection intersects Bulfinch Road but the other
  // side intersects a service road, so we add extraWays.intersection2: [16702952] for the service road's way id
  test('fetchOsmBlockWithSeparatedLanesAndTrafficSignalNodes', done => {
    expect.assertions(1);
    const errors = [];
    queryLocationForOsmSingleBlockResultTask({
      country: 'USA',
      state: 'NC',
      city: 'Charlotte',
      neighborhood: 'South Park',
      intersections: [['Barclay Downs Drive', 'Carnegie Boulevard'], ['Barclay Downs Drive', 'Bulfinch Road']],
      data: {
        osmOverrides: {
          extraWays: {
            intersection2: [16702952]
          }
        }
      }
    }).run().listen(defaultRunToResultConfig(
      {
        onResolved: ({results, location}) => {
          expect(
            R.length(reqStrPathThrowing('nodes', results))
          ).toEqual(4);
        }
      }, errors, done));
  }, 50000);

  // Here East Columbia Avenue becomes West Columbia Avenue
  test('fetchOSMBlockWhereMainBlockChangesName', done => {
    expect.assertions(1);
    queryLocationForOsmSingleBlockResultTask({
      country: 'USA',
      state: 'IL',
      city: 'Champaign',
      neighborhood: 'Downtown Champaign',
      intersections: [
        ['East Columbia Avenue', 'North Neil Street'],
        ['West Columbia Avenue', 'North Randolph Street']
      ]
    }).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.map(
          ({results, location}) => {
            expect(
              R.length(reqStrPathThrowing('nodes', results))
            ).toEqual(2);
            done();
          }
        )
      }));
  }, 90000);


  test("Hetlandsgata", done => {
    const location = {
      "country": "Norway",
      "city": "Stavanger",
      "neighborhood": "Stavanger Sentrum",
      "blockname": "Hetlandsgata",
      "intersc1": "Bergelandsgata ",
      "intersc2": "Vaisenhusgata",
      "intersections": [
        [
          "Hetlandsgata",
          "Bergelandsgata "
        ],
        [
          "Hetlandsgata",
          "Vaisenhusgata"
        ]
      ]
    };
    const errors = [];
    expect.assertions(1);
    queryLocationForOsmSingleBlockResultTask(location).run().listen(defaultRunConfig(
      {
        onResolved: responseResult => responseResult.map(
          ({results, location}) => {
            expect(
              R.length(reqStrPathThrowing('nodes', results))
            ).toEqual(2);
            done();
          }
        )
      }, errors, done));
  }, 500000);
});

