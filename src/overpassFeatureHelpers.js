/**
 * Created by Andy Likuski on 2019.08.14
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import * as R from 'ramda';
import {
  chainExceptMapDeepestMDeep,
  chainObjToValues,
  compact,
  composeWithChainMDeep, composeWithMap,
  composeWithMapMDeep,
  filterWithKeys,
  findOneThrowing,
  mapKeys,
  mapMDeep,
  objOfMLevelDeepMonadsToListWithPairs,
  reqStrPathThrowing,
  traverseReduce
} from 'rescape-ramda';
import * as Result from 'folktale/result';
import 'regenerator-runtime';
import {wayFeatureNameOrDefault} from './locationHelpers';
import {loggers} from 'rescape-log';

const log = loggers.get('rescapeDefault');

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
export const hashNodeFeature = nodeFeature => {
  return hashPoint(reqStrPathThrowing('geometry.coordinates', nodeFeature));
};

/**
 * Creates a hash of the coords of each give node feature
 * @param nodeFeatures
 * @param {[String]} A string representation of each node point
 */
const hashNodeFeatures = nodeFeatures => R.map(hashNodeFeature, nodeFeatures);

/**
 * Hash the given way, a LineString or MultiLineString Feature into an array of points
 * @param wayFeature
 * @returns {[String]} Array of point hashes
 */
export const hashWayFeature = wayFeature => {
  return chainWayCoordinates(hashPoint, wayFeature);
};

/**
 * The flat coordinates of the way features
 * @param wayFeature
 * @return {*[]}
 */
export const wayFeatureToCoordinates = wayFeature => {
  return chainWayCoordinates(R.identity, wayFeature);
};

/**
 * Applies fun to each wayFeature coordinate, returning a flat result whether coordinates are
 * from a LineString or multiple lines in a MultiLineString
 * @param func Expects a coordinate pair and returns a mapped value
 * @param {Object} wayFeature geojson that contains geometry.coordinates
 * @param {Object} wayFeature.geojson
 * @param {Object} wayFeature.geojson.coordinates A LineString or MultiLineString
 * @return {[*]} The mapped values
 */
export const chainWayCoordinates = (func, wayFeature) => {
  return R.cond([
    [geometry => R.propEq('type', 'MultiLineString', geometry),
      geometry => {
        // Process each point of each line string
        return chainExceptMapDeepestMDeep(
          2,
          coord => {
            return func(coord);
          },
          R.prop('coordinates', geometry)
        );
      }
    ],
    [geometry => R.propEq('type', 'LineString', geometry),
      geometry => {
        // Process each point of the single line string
        return R.map(
          coord => {
            return func(coord);
          },
          R.prop('coordinates', geometry)
        );
      }
    ],
    [R.T,
      geometry => {
        throw new Error(`Geometry type is wrong ${R.prop('type', geometry)}`);
      }
    ]
  ])(R.prop('geometry', wayFeature));
};

/**
 * Like hashWayFeature but only hashes the first and last points of the way
 * @param wayFeature
 * @returns {[String]} Array of two point hashes
 */
export const hashWayFeatureExtents = wayFeature => {
  return R.compose(
    pointPair => R.map(hashPoint, pointPair),
    points => extents(points),
    wayFeature => reqStrPathThrowing('geometry.coordinates', wayFeature)
  )(wayFeature);
};

/**
 * Retursn the first and last item of a list
 * @param list
 * @returns {f1}
 */
export const extents = list => {
  return R.map(extreme => R[extreme](list), ['head', 'last']);
};

/**
 * Returns true if the nodeFeature is at either end of the given wayFeature.
 * @param {Object} wayFeature The way
 * @param {Object} nodeFeature The node
 * @returns {Boolean} True if the nodeFeature point equals one of the end wayFeature points
 */
export const nodeMatchesWayEnd = (wayFeature, nodeFeature) => R.includes(
  hashNodeFeature(nodeFeature), hashWayFeatureExtents(wayFeature)
);

/**
 * Reverses hashWayFeature by converting hashed points back to pairs and each number to a float
 * @param hashPoints
 * @returns {[[String]]} String pairs of lon/lat points
 */
export const hashPointsToWayCoordinates = hashPoints => {
  return R.compose(
    mapMDeep(2, str => parseFloat(str)),
    R.map(R.split(':'))
  )(hashPoints);
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
 * more than one we flip the coordinates of one feature and reclassify for the purpose of chaining
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
  const lineStringPointHashes = hashWayFeature(lineStringFeature);
  const headLastValues = ['head', 'last'];
  // Returns {head: true|false, last: true|false} if any node on the LineString matches the head node
  // and last node respectively
  return R.fromPairs(
    R.map(
      headLast => [
        headLast,
        R.includes(R[headLast](nodePointHashes), lineStringPointHashes)
      ],
      headLastValues
    )
  );
});

