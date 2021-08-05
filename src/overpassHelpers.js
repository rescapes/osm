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
import {featuresByOsmType, isLatLng} from './locationHelpers.js';
import {
  reqStrPathThrowing,
  taskToResultTask,
  toNamedResponseAndInputs,
  traverseReduceWhile,
  toMergedResponseAndInputs, strPathOr, reqPathThrowing, compact
} from '@rescapes/ramda';
import {loggers} from '@rescapes/log';
import {findMatchingNodes, hashNodeFeature, hashWayFeature} from './overpassFeatureHelpers.js';
import * as R from 'ramda';
import T from 'folktale/concurrency/task/index.js';
import { createHmac } from 'crypto'


const {of, task} = T;
import Result from 'folktale/result/index.js';

import queryOverpass from 'query-overpass';
import os from 'os';

const log = loggers.get('rescapeDefault');

import Memcached from 'memcached'

const memcached = new Memcached('localhost:11211');

// When doing OSM queries with lat/lon points search for nodes withing this many meters of them
// The idea is that differences between Google, OSM, and manually marking of intersections should
// be within 15 meters. But this might have to be greater.
export const AROUND_LAT_LON_TOLERANCE = 15;
export const AREA_MAGIC_NUMBER = 3600000000;
export const CACHE_LIFETIME = 2592000 // max
/**
 * Converts the osm id string to an area id string
 */
export const osmIdToAreaId = osmId => (parseInt(osmId) + AREA_MAGIC_NUMBER).toString();

// TODO make these accessible for external configuration
const overpassServers = compact(R.split(/\s*[,;\s]\s*/, process.env.OSM_SERVERS || ''));

let i = 0;
const roundRobinOsmServers = () => {
  return overpassServers[i++ % R.length(overpassServers)]
};
export const nominatimServers = ['nominatim.openstreetmap.org'];
let j = 0
export const roundRobinNoimnatimServers = () => {
  return overpassServers[j++ % R.length(nominatimServers)]
};


/**
 * Translates to OSM condition that must be true
 * @param {string} prop The feature property that must be true
 * @return {string} '["prop"]'
 */
export const osmAlways = prop => `[${prop}]`;

/**
 * Translates to OSM condition that must be true
 * @param {string} prop The feature property that must be true
 * @return {string} '[!"prop"]'
 */
export const osmNever = prop => `[!${prop}]`;


/**
 * Translates to OSM not equal condition
 * @param {string} prop The feature property that must not be euqal to the value
 * @param {object} value Value that toStrings appropriately
 * @return {string} '["prop" != "value"]'
 */
export const osmNotEqual = (prop, value) => osmCondition('!=', prop, value);

/**
 * Not equal statement using a tag function for if: statements
 * @param prop
 * @param value
 * @returns {string}
 */
export const osmNotEqualWithTag = (prop, value) => osmTCondition('!=', prop, value);
/**
 * Equal statement using a tag function for if: statements
 * @param prop
 * @param value
 * @returns {string}
 */
export const osmEqualWithTag = (prop, value) => osmTCondition('==', prop, value);

/**
 * Translates to OSM equals condition
 * @param {string} prop The feature property that must not be euqal to the value
 * @param {object} value Value that toStrings appropriately
 * @return {string} '["prop" = "value"]'
 */
export const osmEquals = (prop, value) => osmCondition('=', prop, value);

/**
 * Translates to OSM like condition
 * @param prop
 * @param value
 * @return {string}
 */
export const osmLike = (prop, value) => osmCondition('~', prop, value);

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
 * Conditional statement using the tag operator. Must be used inside an if: or similar
 * @param operator
 * @param prop
 * @param value
 * @returns {string}
 */
export const osmTCondition = (operator, prop, value) => `t["${prop}"] ${operator} "${value}"`;

/**
 * Constructs conditions for a certain OSM type, 'node', 'way', or 'relation'
 * @param {Array} conditions List of query conditions, each in the form '["prop"]' or '["prop" operator "value"]'
 * @param {String} type OSM type
 * @return {*} OSM Query statement for querying a certain type by conditions
 */
