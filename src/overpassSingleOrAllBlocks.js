/**
 * Created by Andy Likuski on 2020.01.03
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  addressString,
  isResolvableAllBlocksLocation,
  isResolvableSingleBlockLocation,
  locationAndOsmBlocksToLocationWithGeojson, locationHasGeojsonFeatures
} from './locationHelpers.js';
import {queryLocationForOsmSingleBlockResultTask} from './overpassSingleBlock.js';
import {locationToOsmAllBlocksQueryResultsTask} from './overpassAllBlocks.js';
import 'regenerator-runtime';
import {loggers} from '@rescapes/log';
import * as R from 'ramda';
import * as Result from 'folktale/result/index.js';

const log = loggers.get('rescapeDefault');
import {toArrayIfNot, strPathOr} from '@rescapes/ramda';


/**
 * Queries locationToOsmAllBlocksQueryResultsTask or queryLocationForOsmSingleBlockResultTask
 * @param {Object} osmConfig
 * @param {Object} osmConfig.forceOsmQuery
 * @param {Object} location A location that must be resolvable to a block or city/neighborhood area
 * @returns {Task<{Ok: Result.Ok, Error: Result.Error}>} Successful values in the Ok: [] array and errors in the Error: [] array.
 * Single block query will only have one result. The result value is {location, results} where location
 * is the location block object (either from the single block query or each block of multiple results) and
 * results are the OSM results {way: way features, node: node features, intersections: {keyed by node id valued by street names of the intersection}}
 */
export const queryLocationForOsmBlockOrAllResultsTask = (osmConfig, location) => {
  return R.cond([
    [
      location => isResolvableSingleBlockLocation(location),
      location => {
        log.debug(`queryLocationForOsmBlockOrAllResultsTask: Found single block location: ${addressString(location)}`);
        return _queryLocationForOsmSingleBlockAllResultsTask(osmConfig, location);
      }
    ],
    [
      location => isResolvableAllBlocksLocation(location),
      location => {
        log.debug(`queryLocationForOsmBlockOrAllResultsTask: Found resolvable all blocks location: ${addressString(location)}`);
        return locationToOsmAllBlocksQueryResultsTask(osmConfig, location);
      }
    ],
    [
      R.T,
      () => {
        throw new Error(`Location ${JSON.stringify(location)} is neither resolvable as a block nor city/neighborhood area`);
      }
    ]
  ])(location);
};

/**
 * Queries for a single locations and returns the result as results matching what locationToOsmAllBlocksQueryResultsTask
 * @param osmConfig
 * @param location
 * @return {f1}
 * @private
 */
const _queryLocationForOsmSingleBlockAllResultsTask = (osmConfig, location) => {
  return R.map(
    result => {
      // Match the format of locationToOsmAllBlocksQueryResultsTask
      // TODO Generalize this in rescape-ramda with something like resultToResults
      return result.matchWith({
        Ok: ({value}) => ({
          Ok: R.map(
            value => {
              // Create the geojson fro the location
              const {block: {ways, nodes, nodesToIntersections}} = value;
              return {
                block: {nodesToIntersections},
                // Assign the geojson to the location if it hasn't been assigned yet or is forced
                location: R.when(
                  R.either(
                    () => strPathOr(false, 'forceOsmQuery', osmConfig),
                    location => R.complement(locationHasGeojsonFeatures)(location)
                  ),
                  location => locationAndOsmBlocksToLocationWithGeojson(location, {ways, nodes})
                )(location)
              };
            },
            toArrayIfNot(value))
        }),
        Error: ({value}) => ({
          Error: R.map(
            value => ({
              result: value,
              location
            }),
            toArrayIfNot(value))
        })
      });
    },
    queryLocationForOsmSingleBlockResultTask(osmConfig, location)
  );
};
