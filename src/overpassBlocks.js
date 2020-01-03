/**
 * Created by Andy Likuski on 2019.09.23
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */


import 'regenerator-runtime';
import {nominatimLocationResultTask} from './nominatimLocationSearch';
import {queryOverpassWithLocationForStreetResultTask} from './overpassStreet';
import {
  addressString,
  aggregateLocation,
  featuresByOsmType,
  isResolvableAllBlocksLocation,
  isResolvableSingleBlockLocation, wayFeatureNameOrDefault
} from './locationHelpers';
import {fetchOsmRawTask, osmResultTask} from './overpassHelpers';
import {
  resultToTaskNeedingResult,
  resultToTaskWithResult,
  mapToNamedResponseAndInputs,
  chainObjToValues,
  eqStrPathsAll,
  reqStrPathThrowing,
  toNamedResponseAndInputs,
} from 'rescape-ramda';
import {loggers} from 'rescape-log';
import {_wayEndPointToDirectionalWays} from './overpassBlockHelpers';
import {findMatchingNodes, hashNodeFeature, hashWayFeature, nodeMatchesWayEnd} from './overpassFeatureHelpers';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';
import * as Result from 'folktale/result';

const log = loggers.get('rescapeDefault');

/**
 * Returns the geojson of a relationship
 * @param {Number} osmId The osm id of the relationship
 * @returns {Task<Result<Object>>}
 */
export const osmRelationshipGeojsonResultTask = osmId => {
  return osmResultTask(
    {name: 'fetchOsmRawTask', testMockJsonToKey: {osmId}},
    options => fetchOsmRawTask(options, `
rel(id:${osmId}) -> .rel;
.rel out geom; 
    `)
  );
};


/**
 * Find componentLocations that match the filterLocation.
 * This is only for matching filterLocation streets to filterLocation blocks to blocks
 * @param componentLocations
 * @param filterLocation
 * @returns {f1}
 * @private
 */
const _matchingComponentLocations = (componentLocations, filterLocation) => R.filter(
  componentLocation => eqStrPathsAll(
    // If filterLocation has intersections we match on that property. Otherwise we just match on street
    R.ifElse(
      l => {
        return R.compose(R.length, strPathOr([], 'intersections'))(l);
      },
      () => ['country', 'state', 'city', 'neighborhood', 'intersections'],
      () => ['country', 'state', 'city', 'neighborhood', 'street']
    )(filterLocation),
    filterLocation,
    componentLocation
  ),
  R.defaultTo([], componentLocations)
);
/**
 * Returns the geojson of the location. For country, state, city, neighborhood this is the OSM relation's geojson
 * when available. For streets it's the geojson of all the location blocks of the street within the neighborhood
 * or city
 * @param {Object} osmConfig The osm config
 * @param {Object} osmConfig.minimumWayLength. The minimum lengths of way features to return. Defaults to 20 meters.
 * @param {[Object]} componentLocations Locations that might be components of location. If filterLocation
 * is a filtered to a street and some componentLocations match that street, uses the geojson of the
 * componentLocations instead of querying osm. If filterLocation is down to a block (has intersections) find
 * the componentLocation that matches and use it's geojson. For block level filterLocation, we must have a
 * matching componentLocation. We currently refuse to query OSM for a single block, preferring to supply all
 * blocks in componentLocations
 * @param {Object} filterLocation The location that is scoped to match 0 or more componentLocations.
 * @returns {Task<Result<Object>>} The geojson
 */
