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
import {task, of, waitAll} from 'folktale/concurrency/task';
import * as R from 'ramda';
import * as Result from 'folktale/result';
import {
  compact,
  findOneThrowing,
  mergeAllWithKey, removeDuplicateObjectsByProp,
  reqStrPathThrowing, traverseReduceWhile
} from 'rescape-ramda';
import os from 'os';
import squareGrid from '@turf/square-grid';
import bbox from '@turf/bbox';
import {concatFeatures} from 'rescape-helpers';
import {fullStreetNamesOfLocationTask} from './googleLocation';
import {nominatimTask} from './searchIO';


const servers = [
  //'https://lz4.overpass-api.de/api/interpreter',
  //'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

function* gen() {
  let serverIndex = -1;
  while (true) {
    serverIndex = R.modulo(serverIndex + 1, R.length(servers));
    yield servers[serverIndex];
  }
}

const genServer = gen();
const roundRobinOsmServers = () => {
  return genServer.next().value;
};

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
    str => (`[bbox: ${str}]`)
  )(bounds);
};


/**
 * Builds simple queries that just consist of filters on the given types
 */
const buildFilterQuery = R.curry((settings, conditions, types) => {

  // For now we always apply the bounds as a bbox in settings
  const appliedSettings = `${R.join('', settings)}${boundsAsString(reqStrPathThrowing('bounds', conditions))};`;
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
    setTimeout(() => {
        console.debug(`Requesting OSM query: ${query}`);
        queryOverpass(query, (error, data) => {
          if (!error) {
            resolver.resolve(data);
          } else {
            resolver.reject(error);
          }
        }, options);
      },
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
 * @param {String} options.overpassUrl server to query
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
 * @param {String} options.overpassUrl server to query
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
 * @param {String} options.overpassUrl server to query
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
 * Query Overpass when we know the node and/or way ids ahead of time. This is done when the regular resolution
 * using intersections would return the wrong data because of duplicate street names
 * @param type
 * @param country
 * @param state
 * @param city
 * @param intersections
 * @param osmId
 * @param {Object} data Location data optionally containing OSM overrides
 * @param {Object} [data.osmOverrides] Optional overrides
 * @param {[Number]} [data.osmOverrides.nodes] Optional 2 node ids
 * @param {[Number]} [data.osmOverrides.ways] Optional 1 or more way ids
 * @returns {string}
 */
const constructIdQuery = ({type}, {country, state, city, intersections, osmId, data}) => {

  // The Overpass Area Id is based on the osm id plus this magic nubmer
  const areaId = parseInt(osmId) + 3600000000;
  // hard-coded node and/or ways
  const nodes = R.view(R.lensPath(['osmOverrides', 'nodes']), data);
  const ways = R.view(R.lensPath(['osmOverrides', 'ways']), data);
  // Get the ordered blocks, unless we have hard-coded way ids
  const orderedBlocks = R.ifElse(
    R.length,
    () => null,
    () => _extractOrderedBlocks(intersections)
  )(ways);

  const query = `
    ${
    R.ifElse(
      R.length,
      // We have hard-coded way ids, just set the first and last to a variable, we don't need w3 because
      // we know for sure that these two ways touch our intersection nodes
      ways => R.join('\n',
        R.addIndex(R.map)(
          (wayId, i) => `way(${wayId})->.w${i + 1};`,
          [R.head(ways), R.last(ways)]
        )
      ),
      // We don't have hard-coded way ids, so search for these values by querying
      () => R.join('\n',
        R.addIndex(R.map)(
          (block, i) => `way(area:${areaId})[highway][name="${block}"][footway!="crossing"]->.w${i + 1};`,
          orderedBlocks
        )
      )
    )(ways)
    }
    // Get the two intersection nodes 
    ${
    R.ifElse(
      R.length,
      // We have hard-coded node ids, just set the nodes to them
      nodes => `(${R.join(' ', R.map(node => `node(${node});`, nodes))})->.nodes;`,
      // Otherwise search for the nodes by searching for the nodes contained in both w1 and w2 and both w1 and w3
      () => `(node(w.w1)(w.w2);
        node(w.w1)(w.w3);
        )->.nodes;
        `
    )(nodes)
    }
    ${
    R.ifElse(
      R.length,
      // We have hard-coded ways, just return these as our final ways
      ways => `(${R.map(way => `way(${way});`, ways)})->.ways;`,
      // Otherwise get all ways containing one or both nodes
      () => `way.w1[highway](bn.nodes)->.ways;`
    )(ways)
    } 
    // Either return nodes or ways. Can't do both because the API messes up the geojson
(${ R.cond([
    [R.equals('way'), R.always('.ways')],
    [R.equals('node'), R.always('.nodes')],
    [R.T, () => {
      throw Error('type argument must specified and be "way" or "node"');
    }]
  ])(type) };)->.outputSet;
.outputSet out geom;
`;
  return query;
};

/**
 * Constructs an OSM query for the given location. Queries are limited to the city of the location
 * and return the ways and nodes related two the intersections. These are more than are actually
 * needed because some refer to ways that are outside the block between the intersections but connected to them.
 * Thus they need to be cleaned up after. The OSM query language is too weak to do it here.
 * Unfortunately the OSM API messed up results if we query for both node and ways together. So I've added the
 * mandatory type argument of 'way' or 'node'. You must query for each separately
 * @param {String} type Either 'way' or 'node'
 * @param {String} country Required country for area resolution
 * @param {String} state Optional depending on the country
 * @param {String} city Required string for area resolution
 * @param {[[String]]} intersections Required two pairs of intersection names that are full street names, i.e.
 * Avenue not Ave
 * @return {string}
 */
const constructLocationQuery = ({type}, {country, state, city, intersections, osmId}) => {

  // The Overpass Area Id is based on the osm id plus this magic nubmer
  const areaId = parseInt(osmId) + 3600000000;
  const orderedBlocks = _extractOrderedBlocks(intersections);
  const query = `
    ${
    // Iterate through the 3 blocks and query for ways in the area with that blockname that isn't a crosswalk
    R.join('\n',
      R.addIndex(R.map)(
        (block, i) => `way(area:${areaId})[highway][name="${block}"][footway!="crossing"]->.w${i + 1};`,
        orderedBlocks
      )
    )
    }
// Get the two intersection nodes 
// node contained in w1 and w2
(node(w.w1)(w.w2);
// node contained in w1 and w3
 node(w.w1)(w.w3);
)->.nodes;
// Get all main ways containing one or both nodes
way.w1[highway](bn.nodes)->.ways; 
// Either return nodes or ways. Can't do both because the API messes up the geojson
(${ R.cond([
    [R.equals('way'), R.always('.ways')],
    [R.equals('node'), R.always('.nodes')],
    [R.T, () => {
      throw Error('type argument must specified and be "way" or "node"');
    }]
  ])(type) };)->.outputSet;
.outputSet out geom;
`;
  return query;
};

/**
 * Makes a string from a point array for hashing
 * @param {String} A string representation of the point
 */
const hashPoint = point => {
  return R.join(':', point);
};
/**
 * Hash the given ndoeFeature point
 * @param nodeFeature
 * @param {String} A string representation of the point
 */
const hashNodeFeature = nodeFeature => {
  return hashPoint(nodeFeature.geometry.coordinates);
};

/**
 * Creates a hash of the coords of each give node feature
 * @param nodeFeatures
 * @param {[String]} A string representation of each node point
 */
const hashNodeFeatures = nodeFeatures => R.map(hashNodeFeature, nodeFeatures);

/**
 * Hash the given way, a LineString Feature into an array of points
 * @param way
 * @returns {[String]} Array of point hashes
 */
const hashWay = way => {
  return R.map(hashPoint, way.geometry.coordinates);
};

/**
 * Given a pair of adjacent street intersections, return the 3 blocks of the two intersections. First the main
 * intersection they both have in common, then the other two blocks
 * @returns {[String]} The three blocks
 * @private
 */
const _extractOrderedBlocks = (intersections) => {

  // Find the common street
  const streetCount = R.reduce(
    (accum, street) => R.over(
      R.lensProp(street),
      value => (value || 0) + 1,
      accum
    ),
    {},
    R.flatten(intersections)
  );
  // This should never happen
  if (!R.find(R.equals(2), R.values(streetCount))) {
    throw `No common block in intersections: ${JSON.stringify(intersections)}`;
  }
  // Sort each intersection, putting the common block first
  const modifiedIntersections = R.map(
    intersection => R.reverse(R.sortBy(street => R.prop(street, streetCount), intersection)),
    intersections
  );
  // List the 3 blocks: common block and then other two blocks
  return [R.head(R.head(modifiedIntersections)), ...R.map(R.last, modifiedIntersections)];
};

/***
 * Reduces a LineString feature by it's head and last point
 * @param {Object} result The accumulating result. This might already be filled with other features.
 * The return value adds this features head and last points to the result. The form of this is
 * {
 *  coordinate_hash1: {head: [features], last: [features]},
 *  coordinate_hash2: {head: [features], last: [features]},
 *  ...
 * }
 * @param {Object} feature geojson LineString feature
 * @returns {Object} Keyed by hashed point valued by an object that has one or both of head and last keys
 * head and last keys are valued by the features whose head point is this point and features whose last point
 * is this point, respectively. We need to end up with no more than one Feature per point per head/last. If we get
 * more than one somewhere it means that feature points aren't ordered in the same direction. So if we get
 * more than one we flip the coordinates of one feature and reclassify for the purpose of chainijng
 */
const _reduceFeaturesByHeadAndLast = (result, feature) => {
  return R.reduce(
    (res, headLast) => {
      return R.over(
        // hash the head or tail point
        R.lensProp(
          hashPoint(
            R[headLast](feature.geometry.coordinates)
          )
        ),
        // Find the hash in res (it might be undefined)
        resultsForPoint => {
          // Operate on it or create a new dict to operate on
          return R.over(
            // Find the 'head' or 'tail' property
            R.lensProp(headLast),
            // Operate on it or create a new array, adding feature
            resultsForPointEnd => R.concat(resultsForPointEnd || [], [feature]),
            resultsForPoint || {}
          );
        },
        res
      );
    },
    result,
    ['head', 'last']
  );
};

/**
 * Given two node points and criteria for matching, returns true if the given LineString feature matches
 * one or both nodes anywhere on the LineString nodes
 * @param {[String]} Two hash node point coordinates
 * @param {Object} lineStringFeature a Geojson feature that is a LineString type
 * @returns {Object} With keys 'head' and 'last' and valued true|false depending on if it matched.
 * It can match 0, 1, or both
 */
const _lineStringFeatureEndNodeMatches = R.curry((nodePointHashes, lineStringFeature) => {
  const lineStringPointHashes = hashWay(lineStringFeature);
  const headLastValues = ['head', 'last'];
  // Returns {head: true|false, last: true|false} if any node on the LineString matches the head node
  // and last node respectively
  return R.fromPairs(
    R.map(
      headLast => [
        headLast,
        R.contains(R[headLast](nodePointHashes), lineStringPointHashes)
      ],
      headLastValues
    )
  );
});


/***
 * Returns an update to the given nodeMatches by checking if the given way LineString feature matches one or both
 * nodes by matching on any node of the LineString. Ways can overlap intersection nodes so we have to check
 * every node of the way
 * @param {[Object]} nodeFeatures The two node geojson objects representing the two street intersections
 * to be merged with the given nodeMatches
 * @param {Object<k,Boolean>} lookup nodeMatches {head: true|false, tail: true|false}
 * @param {Object} nodeFeature way LineString feature Object to test
 * @returns {Object} New version of nodeMatches based on testing feature.
 * @private
 */
const _updateNodeMatches = R.curry((nodeFeatures, nodeMatches, feature) => {
  const nodePointHashes = hashNodeFeatures(nodeFeatures);
  const newNodeMaches = _lineStringFeatureEndNodeMatches(nodePointHashes, feature);
  return R.mergeWith(
    // Once one is true leave it true
    (l, r) => R.or(l, r),
    nodeMatches,
    newNodeMaches
  );
});

/**
 * Returns Features linked in order
 * @param {Object} lookup. Structure created in _reduceFeaturesByHeadAndLast
 * @param {[Object]} nodeFeatures. The two nodeFeatures. These serve as the boundaries of the features
 * @returns {Object} The ordered features from head to last. Any features that are outside of the nodes
 * are left out
 */
const _linkedFeatures = (lookup, nodeFeatures) => {

  // Reduce ways, slicing them to fit between the two node Features.
  // Once we intersect both nodes we quit and ignore any more ways. Usually there will be one extra way at most.
  const {results} = R.reduce(({results, nodeMatches, nodeFeatures}, {resolvedPointLookups, wayFeature}) => {

      // Update the node matches with wayFeature. If we find the last node before the had node, reverse
      // the nodes and the matches, and henceforth the nodes will be reversed
      const updatedNodeMatches = _updateNodeMatches(nodeFeatures, nodeMatches, wayFeature);
      const [newNodeMatches, newNodeFeatures] = _reverseNodesAndWayIfNeeded(updatedNodeMatches, nodeFeatures, wayFeature);

      // Yield any part of the feature that is between the intersection nodes
      const shortenedWayFeature = someAllOrNoneOfWay(newNodeMatches, newNodeFeatures, wayFeature);
      const newResults = R.concat(results, compact([shortenedWayFeature]));
      const reduction = {results: newResults, nodeMatches: newNodeMatches, nodeFeatures: newNodeFeatures};
      if (R.prop('last', newNodeMatches))
      // Quit after this if we intersected the last intersection node. We ignore any way after
        return R.reduced(reduction);
      else
        return reduction;
    },
    // nodeMatches tracks when we have matched at the starting point and ending point of a LineString Feature.
    // We can't allow Features to yield until one first matches at its head (first) point
    // As soon as one matches at its end point we are done matching features, and any remaining are disgarded
    {results: [], nodeFeatures, nodeMatches: {head: false, last: false}},
    [...orderedWayFeatureGenerator(lookup)]
  );
  // Return the nodes and ways
  return {nodes: nodeFeatures, ways: results};
};

function* orderedWayFeatureGenerator(lookup) {
  // headPointToFeature are keyed by points that only have a feature's first point matching it
  // lastPointToFeature are keyed by points that only have a feature's last point matching it
  const [headPointToFeature, lastPointToFeature] = R.map(
    headLast => R.compose(
      // Convert 1 item dict to 1 item dict valued by the single feature
      R.map(value => R.head(R.prop(headLast, value))),
      // Filter by objects having only a 'head' or 'last' key, not both
      R.filter(obj => R.both(
        R.compose(R.equals(1), R.length, R.keys),
        R.prop(headLast)
        )(obj)
      )
    )(lookup),
    ['head', 'last']
  );

  // Starting at the head, find the point who's last item contains the previous feature
  let resolvedPointLookups = headPointToFeature;
  let wayFeature = R.head(R.values(headPointToFeature));
  const lastFeature = R.head(R.values(lastPointToFeature));

  // Make the single item object keyed by next point and valued by feature whose head is the next pointj
  while (true) {
    // Yield these two for iteration
    yield({
      wayFeature,
      resolvedPointLookups
    });
    if (R.equals(wayFeature, lastFeature))
      break;

    // Find the pointLookup whose point is the last point for the currentFeature
    const nextPointLookup = findOneThrowing(
      pointLookupValue => R.pathEq(['last', 0], wayFeature)(pointLookupValue),
      R.omit(R.keys(resolvedPointLookups), lookup)
    );
    // From that pointLookup get the next point by looking at it's head property
    const nextPointToFeature = R.map(value => R.head(R.prop('head', value)), nextPointLookup);
    // Keep track of all points we've processed
    resolvedPointLookups = R.merge(resolvedPointLookups, nextPointToFeature);
    // Use the way whose head touches the nextPoint
    // We always assume there is only 1 way whose head touches, because we should have sorted all ways go
    // flow in the same direction
    wayFeature = R.head(R.values(nextPointToFeature));
  }
}

/**
 * Sometimes the last node is matched before the first node. We know this if nodeMatches.head is false but
 * nodeMatches.last is true. If both nodes match on the same way, we might still have to reverse the nodes
 * if the head of the way is closer to the last node.
 * @param {Object} nodeMatches {head: true|false, last: true|false}
 * @param {[Object]} nodeFeatures: We return a reverse of these if needed as described above
 * @param {Object} wayFeature: The way to check the nodes against
 * @returns {[matches, nodeFeatures]} The reversed nodeMatches in the case that head is false and last is true,
 * it returns head: true, last: false. The possibly reversed nodeFeatures if either of the
 * above described conditions happen
 * @private
 */
const _reverseNodesAndWayIfNeeded = (nodeMatches, nodeFeatures, wayFeature) => {
  return R.cond([
    [
      // If the last node matches before the head reverse the true/false of the matches and reverse the nodeFeatures
      R.both(R.prop('last'), R.complement(R.prop('head'))),
      matches => [R.map(R.not, matches), R.reverse(nodeFeatures)]
    ],
    [
      // If both nodes match, find the closest to the head of the way and put that node first
      R.both(R.prop('last'), R.prop('head')),
      matches => {
        const wayPointHashes = hashWay(wayFeature);
        const sortedNodeFeatures = R.sortBy(
          // Find the closest node to the start of the way
          nodeFeature => R.indexOf(hashNodeFeature(nodeFeature), wayPointHashes),
          nodeFeatures
        );
        return R.ifElse(
          // If the first was closest, leave it alone, else reverse
          sortedNodeFeatures => R.equals(R.head(nodeFeatures), R.head(sortedNodeFeatures)),
          R.always([matches, nodeFeatures]),
          R.always([matches, R.reverse(nodeFeatures)])
        )(sortedNodeFeatures);
      }
    ],
    [
      R.T,
      matches => [matches, nodeFeatures]
    ]
  ])(nodeMatches);
};

/**
 * Slice the given wayFeature to fit between the two nodeFeatures. We only do this if nodeMatches['head'] is true,
 * which indicates that part of this way or a previous one has intersections the first of the two nodes.
 * If the wayFeature intersects one node we shorten it from its start to that node or from that node to its end
 * depending on if its the first or last node. If the way matches both nodes we trim it on both sides
 * @param {Object<k, Boolean>} nodeMatches {head: true|false, last: true|false} indicating if the head and last
 * node have been matched by this wayFeature or a previous one
 * @param {[Object]} nodeFeatures Always the two intersection node features
 * @param {Object} wayFeature The LineString way feature
 * @returns {Object|null} Returns a copy of the Feature with trimmed coordinates. Returns null if
 * nodeMatches['head'] is or the trimmed way feature coordinates are trimmed down to only 1 point
 */
const someAllOrNoneOfWay = (nodeMatches, nodeFeatures, wayFeature) => {
  if (R.prop('head', nodeMatches)) {
    // Mark that we've intersected one of the nodes
    // The head point of this feature must match, so shorten its end if it overlaps the last node
    const shortedFeature = shortenToNodeFeaturesIfNeeded(nodeMatches, nodeFeatures, wayFeature);
    // If we the shortened way is more than 1 point, yield it. A point point way is only matching the node,
    // so we can assume it's completely outside the block except but intersections the intersection at one end
    if (R.lt(1, R.length(shortedFeature.geometry.coordinates))) {
      return shortedFeature;
    }
  }
  return null;
};

/***
 * Shortens a features coordinates to the node if it's a way that crosses the node
 * It's possible for ways to overlap the head node and last node (the intersections)

 * If this is is a head node match, we might have a way that overlaps the head node,
 * so we need to take the slice of the way from head node to last point way
 * x-x-x-x-x-x-x-x|--------------------- -------------------|
 * way head       head node              (new way starts)   last node

 * If we already had a match with the head node then this could only possibly overlap the last node
 * so we need to take the slice of the way from the way head to the lst node
 * ---|-----------------|x-x-x-x-x-x-x-x-x-x
 *    head node         last node

 * It might also be possible for a way to overlap both intersections
 * x-x-x|----------------|x-x-x
 *      head node        last node
 * @param {Object<k,Boolean>} nodeMatches Keys are head and last and value are true or false. If head is true
 * it means that this nodeFeature or a previous has matched the first intersection, so we want to slice this
 * way from this head node intersection (or from head if it's not in this Feature).
 * If last is true that means that this nodeFeature matches the last
 * intersection so we want to slice up until and including this intersection node
 * @param nodeFeatures
 * @param wayFeature
 */
const shortenToNodeFeaturesIfNeeded = (nodeMatches, nodeFeatures, wayFeature) => {
  const wayPointHashes = R.map(hashPoint, wayFeature.geometry.coordinates);
  const nodeHashes = hashNodeFeatures(nodeFeatures);
  // If we don't find the node in the way, resolve to index 0 for the head node
  // and resolve to Infinity for the last node
  const resolveSliceIndex = (nodeIndex, nodeHash) => R.ifElse(
    R.equals(-1),
    () => R.ifElse(
      R.equals(0),
      R.always(0),
      R.always(Infinity)
    )(nodeIndex),
    // Add 1 to the last index to make the slice inclusive of the last point
    foundIndex => R.ifElse(
      R.equals(1),
      () => R.add(1, foundIndex),
      R.always(foundIndex)
    )(nodeIndex)
  )(R.indexOf(nodeHash, wayPointHashes));

  const sliceFromTo = R.addIndex(R.map)(
    (nodeHash, index) => resolveSliceIndex(index, nodeHash),
    nodeHashes
  );
  const coordinateLens = R.lensPath(['geometry', 'coordinates']);
  // Slice the feature coordinates by slicing them from the start to the matching point or the matching point
  // to the end
  return R.over(
    coordinateLens,
    coordinates => R.slice(...sliceFromTo, coordinates),
    wayFeature
  );
};

/***
 * Sorts the features by connecting them at their start/ends
 * @param {[Object]} wayFeatures List of way feaures to sort
 * @param {[Object]} nodeFeatures Two node features respresenting the block intersection
 * @param {Object} Object contains keys nodes and ways. Nodes must always be the two node Features of the4 block.
 * ways must be at least on way Feature, possibly shortened to match the block and up to n way features with at
 * most the first and last possibly shortened to match the block
 */
export const getFeaturesOfBlock = (wayFeatures, nodeFeatures) => {
  // Build a lookup of start and end points
  // This results in {
  //  end_coordinate_hash: {head: [feature]}
  //  coordinate_hash: {head: [feature], tail: [feature] }
  //  end_coordinate_hash: {tail: [feature]}
  //}
  // Note that two hashes have only one feature. One with one at the head and one with one at the tail
  // The other have two features. So this gives us a good idea of how the features are chained together
  const lookup = R.reduce(
    (result, feature) => {
      return _reduceFeaturesByHeadAndLast(result, feature);
    },
    {},
    wayFeatures
  );
  // Do any features have the same head or last point? If so flip the coordinates of one
  const modified_lookup = R.map(
    headLastObj => {
      return R.map(
        features => {
          return R.when(
            f => R.compose(R.lt(1), R.length)(f),
            // Reverse the first features coordinates
            f => R.compose(
              f => R.over(R.lensPath([0, '__reversed__']), R.T, f),
              f => R.over(R.lensPath([0, 'geometry', 'coordinates']), R.reverse, f)
            )(f)
          )(features);
        },
        headLastObj
      );
    },
    lookup
  );
  const modifiedWayFeatures = R.compose(
    R.values,
    // Take l if it has __reversed__, otherwise take r assuming r has reversed or neither does and are identical
    featureObjs => mergeAllWithKey(
      (_, l, r) => R.ifElse(R.prop('__reversed__'), R.always(l), R.always(r))(l),
      featureObjs),
    // Hash each by id
    features => R.map(feature => ({[feature.id]: feature}), features),
    R.flatten,
    values => R.chain(R.values, values),
    R.values
  )(modified_lookup);

  const finalLookup = R.reduce(
    (result, feature) => {
      return _reduceFeaturesByHeadAndLast(result, feature);
    },
    {},
    modifiedWayFeatures
  );

  // Use the linker to link the features together, dropping those that aren't between the two nodes

  const linkedFeatures = _linkedFeatures(finalLookup, nodeFeatures);

  // Finally remove the __reversed__ tags from the ways (we could leave them on for debugging if needed)
  return R.over(
    R.lensProp('ways'),
    ways => R.map(R.omit('__reversed__'), ways),
    linkedFeatures
  );
};

/**
 * Query the given locations
 * @param {Object} location A Location object
 * @param {[String]} location.intersections Two pairs of strings representing the intersections cross-streets
 * @returns {Task<Result>} Result.Ok with the geojson results or a Result.Error
 * The data contains nodes and ways, where there should always be exactly 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 */
export const queryLocationOsm = location => {
  // This long chain of Task reads bottom to top. Only the functions marked Task are actually async calls.
  // Everything else is wrapped in a Task to match the expected type
  return R.composeK(
    location => _locationToQueryResults(location),
    // OSM needs full street names (Avenue not Ave), so use Google to resolve them
    location => R.cond([
      // If we defined explicitly OSM intersections set the intersections to them
      [R.view(R.lensPath(['data', 'osmOverrides', 'intersections'])),
        location => of(
          R.over(
            R.lensProp('intersections'),
            () => R.view(R.lensPath(['data', 'osmOverrides', 'intersections']), location),
            location)
        )
      ],
      // Use Google to resolve full names
      [R.T,
        location => fullStreetNamesOfLocationTask(location).map(
          // Replace the intersections with the fully qualified names
          intersections => R.mergeAll([location, {intersections}, R.propOr('Intersections', location)])
        )
      ]
    ])(location)
  )(location);
};

/**
 * Resolve the location and then query for the block in overpass.
 * Overpass will give us too much data back, so we have to clean it up in getFeaturesOfBlock.
 * This process will first use nominatimTask to query nomatim.openstreetmap.org for the relationship
 * of the neighborhood of the city. If it fails it will try the entire city. With this result we
 * query overpass using the area representation of the neighborhood or city, which is the OpenStreetMap id
 * plus a magic number defined by Overpass. If the neighborhood area query fails to give us the results we want,
 * we retry with the city area
 * @param location
 * @returns {Task<Result<Object>>} Result.Ok if data is found, otherwise Result.Error.
 * The data contains nodes and ways, where there should always be exactly 2 nodes for the two intersections.
 * There must be at least on way and possibly more, depending on where two ways meet.
 */
const _locationToQueryResults = location => {
  // Sort LineStrings (ways) so we know how they are connected
  return R.composeK(
    // Chain our queries until we get a result or fail
    locationsWithOsm => _queryOverpassForBlockTaskUntilFound(locationsWithOsm),
    // Remove failed nominatim queries
    results => of(compact(results)),
    // Use OSM Nominatim to get relation of the neighborhood (if it exists) and the city
    // We'll use one of these to query an area in Overpass
    location => waitAll(
      R.map(
        keys => nominatimTask(R.pick(keys, location))
          .map(responseResult => responseResult.matchWith({
              Ok: ({value}) => {
                // bounding box comes as two lats, then two lon, so fix
                return R.merge(location, {
                  // We're not using the bbox, but note it anyway
                  bbox: R.map(str => parseFloat(str), R.props([0, 2, 1, 3], value.boundingbox)),
                  osmId: value.osm_id,
                  placeId: value.place_id
                });
              },
              Error: ({value}) => {
                // If no results are found, just return null. Hopefully the other nominatin query will return something
                console.debug(value);
                return null;
              }
              // Remove nulls
            })
          ).mapRejected(
            // If the query fails to excute
            errorResult => errorResult.map(error => {
              console.warn(`Giving up. Nominatim query failed with error message: ${error}`);
              return error;
            })
          ),
        // Query with neighborhood (if given) and without. We probably won't need the area from the without
        // query but it doesn't hurt to grab it here
        R.concat(
          R.ifElse(
            R.prop('neighborhood'),
            R.always([['country', 'state', 'city', 'neighborhood']]),
            R.always([])
          )(location),
          [['country', 'state', 'city']]
        )
      )
    )
  )(location);
};

/***
 * Queries the location with the OverPass API for its given street block. Querying happens once or twice, first
 * with the neighborhood specified (faster) and then without if no results return. The neighborhood is
 * also be omitted in a first and only query if the location doesn't have one
 * @param locationsWithOsm
 * @returns Task<Result<Object>> A Result.Ok with the geojson object or a Result.Error
 */
const _queryOverpassForBlockTaskUntilFound = locationsWithOsm => {
  const predicate = R.allPass([
    // Not null
    R.complement(R.isNil),
    // 2 nodes
    R.compose(R.equals(2), R.length, R.prop('nodes')),
    // >0 ways
    R.compose(R.lt(0), R.length, R.prop('ways'))
  ]);

  return R.composeK(
    // Run the predicate once more to make sure we got a result. Return a Result.ok or Result.error
    result => of(
      R.ifElse(
        result => predicate(result),
        result => Result.Ok(result),
        () => {
          return Result.Error(
            {
              error: `Unable to resolve block using the given locations with OpenStreetMap. Take a look at the results. 
            If there are more than two nodes you need to query them manually and figure the correct two. Then update
            the location field osmIntersections with the two ids. e.g. ([351103238', 367331193])
            `,
              result,
              locations: locationsWithOsm
            }
          );
        }
      )(result)
    ),
    // A chained Task that runs 1 or 2 queries as needed
    locations => traverseReduceWhile(
      {
        // Keep searching until we have a result
        predicate: (previousResult, result) => {
          // We have good results when we have exactly 2 nodes and at least 1 way
          // Return false if all conditions are met
          return R.complement(predicate)(result);
        },
        accumulateAfterPredicateFail: true
      },

      // No merge, we just want the first legit result, which the predicate will determine
      (previousResult, result) => R.merge(previousResult, result),
      of({}),
      // Create a list of Tasks. We'll only run as many as needed
      R.map(locationWithOsm => _queryOverpassForBlockTask(locationWithOsm), locations)
    )
  )(locationsWithOsm);
};

/**
 * Given a location with an osmId included, query the Overpass API and cleanup the results to get a single block
 * of geojson representing the location's two intersections and the block
 * @param locationWithOsm
 */
const _queryOverpassForBlockTask = locationWithOsm => {
  return R.composeK(
    // Finally get the features from the response
    ([wayResponse, nodeResponse]) => of(getFeaturesOfBlock(
      wayResponse.features,
      nodeResponse.features
    )),
    // Then perform the queries in parallel
    queries => waitAll(
      // Wait 2 seconds for the second call, Overpass is super picky
      R.addIndex(R.map)((query, i) => fetchOsmRawTask({
        overpassUrl: roundRobinOsmServers(),
        sleepBetweenCalls: i * 2000
      }, query), queries)
    ),
    // Build an OSM query for the location. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    locationWithOsm => of(
      R.map(
        type => constructIdQuery({type}, locationWithOsm),
        ['way', 'node']
      )
    )
  )(locationWithOsm);
};
