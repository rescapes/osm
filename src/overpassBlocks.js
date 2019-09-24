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


import {of, task} from 'folktale/concurrency/task';
import * as R from 'ramda';
import 'regenerator-runtime';
import * as Result from 'folktale/result';
import {nominatimLocationResultTask} from './nominatimLocationSearch';
import {queryOverpassWithLocationForStreetResultTask} from './overpassStreet';
import {
  aggregateLocation,
  featuresByOsmType,
  isResolvableAllBlocksLocation,
  isResolvableSingleBlockLocation
} from './locationHelpers';
import {locationToOsmAllBlocksQueryResultsTask} from './overpassAllBlocks';
import {fetchOsmRawTask, osmResultTask} from './overpassHelpers';
import {queryLocationForOsmSingleBlockResultTask} from './overpassSingleBlock';
import {
  resultToTaskNeedingResult,
  resultToTaskWithResult,
  strPathOr,
  mapToNamedResponseAndInputs,
  chainObjToValues
} from 'rescape-ramda';

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
 * Returns the geojson of the location. For country, state, city, neighborhood this is the OSM relation's geojson
 * when available. For streets it's the geojson of all the location blocks of the street within the neighborhood
 * or city
 * @param {Object} location The location
 * @returns {Task<Result<Object>>} The geojson
 */
export const osmLocationToLocationWithGeojsonResultTask = location => {
  // Look for a way if the location has a blockname specified. We don't currently support anything
  // more specific. In the future we can support nodes for intersections
  const locationType = R.cond([
    [R.compose(R.length, R.prop('intersections')), () => 'way'],
    [R.prop('street'), () => 'way'],
    [R.prop('country'), () => 'rel'],
    [R.T, () => {
      throw Error(`Location has no jurisdiction data needed to resolve it geospatially: ${JSON.stringify(location)}`);
    }]
  ])(location);
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
    resultToTaskWithResult(
      ({osmId}) => R.cond([
        [
          // Just get the relation for neighborhoods and above
          () => R.equals('rel', locationType),
          osmId => R.composeK(
            resultToTaskNeedingResult(
              // Here we always discard location's geojson, since the geojson result represents the entire
              // location, not components of it
              geojson => of(R.merge(location, {geojson}))
            ),
            osmId => osmResultTask(
              {name: 'fetchOsmRawTask', testMockJsonToKey: {osmId}},
              options => fetchOsmRawTask(options, `${locationType}(id:${osmId}) -> .${locationType};
.${locationType} out geom;`)
            )
          )(osmId)
        ],
        // TODO add single logic for a single block query
        [
          // Query for all blocks of the street.
          R.T,
          osmId => R.composeK(
            ({locationWithOsm, blockLocationsResult}) => resultToTaskNeedingResult(
              // Aggregate the geojson into a street-scope location
              blockLocations => of(aggregateLocation({}, locationWithOsm, blockLocations))
            )(blockLocationsResult),
            mapToNamedResponseAndInputs('blockLocationsResult',
              locationWithOsm => queryOverpassWithLocationForStreetResultTask(locationWithOsm)
            )
          )(R.merge(location, {osmId}))
        ]
      ])(osmId)
    ),
    // This logic says, if we have a blockname or more specific, allow us to fallback to the city without the
    // neighborhood is querying with the neighborhood fails. Sometimes the neighborhood isn't known and hides results
    // We can only query nomanatim up the neighborhood level. It gives garbage results for blocks
    location => nominatimLocationResultTask({allowFallbackToCity: R.not(R.isNil(R.prop('blockname', location)))}, location)
  )(location);
};


/**
 * Queries locationToOsmAllBlocksQueryResultsTask or queryLocationForOsmSingleBlockResultTask
 * @param {Object} osmConfig
 * @param {Object} osmConfig.forceOsmQuery
 * @param {Object} location A location that must be resolvable to a block or city/neighborhood area
 * @returns {Task<{Ok: Result.Ok, Error: Result.Error}>} Successful values in the Ok: [] array and errors in the Error: [] array.
 * Single block query will only have one result. The result value is {location, results} where location
 * is the location block object (either from the single block query or each block of multiple results) and
 * results are the OSM results {way: way features, node: node features, intersections: {keyed by node id valued by street names of the intersection}}
 */
export const queryLocationForOsmBlockOrAllResultsTask = (osmConfig, location) => {
  return R.cond([
    [
      location => isResolvableSingleBlockLocation(location),
      location => {
        return R.map(
          result => {
            // Match the format of locationToOsmAllBlocksQueryResultsTask
            return result.matchWith({
              Ok: ({value}) => ({Ok: [value]}),
              Error: ({value}) => ({Error: [value]})
            });
          },
          queryLocationForOsmSingleBlockResultTask(osmConfig, location)
        );
      }
    ],
    [
      location => isResolvableAllBlocksLocation(location),
      location => locationToOsmAllBlocksQueryResultsTask(location)
    ],
    [
      R.T,
      () => {
        throw new Error(`Location ${JSON.stringify(location)} is neither resolvable as a block nor city/neighborhood area`);
      }
    ]
  ])(location);
};