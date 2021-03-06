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

import {
  queryLocationForOsmSingleBlockResultTask,
  queryLocationForOsmSingleBlocksResultsTask
} from './overpassSingleBlock.js';
import {defaultRunConfig, reqStrPathThrowing, defaultRunToResultConfig} from '@rescapes/ramda';
import * as R from 'ramda';
import {loggers} from '@rescapes/log';

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
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, {
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point',
      // Intentionally put Grand Ave a different positions
      intersections: [{data: {streets: ['Grand Ave', 'Perkins St']}}, {data: {streets: ['Lee St', 'Grand Ave']}}],
      blockname: 'Grand Ave'
    }).run().listen(defaultRunToResultConfig({
        onResolved: ({result, location}) => {
          // Expect it to be two ways
          expect(R.map(R.prop('id'), R.prop('ways', result))).toEqual(['way/417728789', 'way/417728790']);
          done();
        }
      }, errors, done)
    );
  }, 50000);

  // Query multiple locations and combine results. Expect one result in Ok and one in Errors
  // Currently the second location here doesn't resolve because of a weird highway intersection. It might
  // work in the future though when the query code is improved
  test('queryLocationForOsmSingleBlocksResultsTask', done => {
    expect.assertions(1);
    const errors = [];
    const osmConfig = {};
    queryLocationForOsmSingleBlocksResultsTask(osmConfig, [
      {
        country: 'USA',
        state: 'California',
        city: 'Oakland',
        neighborhood: 'Adams Point',
        // Intentionally put Grand Ave a different positions
        intersections: [{data: {streets: ['Grand Ave', 'Perkins St']}}, {data: {streets: ['Lee St', 'Grand Ave']}}],
        blockname: 'Grand Ave'
      },
      {
        geojson: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {type: 'Point', coordinates: [-73.8057879, 40.6660816]}
          }, {type: 'Feature', geometry: {type: 'Point', coordinates: [-73.80604, 40.66528]}}]
        }
      }
    ]).run().listen(defaultRunConfig({
        onResolved: (results) => {
          // Expect it to be two ways
          expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/417728789', 'way/417728790']);
          done();
        }
      }, errors, done)
    );
  }, 100000);

  test('fetchOsmBlockOslo', done => {
    expect.assertions(1);
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, {
      country: 'Norway',
      city: 'Oslo',
      neighborhood: 'Sentrum',
      intersections: [{data: {streets: ['Kongens gate', 'Myntgata']}}, {data: {streets: ['Kongens gate', 'Revierstredet']}}],
      blockname: 'Kongens gate'
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
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, {
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
      intersections: [{data: {streets: ['Pedersgata', 'A. B. C. Gata']}}, {data: {streets: ['Pedersgata', 'Vinkelgata']}}],
      blockname: 'Pedersgata'
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
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, {
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
      intersections: [{data: {streets: ['Pedersgata', 'Nykirkebakken']}}, {data: {streets: ['Pedersgata', 'A.B.C Gata']}}],
      blockname: 'Pedersgata'
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
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, {
      country: 'USA',
      // BAD SPELLING
      city: 'Los Angleles',
      neighborhood: 'Boyle Heights',
      intersections: [{data: {streets: ['East 1st St', 'North Savannah Street']}}, {data: {streets: ['East 1st St', 'North Saratoga Street']}}],
      blockname: 'East 1st St'
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
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, {
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
      intersections: [{data: {streets: ['Langgata', 'Pedersgata']}}, {data: {streets: ['Vinkelgata', 'Pedersgata']}}],
      blockname: 'Langgata',
      data: {
        osmOverrides: {
          // We have to override OSM names because they differ from Google
          intersections: [{data: {streets: ['Langgata', 'Nytorget']}}, {data: {streets: ['Vinkelgata', 'Nytorget']}}],
          blockname: 'Langgata',
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

  // Make sure we only get nodes back that are intersections, not just traffic lights
  // This road is divided and one side of one intersection intersects Bulfinch Road but the other
  // side intersects a service road, so we add extraWays.intersection2: [16702952] for the service road's way id
  // TODO we can't rely on osmOverrides anymore. The code must be smart enough to resolve without it
  test('fetchOsmBlockWithSeparatedLanesAndTrafficSignalNodes', done => {
    expect.assertions(1);
    const errors = [];
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, {
      country: 'USA',
      state: 'NC',
      city: 'Charlotte',
      neighborhood: 'South Park',
      intersections: [{data: {streets: ['Barclay Downs Drive', 'Carnegie Boulevard']}}, {data: {streets: ['Barclay Downs Drive', 'Bulfinch Road']}}],
      blockname: 'Barclay Downs Drive',
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
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, {
      country: 'USA',
      state: 'IL',
      city: 'Champaign',
      neighborhood: 'Downtown Champaign',
      intersections: [
        {data: {streets: ['East Columbia Avenue', 'North Neil Street']}},
        {data: {streets: ['West Columbia Avenue', 'North Randolph Street']}}
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
      "street": "Hetlandsgata",
      "intersections": [{
        data: {
          streets:
            [
              "Hetlandsgata",
              "Bergelandsgata "
            ]
        }
      },
        {
          data: {
            streets: [
              "Hetlandsgata",
              "Vaisenhusgata"
            ]
          }
        }
      ]
    };
    const errors = [];
    expect.assertions(1);
    queryLocationForOsmSingleBlockResultTask({}, location).run().listen(defaultRunConfig(
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

  test('fetchBlockWithJogAtIntersectionProducing2Nodes', done => {
    const location = {
      'street': 'High St',
      'intersections': {data: {streets: [['High St', 'Shortland St'], ['High St', 'Vulcan Ln']]}},
      'neighborhood': 'Viaduct Basin',
      'city': 'Auckland',
      'state': '',
      'country': 'New Zealand'
    };
    // This is where the block is a pedestrian area, not a simple line.
    const errors = [];
    expect.assertions(2);
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, location).run().listen(
      defaultRunToResultConfig({
        onResolved: ({results, location}) => {
          expect(R.length(R.prop('nodes', results))).toEqual(2);
          expect(R.length(R.prop('ways', results))).toEqual(1);
        }
      }, errors, done)
    );
  }, 200000);

  test('fetchBlockForDividedRoad', done => {
    const location = {
      'intersections': {data: {streets: [['Lee Hwy', 'N Buchanan St'], ['Lee Hwy', 'N Glebe Rd']]}},
      'city': 'Arlington',
      'state': 'VA',
      'country': 'USA'
    };
    // This is where the block is a pedestrian area, not a simple line.
    const errors = [];
    expect.assertions(2);
    const osmConfig = {};
    queryLocationForOsmSingleBlockResultTask(osmConfig, location).run().listen(
      defaultRunToResultConfig({
        onResolved: ({results, location}) => {
          // 6 nodes because a divided road crosses a divided road
          expect(R.length(R.prop('nodes', results))).toEqual(6);
          // One way side splits at the first divided road node and the other doesn't, so we get 3
          expect(R.length(R.prop('ways', results))).toEqual(3);
        }
      }, errors, done)
    );
  }, 200000);
});