export const filtersForType = R.curry((conditions, type) => `${type}${R.join('', conditions)};`);

/**
 * Given an array of bounds lat, lon, lat, lon, return them as a string for osm
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

/**
 * Uses an overpass if expression for boolean logic
 * @param expression
 * @returns {string}
 */
export const osmIf = expression => `(if: ${expression})`;

/**
 * Joins any number of expressions with &&s
 * @param expressions
 */
export const osmAnd = expressions => R.join(' && ', expressions);
/**
 * Joins any number of expressions with ||s
 * @param expressions
 */
export const osmOr = expressions => R.join(' || ', expressions);


/**
 * Creates a query buffer filter around a point (around: radius, lat, lon)
 * @param radius
 * @param point
 * @returns {string}
 */
export const aroundPointDeclaration = (radius, point) => {
  return `(around: ${radius}, ${R.join(', ', R.reverse(reqStrPathThrowing('geometry.coordinates', point)))})`;
};

const highwayWayFilters = [
  osmAlways('highway'),
  osmNever('building'),
  osmNotEqual('access', 'delivery'),
  osmNotEqual('highway', 'path'),
  osmNotEqual('highway', 'footway'),
  // TODO This should be configurable depending on what we want
  osmNotEqual('highway', 'service'),
  osmNotEqual('building', 'yes'),
  osmNotEqual('highway', 'elevator'),
  // For some uses we need motorways, but it's off by default
  osmNotEqual('highway', 'motorway'),
  osmNotEqual('highway', 'motorway_link'),
  // We're not currently interested in driveways, but might be in the future
  osmNotEqual('highway', 'driveway'),
  // We don't want to treat cycleways separate from the roads they are on
  osmNotEqual('highway', 'cycleway'),
  // We might be able to support some steps in the future
  osmNotEqual('highway', 'steps'),
  // Can't deal with things that don't exist yet
  osmNotEqual('highway', 'proposed'),
  // Crosswalks
  osmNotEqual('footway', 'crossing'),
  // Sidewalks along a highway, these might be useful for some contexts
  osmNotEqual('footway', 'sidewalk'),
  osmNotEqual('service', 'parking_aisle'),
  osmNotEqual('service', 'driveway'),
  osmNotEqual('service', 'drive-through'),
  // One of these must not be true
  osmIf(
    osmOr(
      [
        osmNotEqualWithTag('highway', 'service'),
        osmNotEqualWithTag('access', 'private')
      ]
    )
  ),
  // Both of these cannot be true
  osmIf(
    osmOr(
      [
        osmNotEqualWithTag('highway', 'footway'),
        osmNotEqualWithTag('indoor', 'yes')
      ]
    )
  )
];

export const configuredHighwayWayFilters = osmConfig => R.ifElse(
  R.propOr(false, 'includePedestrianArea'),
  () => R.join('', highwayWayFilters),
  () => highwayWayFiltersNoAreas
)(osmConfig);

// Filter to get roads and paths that aren't sidewalks or crossings and not areas
export const highwayWayFiltersNoAreas = R.join('',
  R.concat([
    // No areas
    osmNotEqual('area', 'yes')
  ], highwayWayFilters)
);

// Filter to get roads and paths that aren't sidewalks or crossings but are areas
export const highwayWayFiltersOnlyAreas = R.join('',
  R.concat([
    // No areas
    osmEquals('area', 'yes')
  ], highwayWayFilters)
);

/**
 * Street limitations on nodes.
 * Add more as they are discovered
 * For instance they can't be tagged as traffic signals!
 */
