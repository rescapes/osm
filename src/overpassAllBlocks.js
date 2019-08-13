import {mapObjToValues, reqStrPathThrowing, resultToTaskNeedingResult, traverseReduceDeepResults} from 'rescape-ramda';
import * as R from 'ramda';
import {of, waitAll} from 'folktale/concurrency/task';
import {_cleanGeojson, _intersectionsFromWaysAndNodes, fetchOsmRawTask, osmResultTask} from './overpass';
import * as Result from 'folktale/result';
import {constructInstersectionsQuery, getFeaturesOfBlock} from './overpassSingleBlock';
import {parallelWayNodeQueriesResultTask, predicate} from './overpassBlockHelpers';

/**
 * Created by Andy Likuski on 2019.07.26
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */


/**
 * Given locations that each represent a neighborhood or city (TODO and in the future any geojson-based bounds),
 * resolves all OpenStreetMap blocks in those neighborhoods. We define a block as one or more full or partial OSM ways
 * between two OSM nodes, where the nodes are defined as intersections because
 * 1) 3 or more ways touch them
 * 2) 2 ways touch them and one of the ways has nodes (waynodes) on either side of the node (the way doesn't just touch
 * the node at one end)
 * @param [{Object}] locations Locations that must each contain a country, city, and optionally state, neighborhood
 * @returns {Task<Object<Ok:[Location], Error:[Object]>>} A task with an object containing two arrays.
 * The Ok array is a list of all the blocks represented as locations. A location block contains a country, [state],
 * city, [neighborhood], intersections (usually two arrays with 2 or more streets names each representing an intersection,
 * one array for a dead end),
 * geojson containing one or more intersection nodes, and one or more ways where the nodes of the ways are trimmed
 * to the nodes between the intersections
 */
export const getAllBlocksOfLocations = ({locations}) => {
  return traverseReduceDeepResults(2,
    // The accumulator
    (res, okObj) => R.concat(
      res,
      [okObj]
    ),
    // The accumulator of errors
    (res, errorObj) => R.concat(
      res,
      // extract the errors array, each of which has a list of errors and the location that erred
      // If there isn't an errors array just add the entire object
      R.ifElse(
        R.has('errors'),
        // TODO errorObj.errors should be an array but sometimes isn't, so wrap
        errorObj => R.compose(R.unless(Array.isArray, Array.of), reqStrPathThrowing('errors'))(errorObj),
        Array.of
      )(errorObj)
    ),
    // Our initial value is a Task with an object can contain Result.Ok and Result.Error results
    of({Ok: [], Error: []}),
    // [Object] -> [Task (Result.Ok | Result.Error)]
    R.map(
      locationWithOsm => _queryOverpassWithLocationForAllBlocksResultTask(locationWithOsm),
      locations
    )
  );
};

/***
 * Queries for all blocks matching the Osm area id in the given location
 * @param {Object} locationWithOsm Location object with  bbox, osmId, placeId from
 * @private
 * @returns {Task<Result<[Object]>>} The block represented as locations (see getAllBlocksOfLocations for description)
 */
const _queryOverpassWithLocationForAllBlocksResultTask = (locationWithOsm) => {
  return R.composeK(
    ({way: wayQuery, node: nodeQuery}) => _queryOverpassForAllBlocksResultTask(
      {way: wayQuery, node: nodeQuery}
    ),
    // Build an OSM query for the location. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    locationWithOsm => of(
      R.fromPairs(R.map(
        type => [type, _constructHighwaysQuery({type}, locationWithOsm)],
        ['way', 'node']
      ))
    )
  )(locationWithOsm);
};

const _queryOverpassForAllBlocksResultTask = ({way: wayQuery, node: nodeQuery}) => {
  return R.composeK(
    // Finally get the features from the response
    resultToTaskNeedingResult(
      ({way, node, waysOfNodes}) => {
        const [wayFeatures, nodeFeatures] = R.map(reqStrPathThrowing('response.features'), [way, node]);
        const nodeIdToWaysOfNodeFeatures = R.map(reqStrPathThrowing('response.features'), waysOfNodes);
        return of(
          R.merge(
            {
              // Calculate the street names and put them in intersections
              // intersections is an object keyed by node id and valued by the unique list of streets.
              // The first street is always street matching the way's street and the remaining are alphabetical
              // Normally there are only two unique streets for each intersection.
              // If one or both streets change names or for a >4-way intersection, there can be more.
              // If we handle roundabouts correctly in the future these could also account for more
              intersections: _intersectionsFromWaysAndNodes(wayFeatures, nodeIdToWaysOfNodeFeatures),
              // Clean the geojson of each way intersecting  each node
              // Then store the results in {waysOfNodes => {nodeN: ..., nodeM:, ...}}
              waysOfNodes: R.map(
                WaysOfNodeFeatures => R.map(
                  // Clean the features of each first
                  _cleanGeojson,
                  WaysOfNodeFeatures
                ),
                nodeIdToWaysOfNodeFeatures
              )
            },
            // Clean the geojson of each way and node feature to remove weird characters that mess up API storage
            // Then store the features in {ways: ..., nodes: ...}
            getFeaturesOfBlock(
              // Clean the features of each first
              ...R.map(
                features => R.map(_cleanGeojson, features),
                [wayFeatures, nodeFeatures]
              )
            )
          )
        );
      }
    ),

    // Query for the ways and nodes in parallel
    queries => parallelWayNodeQueriesResultTask(queries)
  )({way: wayQuery, node: nodeQuery});
};

/**
 * Create and OSM query to get all eligible highway ways or nodes for area of the given osmId
 * @param type
 * @param locationWithOsm
 * @private
 */
const _constructHighwaysQuery = ({type}, locationWithOsm) => {

};
