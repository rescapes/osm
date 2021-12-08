/**
 * Created by Andy Likuski on 2020.01.08
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {defaultRunToResultConfig, defaultRunConfig, composeWithChain} from '@rescapes/ramda';
import * as R from 'ramda';
import {
  _addIntersectionsToBlocksTask,
  _partialBlocksToFeaturesResultsTask, _queryOverpassForAllBlocksResultsTask,
  _traversePartialBlocksToBuildBlocksResultTask
} from './overpassAllBlocksHelpers.js';
import {blockData, partialBlocks, location, locationWithNominatimData} from './samplePartialBlocks.sample.js';
import {processJurisdictionOrGeojsonResponsesResultTask} from './overpassAllBlocks.js';
import {
  _addIntersectionsToBlocksTaskOsmConfig,
  _addIntersectionsToBlocksTaskNodeIdsToWays,
  _addIntersectionsToBlocksTaskBlocks
} from "./overpassAllBlocksHelpers.sample.js";
import T from 'folktale/concurrency/task';
import {jest} from '@jest/globals';

describe("overpassAllBlockHelpers", () => {

  test('processJurisdictionOrGeojsonResponsesResultTask', done => {
    const errors = []
    processJurisdictionOrGeojsonResponsesResultTask({}, location, [locationWithNominatimData]).run().listen(defaultRunToResultConfig({
      onResolved: blocks => {
        expect(R.length(blocks)).toBeGreaterThan(30);
      }
    }, errors, done))
  }, 200000)

  test('_queryOverpassForAllBlocksResultsTask', done => {
    const errors = [];
    _queryOverpassForAllBlocksResultsTask({},
      {
        location: locationWithNominatimData,
        way: [
          "\n    way(area:3608398102)[\"area\" != \"yes\"][highway][\"building\" != \"yes\"][\"highway\" != \"elevator\"][\"highway\" != \"driveway\"][\"highway\" != \"cycleway\"][\"highway\" != \"steps\"][\"highway\" != \"proposed\"][\"footway\" != \"crossing\"][\"footway\" != \"sidewalk\"][\"service\" != \"parking_aisle\"][\"service\" != \"driveway\"][\"service\" != \"drive-through\"](if: t[\"highway\"] != \"service\" || t[\"access\"] != \"private\")(if: t[\"highway\"] != \"footway\" || t[\"indoor\"] != \"yes\")->.ways;\n    \n    .ways out geom;"
        ],
        node: [
          "\n    way(area:3608398102)[\"area\" != \"yes\"][highway][\"building\" != \"yes\"][\"highway\" != \"elevator\"][\"highway\" != \"driveway\"][\"highway\" != \"cycleway\"][\"highway\" != \"steps\"][\"highway\" != \"proposed\"][\"footway\" != \"crossing\"][\"footway\" != \"sidewalk\"][\"service\" != \"parking_aisle\"][\"service\" != \"driveway\"][\"service\" != \"drive-through\"](if: t[\"highway\"] != \"service\" || t[\"access\"] != \"private\")(if: t[\"highway\"] != \"footway\" || t[\"indoor\"] != \"yes\")->.ways;\n    node(w.ways)->.nodes;\n    foreach .ways -> .currentway(\n      (.ways; - .currentway;)->.allotherways;\n  node(w.currentway)->.nodesOfCurrentWay;\n  node(w.allotherways)->.nodesOfAllOtherWays;\n  node.nodesOfCurrentWay.nodesOfAllOtherWays -> .n;\n  (.n ; .result;) -> .result;\n  );\n.result out geom;"
        ]
      }
    ).run().listen(defaultRunConfig({
        onResolved: ({Ok, Error}) => {
          expect(R.length(Ok)).toEqual(41);
        }
      }, errors, done)
    );
  }, 200000);

  test('_partialBlocksToFeaturesResultsTask', done => {
    const errors = [];
    _partialBlocksToFeaturesResultsTask(
      {},
      locationWithNominatimData,
      R.merge(blockData, {partialBlocks})
    ).run().listen(defaultRunConfig({
        onResolved: ({Ok, Error}) => {
          expect(R.length(Ok)).toEqual(41);
        }
      }, errors, done)
    );
  }, 200000);

  test('_traversePartialBlocksToBuildBlocksResultTask', done => {
    const errors = [];

    _traversePartialBlocksToBuildBlocksResultTask(
      {}, blockData, partialBlocks
    ).run().listen(defaultRunToResultConfig({
        onResolved: ({blocks, errorBlocks}) => {
          expect(R.length(blocks)).toEqual(41);
        }
      }, errors, done)
    );
  }, 200000);

  test('_addIntersectionsToBlocksTask', async () => {
    await expect(_addIntersectionsToBlocksTask({
        osmConfig: _addIntersectionsToBlocksTaskOsmConfig,
        nodeIdToWays: _addIntersectionsToBlocksTaskNodeIdsToWays
      },
      _addIntersectionsToBlocksTaskBlocks).run().promise().then(x => {
      return R.length(x)
    })).resolves.toBe(1959)
  })
});
