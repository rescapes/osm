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

import * as R from 'ramda';
import {mergeAllWithKey, removeDuplicateObjectsByProp, reqStrPathThrowing} from '@rescapes/ramda';
import {loggers} from '@rescapes/log';
import {buildFilterQuery, queryTask} from './overpassHelpers.js';
import {concatFeatures} from '@rescapes/helpers';
import {extractSquareGridBboxesFromBounds} from '@rescapes/helpers';

/**
 * fetches transit data from OpenStreetMap using the Overpass API.
 * @param {Object} options settings to pass to query-overpass, plus the following options:
 * @param {[String]} options.settings OSM query settings such as '[out:csv']`. Defaults to [`[out:json]`]. Don't
 * put a bounding box here. Instead put it in conditions.bounds.
 * @param {Object} options.cellSize If specified delegates to fetchCelled
 * @param {String} options.overpassUrl server to query
 * @param {Object} options.context for testing only matches a test result in __mocks__/query-overpass.js
 * @param {Array} conditions List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'.
 * @param {Array} conditions.filters List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'.
 * The conditions apply to all types given
 * @param {[Number]} conditions.bounds Required [lat_min, lon_min, lat_max, lon_max] to limit all conditions
 * @param {[String]} types List of OSM type sto query by e.g. ['way', 'node', relation']
 * @returns {Object} Task to fetchTransitOsm the data
 */
export const fetchTransitOsmTask = R.curry((options, conditions, types) => {
  // Default settings
  const settings = options.settings || [`[out:json]`];
  const defaultOptions = R.merge(options, {settings});

  if (options.cellSize) {
    return fetchOsmTransitCelled(defaultOptions, conditions, types);
  }
  // Build the query
  const query = buildFilterQuery(defaultOptions.settings, conditions, types);
  // Create a Task to run the query. Settings are already added to the query, so omit here
  return queryTask(R.omit(['settings'], options), query);
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
 * @param {String} options.overpassUrl server to query
 * @param {Number} options.sleepBetweenCalls Pause this many milliseconds between calls to avoid the request rate limit
 * @param {Object} options.context Used only for testing
 * @param {Array} conditions List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'.
 * @param {Array} conditions.filters List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'.
 * The conditions apply to all types given
 * @param {[Number]} conditions.bounds Required [lat_min, lon_min, lat_max, lon_max] to limit all conditions
 * @param {[String]} types List of OSM type sto query by e.g. ['way', 'node', relation']
 * @returns {Task} Chained Tasks to fetchTransitOsm the data
 */
const fetchOsmTransitCelled = ({cellSize, ...options}, conditions, types) => {
  const squareBoundaries = extractSquareGridBboxesFromBounds(
    {cellSize},
    reqStrPathThrowing('bounds', conditions)
  );

  // Create a fetchTransitOsm Task for reach square boundary
  // fetchTasks :: Array (Task Object)
  const fetchTasks = R.map(
    boundary => fetchTransitOsmTask(
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


  // This combines the results of all the fetchTransitOsm calls and removes duplicate results
  // sequenced :: Task (Array Object)
  // const sequenced = R.sequence(Task.of, fetchTasks);
  return chainedTasks.map(results => {
      return R.compose(
        // Lastly remove features with the same id
        R.over(
          R.lens(R.prop('features'), R.assoc('features')),
          removeDuplicateObjectsByProp('id')
        ),
        // First combine the results into one obj with concatinated features
        mergeAllWithKey(concatFeatures)
      )(results)
    }
  );
};