/***
 * Returns an update to the given nodeMatches by checking if the given way LineString feature matches one or both
 * nodes by matching on any node of the LineString. Ways can overlap intersection nodes so we have to check
 * every node of the way
 * @param {[Object]} nodeFeatures The two or more node geojson objects representing the two street intersections
 * to be merged with the given nodeMatches. There are only more than
 * two nodes when a way is crossing a divided highway or similar
 * @param {Object<k,Boolean>} lookup nodeMatches {head: true|false, tail: true|false}
 * @param {Object} nodeFeature way LineString feature Object to test
 * @returns {Object} New version of nodeMatches based on testing feature.
 * @private
 */
const _updateNodeMatches = R.curry((nodeFeatures, nodeMatches, feature) => {
  const nodePointHashes = hashNodeFeatures(nodeFeatures);
  // We only test the nodes at the extremes, assuming the nodes our ordered. There are only more than
  // two nodes when a way is crossing a divided highway or similar
  const testNodePointHashes = R.map(f => f(nodePointHashes), [R.head, R.last]);
  const newNodeMatches = _lineStringFeatureEndNodeMatches(testNodePointHashes, feature);
  return R.mergeWith(
    // Once one is true leave it true
    (l, r) => R.or(l, r),
    nodeMatches,
    newNodeMatches
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

  // Generate the ordered ways.
  const orderedWaysAndNodeFeatureSets = orderedWayFeatureGenerator(lookup, nodeFeatures);
  // Reduce ways, slicing them to fit between the two node Features.
  // Once we intersect both nodes we quit and ignore any more ways. Usually there will be one extra way at most.
  const ways = R.chain(
    orderedWaysAndNodeFeatureSet => {
      const {results} = R.reduce(
        ({results, nodeMatches, nodeFeatures},
         wayFeature
        ) => {
          // Update the node matches with wayFeature. If we find the last node before the had node, reverse
          // the nodes and the matches, and henceforth the nodes will be reversed
          const updatedNodeMatches = _updateNodeMatches(nodeFeatures, nodeMatches, wayFeature);
          // If the wayFeature matches both nodes, this will make newNodeMatches {head: true, last: true}
          // If wayFeature only matches at the start node, it will make newNodeMatches {head: true, last: false}
          // If wayFeature only matches at the last node and nodeMatches.last if false, this will reverse the nodes
          // to line up directionally with wayFeature.
          // If there are more than 2 nodeFeatures, like for crossing divided highways, we ignore the middle nodes
          // but include them in the reversal of nodes when we reverse
          const [newNodeMatches, newNodeFeatures] = _reverseNodesAndWayIfNeeded(updatedNodeMatches, nodeFeatures, wayFeature);

          // return any part of the feature that is between the intersection nodes
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
        // We can't allow Features to stop the reduction until one first matches at its head (first) point
        // As soon as one matches at its end point we are done matching features, and any remaining are disgarded
        {
          results: [],
          nodeMatches: {head: false, last: false},
          nodeFeatures: R.prop('nodeFeatures', orderedWaysAndNodeFeatureSet)
        },
        R.prop('wayFeatures', orderedWaysAndNodeFeatureSet)
      );
      return results;
    },
    orderedWaysAndNodeFeatureSets
  );
  // Return the nodes and ways
  return {nodes: nodeFeatures, ways};
};

const orderedWayFeatureGenerator = (lookup, nodeFeatures) => {
  // Return nodes that match the way
  const nodeFeatureLookup = R.fromPairs(R.map(
    nodeFeature => ([hashNodeFeature(nodeFeature), nodeFeature]),
    nodeFeatures)
  );
  const nodeHashes = R.keys(nodeFeatureLookup);
  // headPointToFeature are keyed by points that only have a way feature's first point matching it
  // lastPointToFeature are keyed by points that only have a way feature's last point matching it
  const [headPointToWayFeature, lastPointToWayFeature] = R.map(
    headOrLast => R.compose(
      // Convert 1 item dict to 1 item dict valued by the single feature
      R.map(value => R.head(R.prop(headOrLast, value))),
      // Filter by objects having the matching headOrLast value,
      // and either they don't have the other key (head or last) or they match a nodeFeature
      // Meaning a lookup with a head and last can be split so some of its features pass both 'head' and 'last'
      // if it matches a node feature. We do this because we don't want a lookup matching a node feature
      // to be used as a point of continuation when we're linking ways. A node should be place where we end way
      // linking
      filterWithKeys(
        (obj, pointHash) => R.both(
          // Matches head or last
          R.prop(headOrLast),
          // And either
          R.either(
            // Only has one key
            R.compose(R.equals(1), R.length, R.keys),
            // Or matchers a node
            () => R.includes(pointHash, nodeHashes)
          )
        )(obj)
      )
    )(lookup),
    // Process the head then the last node
    ['head', 'last']
  );

  let resolvedPointToWaysLookups = {};
  // Iterate through each each start point. Each is the place a way starts. We want to travel
  // along the way and connect to other ways or to a lastPoint node. Whenever we meet a lastPoint node
  // we yield a completed way. Usually there is just one lastPoint that is met except for cases of
  // intersecting divided roads where we can meet two lastPoints. In that case we yield the short way between
  // the two last points.
  // Whenever we run out of ways to connect to we are done with this startPoint
  return chainObjToValues(
    (startWayFeature, startPoint) => {
      resolvedPointToWaysLookups = R.merge(resolvedPointToWaysLookups, {[startPoint]: startWayFeature});
      let wayFeature = startWayFeature;
      const resolvedWayFeatures = [];
      // Make the single item object keyed by next point and valued by feature whose head is the next point
      while (true) {
        // Find the lastPointToWayFeatureEntries whose last property contains our wayFeature
        // In other words, does the end of this way match a point that isn't the start of another way?
        const matchingLastPointToWayFeatures = R.filter(
          lastFeature => R.equals(wayFeature, lastFeature),
          R.values(lastPointToWayFeature)
        );
        resolvedWayFeatures.push(wayFeature);

        // If we match a last, we're done.
        if (R.length(matchingLastPointToWayFeatures))
          break;

        // Get the lookups that are left
        const remainingLookup = R.compose(
          R.filter(
            value => R.both(
              R.prop('head'),
              R.prop('last')
            )(value)
          ),
          R.omit(
            R.keys(resolvedPointToWaysLookups)
          )
        )(lookup);

        // If for some reason there are no other ways then continue. This happens in loop conditions
        if (!R.length(R.keys(remainingLookup))) {
          break;
        }

        // We expect exactly one intermediate pointLookup to match the wayFeature
        // This is a pointLookup that has a last and head. 'last' matches our wayFeature and head indicates
        // the next wayFeature we want to follow
        // -wayFeature--> <tail, head> -next wayFeature-->
        const nextHeadAndLastPointLookup = findOneThrowing(
          pointLookupValue => R.pathEq(['last', 0], wayFeature)(pointLookupValue),
          remainingLookup
        );
        // From that pointLookup get the next point by looking at it's head property
        const nextPointToWayFeature = R.map(value => R.head(R.prop('head', value)), nextHeadAndLastPointLookup);

        // Add it to our resolvedPointToWaysLookups nextPointToWayFeature
        resolvedPointToWaysLookups = R.merge(resolvedPointToWaysLookups, nextPointToWayFeature);

        // Use the way whose head touches the nextPoint
        // We always assume there is only 1 way whose head touches, because we should have sorted all ways go
        // flow in the same direction
        wayFeature = R.head(R.values(nextPointToWayFeature));
      }
      // Yield the wayFeature and nodeFeatures that match
      // This is either an initial wayFeature from startWayFeature or the one we connected to on the last iteration
      const wayPoints = R.chain(
        wayFeature => hashWayFeature(wayFeature),
        resolvedWayFeatures
      );

      const matchingNodeFeatures = compact(R.map(
        // Resolve the nodeFeature or Null
        wayPoint => R.propOr(null, wayPoint, nodeFeatureLookup),
        wayPoints
      ));
      // Return each way individually with the matching nodeFeatures.
      // Normally there is only one resolvedWayFeatures, but if we had to link ways we'll return
      // them separately with the same nodes and trim them later
      return {
        wayFeatures: resolvedWayFeatures,
        nodeFeatures: matchingNodeFeatures
      };
    },
    headPointToWayFeature
  );
};

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
        const wayPointHashes = hashWayFeature(wayFeature);
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
  // We only test with the extreme nodes, assuming they are ordered. We usually have only 2 nodes but
  // can have more if the way crosses a divided road.
  const testNodeFeatures = R.map(f => f(nodeFeatures), [R.head, R.last]);
  if (R.prop('head', nodeMatches)) {
    // Mark that we've intersected one of the nodes
    // The head point of this feature must match, so shorten its end if it overlaps the last node
    const shortenedWayFeature = shortenToNodeFeaturesIfNeeded(nodeMatches, testNodeFeatures, wayFeature);
    // If we the shortened way is more than 1 point, yield it. A point point way is only matching the node,
    // so we can assume it's completely outside the block except but intersections the intersection at one end
    if (R.lt(1, R.length(shortenedWayFeature.geometry.coordinates))) {
      return shortenedWayFeature;
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
  const wayPointHashes = hashWayFeature(wayFeature);
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
export const cleanGeojson = feature => {
  const tagsLens = R.lensPath(['properties', 'tags']);
  return R.over(
    tagsLens,
    mapKeys(
      R.when(
        R.includes(':'),
        R.replace(/:/g, '__')
      )
    ),
    feature
  );
};

/**
 * Given the way features of a single block and a lookup that maps intersection node ids to the way features
 * that intersect the node (including but not limited to the wayFeatures ways), resolves the names of the
 * intersections of the wayFeatures. If street names can't be resolved because a nodeFeature is a dead end,
 * we use the street name and the dead-end node id. This way we always have two names at each end of the way.
 * It's possible that have more that two street names for an intersection where more than two street names meet
 * @param {Object} osmConfig
 * @param {Object} osmConfig.disableNodesOfWayQueries If true then no extra OSM queries are allowed to get
 * intersection data. This means we allow naming intersections based on node ids if intersecting street features
 * aren't loaded
 * @param {[Object]} nodeFeatures The 2 node features of the single block. This might include a dead end node
 * @param {[Object]} wayFeatures The way features of a single block. This could be one or more ways:
 * If the way splits half way through the block or if it's a boulevard, highway, etc with a divided roads
 * @param {Object} nodeIdToWayFeatures Keyed by node id and value by a list of way features that
 * intersect the node. Each node represents an intersection of the block. Note that this lookup can be larger
 * than just the needed nodes if you are calling this function multiple times on many blocks and have a comprehensive
 * list of lookups. This lookup lacks matches for dead-end nodes since they are not intersections. We handle
 * this case
 * @returns {Result<Object>} An object keyed by the same node ids but valued by an object
 * in the form {data: streets: [...]} where streets is list of street names of the
 * ways that intersect the node. The street names list first the street matching one of the wayFeatures
 * (i.e. the block name) and the remaining are alphabetical. If a way has no name the way's id string is used
 * (e.g. 'way/12345').
 * Returns Result.Error if anything goes wrong
 * @private
 */
export const _intersectionStreetNamesFromWaysAndNodesResult = (
  osmConfig,
  wayFeatures,
  nodeFeatures,
  nodeIdToWayFeatures
) => {
  // Get the node id to way features matching our node features
  const limitedNodeIdToWayFeatures = R.fromPairs(
    R.map(
      nodeFeature => {
        const nodeId = R.prop('id', nodeFeature);
        return [
          nodeId,
          R.when(
            R.isNil,
            () => {
              // If we can't find the wayFeatures it's because we have a non-intersection dead-end node
              // That means the only way of the node is the last of wayFeatures, because our ways always flow from
              // an intersection the dead end can only be at the end of an intersection (unless we have have an
              // isolated way, which isn't handled anywhere in the code yet)
              // We put the nodeFeature as the second feature to represent the cross-street, since there is no cross street
              // This can be removed in the future when we don't need a cross street
              return [R.last(wayFeatures), nodeFeature];
            }
          )(R.propOr(null, nodeId, nodeIdToWayFeatures))
        ];
      }, nodeFeatures)
  );
  const nameOrIdOfFeature = feature => wayFeatureNameOrDefault(reqStrPathThrowing('id', feature), feature);
  const wayNames = R.map(nameOrIdOfFeature, wayFeatures);
  const wayIds = R.map(R.prop('id'), wayFeatures);
  const wayMatches = R.concat(wayIds, wayNames);
  // Scores a featureName 100 if it matches a way name or id, else 0
  const wayMatchWeight = R.ifElse(
    feature => R.includes(R.prop('name', feature), wayMatches),
    R.always(1),
    R.always(0)
  );

  const nodeIdToResult = R.mapObjIndexed(
    (waysOfNodeFeatures, nodeId) => {
      return composeWithChainMDeep(1, [
        // Take the name of each feature
        // If we have duplicate names at this point, either because like-named streets meet or because
        // we have a fake intersection and osmConfig.disableNodesOfWayQueries is true so we can't remove them,
        // then rename matching features of the same name to name-wayId. Don't rename the first feature,
        // which represents the block name
        featureAndNames => {
          return Result.Ok(
            R.reduce(
              (acc, {feature, name}) => {
                return R.concat(
                  acc,
                  Array.of(R.when(
                    name => R.includes(name, acc),
                    // Add the id if we are on a second feature that is a duplicate name
                    // This doesn't cover the case where the 2nd and 3rd features have duplicate names
                    name => `${name}-${R.prop('id', feature)}`
                    )(name)
                  )
                );
              },
              [],
              featureAndNames
            )
          );
        },
        // Error terminally if we didn't generate two features (i.e. an intersection).
        // This should never happen when we can query OSM
        // If we disabled OSM querying because we are processing non OSM data
        features => {
          return R.cond([
            [
              // If we got 1 feature and disableNodesOfWayQueries is false, error
              features => {
                return R.both(
                  () => R.propEq('disableNodesOfWayQueries', false, osmConfig),
                  R.compose(R.gt(2), R.length)
                )(features);
              },
              features => {
                const error = `Feature ${JSON.stringify(features)} generated fewer than 2 intersection names. This should never happen`;
                log.warn(error);
                return Result.Error({error});
              }
            ],
            [
              // If we got 1 feature and disableNodesOfWayQueries is true, use the node id for the intersection name
              () => {
                return R.both(
                  () => R.propEq('disableNodesOfWayQueries', true, osmConfig),
                  R.compose(R.gt(2), R.length)
                )(features);
              },
              features => {
                return Result.Ok(R.concat(features, [{name: nodeId}]));
              }
            ],
            [
              // Otherwise returns the >1 features successfully
              R.T,
              features => {
                return Result.Ok(features);
              }
            ]
          ])(features);
        },
        // Sort by first matching a way and second alphabetically
        uniqueFeatures => Result.Ok(R.sortWith(
          [
            // Most points for matching the way
            R.descend(wayMatchWeight),
            // Small points for alphabetical name
            R.ascend(R.prop('name'))
          ],
          uniqueFeatures
        )),
        // If we have more than 2 features, get uniquely named features. If we have at least two unique street names
        // where the 2 have the same name, we only need to store the name once.
        // If we only have 2 features with the same name, keep both. This is for cases where two intersecting
        // streets have the same name.
        featuresWithNames => {
          return Result.Ok(R.when(
            featuresWithNames => R.compose(
              R.lte(2),
              R.length,
              R.uniq,
              R.map(R.prop('name'))
            )(featuresWithNames),
            featuresWithNames => R.uniqBy(
              R.prop('name'),
              featuresWithNames
            )
          )(featuresWithNames));
        },
        // Name features by the name tag or failing that the way id
        features => Result.Ok(R.map(
          feature => ({feature, name: nameOrIdOfFeature(feature)}),
          features
        ))
      ])(waysOfNodeFeatures);
    },
    limitedNodeIdToWayFeatures
  );
  // Return a Result.Error unless all results are Ok
  return R.ifElse(
    nodeIdToResult => R.compose(
      results => R.all(
        Result.Ok.hasInstance,
        results
      ),
      R.values
    )(nodeIdToResult),
    // Put the object in a Result.Ok without the internal Result.Oks
    nodeIdToResult => {
      return composeWithMap([
        // Map the values to the final format {data: {streets: streets}}
        R.map(streets => ({data: {streets}})),
        pairs => R.fromPairs(pairs),
        nodeIdToResult => traverseReduce(
          (accum, pair) => {
            return R.concat(accum, [pair]);
          },
          Result.Ok([]),
          objOfMLevelDeepMonadsToListWithPairs(1, Result.Ok, nodeIdToResult)
        )
      ])(nodeIdToResult);
    },
    // Errors in at least one value. Wrap in an Error to abandon
    nodeIdToResult => Result.Error({error: nodeIdToResult})
  )(nodeIdToResult);
};

/**
 * Given a list of node features creates a function that expects a way feature and finds the nodes features
 * that the way intersects
 * @param {Object} nodePointHash A list of nodes hashed by point geojson
 * @returns {[Object]} The matching nodes
 */
export const findMatchingNodes = R.curry((nodePointHash, wayFeature) => {
  return R.compose(
    nodes => compact(nodes),
    wayFeature => R.map(
      wayPointHash => R.propOr(null, wayPointHash, nodePointHash),
      hashWayFeature(wayFeature)
    )
  )(wayFeature);
});
