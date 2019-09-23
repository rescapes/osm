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

import {highwayNodeFilters, highwayWayFilters, osmEquals, osmIdToAreaId} from './overpassHelpers';
import * as R from 'ramda';
import {
  pickDeepPaths,
  mapToNamedResponseAndInputs
} from 'rescape-ramda';
import {of} from 'folktale/concurrency/task';
import * as Result from 'folktale/result';
import {loggers} from 'rescape-log';
import {commonStreetOfLocation} from './locationHelpers';
import {_queryOverpassForAllBlocksResultsTask} from './overpassAllBlocks';

const log = loggers.get('rescapeDefault');

/**
 * Given a location with an osmId included, query the Overpass API and cleanup the results to get a single street
 * of geojson representing the location's one or two intersections common street (or only street)
 * @param {Object} locationWithOsm A Location object that also has an osmId to limit the area of the queries.
 * @returns {Task<Result<Object>>} Result.Ok or a Result.Error in the form {error}
 * The results contain nodes and ways of the streets, where nodes are where intersections occur
 * There must be at least on way and possibly more
 * Some blocks have more than two nodes if they have multiple divided ways.
 */
export const queryOverpassWithLocationForSingleSteetResultTask = locationWithOsm => {
  return R.composeK(
    // Query for all blocks matching the street
    ({locationWithOsm, queries: {way, node}}) => _queryOverpassForAllBlocksResultsTask(
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
            _constructSingleStreetQuery(
              {type},
              // These are the only properties we might need from the location
              pickDeepPaths(['street', 'intersections', 'osmId'], locationWithOsm)
            )
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
 * @param {String} type 'way' or 'node'
 * @param {String} [street] The street to query for. If not specified then intersections must be sepecified
 * @param {[[String]]} [intersections] The one or two intersections are an
 * array of at least on complete street names. Example [['Main Street', 'Chestnut Street'],
 * ['Main Street', 'Orchard Way']]  or [['Main Street']], [['Main Street']]
 * Street abbreviations are not allowed. They will not be matched by OpenStreetMap.
 * @param {String} osmId OSM id to be used to constrain the area of the query. This id corresponds
 * to a neighborhood or city.
 * @returns {string} The complete Overpass query string
 */
const _constructSingleStreetQuery = ({type}, {street, intersections, osmId}) => {

  // If a street is specified, use it. Otherwise extract the common street from the intersections
  const blockname = street || commonStreetOfLocation(intersections);

  if (R.isNil(blockname)) {
    throw Error("Improper configuration. Street or intersections must be non-null");
  }

  // The Overpass Area Id is based on the osm id plus this Overpass magic number
  const areaId = osmIdToAreaId(osmId);
  // Query for all the ways and just the ways of the street
  // Nodes must intersect a street from .ways and one from the other ways
  return `way(area:${areaId})${highwayWayFilters} -> .allWays;
way.allWays${osmEquals('name', blockname)} -> .ways;
(.allWays; - .ways;) -> .otherWays;
node(w.ways)(w.otherWays)${highwayNodeFilters} -> .nodes;
.${type}s out geom;
      `;
};
