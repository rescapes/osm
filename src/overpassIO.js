/**
 * Created by Andy Likuski on 2017.04.03
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import queryOverpass from 'query-overpass';
import {task, of} from 'folktale/concurrency/task';
import * as R from 'ramda';
import {mergeAllWithKey, removeDuplicateObjectsByProp, reqPathThrowing, reqStrPathThrowing} from 'rescape-ramda';
import os from 'os';
import squareGrid from '@turf/square-grid';
import bbox from '@turf/bbox';
import {concatFeatures} from 'rescape-helpers';
import {fullStreetNamesOfLocationTask} from './googleLocation';
import {cityNominatimTask} from './searchIO';

/**
 * Translates to OSM condition that must be true
 * @param {string} prop The feature property that must be true
 * @return {string} '["prop"]'
 */
export const osmAlways = prop => `[${prop}]`;

/**
 * Translates to OSM not equal condition
 * @param {string} prop The feature property that must not be euqal to the value
 * @param {object} value Value that toStrings appropriately
 * @return {string} '["prop" != "value"]'
 */
export const osmNotEqual = (prop, value) => osmCondition('!=', prop, value);

/**
 * Translates to OSM equals condition
 * @param {string} prop The feature property that must not be euqal to the value
 * @param {object} value Value that toStrings appropriately
 * @return {string} '["prop" = "value"]'
 */
export const osmEquals = (prop, value) => osmCondition('=', prop, value);

/**
 * Translates to OSM (in)equality condition
 * @param {string} operator Anything that osm supports '=', '!=', '>', '<', '>=', '<=', etc
 * @param {string} prop The feature property that must not be euqal to the value
 * @param {object} value Value that toStrings appropriately
 * @return {string} '["prop" operator "value"]'
 */
export const osmCondition = (operator, prop, value) => `["${prop}" ${operator} "${value}"]`;


/**
 * Constructs conditions for a certain OSM type, 'node', 'way', or 'relation'
 * @param {Array} conditions List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'
 * @param {String} type OSM type
 * @return {*} OSM Query statement for querying a certain type by conditions
 */
const filtersForType = R.curry((conditions, type) => `${type}${R.join('', conditions)};`);

/**
 * Given an array of bounds lat, lon, lat, lon, return themn as a string for osm
 * @param {[Number]} bounds
 * @return {*}
 */
const boundsAsString = bounds => {
  return R.pipe(
    list => R.concat(
      R.reverse(R.slice(0, 2)(list)),
      R.reverse(R.slice(2, 4)(list))),
    R.join(','),
    str => (`[bbox: ${str}`)
  )(bounds);
};


/**
 * Builds simple queries that just consist of filters on the given types
 */
const buildFilterQuery = R.curry((settings, conditions, types) => {

  // For now we always apply the bounds as a bbox in settings
  const appliedSettings = `${R.join('', settings)}${boundsAsString(reqStrPathThrowing('bounds', settings))};`;
  const filters = reqStrPathThrowing('filters', conditions);

  return `
  ${appliedSettings}
    (
  ${R.compose(
    R.join(os.EOL),
    R.map(type => filtersForType(filters, type))
  )(types)
    }
    );
    // print results
    out meta;/*fixed by auto repair*/
    >;
    out meta qt;/*fixed by auto repair*/
    `;
});

/**
 * From the given query create a Task to run the query
 * @param {Object} options
 * @param {Number} options.sleepBetweenCalls: Optional value to slow down calls. This only matters when
 * multiple queries are running
 * @param {String} query The complete OSM query string
 * @return {Task} A task that calls query-overpass with the query
 */
const taskQuery = (options, query) => {
  // Wrap overpass helper's execution and callback in a Task
  return task(resolver => {
    // Possibly delay each call to query_overpass to avoid request rate threshold
    // Since we are executing calls sequentially, this will pause sleepBetweenCalls before each call
    setTimeout(() =>
        queryOverpass(query, (error, data) => {
          if (!error) {
            resolver.resolve(data);
          } else {
            resolver.reject(error);
          }
        }, options),
      options.sleepBetweenCalls || 0);
  });
};

