import * as R from 'ramda';
import {defaultRunToResultConfig, defaultRunConfig, reqStrPathThrowing} from 'rescape-ramda';
import {
  locationToOsmAllBlocksQueryResultsTask
} from './overpassAllBlocks';
import {blocksToGeojson, blocksWithLengths, lengthOfBlocks} from './overpassBlockHelpers';
import {queryLocationForOsmBlockOrAllResultsTask} from './overpassBlocks';
import {length} from '@turf/turf';

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


describe('overpassAllBlocks', () => {
  // This mocks the overall response but has to go to the server to get node dead end queries.
  // There are too many of the latter to bother mocking and they run fast on the server
  test('locationToOsmAllBlocksQueryResultsTask', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'Canada',
      state: 'BC',
      city: 'Fernie'
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(1030);
        }
      }, errors, done)
    );
  }, 1000000);

  // These are long tests
  /*
  test('queryLocationForOsmBlockOrAllResultsTask', done => {
    expect.assertions(4);
    let dones = 0;
    const incDones = () => {
      if (++dones == 2) {
        done();
      }
    };
    const errors = [];
    const location = {
      country: 'Canada',
      state: 'BC',
      city: 'Fernie'
    };
    const osmConfig = {};
    // Detects an area
    queryLocationForOsmBlockOrAllResultsTask(osmConfig, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: blocks, Error: errors}) => {
          expect(R.length(blocks)).toEqual(1030);
        }
      }, errors, incDones)
    );
    // Detects a block
    queryLocationForOsmBlockOrAllResultsTask(
      osmConfig,
      {intersections: ['40.6660816,-73.8057879', '40.66528,-73.80604']}
    ).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: blocks, Error: errors}) => {
          // Expect it to be two ways
          expect(R.length(blocks)).toEqual(1);
          expect(R.map(R.prop('id'), reqStrPathThrowing('0.results.ways', blocks))).toEqual(['way/5707230']);
          expect(R.map(R.prop('id'), reqStrPathThrowing('0.results.nodes', blocks))).toEqual(['node/42875319', 'node/42901997']);
        }
      }, errors, incDones)
    );

  }, 1000000);
   */

  test('smallLocationToOsmAllBlocksQueryResultsTask', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'USA',
      state: 'North Carolina',
      city: 'Durham',
      neighborhood: 'Old North Durham'
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(131);
        }
      }, errors, done)
    );
  }, 1000000);

  test('Remove blocks that are too short', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      geojson: {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "properties": {},
            "geometry": {
              "type": "Polygon",
              "coordinates": [
                [
                  [
                    34.791855812072754,
                    31.236389550690053
                  ],
                  [
                    34.793561697006226,
                    31.236389550690053
                  ],
                  [
                    34.793561697006226,
                    31.23777474374497
                  ],
                  [
                    34.791855812072754,
                    31.23777474374497
                  ],
                  [
                    34.791855812072754,
                    31.236389550690053
                  ]
                ]
              ]
            }
          }
        ]
      }
    };
    queryLocationForOsmBlockOrAllResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          blocksWithLengths(R.map(R.prop('results'), locationsAndOsmResults))
          expect(R.length(locationsAndOsmResults)).toEqual(16);
        }
      }, errors, done)
    );
  }, 2000000);

  test('Test PointBuffer locations', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: "Feature",
            properties: {
              radius: 100
            },
            geometry: {
              type: "Point",
              coordinates: [
                -80.18231999999999,
                26.098829
              ]
            }
          }
        ]
      }
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(9);
        }
      }, errors, done)
    );
  }, 1000000)

  test('Test Jurisdiction Point Buffer locations', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'USA',
      state: 'NV',
      city: 'Winnemucca',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: "Feature",
            properties: {
              radius: 100,
              jurisdictionCenterPoint: true
            },
          }
        ]
      }
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(9);
        }
      }, errors, done)
    );
  }, 1000000)

  test('Test Jurisdiction Point Buffer locations Alexandria', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'Egypt',
      city: 'Alexandria',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: "Feature",
            properties: {
              radius: 100,
              jurisdictionCenterPoint: true
            },
          }
        ]
      }
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(9);
        }
      }, errors, done)
    );
  }, 1000000)
});
