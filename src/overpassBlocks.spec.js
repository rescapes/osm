import {defaultRunToResultConfig, reqStrPathThrowing} from 'rescape-ramda';
import {osmLocationToLocationWithGeojsonResultTask, osmRelationshipGeojsonResultTask} from './overpassBlocks';
import R from 'ramda';

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

describe('overpassBlocks', () => {
  test('osmRelationshipGeojsonResultTask', done => {
    expect.assertions(1);
    const errors = [];
    osmRelationshipGeojsonResultTask(8398096).run().listen(defaultRunToResultConfig({
      onResolved: geojson => expect(reqStrPathThrowing('features.0.geometry.type', geojson)).toBe(
        'Polygon'
      )
    }, errors, done));
  });

  test('osmLocationToRelationshipGeojsonBlockTaskBlock', done => {
    expect.assertions(1);
    const errors = [];

    const componentLocations = [
      {
        "id": 2231909,
        "intersections": [
          {
            data: {
              streets: ['Chambers Street', 'Hudson River Greenway']
            }
          },
          {
            data: {
              streets: ['Chambers Street', 'North End Avenue']
            }
          }
        ],
        "neighborhood": "Battery Park City",
        "city": "New York",
        "state": "NY",
        "country": "USA",
        "data": {},
        "dataComplete": false,
        "geojson": {
          "type": "FeatureCollection",
          "features": [
            {
              "type": "Feature",
              "id": "node/42431629",
              "geometry": {
                "type": "Point",
                "coordinates": [
                  -74.0138209,
                  40.7176174
                ]
              }
            },
            {
              "type": "Feature",
              "id": "node/246866828",
              "geometry": {
                "type": "Point",
                "coordinates": [
                  -74.0131526,
                  40.7173145
                ]
              }
            },
            {
              "type": "Feature",
              "id": "way/226040985",
              "geometry": {
                "type": "LineString",
                "coordinates": [
                  [
                    -74.0138209,
                    40.7176174
                  ],
                  [
                    -74.0132398,
                    40.717354
                  ],
                  [
                    -74.0131526,
                    40.7173145
                  ]
                ]
              }
            }
          ],
          "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL."
        }
      }
    ];
    osmLocationToLocationWithGeojsonResultTask({}, componentLocations, {
      country: 'USA',
      state: 'NY',
      city: 'New York',
      neighborhood: 'Battery Park City',
      intersections: [{data: {streets: ['Chambers Street', 'Hudson River Greenway']}}, {data: {streets: ['Chambers Street', 'North End Avenue']}}],
      blockname: 'Chambers Street'
    }).run().listen(defaultRunToResultConfig({
      onResolved: location => {
        expect(R.length(reqStrPathThrowing('geojson.features', location))).toEqual(3);
      }
    }, errors, done));
  }, 200000);

  test('osmLocationToRelationshipGeojsonResultTaskStreetBatteryPlace', done => {
    expect.assertions(1);
    const errors = [];

    osmLocationToLocationWithGeojsonResultTask({}, [], {
      country: 'USA',
      state: 'NY',
      city: 'New York',
      neighborhood: 'Battery Park City',
      street: 'Battery Place'
    }).run().listen(defaultRunToResultConfig({
      onResolved: location => {
        expect(R.length(reqStrPathThrowing('geojson.features', location))).toEqual(16);
      }
    }, errors, done));
  }, 200000);

  test('osmLocationToRelationshipGeojsonResultTaskNeighborhood', done => {
    expect.assertions(1);
    const errors = [];
    osmLocationToLocationWithGeojsonResultTask({}, [], {
      country: 'USA',
      state: 'NY',
      city: 'New York',
      neighborhood: "Hell's Kitchen"
    }).run().listen(defaultRunToResultConfig({
      onResolved: location => {
        expect(reqStrPathThrowing('geojson.features.0.geometry.type', location)).toEqual(
          'Polygon'
        );
      }
    }, errors, done));

  }, 20000);

  test('osmLocationToRelationshipGeojsonResultTasCity', done => {
    expect.assertions(1);
    const errors = [];
    osmLocationToLocationWithGeojsonResultTask({}, [], {
      country: 'Canada',
      state: 'Northwest Territories',
      city: 'Yellowknife'
    }).run().listen(defaultRunToResultConfig({
      onResolved: location => expect(R.length(reqStrPathThrowing('geojson.features.0.geometry.coordinates.0', location))).toEqual(30)
    }, errors, done));
  }, 20000);

  test('osmLocationToRelationshipGeojsonResultState', done => {
    expect.assertions(1);
    const errors = [];
    osmLocationToLocationWithGeojsonResultTask({}, [], {
      country: 'USA',
      state: 'Colorado'
    }).run().listen(defaultRunToResultConfig({
      onResolved: location => expect(
        reqStrPathThrowing('geojson.features.0.geometry.type', location)
      ).toBe('Polygon')
    }, errors, done));
  }, 20000);

  test('osmLocationToRelationshipGeojsonResultCountry', done => {
    expect.assertions(1);
    const errors = [];
    osmLocationToLocationWithGeojsonResultTask({}, [], {country: 'Nepal'}).run().listen(defaultRunToResultConfig({
      onResolved: location => expect(reqStrPathThrowing('geojson.features.0.geometry.type', location)).toBe('Polygon')
    }, errors, done));
  }, 200000);
});