/**
 * fetches transit data from OpenStreetMap using the Overpass API.
 * @param {Object} options settings to pass to query-overpass, plus the following options:
 * @param {[String]} options.settings OSM query settings such as '[out:csv']`. Defaults to [`[out:json]`]. Don't
 * put a bounding box here. Instead put it in conditions.bounds.
 * @param {Object} options.testBounds Used only for testing
 * @param {Object} options.cellSize If specified delegates to fetchCelled
 * @param {Array} conditions List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'.
 * @param {Array} conditions.filters List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'.
 * The conditions apply to all types given
 * @param {[Number]} conditions.bounds Required [lat_min, lon_min, lat_max, lon_max] to limit all conditions
 * @param {[String]} types List of OSM type sto query by e.g. ['way', 'node', relation']
 * @returns {Object} Task to fetchOsm the data
 */
export const fetchOsm = R.curry((options, conditions, types) => {
  // Default settings
  const settings = options.settings || [`[out:json]`];
  const defaultOptions = R.merge(options, {settings});

  if (options.cellSize) {
    return fetchOsmCelled(defaultOptions, conditions, types);
  }
  // Build the query
  const query = buildFilterQuery(defaultOptions.settings, conditions, types);
  // Create a Task to run the query. Settings are already added to the query, so omit here
  return taskQuery(R.omit(['settings'], options), query);
});

/**
 * Run a provided query in osm. This assumes a complete query that doesn't need to be split into smaller calls.
 * Settings should be separate from the query in option.settings
 * @param {Object} options settings to pass to query-overpass
 * @param {[String]} options.settings OSM query settings such as '[out:csv']`. Defaults to [`[out:json]`]. Don't
 * put a bounding box here. Instead put it in conditions.bounds.
 * @param {String} query A complete OSM query, minus the settings
 * @returns {Task} A Task to run the query
 */
export const fetchOsmRawTask = R.curry((options, query) => {
  // Default settings
  const settings = options.settings || [`[out:json]`];
  const appliedSettings = `${R.join('', settings)}${
    R.ifElse(
      R.prop('bounds'),
      // If bounds add them
      options => boundsAsString(reqStrPathThrowing('bounds', options)),
      // Otherwise assume we bound by area or something else non-global
      R.always('')
    )(options)
    };`;
  // Create a Task to run the query. Settings are already added to the query, so omit here
  return taskQuery(options, `${appliedSettings}${query}`);
});

/**
 * fetches transit data in squares sequentially from OpenStreetMap using the Overpass API.
 * (concurrent calls were triggering API throttle limits)
 * @param {Number} cellSize Splits query-overpass into separate requests, by splitting
 * the bounding box by the number of kilometers specified here. Example, if 200 is specified,
 * 200 by 200km bounding boxes will be created and sent to query-overpass. Any remainder will
 * be queried separately. The results from all queries are merged by feature id so that no
 * duplicates are returned.
 * @param {[Number]} bounds [lat_min, lon_min, lat_max, lon_max]
 * @param {Number} options.sleepBetweenCalls Pause this many milliseconds between calls to avoid the request rate limit
 * @param {Object} options.testBounds Used only for testing
 * @param {Array} conditions List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'.
 * @param {Array} conditions.filters List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'.
 * The conditions apply to all types given
 * @param {[Number]} conditions.bounds Required [lat_min, lon_min, lat_max, lon_max] to limit all conditions
 * @param {[String]} types List of OSM type sto query by e.g. ['way', 'node', relation']
 * @returns {Task} Chained Tasks to fetchOsm the data
 */
const fetchOsmCelled = ({cellSize, ...options}, conditions, types) => {
  const squareGridOptions = {units: 'kilometers'};
  // Use turf's squareGrid function to break up the bbox by cellSize squares
  const squareBoundaries = R.map(
    polygon => bbox(polygon),
    squareGrid(reqStrPathThrowing('bounds', conditions), cellSize, squareGridOptions).features);

  // Create a fetchOsm Task for reach square boundary
  // fetchTasks :: Array (Task Object)
  const fetchTasks = R.map(
    boundary => fetchOsm(
      options,
      R.merge(conditions, {boundary}),
      types
    ),
    squareBoundaries);

  // chainedTasks :: Array (Task Object) -> Task.chain(Task).chain(Task)...
  // We want each request to overpass to run after the previous is finished
  // so as to not exceed the permitted request rate. Chain the tasks and reduce
  // them using map to combine all previous Task results.
  const chainedTasks = R.reduce(
    (prevChainedTasks, fetchTask) => prevChainedTasks.chain(results =>
      fetchTask.map(result =>
        R.concat(results.length ? results : [results], [result])
      )
    ),
    R.head(fetchTasks),
    R.tail(fetchTasks));


  // This combines the results of all the fetchOsm calls and removes duplicate results
  // sequenced :: Task (Array Object)
  // const sequenced = R.sequence(Task.of, fetchTasks);
  return chainedTasks.map(results =>
    R.compose(
      // Lastly remove features with the same id
      R.over(
        R.lens(R.prop('features'), R.assoc('features')),
        removeDuplicateObjectsByProp('id')
      ),
      // First combine the results into one obj with concatinated features
      mergeAllWithKey(concatFeatures)
    )(results)
  );
};