export const highwayNodeFilters = R.join('', [
    // This is allowed, Traffic signals are sometimes the node of the way
    // osmNotEqual('traffic_signals', 'signal'),
    // This is allowed. Nodes marked as highway='traffic_signals' can still be the nodes used by the way
    // osmNotEqual('highway', 'traffic_signals')
    // Also allowed, just describes the type of crossing
    //osmNever('crossing')
  ]
);

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
 * Runs an OpenStreetMap task. Because OSM servers are picky about throttling,
 * this allows us to try all servers sequentially until one gives a result
 * @param {Object} config
 * @param {Number} [config.tries] Number of tries to make. Defaults to the number of servers, but minimum 3 tries
 * @param {String} config.name The name taskFunc for logging purposes
 * @param {Object} config.context For errors and mock testing only. Context to identify information about the request
 * and to mock the desired results in __mocks__/query-overpass.js
 * @param taskFunc
 * @returns {Task<Result<Object>>} The response in a Result.Ok or errors in Result.Error
 */
export const osmResultTask = ({tries, name, context}, taskFunc) => {
  const attempts = R.min(3, tries || R.length(overpassServers));
  return traverseReduceWhile(
    {
      // Fail the _predicate to stop searching when we have a Result.Ok
      predicate: (previousResult, result) => R.complement(Result.Ok.hasInstance)(result),
      // Take the the last accumulation after the _predicate fails
      accumulateAfterPredicateFail: true
    },

    // If we get a Result.Ok, just return it. The first Result.Ok we get is our final value
    // When we get Result.Errors, concat them for reporting
    (previousResult, result) => result.matchWith({
      Error: ({value}) => {
        log.warn(`Osm query failed on server ${value.server} with ${JSON.stringify(value.value)}`);
        return previousResult.mapError(R.append(value));
      },
      Ok: R.identity
    }),
    // Starting condition is failure
    of(Result.Error([])),
    // Create the task with each function. We'll only run as many as needed to get a result
    R.times(attempt => {
      const server = roundRobinOsmServers();
      // Convert rejected tasks to Result.Error and resolved tasks to Result.Ok.
      // For errors wrap the server into the value so we can't report the erring server
      return taskToResultTask(
        //taskFunc({overpassUrl: server})
        task(({resolve}) => {
          log.debug(`Starting OSM task ${name} attempt ${attempt + 1} of ${attempts} on server ${server}`);
          return resolve(server);
        }).chain(server => {
          return taskFunc({overpassUrl: server, context: context});
        }).orElse(error => {
          return of({
            error,
            name,
            context
          });
        })
      ).map(v => {
        return v.mapError(e => ({value: e, server}));
      });
    }, attempts)
  );
};

const secret = 'enwandagon';
/**
 * memcached needs a string without whitespace up to 250 chars
 * @param key
 * @returns {*}
 */
const createWellFormedKey = key => {
  // Get rid of all spaces, control characters, etc using base64
  const encoded = global.Buffer.from(key).toString('base64')
  if (R.lt(250, R.length(encoded))) {
    return createHmac('sha256', secret)
      .update(key)
      .digest('hex');
  }
  return encoded
}

/**
 * From the given query create a Task to run the query
 * @param {Object} options
 * @param {Number} options.sleepBetweenCalls: Optional value to slow down calls. This only matters when
 * multiple queries are running
 * @param {String} query The complete OSM query string
 * @return {Task} A task that calls query-overpass with the query and resolves to a query response
 */
