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
import {task} from 'folktale/concurrency/task';
import * as R from 'ramda';
import {
  compact,
  findOneThrowing,
  mapKeys,
  reqStrPathThrowing,
  strPathOr
} from 'rescape-ramda';
import os from 'os';
import 'regenerator-runtime';
import {loggers} from 'rescape-log';

const log = loggers.get('rescapeDefault');

// When doing OSM queries with lat/lon points search for nodes withing this many meters of them
// The idea is that differences between Google, OSM, and manually marking of intersections should
// be within 10 meters. But this might have to be greater
export const AROUND_LAT_LON_TOLERANCE = 10;


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
 * Translates to OSM equals condition
 * @param {object} id The id to match
 * @return {string} '(id)'
 */
export const osmIdEquals = id => `(${id})`;

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
export const filtersForType = R.curry((conditions, type) => `${type}${R.join('', conditions)};`);

/**
 * Given an array of bounds lat, lon, lat, lon, return themn as a string for osm
 * @param {[Number]} bounds
 * @return {*}
 */
export const boundsAsString = bounds => {
  return R.pipe(
    list => R.concat(
      R.reverse(R.slice(0, 2)(list)),
      R.reverse(R.slice(2, 4)(list))),
    R.join(','),
    str => (`[bbox: ${str}]`)
  )(bounds);
};

// Filter to get roads and paths that aren't sidewalks or crossings
export const highwayOsmFilter = R.join('', [
  osmAlways('highway'),
  osmNotEqual('footway', 'crossing'),
  osmNotEqual('footway', 'sidewalk')
]);

/**
 * Builds simple queries that just consist of filters on the given types
 */
export const buildFilterQuery = R.curry((settings, conditions, types) => {

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
export const taskQuery = (options, query) => {
  // Wrap overpass helper's execution and callback in a Task
  return task(resolver => {
    // Possibly delay each call to query_overpass to avoid request rate threshold
    // Since we are executing calls sequentially, this will pause sleepBetweenCalls before each call
    setTimeout(() => {
        log.debug(`Requesting OSM query: ${query}`);
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
 * Creates a filter to only accept nodes around a given point that have at 2 least ways attached to them,
 * meaning they are intersections
 * @param {String} around: e.g. '(around: 10, 40.6660816, -73.8057879)'
 * @param {String} outputNodeName e.g. 'nodes1'
 * @returns {string} The osm string
 * @private
 */
export const _filterForIntersectionNodesAroundPoint = (around, outputNodeName) => {
  const possibleNodes = `${outputNodeName}Possible`;
  const oneOfPossibleNodes = `oneOf${outputNodeName}Possible`;
  const waysOfOneOfPossibleNodes = `waysOfOneOf${outputNodeName}Possible`;
  return `node${around} -> .${possibleNodes};
foreach.${possibleNodes} ->.${oneOfPossibleNodes}
{
  way(bn.${oneOfPossibleNodes})${highwayOsmFilter}->.${waysOfOneOfPossibleNodes};
  // If we have at least 2 ways, we have an intersection
  if (${waysOfOneOfPossibleNodes}.count(ways) >= 2)
  {
  .${oneOfPossibleNodes} -> .${outputNodeName};
  }
}`;
};

/**
 * Makes a string from a point array for hashing
 * @param {String} A string representation of the point
 */
export const hashPoint = point => {
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


/***
 * Reduces a LineString feature by its head and last point
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
export const _reduceFeaturesByHeadAndLast = (result, feature) => {
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
export const _linkedFeatures = (lookup, nodeFeatures) => {

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

/**
 * One problem with OSM data is it returns feature.properties.tags with tag keys in the form 'a:b' like 'maxspeed:type'
 * This is a tough key to handle in graphql, so we convert it to a__b
 * @param feature
 * @private
 */
export const _cleanGeojson = feature => {
  const tagsLens = R.lensPath(['properties', 'tags']);
  return R.over(
    tagsLens,
    mapKeys(
      R.when(
        R.contains(':'),
        R.replace(/:/g, '__')
      )
    ),
    feature
  );
};

/**
 *
 * @param {[Object]} wayFeatures The way features of a single block. This could be one or more ways:
 * If the way splits half way through the block or if it's a boulevard, highway, etc with a divided roads
 * @param {Object} nodeIdToWaysOfNodeFeatures Keyed by node id and value by a list of way features that
 * intersect the node. Each node represents an intersection of the block
 * @returns {Object} An object keyed by the same node ids but valued by a list of street names of the
 * ways that intersect the node. The street names list first the street matching one of the wayFeatures
 * and the remaining are alphabetical. If a way has no name the way's id string is used
 * @private
 */
export const _intersectionsFromWaysAndNodes = (wayFeatures, nodeIdToWaysOfNodeFeatures) => {
  const nameOrIdOfFeature = feature => strPathOr(reqStrPathThrowing('id', feature), 'properties.tags.name', feature);
  const wayNames = R.map(nameOrIdOfFeature, wayFeatures);
  const wayIds = R.map(R.prop('id'), wayFeatures);
  const wayMatches = R.concat(wayIds, wayNames);
  // Scores a featureName 100 if it matches a way name or id, else 0
  const wayMatchWeight = R.ifElse(featureName => R.contains(featureName, wayMatches), R.always(1), R.always(0));

  return R.map(
    waysOfNodeFeatures => {
      return R.compose(
        // Take the name
        R.map(R.prop('name')),
        // Sort by first matching a way and second alphabetically
        uniqueFeatures => R.sortWith(
          [
            // Most points for matching the way
            R.descend(wayMatchWeight),
            // Small points for alphabetical name
            R.ascend(R.prop('name'))
          ],
          uniqueFeatures
        ),
        // Get uniquely named features
        featuresWithNames => R.uniqBy(
          R.prop('name'),
          featuresWithNames
        ),
        // Name features by the name tag or failing that the way id
        features => R.map(
          feature => ({feature, name: nameOrIdOfFeature(feature)}),
          features
        )
      )(waysOfNodeFeatures);
    },
    nodeIdToWaysOfNodeFeatures
  );
};
