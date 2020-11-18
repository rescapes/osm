/**
 * Created by Andy Likuski on 2020.06.29
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {processParamsFromJsonOrJsToList} from './scriptHelpers.js';
import {composeWithChain, defaultRunConfig, defaultRunToResultConfig, traverseReduce} from '@rescapes/ramda';
import {locationsToGeojsonFileResultTask} from '../overpassBlockHelpers.js';
import {locationToOsmAllBlocksQueryResultsTask} from '../overpassAllBlocks.js';
import moment from 'moment';
import "regenerator-runtime/runtime";
import R from 'ramda';
import T from 'folktale/concurrency/task';
const {of} = T;
import {loggers} from '@rescapes/log';
import phillySamples from '../samples/philadelphia_neighborhoods_to_locations.js'

const log = loggers.get('rescapeDefault');

describe('queryForGeojson', () => {
  test('queryForGeojson', done => {
    expect.assertions(1);
    const osmConfig = {};
    // Process .json or the default value of a .js file export
    const propSets = processParamsFromJsonOrJsToList(phillySamples);
    log.debug(`Config: ${JSON.stringify({osmConfig}, null, '\t')}`);

    const sequencedTask = composeWithChain([
      results => {
        return locationsToGeojsonFileResultTask(
          '/tmp',
          `rescapeOsmlocationsToGeojsonFileResultTask_${moment().format('YYYY-MM-DD-HH-mm-SS')}`,
          R.map(R.prop('location'), results.Ok)
        );
      },
      propSets => {
        return traverseReduce(
          // The accumulator
          /***
           * @param {Object} res {Ok:[Object], Error:[Object] Previous or initial results
           * @param {Object} results {Ok:[Object], Error:[Object]} Current results
           * @returns {Object} {Ok:[Object], Error[Object]} The merged results
           */
          (res, results) => {
            return R.mergeWith(R.concat, res, results);
          },
          of({Ok: [], Error: []}),
          R.map(
            location => {
              return locationToOsmAllBlocksQueryResultsTask(osmConfig, location);
            },
            propSets
          )
        );
      }])(R.slice(0, 1, propSets));

    const errors = [];
    sequencedTask.run().listen(
      defaultRunToResultConfig({
        onResolved: results => {
          // Use Dump results to json streetviewConfig to figure out output dir
          log.debug(`Finished all propsets. Dumping results with processQueryForStreetviewResults`);
          expect(R.length(results.geojson.features)).toBeGreaterThan(0);
        }
      }, errors, done)
    );

  }, 100000000);
});