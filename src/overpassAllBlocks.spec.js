import * as R from 'ramda';
import {defaultRunToResultConfig, defaultRunConfig, reqStrPathThrowing} from 'rescape-ramda';
import {
  locationToOsmAllBlocksQueryResultsTask
} from './overpassAllBlocks';
import {_blocksToGeojson, _blocksWithLengths, _lengthOfBlocks} from './overpassBlockHelpers';
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
          expect(R.length(locationsAndOsmResults)).toEqual(131);
        }
      }, errors, done)
    );
  }, 1000000);


  test('Test Israel 1', done => {
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
                    34.793572425842285,
                    31.244140866512556
                  ],
                  [
                    34.79297161102295,
                    31.24399410194368
                  ],
                  [
                    34.79666233062744,
                    31.241022070353754
                  ],
                  [
                    34.79876518249511,
                    31.236508806520323
                  ],
                  [
                    34.802885055541985,
                    31.23782978410905
                  ],
                  [
                    34.803786277770996,
                    31.238783811990814
                  ],
                  [
                    34.806532859802246,
                    31.240214835747455
                  ],
                  [
                    34.805803298950195,
                    31.240801916145294
                  ],
                  [
                    34.806275367736816,
                    31.241535761511255
                  ],
                  [
                    34.80588912963867,
                    31.24226960117563
                  ],
                  [
                    34.80623245239258,
                    31.244397703959265
                  ],
                  [
                    34.80494499206543,
                    31.244874685935727
                  ],
                  [
                    34.803571701049805,
                    31.2474796988374
                  ],
                  [
                    34.80164051055908,
                    31.248873901571773
                  ],
                  [
                    34.800353050231934,
                    31.25030477244663
                  ],
                  [
                    34.79794979095458,
                    31.250855101624765
                  ],
                  [
                    34.79794979095458,
                    31.24817680277773
                  ],
                  [
                    34.79679107666015,
                    31.24634230767628
                  ],
                  [
                    34.79546070098877,
                    31.24491137675723
                  ],
                  [
                    34.793572425842285,
                    31.244140866512556
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
          const blocks = R.map(R.prop('results'), locationsAndOsmResults);
          _blocksToGeojson(blocks);
          _lengthOfBlocks(blocks);
          expect(R.length(locationsAndOsmResults)).toEqual(192);
        }
      }, errors, done)
    );
  }, 2000000);

  test('Test Israel 2', done => {
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
                    34.79297161102295,
                    31.244177557619114
                  ],
                  [
                    34.78923797607421,
                    31.245094830650817
                  ],
                  [
                    34.78868007659912,
                    31.243663880829857
                  ],
                  [
                    34.7870922088623,
                    31.242196217465768
                  ],
                  [
                    34.784560203552246,
                    31.244030793107285
                  ],
                  [
                    34.78340148925781,
                    31.24285666880196
                  ],
                  [
                    34.78374481201172,
                    31.242379676633526
                  ],
                  [
                    34.78297233581543,
                    31.241462377231237
                  ],
                  [
                    34.78348731994628,
                    31.24076522372733
                  ],
                  [
                    34.78331565856933,
                    31.240324913600006
                  ],
                  [
                    34.785590171813965,
                    31.238453572660557
                  ],
                  [
                    34.78516101837158,
                    31.237939864740973
                  ],
                  [
                    34.78949546813965,
                    31.234967642654343
                  ],
                  [
                    34.790825843811035,
                    31.235774922100635
                  ],
                  [
                    34.79241371154785,
                    31.236068476552624
                  ],
                  [
                    34.79387283325195,
                    31.235885005127006
                  ],
                  [
                    34.79837894439697,
                    31.233169586368767
                  ],
                  [
                    34.8006534576416,
                    31.232912718391738
                  ],
                  [
                    34.80327129364014,
                    31.234013576233565
                  ],
                  [
                    34.805288314819336,
                    31.23698582833593
                  ],
                  [
                    34.806060791015625,
                    31.238453572660557
                  ],
                  [
                    34.807305335998535,
                    31.239701137406072
                  ],
                  [
                    34.80644702911377,
                    31.240471683870496
                  ],
                  [
                    34.803528785705566,
                    31.238783811990814
                  ],
                  [
                    34.803099632263184,
                    31.23782978410905
                  ],
                  [
                    34.79923725128174,
                    31.23676566472033
                  ],
                  [
                    34.79691982269287,
                    31.241682529900256
                  ],
                  [
                    34.79297161102295,
                    31.244177557619114
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
          const blocks = R.map(R.prop('results'), locationsAndOsmResults);
          _blocksToGeojson(blocks);
          _lengthOfBlocks(blocks);
          expect(R.length(locationsAndOsmResults)).toEqual(352);
        }
      }, errors, done)
    );
  }, 2000000);

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
          _blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          _blocksWithLengths(R.map(R.prop('results'), locationsAndOsmResults))
          expect(R.length(locationsAndOsmResults)).toEqual(16);
        }
      }, errors, done)
    );
  }, 2000000);
});
