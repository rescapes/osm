#! /usr/bin/node

/**
 * Created by Andy Likuski on 2018.04.27
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import moment from 'moment';
import * as R from 'ramda';
import {composeWithChain, defaultRunConfig, defaultRunToResultConfig, traverseReduce} from '@rescapes/ramda';
import meow from 'meow';
import {loggers} from '@rescapes/log';
import {locationsToGeojsonFileResultTask} from '../overpassBlockHelpers.js';
import {locationToOsmAllBlocksQueryResultsTask} from '../overpassAllBlocks.js';
import T from 'folktale/concurrency/task/index.js';
const {of} = T;
import {processParamsFromJsonOrJsToList} from './scriptHelpers.js';

Error.stackTraceLimit = Infinity;
const log = loggers.get('rescapeDefault');

const cli = meow(`
    Usage
      $ ./node_modules/.bin/babel-node ./src/scripts/queryForGeojson.js <input>
 
    Options
    --help, -h Show help and exit
    --output-dir, -o The output directory
    --dev Query the local server instead of the production server. The local server is http://localhost/sop_api/graphql
    --log-debug Show all the SoP API, OpenStreetMap, and Google queries
    --external-source Optional geojson file of line strings to provide instead of querying OpenStreetMap. Used for
    bringing in data from sources such as ESRI. When this is specified OSM is not consulted.
 
    Example
        # Default 
      $  /usr/local/bin/node ./node_modules/.bin/babel-node  ./rescape-osm/src/scripts/queryForGeojson.js ./params.json 
`, {
  flags: {
    dev: {
      type: 'boolean'
    },
    logDebug: {
      type: 'boolean'
    },
    outputDir: {
      type: 'string',
      alias: 'o'
    },
  }
});

const flags = cli.flags;
const input = cli.input;

// Set the logger's transports to debug
const log = flags.logDebug ? loggers.get('rescapeForceDebug') : loggers.get('rescapeForceInfo');

log.debug(`Flags: ${JSON.stringify(flags, null, '\t')}`);
log.debug(`Input: ${JSON.stringify(input, null, '\t')}`);

// Query params are called with multiple values
const params = input[0];
if (!params) {
  throw new Error("No params supplied. Specify to a json file such as ./params.json");
}

const osmConfig = {};

process.on('unhandledRejection', reason => {
  log.error('Unhandled Promise', reason);
});

// Process .json or the default value of a .js file export
const propSets = processParamsFromJsonOrJsToList(require(params));
log.debug(`Config: ${JSON.stringify({osmConfig}, null, '\t')}`);

const sequencedTask = composeWithChain([
  results => {
    return locationsToGeojsonFileResultTask(
      flags.o || '/tmp',
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
  }])(propSets);

const errors = [];
sequencedTask.run().listen(
  defaultRunToResultConfig({
    onResolved: results => {
      // Use Dump results to json streetviewConfig to figure out output dir
      console.log(JSON.stringify(results.geojsonWays))
    }
  }, errors, () => {})
);
