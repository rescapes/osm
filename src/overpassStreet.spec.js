import {
  defaultRunToResultConfig,
  reqStrPathThrowing,
  mapToNamedResponseAndInputs,
  resultToTaskWithResult,
  mapResultTaskWithOtherInputs, defaultRunConfig
} from 'rescape-ramda';
import {osmLocationToLocationWithGeojsonResultTask, osmRelationshipGeojsonResultTask} from './overpassBlocks';
import * as R from 'ramda';
import {queryOverpassWithLocationForStreetResultTask} from './overpassStreet';
import {nominatimLocationResultTask} from './nominatimLocationSearch';
import {of} from 'folktale/concurrency/task';
import {locationToOsmAllBlocksQueryResultsTask} from './overpassAllBlocks';
import {locationsToGeojson} from './overpassBlockHelpers';

/**
 * Created by Andy Likuski on 2019.09.23
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

describe('overpassStreet', () => {
  test('osmLocationToRelationshipGeojsonResultTaskStreet1', done => {
    expect.assertions(1);
    const errors = [];

    osmLocationToLocationWithGeojsonResultTask({}, [], {
      country: 'USA',
      state: 'NY',
      city: 'New York',
      neighborhood: 'Battery Park City',
      street: 'Chambers Street'
    }).run().listen(defaultRunToResultConfig({
      onResolved: location => {
        expect(R.length(reqStrPathThrowing('geojson.features', location))).toEqual(13);
      }
    }, errors, done));
  }, 200000);

  test('osmLocationToRelationshipGeojsonResultTaskStreet2', done => {
    expect.assertions(1);
    const errors = [];

    osmLocationToLocationWithGeojsonResultTask({}, [], {
      country: "Norway",
      state: "",
      city: "Alesund",
      neighborhood: "Downtown",
      street: "Grimmergata"
    }).run().listen(defaultRunToResultConfig({
      onResolved: location => {
        expect(R.length(reqStrPathThrowing('geojson.features', location))).toEqual(13);
      }
    }, errors, done));
  }, 200000);

  // osmLocationToRelationshipGeojsonResultTaskStreet with component locations selected to be used for geojson
  // We do this test by fetching the component locationWithNominatimData from OSM first
  test('osmLocationToRelationshipGeojsonResultTaskStreetWithComponentLocations', done => {
    expect.assertions(1);
    const errors = [];

    R.composeK(
      ({locationWithGeojsonResult}) => of(locationWithGeojsonResult),
      // Call with blocks.
      mapResultTaskWithOtherInputs(
        {resultInputKey: 'componentLocationsResult', resultOutputKey: 'locationWithGeojsonResult'},
        ({filterLocation, componentLocations}) => osmLocationToLocationWithGeojsonResultTask(
          {},
          componentLocations,
          filterLocation
        )
      ),
      // Get the blocks
      mapResultTaskWithOtherInputs(
        {resultInputKey: 'locationWithOsmResult', resultOutputKey: 'componentLocationsResult'},
        ({locationWithOsm}) => queryOverpassWithLocationForStreetResultTask({}, locationWithOsm)
      ),
      // Get the osmId
      mapToNamedResponseAndInputs('locationWithOsmResult',
        ({filterLocation}) => nominatimLocationResultTask(
          {},
          filterLocation
        )
      )
    )({
      filterLocation: {
        country: 'USA',
        state: 'NY',
        city: 'New York',
        neighborhood: 'Battery Park City',
        street: 'Chambers Street'
      }
    }).run().listen(defaultRunToResultConfig({
      onResolved: location => {
        expect(R.length(reqStrPathThrowing('geojson.features', location))).toEqual(11);
      }
    }, errors, done));
  }, 200000);

  // osmLocationToRelationshipGeojsonResultTaskStreet with component locations selected to be used for geojson
  // We do this test by fetching the component locationWithNominatimData from OSM first
  test('_constructStreetQuery', done => {
    expect.assertions(1);
    const errors = [];

    // This calls _constructStreetQuery indirectlly
    locationToOsmAllBlocksQueryResultsTask({}, {
        country: 'China 中国',
        city: '香港 Hong Kong',
        street: 'Theatre Lane'
      }
    ).run().listen(defaultRunConfig({
      onResolved: ({Ok: componentLocationResponses}) => {
        locationsToGeojson(R.map(R.prop('location'), componentLocationResponses))
        expect(R.length(componentLocationResponses)).toEqual(2);
      }
    }, errors, done));
  }, 200000);

});
