import {
  reqStrPathThrowing,
  resultToTaskNeedingResult,
  traverseReduceDeepResults,
  pickDeepPaths
} from 'rescape-ramda';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import {
  highwayNodeFilters,
  highwayWayFilters,
  osmIdToAreaId
} from './overpass';
import {
  _cleanGeojson,
  _intersectionStreetNamesFromWaysAndNodes
} from './overpassFeatureHelpers';
import * as Result from 'folktale/result';
import {getFeaturesOfBlock} from './overpassBlockHelpers';
import {parallelWayNodeQueriesResultTask} from './overpassBlockHelpers';

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

/**
 * Queries for all blocks matching the Osm area id in the given location
 * @param {Object} locationWithOsm Location object with  bbox, osmId, placeId from
 * @private
 * @returns {Task<Result<[Object]>>} The block represented as locations (see getAllBlocksOfLocations for description)
 */
const _queryOverpassWithLocationForAllBlocksResultTask = (locationWithOsm) => {
  return R.composeK(
    result => of(result),
    ({way: wayQuery, node: nodeQuery}) => _queryOverpassForAllBlocksResultTask(
      {location: locationWithOsm, way: wayQuery, node: nodeQuery}
    ),
    // Build an OSM query for the location. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    locationWithOsm => of(
      R.fromPairs(R.map(
        type => [
          type,
          _constructHighwaysQuery(
            {type},
            // These are the only properties we might need from the location
            pickDeepPaths(['intersections', 'osmId', 'data.osmOverrides'], locationWithOsm)
          )
        ],
        ['way', 'node']
      ))
    )
  )(locationWithOsm);
};

/**
 * Queries for all blocks
 * @param location {Object} Only used for context for testing mocks
 * @param {String} wayQuery The Overpass way query
 * @param {String} nodeQuery The overpass node query
 * @returns {Task<Result<Object>>} The Geojson nodes and way features in a Result.Ok. If an error occurs,
 * Result.Error is returned. Object has a ways, nodes
 */
const _queryOverpassForAllBlocksResultTask = ({location, way: wayQuery, node: nodeQuery}) => {
  return R.composeK(
    // Finally get the features from the response
    resultToTaskNeedingResult(
      ({way, node, waysByNodeId: waysByNodeId}) => {
        const [wayFeatures, nodeFeatures] = R.map(reqStrPathThrowing('response.features'), [way, node]);
        const wayFeaturesByNodeId = R.map(reqStrPathThrowing('response.features'), waysByNodeId);
        return of(
          R.merge(
            {
              // Calculate the street names and put them in intersections
              // intersections is an object keyed by node id and valued by the unique list of streets.
              // The first street is always street matching the way's street and the remaining are alphabetical
              // Normally there are only two unique streets for each intersection.
              // If one or both streets change names or for a >4-way intersection, there can be more.
              // If we handle roundabouts correctly in the future these could also account for more
              intersections: _intersectionStreetNamesFromWaysAndNodes(wayFeatures, wayFeaturesByNodeId),
              // Clean the geojson of each way intersecting  each node
              // Then store the results in {waysByNodeId => {nodeN: ..., nodeM:, ...}}
              waysByNodeId: R.map(
                wayFeatures => R.map(
                  // Clean the features of each first
                  _cleanGeojson,
                  wayFeatures
                ),
                wayFeaturesByNodeId
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
    queries => parallelWayNodeQueriesResultTask(location, queries)
  )({way: wayQuery, node: nodeQuery});
};

/**
 * Construct an Overpass query to get all eligible highway ways or nodes for area of the given osmId or optionally
 * geojsonBOunds
 * @param {String} type 'way' or 'node' We have to do the queries separately because overpass combines the geojson
 * results in buggy ways
 * @param {String} [osmId] OSM id to be used to constrain the area of the query. This id corresponds
 * to a neighborhood or city. It can only be left undefined if geojsonBounds is defined
 * @param {Object} data Location data optionally containing OSM overrides
 * @param {Object} [data.osmOverrides] Optional overrides
 * @param {[Number]} [data.osmOverrides.nodes] Optional 2 node ids
 * @param {[Number]} [data.osmOverrides.ways] Optional 1 or more way ids
 * @param {[Object]} [geojsonBounds] Optional. Bounds to use instead of the area of the osmId
 * @returns {string} The complete Overpass query string
 */
const _constructHighwaysQuery = ({type}, {osmId, data}, geojsonBounds) => {

  if (R.not(R.or(osmId, geojsonBounds))) {
    throw Error("Improper configuration. osmId or geojsonBounds must be non-nil");
  }

  // The Overpass Area Id is based on the osm id plus this Overpass magic number
  // Don't calculate this if we didn't pass an osmId
  const areaId = R.when(R.identity, osmIdToAreaId)(osmId);

  // We generate different queries based on the parameters.
  // Rather than documenting the generated queries here it's better to run the tests and look at the log
  const query = `
    ${
    // Declare the way variables if needed
    _createQueryWaysDeclarations(areaId, geojsonBounds)
    }
    ${
    // Declare the node variables
    _createQueryNodesDeclarations()
    }
    ${
    _createQueryOutput(type)
    }`;
  return query;
};

/**
 * Creates OSM Overpass query syntax to declare ways for a given OSM area id or geojsonBounds.
 * @param {Number} areaId Represents an OSM neighborhood or city
 * @param {Object} [geojsonBounds] Geojson bounds via a polygon. Will override the area id if specified
 * @returns {String} Overpass query syntax string that declares the way variable
 * @private
 */
const _createQueryWaysDeclarations = (areaId, geojsonBounds) => {
  return R.cond([
    // TODO handle geojsonBounds
    // We don't have hard-coded way ids, so search for these values by querying
    [R.T, () => {
      const wayQuery = `way(area:${areaId})${highwayWayFilters}`;
      return `${wayQuery}->.ways;`;
    }]
  ])(geojsonBounds);
};

/**
 * Creates OSM Overpass query syntax to declare nodes based on .ways defined in _createQueryWaysDeclarations
 * @returns {String} Overpass query syntax string that declares the way variable
 * @private
 */
const _createQueryNodesDeclarations = () => {
  return `node(w.ways)${highwayNodeFilters}->.nodes;`;
};

/**
 * Creates syntax for the output of the query.
 * @param {String} type Either way or node. We have to query nodes and ways seperately to prevent geojson output errors
 * @returns {String} the syntax for the output
 * @private
 */
const _createQueryOutput = type => {
  // Either return nodes or ways. Can't do both because the API messes up the geojson
  const outputVariable = R.cond([
    [R.equals('way'), R.always('.matchingWays')],
    [R.equals('node'), R.always('.matchingNodes')],
    [R.T, () => {
      throw Error('type argument must specified and be "way" or "node"');
    }]
  ])(type);
  return `
    .ways -> .matchingWays;
    .nodes -> .matchingNodes;
    ${outputVariable} out geom;`;
};