export const queryTask = (options, query) => {
  // Wrap overpass helper's execution and callback in a Task
  return task(resolver => {
    // Possibly delay each call to query_overpass to avoid request rate threshold
    // Since we are executing calls sequentially, this will pause sleepBetweenCalls before each call
    setTimeout(() => {
        log.debug(`\n\nRequesting OSM query:\n${query}\n\n`);
        const key = createWellFormedKey(query)
        memcached.get(key, function (err, data) {
          if (err) {
            console.error(`Error trying to fetch from memcached ${JSON.stringify(err)}`)
          }
          if (data) {
            console.log(`Found cached query data in memcached for query ${query}`);
            resolver.resolve(data)
          } else {
            queryOverpass(query, (error, data) => {
              if (!error) {
                log.debug(`\n\nSuccessful Response from OSM query:\n${query}\nGot the following feature counts: ${
                  JSON.stringify(R.map(R.length, featuresByOsmType(strPathOr([], 'features', data))))
                } features`);
                memcached.set(key, data, CACHE_LIFETIME, function (err) {
                  if (err) {
                    log.error(`Error: ${JSON.stringify(err)} caching to memcached query ${query}`);
                  }
                });
                resolver.resolve(data);
              } else {
                log.warn(`\n\nFailure Response from OSM query:\n${query}\n\n`);
                resolver.reject({error, query});
              }
            }, options);
          }
        });

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
 * @returns {Task} A Task that resolves to the query reponse or rejects with an Error
 */
export const fetchOsmRawTask = R.curry((options, query) => {
  // Default settings. Set timeout and maxsize to large values
  const settings = options.settings || [`[timeout:900][maxsize:1073741824][out:json]`];
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
  return queryTask(options, `${appliedSettings}${query}`).orElse(
    error => {
      // Return Error context
      return {
        error,
        options,
        query
      };
    }
  );
});

/**
 * Creates a filter to only accept nodes around a given point that have at 2 least ways attached to them,
 * meaning they are intersections
 * @param {Object} osmConfig
 * @param {[String]} intersection Optional intersection represented by {data: streets: [...]} where streets
 * are 2 or more streets representing the intersection
 * pair of street names representing the intersection to limit the ways of the node
 * to those ways with those names
 * @param {String} around: e.g. '(around: 10, 40.6660816, -73.8057879)'
 * @param {String} outputNodeName e.g. 'nodes1'
 * @param {boolean} leaveForAndIfBlocksOpen Default false. Leave the code blocks open so we can put another loop
 * for another point inside these loops.
 * @returns {string} The osm string
 * @private
 */
export const _filterForIntersectionNodesAroundPoint = (osmConfig, intersection, around, outputNodeName, leaveForAndIfBlocksOpen = false) => {
  const possibleNodes = `${outputNodeName}Possible`;
  const oneOfPossibleNodes = `oneOf${outputNodeName}Possible`;
  const waysOfOneOfPossibleNodes = `waysOfOneOf${outputNodeName}Possible`;
  // If the intersection with streets is given use it to limit the ways to the streets of the intersection
  const intersectionNamesFilter = R.ifElse(
    intersection => R.length(strPathOr([], 'data.streets', intersection)),
    intersection => osmIf(
      osmOr(
        R.map(
          street => osmEqualWithTag('name', street),
          reqStrPathThrowing('data.streets', intersection)
        )
      )
    ),
    () => ''
  )(intersection);
  return `node${around}${highwayNodeFilters} -> .${possibleNodes};
foreach.${possibleNodes} ->.${oneOfPossibleNodes}
{
  way(bn.${oneOfPossibleNodes})${intersectionNamesFilter}${configuredHighwayWayFilters(osmConfig)}->.${waysOfOneOfPossibleNodes};
  // If we have at least 2 ways, we have an intersection
  if (${waysOfOneOfPossibleNodes}.count(ways) >= 2)
  {
  .${oneOfPossibleNodes} -> .${outputNodeName};
  ${leaveForAndIfBlocksOpen ? '' : '} };'}`;
};

/**
 * Creates data structures that relate the nodes and ways
 * @param {[Object]} ways Way features
 * @param {[Object]} nodes Node features
 * @returns {Object} nodeIdToNode, nodePointToNode, nodeIdToNodePoint, wayIdToWay, wayIdToNodes, wayIdToWayPoints, nodeIdToWays, wayEndPointToDirectionalWays
 * @private
 */
export const _calculateNodeAndWayRelationships = ({ways, nodes}) => {
  return R.compose(
    toNamedResponseAndInputs('wayEndPointToDirectionalWays',
      ({ways, wayIdToWayPoints, nodePointToNode}) => _wayEndPointToDirectionalWays({
        ways,
        wayIdToWayPoints,
        nodePointToNode
      })
    ),
    toNamedResponseAndInputs('nodeIdToWays',
      // "Invert" wayIdToNodes to create nodeIdToWays
      ({wayIdToNodes, wayIdToWay}) => {
        return R.reduce(
          (hash, [wayId, nodes]) => {
            const nodeIds = R.map(reqStrPathThrowing('id'), nodes);
            return R.reduce(
              // Add the wayId to the nodeId key
              (hsh, nodeId) => R.over(
                // Lens to get the node id in the hash
                R.lensProp(nodeId),
                // Add the way to the list of the nodeId
                wayList => R.concat(wayList || [], [R.prop(wayId, wayIdToWay)]),
                hsh
              ),
              hash,
              nodeIds
            );
          },
          {},
          R.toPairs(wayIdToNodes));
      }
    ),
    toNamedResponseAndInputs('wayIdToWayPoints',
      // Map the way id to its points
      ({ways}) => {
        return R.fromPairs(R.map(
          wayFeature => [
            reqStrPathThrowing('id', wayFeature),
            hashWayFeature(wayFeature)
          ],
          ways
        ));
      }
    ),
    toNamedResponseAndInputs('wayIdToNodes',
      // Hash all way ids by intersection node if any waynode matches or
      // is an area-way (pedestrian area) within 5m  <-- TODO
      ({nodePointToNode, ways}) => {
        return R.fromPairs(R.map(
          wayFeature => {
            return [
              // way id becomes key
              reqStrPathThrowing('id', wayFeature),
              // nodes matching the way are values
              findMatchingNodes(nodePointToNode, wayFeature)
            ];
          },
          ways
        ));
      }
    ),
    toNamedResponseAndInputs('wayIdToWay',
      // way id to way
      ({ways}) => R.indexBy(
        reqStrPathThrowing('id'),
        ways
      )
    ),
    toNamedResponseAndInputs('nodeIdToNodePoint',
      // Hash intersection nodes by id. These are all intersections
      ({nodeIdToNode}) => {
        return R.map(
          nodeFeature => hashNodeFeature(nodeFeature),
          nodeIdToNode
        );
      }
    ),
    toNamedResponseAndInputs('nodePointToNode',
      // Hash the node points to match ways to them
      ({nodes}) => {
        return R.indexBy(
          nodeFeature => hashNodeFeature(nodeFeature),
          nodes
        );
      }
    ),
    toNamedResponseAndInputs('nodeIdToNode',
      // Hash intersection nodes by id. These are all intersections
      ({nodes}) => {
        return R.indexBy(
          reqStrPathThrowing('id'),
          nodes
        );
      }
    )
  )({ways, nodes});
};


/**
 *
 * @param ways
 * @param wayIdToWayPoints
 * @param nodePointToNode
 * @private
 */
export const _wayEndPointToDirectionalWays = ({ways, wayIdToWayPoints, nodePointToNode}) => {
  return R.compose(
    // way end points will usually be unique, but some will match two ways when two ways meet at a place
    // that is not an intersection
    // This produces {wayEndPoint: [...ways with that end point], ...}
    endPointToWayPair => R.reduceBy(
      (acc, [endPoint, way]) => R.concat(acc, [way]),
      [],
      ([endPoint]) => endPoint,
      endPointToWayPair
    ),
    R.chain(
      wayFeature => {
        const wayCoordinates = reqPathThrowing([R.prop('id', wayFeature)], wayIdToWayPoints);
        return R.compose(
          endPointObjs => R.map(({endPoint, way}) => [endPoint, way], endPointObjs),
          // Filter out points that are already nodes
          endPointObjs => R.filter(
            ({endPoint}) => R.not(R.propOr(false, endPoint, nodePointToNode)),
            endPointObjs
          ),
          // Get the first and last point of the way
          wayCoordinates => R.map(
            prop => (
              {
                endPoint: R[prop](wayCoordinates),
                way: R.when(
                  () => R.equals('tail', prop),
                  // For the tail end point, created a copy of the wayFeature with the coordinates reversed
                  // This makes it easy to traverse the ways from their endPoints.
                  // Since we hash ways independent of directions, we'll still detect ways we've already traversed
                  wayFeature => R.over(R.lensPath(['geometry', 'coordinates']), R.reverse, wayFeature)
                )(wayFeature)
              }
            ),
            ['head', 'last']
          )
        )(wayCoordinates);
      }
    )
  )(ways);
};