/**
 * Constructs an OSM query for the given location. Queries are limited to the city of the location
 * and return the ways and nodes related two the intersections. These are more than are actually
 * needed because some refer to ways that are outside the block between the intersectiions but connected to them.
 * Thus they need to be cleaned up after. The OSM query language is too weak to do it here
 * @param {String} country Required country for area resolution
 * @param {String} state Optional depending on the country
 * @param {String} city Required string for area resolution
 * @param {[[String]]} intersections Required two pairs of intersection names that are full street names, i.e.
 * Avenue not Ave
 * @return {string}
 */
const constructLocationQuery = ({country, state, city, intersections}) => {

  // Fix all street endings. OSM needs full names: Avenue not Ave, Lane not Ln
  const streetCount = R.reduce(
    (accum, street) => R.over(
      R.lensProp(street),
      value => (value || 0) + 1,
      accum
    ),
    {},
    R.flatten(intersections)
  );
  if (!R.find(R.equals(2), R.values(streetCount))) {
    throw `No common block in intersections: ${JSON.stringify(intersections)}`;
  }
  // Sort each intersection, putting the common block first
  const modifiedIntersections = R.map(
    intersection => R.reverse(R.sortBy(street => R.prop(street, streetCount), intersection)),
    intersections
  );
  // List the 3 blocks: common block and then other two blocks
  const orderedBlocks = [R.head(R.head(modifiedIntersections)), ...R.map(R.last, modifiedIntersections)];

  return `
    area[boundary='administrative']['is_in:country'='${country}']['is_in:state'='${state}'][name='${city}']->.area;
    ${
    R.join('\n',
      R.addIndex(R.map)(
        (block, i) => `way(area.area)[highway][name="${block}"][footway!="crossing"]->.w${i + 1};`,
        orderedBlocks
      )
    )
    }
// Get the two intersection nodes 
// node contained in w1 and w2
(node(w.w1)(w.w2);
// node contained in w1 and w3
 node(w.w1)(w.w3);
)->.allnodes;
// Get all main ways containing one or both nodes
way.w1[highway](bn.allnodes)->.ways; 
(.ways; .allnodes;)->.outputSet;
.outputSet out geom;
`;
};

/***
 * Sorts the features by connecting them at their start/ends
 * @param features
 */
const sortFeatures = features => {
  // Build a lookup of start and end points
  reqPathThrowing
};

export const queryLocation = location => {
  // This long chain of Task reads bottom to top. Only the functions marked Task are actually async calls.
  // Everything else is wrapped in a Task to match the expected type
  return R.composeK(
    response => of(sortFeatures(response.features)),
    // Perform the query
    query => fetchOsmRawTask({}, query),
    // Now build an OSM query for the location
    location => of(constructLocationQuery(location)),
    // Use OSM Nominatim to get the bbox of the city. We're not currently using bbox but this at least
    // verifies that we are searching for a city that OSM knows about as an Area. We use Area to limit
    // our OSM query to the given city to make the results accurate and fast
    location => cityNominatimTask(R.pick(['country', 'state', 'city'], location)).map(
      // bounding box comes as two lats, then two lon, so fix
      result => R.merge(location, {
        // We're not using the bbox, but note it anyway
        bbox: R.map(str => parseFloat(str), R.props([0, 2, 1, 3], result.boundingbox)),
      })
    ),
    // OSM needs full street names (Avenue not Ave), so use Google to resolve them
    location => fullStreetNamesOfLocationTask(location).map(
      // Replace the intersections with the fully qualified names
      intersections => R.merge(location, {intersections})
    )
  )(location);
};