export const osmLocationToLocationWithGeojsonResultTask = (osmConfig, componentLocations, filterLocation) => {
  // Look for a way if the location has at least a street specified.
  // For greater scales look for a relation
  const locationType = R.cond([
    [R.compose(R.length, R.prop('intersections')), () => 'way'],
    [R.prop('street'), () => 'way'],
    [R.prop('country'), () => 'rel'],
    [R.T, () => {
      throw Error(`Location has no jurisdiction data needed to resolve it geospatially: ${JSON.stringify(filterLocation)}`);
    }]
  ])(filterLocation);
  const resultTypes = {
    way: ['ways', 'nodes'],
    rel: ['relations']
  }[locationType];

  return R.composeK(
    // Filters out any geojson that isn't a way or relation depending on what we're looking for.
    // Sometimes overpass returns center point nodes for relations that we don't want
    resultToTaskNeedingResult(
      location => of(R.over(
        R.lensPath(['geojson', 'features']),
        features => {
          return R.compose(
            // Flatten the values
            chainObjToValues(R.identity),
            // Pick the keys we want
            R.pick(resultTypes),
            // Bucket by type
            features => featuresByOsmType(features)
          )(features);
        },
        location
      ))
    ),

    // We need to handle different scopes. >= neighborhood scope is looking for a relation that outlines the area,
    // Street scope is looking for all the blocks of that street, where each block is ways and nodes
    // Intersections defined means that we're looking for a single block
    // In the future we need to handle way areas like plazas and parks
    resultToTaskWithResult(
      // Relationships
      ({osmId}) => R.cond([
        [
          // Just get the relation for neighborhoods and above
          () => R.equals('rel', locationType),
          osmId => R.composeK(
            resultToTaskNeedingResult(
              // Here we always discard location's geojson, since the geojson result represents the entire
              // location, not components of it
              geojson => of(R.merge(filterLocation, {geojson}))
            ),
            osmId => osmResultTask(
              {name: 'fetchOsmRawTask', testMockJsonToKey: {osmId}},
              options => fetchOsmRawTask(options, `${locationType}(id:${osmId}) -> .${locationType};
.${locationType} out geom;`)
            )
          )(osmId)
        ],
        // Single Block
        [
          () => R.compose(R.length, R.prop('intersections'))(filterLocation),
          osmId => of(R.ifElse(
            // Do we have a component location that matches the block?
            ({blockLocations}) => R.length(blockLocations),
            // If so just use that location's geojson
            ({blockLocations}) => Result.Ok(
              R.head(blockLocations)
            ),
            // Otherwise error, we don't want to query single blocks here. Matching blocks should by supplied
            // in componentLocations
            ({locationWithOsm}) => Result.Error({
              location: locationWithOsm,
              message: 'No matching componentLocations found for this block location'
            })
          )({
            locationWithOsm: R.merge(filterLocation, {osmId}),
            blockLocations: _matchingComponentLocations(componentLocations, filterLocation)
          }))
        ],
        // Streets
        [
          // Query for all blocks of the street.
          R.T,
          osmId => R.composeK(
            // Aggregate the geojson of all block features into a street-scope location
            ({locationWithOsm, blockLocationsResult}) => resultToTaskNeedingResult(
              blockLocations => of(aggregateLocation(osmConfig, locationWithOsm, blockLocations))
            )(blockLocationsResult),

            // Collect blocks from the matching componentLocations or by querying OSM
            mapToNamedResponseAndInputs('blockLocationsResult',
              ({locationWithOsm, blockLocations}) => R.ifElse(
                // Do we have component locations that match the street?
                R.length,
                // If so just use those locations geojson, hoping we have all we need
                matchingComponentLocations => of(Result.Ok(
                  matchingComponentLocations
                )),
                // Otherwise query OSM and create the blockLocations
                () => queryOverpassWithLocationForStreetResultTask(osmConfig, locationWithOsm)
              )(blockLocations)
            )
          )({
            locationWithOsm: R.merge(filterLocation, {osmId}),
            blockLocations: _matchingComponentLocations(componentLocations, filterLocation)
          })
        ]
      ])(osmId)
    ),

    // This logic says, if we have a blockname or more specific, allow us to fallback to the city without the
    // neighborhood is querying with the neighborhood fails. Sometimes the neighborhood isn't known and hides results
    // We can only query nomanatim up the neighborhood level. It gives garbage results for blocks
    R.unless(
      // Don't repeat search if the location already knows its osmId
      R.prop('osmId'),
      location => nominatimLocationResultTask(
        {
          allowFallbackToCity: R.not(R.isNil(R.prop('blockname', location)))
        },
        location
      )
    )
  )(filterLocation);
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
      ({wayIdToNodes, wayIdToWay}) => R.reduce(
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
        R.toPairs(wayIdToNodes))
    ),
    toNamedResponseAndInputs('wayIdToWayPoints',
      // Map the way id to its points
      ({ways}) => R.fromPairs(R.map(
        wayFeature => [
          reqStrPathThrowing('id', wayFeature),
          hashWayFeature(wayFeature)
        ],
        ways
      ))
    ),
    toNamedResponseAndInputs('wayIdToNodes',
      // Hash all way ids by intersection node if any waynode matches or
      // is an area-way (pedestrian area) within 5m  <-- TODO
      ({nodePointToNode, ways}) => {
        return R.fromPairs(R.map(
          wayFeature => [reqStrPathThrowing('id', wayFeature), findMatchingNodes(nodePointToNode, wayFeature)],
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
      ({nodeIdToNode}) => R.map(
        nodeFeature => hashNodeFeature(nodeFeature),
        nodeIdToNode
      )
    ),
    toNamedResponseAndInputs('nodePointToNode',
      // Hash the node points to match ways to them
      ({nodes}) => R.indexBy(
        nodeFeature => hashNodeFeature(nodeFeature),
        nodes
      )
    ),
    toNamedResponseAndInputs('nodeIdToNode',
      // Hash intersection nodes by id. These are all intersections
      ({nodes}) => R.indexBy(
        reqStrPathThrowing('id'),
        nodes
      )
    )
  )({ways, nodes});
};
/**
 * Returns true if the given nodeFeature connects at least two wayFeatures that have different street names.
 * Ways often end and start at a node where there isn't an intersection, and we don't want to treat these
 * nodes as intersections that break up blocks
 * @param {[Object]} wayFeatures List of way features which intersect the node
 * @param {Object} nodeFeature The node feature to test
 * @returns {Boolean} True if 1) There are no ways (maybe node of a way araa, in any case not enough info to say it's
 * not real)
 * 2) there are more than 2 ways,
 * 3) there at least two ways with different street names intersect the node or
 * 4) if the node point is not at the end of at least on way. This means it has to be a real intersection for Overpass
 * to have
 * returned it.
 */
export const isRealIntersection = (wayFeatures, nodeFeature) => R.anyPass([
  // Return true if there are no way features because it's a node of a way area. We never eliminate these
  wayFeatures => R.isEmpty(wayFeatures),
  // Either more than 2 ways
  wayFeatures => R.compose(R.lt(2), R.length)(wayFeatures),
  // The node point is not at the end of a way.
  wayFeatures => R.any(
    wayFeature => R.complement(nodeMatchesWayEnd)(wayFeature, nodeFeature),
    wayFeatures
  ),
  // Or more than 1 distinct way names.
  // If the way doesn't have a name default to the node id, which is to say pretend they have the same name.
  wayFeatures => R.compose(
    R.lt(1),
    R.length,
    R.uniq,
    R.map(
      wayFeature => wayFeatureNameOrDefault(reqStrPathThrowing('id', nodeFeature), wayFeature)
    )
  )(wayFeatures)
])(wayFeatures);

/**
 * Trims the given way to the index of the nodeObj inclusive
 * @param {Object} nodeObj
 * @param {Number} nodeObj.index The node index of the node in the way
 * @param {Object} nodeObj.node The node
 * @param {Object} way The way to trip
 * @returns {Object} The way trimmed ot the node inclusive
 */
export const trimWayToNodeObj = (nodeObj, way) => R.over(
  R.lensPath(['geometry', 'coordinates']),
  // Slice the coordinates to the found node index
  // (+2 because the index is based on remainingWayPoints and we want to be inclusive)
  coordinates => R.slice(0, R.prop('index', nodeObj) + 2, coordinates),
  way
);

/**
 * Trims the given way to the index of the nodeObj inclusive
 * @param {Object} node The node
 * @param {Object} way The way to trip
 * @returns {Object} The way trimmed ot the node inclusive
 */
export const trimWayToNode = (node, way) => {
  // Take the tail because trimWayToNodeObj expects the index based on the tail
  const index = R.indexOf(hashNodeFeature(node), R.tail(hashWayFeature(way)));
  return trimWayToNodeObj({node, index}, way);
};
