/**
 * Created by Andy Likuski on 2019.08.13
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import {fetchOsmRawTask, osmResultTask} from './overpass';
import {mapObjToValues, reqStrPathThrowing} from 'rescape-ramda'
import {waitAll} from 'folktale/concurrency/task';

/**
 * Determines if an OSM query result is a valid block
 * @param wayFeatures
 * @param nodeFeatures
 */
export const predicate = ({wayFeatures, nodeFeatures}) => R.allPass([
  // Not null
  R.complement(R.isNil),
  // We'd normally limit nodes to 2, but there can be 4 if we have a divided road
  // There might be cases where a divided road merges into a nondivided road, so we'll allow 2-4
  ({nodeFeatures}) => R.compose(R.both(R.lte(2), R.gte(4)), R.length)(nodeFeatures),
  // >0 ways:w
  ({wayFeatures}) => R.compose(R.lt(0), R.length)(wayFeatures)
])({wayFeatures, nodeFeatures});

/**
 * Simple OSM query to return the ways of an intersection node.
 * @param {String} nodeId In the form 'node/id'
 * @returns {string}
 */
const waysOfNodeQuery = nodeId => {
  const id = R.compose(
    R.last,
    R.split('/')
  )(nodeId);
  return `
    node(id:${id})->.matchingNode;
    // Find ways within 10 meters of the node for ways with area=="yes" and ways containing the node otherwise
    (way(around.bn.matchingNode:10)[area = "yes"][highway]["highway" != "driveway"]["footway" != "crossing"]["footway" != "sidewalk"];
    way(bn.matchingNode)[area != "yes"][highway]["highway" != "driveway"]["footway" != "crossing"]["footway" != "sidewalk"];
    )->.matchingWays;
    .matchingWays out geom;
  `;
};

/**
 * Perform the OSM queries in parallel
 * @param {Object} queries Object keyed by query type 'way' and 'node' and valued by the OSM query string.
 * This can technically be more than two queries or have different names
 * @returns {Task<Result<Object>>} A Result.Ok The original query object with response props added containing the OSM response.
 * If one of the queries fail then a Result.Error object is returned with the errors instead
 * @sig parallelWayNodeQueriesResultTask:: String query, Object response <way: <query, node: <query> -> Task <way: <query, response>, node: <query, response>>>
 */
export const parallelWayNodeQueriesResultTask = queries => R.map(
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
        osmResultTask({name: 'fetchOsmRawTask'},
          ({overpassUrl}) => fetchOsmRawTask(
            {
              overpassUrl,
            }, query
          )
        )
      ),
      queries
    )
  )
);

/***
 * Given node results this finds all ways of each node so that we can resolve street names of the intersections
 * @param {Object} queries
 * @param {Object} queries.way Currently non used but returned
 * @param {Object} queries.node Response contains the nodes
 * @param {Object} queries.node.response Response containing the nodes
 * @returns {Task<Object>} Object keyed by way, node, and waysOfNodes. waysOfNodes is and object keyed
 * by nodeId and valued by a query and response
 * @sig waysOfNodeTask:: Task <way: <query, response>, node: <query, response>>> ->
 * Task <way: <query, response>, node: <query, response>, waysOfNodes: <node: <query, response>>>> ->
 */
export const waysOfNodesTask = ({way, node}) => R.map(
  // Just combine the results to get {nodeIdN: {query, response}, nodeIdM: {query, response}, ...}
  objs => ({way, node, waysOfNodes: R.mergeAll(objs)}),
  waitAll(
    R.addIndex(R.map)(
      (nodeId, i) => R.map(
        // Then map the task response to include the query for debugging/error resolution
        // TODO currently extracting the Result.Ok value here. Instead we should handle Result.Error
        response => ({[nodeId]: {query: waysOfNodeQuery(nodeId), response: response.value}}),
        // Perform the task
        osmResultTask({name: 'waysOfNodeQuery'},
          ({overpassUrl}) => fetchOsmRawTask(
            {
              overpassUrl,
              sleepBetweenCalls: i * 0,
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
)
