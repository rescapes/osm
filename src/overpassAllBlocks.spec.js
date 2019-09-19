import * as R from 'ramda';
import {defaultRunToResultConfig, defaultRunConfig, reqStrPathThrowing} from 'rescape-ramda';
import {
  locationToOsmAllBlocksQueryResultsTask, osmLocationToRelationshipGeojsonResultTask,
  osmRelationshipGeojsonResultTask,
  queryLocationForOsmBlockOrAllResultsTask
} from './overpassAllBlocks';
import {_blocksToGeojson} from './overpassBlockHelpers';

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
    locationToOsmAllBlocksQueryResultsTask(location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Errors: errors}) => {
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
        onResolved: ({Ok: blocks, Errors: errors}) => {
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
        onResolved: ({Ok: blocks, Errors: errors}) => {
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
    locationToOsmAllBlocksQueryResultsTask(location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsAndOsmResults, Errors: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          _blocksToGeojson(R.map(R.prop('results'), locationsAndOsmResults));
          expect(R.length(locationsAndOsmResults)).toEqual(148);
        }
      }, errors, done)
    );

  }, 1000000);

  test('osmRelationshipGeojsonResultTask', done => {
    expect.assertions(1);
    const errors = [];
    osmRelationshipGeojsonResultTask(8398096).run().listen(defaultRunToResultConfig({
      onResolved: geojson => expect(reqStrPathThrowing('features.0.geometry', geojson)).toEqual(
        {
          "coordinates": [[[-73.9935702, 40.7571438], [-73.9926276, 40.7584281], [-73.9897925, 40.7572376], [-73.9842691, 40.7647982], [-73.9828727, 40.7667157], [-73.9857128, 40.7679195], [-73.9847606, 40.7692277], [-73.9847685, 40.769231], [-73.993569, 40.7729369], [-73.9939928, 40.7733086], [-73.9941524, 40.7733787], [-73.9960903, 40.7742003], [-73.9963692, 40.7738002], [-73.9940733, 40.7727927], [-73.9942235, 40.7725956], [-73.99616, 40.7733838], [-73.9964068, 40.7730913], [-73.9946607, 40.7723438], [-73.9948565, 40.7720959], [-73.9969674, 40.7729836], [-73.9973322, 40.7725205], [-73.9952078, 40.7716166], [-73.995409, 40.7713606], [-73.995975, 40.7716003], [-73.9961976, 40.7712915], [-73.9959508, 40.771188], [-73.9959937, 40.771129], [-73.9956531, 40.7709889], [-73.9958328, 40.7707451], [-73.9959213, 40.7707878], [-73.9962056, 40.7704465], [-73.996093, 40.7703896], [-73.9963827, 40.7699692], [-73.9987564, 40.7709279], [-73.9991614, 40.7703917], [-73.9968413, 40.769376], [-73.9971685, 40.7689454], [-73.9995879, 40.7699773], [-74.0000251, 40.7694248], [-73.9967179, 40.7680576], [-73.9972463, 40.7673263], [-74.0005133, 40.7687077], [-74.0009397, 40.7681714], [-73.9976245, 40.7667697], [-73.998, 40.76627], [-73.9982522, 40.766268], [-74.0013501, 40.7675681], [-74.0019402, 40.7668043], [-73.9987242, 40.7654147], [-73.9989388, 40.7652502], [-73.9988717, 40.7649861], [-73.9991775, 40.7649556], [-74.0021253, 40.7661115], [-74.0026027, 40.765498], [-74.0024284, 40.7654066], [-74.0025812, 40.7650897], [-73.9995718, 40.7638444], [-74.000001, 40.7636087], [-74.0031847, 40.7649516], [-74.0034664, 40.764594], [-74.003225, 40.7644721], [-74.0033671, 40.764273], [-74.0012401, 40.7633487], [-74.0014815, 40.7630358], [-74.0036756, 40.7639541], [-74.0040135, 40.7635214], [-74.0018356, 40.7625787], [-74.0023103, 40.7619571], [-74.0045071, 40.7628672], [-74.004837, 40.7624447], [-74.0025732, 40.7614573], [-74.0028682, 40.761051], [-73.9935702, 40.7571438]]],
          "type": "Polygon"
        }
      )
    }, errors, done));
  });

  test('osmLocationToRelationshipGeojsonResultTask', done => {
    expect.assertions(1);
    const errors = [];
    osmLocationToRelationshipGeojsonResultTask({country: 'USA', state: 'New York', city: 'New York', neighborhood: "Hell's Kitchen"}).run().listen(defaultRunToResultConfig({
      onResolved: geojson => expect(reqStrPathThrowing('features.0.geometry', geojson)).toEqual(
        {
          "coordinates": [[[-73.9935702, 40.7571438], [-73.9926276, 40.7584281], [-73.9897925, 40.7572376], [-73.9842691, 40.7647982], [-73.9828727, 40.7667157], [-73.9857128, 40.7679195], [-73.9847606, 40.7692277], [-73.9847685, 40.769231], [-73.993569, 40.7729369], [-73.9939928, 40.7733086], [-73.9941524, 40.7733787], [-73.9960903, 40.7742003], [-73.9963692, 40.7738002], [-73.9940733, 40.7727927], [-73.9942235, 40.7725956], [-73.99616, 40.7733838], [-73.9964068, 40.7730913], [-73.9946607, 40.7723438], [-73.9948565, 40.7720959], [-73.9969674, 40.7729836], [-73.9973322, 40.7725205], [-73.9952078, 40.7716166], [-73.995409, 40.7713606], [-73.995975, 40.7716003], [-73.9961976, 40.7712915], [-73.9959508, 40.771188], [-73.9959937, 40.771129], [-73.9956531, 40.7709889], [-73.9958328, 40.7707451], [-73.9959213, 40.7707878], [-73.9962056, 40.7704465], [-73.996093, 40.7703896], [-73.9963827, 40.7699692], [-73.9987564, 40.7709279], [-73.9991614, 40.7703917], [-73.9968413, 40.769376], [-73.9971685, 40.7689454], [-73.9995879, 40.7699773], [-74.0000251, 40.7694248], [-73.9967179, 40.7680576], [-73.9972463, 40.7673263], [-74.0005133, 40.7687077], [-74.0009397, 40.7681714], [-73.9976245, 40.7667697], [-73.998, 40.76627], [-73.9982522, 40.766268], [-74.0013501, 40.7675681], [-74.0019402, 40.7668043], [-73.9987242, 40.7654147], [-73.9989388, 40.7652502], [-73.9988717, 40.7649861], [-73.9991775, 40.7649556], [-74.0021253, 40.7661115], [-74.0026027, 40.765498], [-74.0024284, 40.7654066], [-74.0025812, 40.7650897], [-73.9995718, 40.7638444], [-74.000001, 40.7636087], [-74.0031847, 40.7649516], [-74.0034664, 40.764594], [-74.003225, 40.7644721], [-74.0033671, 40.764273], [-74.0012401, 40.7633487], [-74.0014815, 40.7630358], [-74.0036756, 40.7639541], [-74.0040135, 40.7635214], [-74.0018356, 40.7625787], [-74.0023103, 40.7619571], [-74.0045071, 40.7628672], [-74.004837, 40.7624447], [-74.0025732, 40.7614573], [-74.0028682, 40.761051], [-73.9935702, 40.7571438]]],
          "type": "Polygon"
        }
      )
    }, errors, done));
  });
});

