import {mapObjToValues, reqStrPathThrowing, resultToTaskNeedingResult, traverseReduceDeepResults} from 'rescape-ramda';
import * as R from 'ramda';
import {of, waitAll} from 'folktale/concurrency/task';
import {_cleanGeojson, _intersectionsFromWaysAndNodes, fetchOsmRawTask, osmResultTask} from './overpass';
import * as Result from 'folktale/result';
import {constructInstersectionsQuery, getFeaturesOfBlock} from './overpassBlocks';

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
 *
 * @param bbox
 */
export const getBlocksOfBounds = ({locaitons}) => {
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
      locationWithOsm => _queryOverpassForBlocksResultTask(locationWithOsm),
      locationsWithOsm
    )
  );
};

const _queryOverpassForBlocksResultTask = ({way: wayQuery, node: nodeQuery, waysOfNodeQuery}) => {
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

    // If our predicate fails, give up with a Response.Error
    // Task [Object] -> Task Result.Ok (Object) | Result.Error (Object)
    ({way, node, waysOfNodes}) => of(
      R.ifElse(
        // If predicate passes
        ({way: wayFeatures, node: nodeFeatures}) => predicate({wayFeatures, nodeFeatures}),
        // All good, return the responses
        () => Result.Ok({
          node,
          way,
          waysOfNodes
        }),
        // Predicate fails, return a Result.Error with useful info.
        ({way: wayFeatures, node: nodeFeatures}) => Result.Error({
          error: `Found ${R.length(nodeFeatures)} nodes and ${R.length(wayFeatures)} ways`,
          way,
          node,
          waysOfNodes
        })
      )(R.map(reqStrPathThrowing('response.features'), {node, way}))
    ),

    // Once we get our way query and node query done,
    // we want to get all ways of each node that was returned. These ways tell us the street names
    // that OSM has for each intersection, which are our official street names if we didn't collect them manually
    ({way, node}) => R.map(
      // Just combine the results to get {nodeIdN: {query, response}, nodeIdM: {query, response}, ...}
      objs => ({way, node, waysOfNodes: R.mergeAll(objs)}),
      waitAll(
        R.addIndex(R.map)(
          (nodeId, i) => R.map(
            // Then map the task response to include the query for debugging/error resolution
            // Then map the task response to include the query for debugging/error resolution
            // TODO currently extracting the Result.Ok value here. Instead we should handle Result.Error
            response => ({[nodeId]: {query: waysOfNodeQuery(nodeId), response: response.value}}),
            // Perform the task
            osmResultTask({name: 'waysOfNodeQuery'},
              ({overpassUrl}) => fetchOsmRawTask(
                {
                  overpassUrl,
                  sleepBetweenCalls: i * 2000
                }, waysOfNodeQuery(nodeId)
              )
            )
          ),
          // Extract the id of each node
          R.compose(
            R.map(reqStrPathThrowing('id')),
            reqStrPathThrowing('response.features')
          )(node)
        )
      )
    ),

    // Perform the OSM queries in "parallel"
    // TODO Wait 2 seconds for the second call, Overpass is super picky. When we get our
    // own server we can remove the delay
    queries => R.map(
      // Just combine the results to get {way: {query, response}, node: {query, response}}
      objs => R.mergeAll(objs),
      waitAll(
        // When we have our own serve we can disable the delay
        R.addIndex(mapObjToValues)(
          (query, type, obj, i) => R.map(
            // Then map the task response to include the query for debugging/error resolution
            // TODO currently extracting the Result.Ok value here. Instead we should handle Result.Error
            // if the OSM can't be resolved
            response => ({[type]: {query, response: response.value}}),
            // Perform the task
            osmResultTask({name: 'featchOsmRawTask'},
              ({overpassUrl}) => fetchOsmRawTask(
                {
                  overpassUrl,
                  sleepBetweenCalls: i * 2000
                }, query
              )
            )
          ),
          queries
        )
      )
    )
  )({way: wayQuery, node: nodeQuery});
};

