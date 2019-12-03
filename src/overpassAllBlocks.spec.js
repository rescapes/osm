import * as R from 'ramda';
import {defaultRunToResultConfig, defaultRunConfig, reqStrPathThrowing} from 'rescape-ramda';
import {
  locationToOsmAllBlocksQueryResultsTask, organizeResponseFeaturesResultsTask
} from './overpassAllBlocks';
import {_blocksToGeojson} from './overpassBlockHelpers';
import {queryLocationForOsmBlockOrAllResultsTask} from './overpassBlocks';
import Result from 'folktale/result';

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
          _blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(1068);
        }
      }, errors, done)
    );
  }, 1000000);

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
          expect(R.length(blocks)).toEqual(1068);
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

  }, 100000);

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
          _blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(148);
        }
      }, errors, done)
    );
  }, 1000000);


  test('Test bounding box', done => {
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
    };
    queryLocationForOsmBlockOrAllResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          _blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(39);
        }
      }, errors, done)
    );
  }, 200000);

  // Tests a large number of ways and nodes to make sure there are no stack overflows
  test('Fort Lauderdale', done => {
    const errors = [];
    const nodes = require('./samples/fort_lauderdale_nodes.json');
    const ways = require('./samples/fort_lauderdale_ways.json');
    const location = {country: 'USA', state: 'FL', city: 'Fort Lauderdale'};
    organizeResponseFeaturesResultsTask(location,
      Result.Ok({
        node: {response: {features: nodes.features}},
        way: {response: {features: ways.features}}
      })).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          _blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(1068);
        }
      }, errors, done));
  }, 1000000);

  test("Be'ersheva", done => {
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
                    34.797821044921875,
                    31.24836025032774
                  ],
                  [
                    34.796812534332275,
                    31.246782589750854
                  ],
                  [
                    34.7952675819397,
                    31.245131521386778
                  ],
                  [
                    34.79342222213745,
                    31.244177557619114
                  ],
                  [
                    34.79200601577759,
                    31.244764613385744
                  ],
                  [
                    34.78915214538574,
                    31.245388356139326
                  ],
                  [
                    34.788658618927,
                    31.243682226477574
                  ],
                  [
                    34.78827238082886,
                    31.243535461196
                  ],
                  [
                    34.787070751190186,
                    31.242214563398587
                  ],
                  [
                    34.784367084503174,
                    31.244067484256615
                  ],
                  [
                    34.78318691253662,
                    31.24285666880196
                  ],
                  [
                    34.78376626968384,
                    31.242416368424312
                  ],
                  [
                    34.782838225364685,
                    31.241356887228815
                  ],
                  [
                    34.783610701560974,
                    31.24088447403361
                  ],
                  [
                    34.78324592113495,
                    31.24048085700484
                  ],
                  [
                    34.78571891784668,
                    31.23849026597648
                  ],
                  [
                    34.78516101837158,
                    31.23804994524463
                  ],
                  [
                    34.78919506072998,
                    31.23474747433544
                  ],
                  [
                    34.79241371154785,
                    31.236031782295996
                  ],
                  [
                    34.794301986694336,
                    31.23573822772999
                  ],
                  [
                    34.79790687561035,
                    31.233279672430864
                  ],
                  [
                    34.80073928833007,
                    31.232802631902096
                  ],
                  [
                    34.80297088623047,
                    31.233463148915984
                  ],
                  [
                    34.80636119842529,
                    31.238453572660557
                  ],
                  [
                    34.80743408203125,
                    31.239370901282832
                  ],
                  [
                    34.80588912963867,
                    31.24083860854901
                  ],
                  [
                    34.80636119842529,
                    31.241535761511255
                  ],
                  [
                    34.80593204498291,
                    31.242416368424312
                  ],
                  [
                    34.80640411376953,
                    31.24458115885068
                  ],
                  [
                    34.80520248413086,
                    31.24502144913615
                  ],
                  [
                    34.80374336242676,
                    31.247406319175877
                  ],
                  [
                    34.80172634124755,
                    31.24902065855683
                  ],
                  [
                    34.80039596557617,
                    31.2504882158624
                  ],
                  [
                    34.79790687561035,
                    31.251075232397856
                  ],
                  [
                    34.797821044921875,
                    31.24836025032774
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
          _blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(39);
        }
      }, errors, done)
    );
  }, 200000);
});
