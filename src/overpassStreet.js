/**
 * Created by Andy Likuski on 2019.09.20
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  configuredHighwayWayFilters,
  osmEquals,
  osmIdToAreaId
} from './overpassHelpers';
import * as R from 'ramda';
import {
  pickDeepPaths,
  mapToNamedResponseAndInputs
} from 'rescape-ramda';
import {of} from 'folktale/concurrency/task';
import * as Result from 'folktale/result';
import {loggers} from 'rescape-log';
import {commonStreetOfLocation, locationAndOsmBlocksToLocationWithGeojson} from './locationHelpers';
import {_queryOverpassForAllBlocksResultsTask} from './overpassAllBlocksHelpers';

const log = loggers.get('rescapeDefault');

/**
 * Given a location with an osmId included, query the Overpass API and cleanup the results to get all the blocks
 * for the given street for the part of the street in the given neighborhood, city, state, country, etc.
 * @param {Object} osmConfig The osm config
 * @param {Object} osmConfig.minimumWayLength. The minimum lengths of way features to return. Defaults to 20 meters.
 * @param {Object} locationWithOsm A Location object that also has an osmId to limit the area of the queries.
 * @returns {Task<Result<[Object]>>} Result.Ok with the successful location blocks containing geojson
 * The results contain nodes and ways of the streets, where nodes are where intersections occur
 * There must be at least on way and possibly more
 * Some blocks have more than two nodes if they have multiple divided ways.
 */
export const queryOverpassWithLocationForStreetResultTask = (osmConfig, locationWithOsm) => {
  return R.composeK(
    // Take the positive results and combine them with the location, which has corresponding intersections
    ({Ok: locationsAndResults}) => of(Result.Ok(R.map(
      ({location, results}) => locationAndOsmBlocksToLocationWithGeojson(location, results),
      locationsAndResults
    ))),
    // Query for all blocks matching the street
    ({locationWithOsm, queries: {way, node}}) => _queryOverpassForAllBlocksResultsTask(

      // forceWaysOfNodesQueries  is needed for the street query because we don't get all the ways connected to each
      // node of the street. We need to know how many ways each node has so we know if it's really an intersection node,
      // rather than just a point where the way changes.
      R.merge({forceWaysOfNodeQueries: true}, osmConfig),
      {location: locationWithOsm, way, node}
    ),
    // Build an OSM query for the location. We have to query for ways and then nodes because the API muddles
    // the geojson if we request them together
    mapToNamedResponseAndInputs('queries',
      // Location l, String w, String n: l -> <way: w, node: n>
      ({locationWithOsm}) => of(
        R.fromPairs(R.map(
          type => [
            type,
            // We put this in an array since _queryOverpassForAllBlocksResultsTask expects
            // way and node to have an array of queries. It needs arrays of queries for breaking up large
            // areas into small queries. We don't do that here since we're trying to find a single street
            [
              _constructStreetQuery(
                osmConfig,
                {type},
                locationWithOsm
              )
            ]
          ],
          ['way', 'node']
        ))
      )
    )
  )({locationWithOsm});
};

/**
 * Construct a query for Overpass to find the entire street specified in one or both of the intersection arrays
 * in intersections
 * Explicit OSM ids are required to limit the query to a city or neighbhorhood
 * @param {Object} osmConfig
 * @param {String} type 'way' or 'node'
 * @param {Object} locationWithOsm
 * @param {String} [locationWithOsm.street] The street to query for. If not specified then intersections must be sepecified
 * @param {[[String]]} [locationWithOsm.intersections] The one or two intersections are an
 * array of at least on complete street names. Example [['Main Street', 'Chestnut Street'],
 * ['Main Street', 'Orchard Way']]  or [['Main Street']], [['Main Street']]
 * Street abbreviations are not allowed. They will not be matched by OpenStreetMap.
 * @param {String} locationWithOsm.osmId OSM id to be used to constrain the area of the query. This id corresponds
 * to a neighborhood or city.
 * @returns {string} The complete Overpass query string
 */
const _constructStreetQuery = (osmConfig, {type}, locationWithOsm) => {

  const {street, intersections, osmId} = locationWithOsm;
  // If a street is specified, use it. Otherwise extract the common street from the intersections
  const blockname = street || commonStreetOfLocation(locationWithOsm, intersections);

  if (R.isNil(blockname)) {
    throw Error("Improper configuration. Street or intersections must be non-null");
  }

  // The Overpass Area Id is based on the osm id plus this Overpass magic number
  const areaId = osmIdToAreaId(osmId);
  // Query for all the ways and just the ways of the street
  // Nodes must intersect a street from .ways and one from the other ways
  return `way(area:${areaId})${configuredHighwayWayFilters(osmConfig)} -> .allWays;
way.allWays${osmEquals('name', blockname)} -> .ways;
(.allWays; - .ways;) -> .otherWays;
node(w.ways)(w.otherWays) -> .nodes;
.${type}s out geom;
      `;
};
