/**
 * Created by Andy Likuski on 2018.03.27
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {
  calculateRouteTask,
  createOpposingRoutesFromOriginAndDestination,
  geocodeAddressResultTask,
  geocodeAddressWithBothIntersectionOrdersTask,
  geocodeBlockAddressesResultTask,
  geojsonCenterOfBlockAddress,
  googleIntersectionTask,
  initDirectionsService,
  resolveGeojsonTask,
  resolveGeoLocationTask
} from './googleLocation.js';
import R from 'ramda';
import {defaultRunConfig, defaultRunToResultConfig, reqStrPathThrowing} from '@rescapes/ramda';
import {turfPointToLocation} from '@rescapes/helpers';
import T from 'folktale/concurrency/task/index.js';
const {rejected} = T;

const austinIntersections = [{data: {streets: ['Salina St', 'E 21st St']}}, {data: {streets: ['Leona St and E 21st St']}}];

describe('googleLocation', () => {
  // This request is returning 2 results in production. Seems fine here
  test('geocode2Results', done => {
    const errors = [];
    geocodeAddressResultTask({
      country: 'USA',
      state: 'GA',
      city: 'Atlanta',
      intersections: [
        {data: {streets: ['Monroe Dr NE', '10th St. NE']}},
        {data: {streets: ['Monroe Dr NE', 'Kanuga Dr.']}}
      ]
    }).run().listen(
      defaultRunToResultConfig({
        onResolved:
          resultValue => {
            expect(resultValue.formatted_address).toEqual("10th St NE & Monroe Dr NE, Atlanta, GA 30306, USA");
          }
      }, errors, done)
    );
  }, 5000);

  test('geocodeAddressApproximate', done => {
      const errors = [];
      // This request for a city returns an approximate locationWithNominatimData, which is ok. It's not okay for intersections
      // to be approximate
      geocodeAddressResultTask({
        country: 'USA',
        state: 'CA',
        city: 'Irvine',
        intersections: []
      }).run().listen(
        defaultRunConfig({
          onResolved:
            result => result.mapError(
              errorValue => {
                // This should not happen
                expect(R.length(errorValue.results)).toEqual(1);
                done();
              }
            ).map(
              resultValue => {
                expect(resultValue.formatted_address).toEqual('Irvine, CA, USA');
              }
            )
        }, errors, done)
      );
    },
    5000);

  test('geocodeIntersectionWithWordNorthInName', done => {
      const errors = [];
      geocodeAddressResultTask({
        country: 'USA',
        state: 'IL',
        city: 'Peoria',
        // Google can't handle North North St even though it returns that.
        // Our code overrides values like North that google doesn't like
        intersections: [{data: {streets: ['Main St', 'N North St']}}]
      }).run().listen(
        defaultRunConfig({
          onResolved:
            result => result.mapError(
              errorValue => {
                // This should not happen
                expect(errorValue).toBeTruthy();
                done();
              }
            ).map(
              resultValue => {
                // Should not happen
                expect(resultValue).toEqual(null);
                done();
              }
            )
        }, errors)
      );
    },
    20000);

  test('geocodeAddressWithBothIntersectionOrdersTask', done => {
      const errors = [];
      geocodeAddressWithBothIntersectionOrdersTask({
        country: 'USA',
        state: 'IL',
        city: 'Peoria',
        // Google can't find this, but if you reverse these names it does find it, sigh
        // This test shows that are code will reverse the intersection if it fails the first time
        intersections: [{data: {streets: ['W Main St', 'NE Crescent Ave']}}]
      }).run().listen(
        defaultRunConfig({
          onResolved:
            result => result.mapError(
              errorValue => {
                // This should not happen
                expect(R.length(errorValue.results)).toEqual(1);
                done();
              }
            ).map(
              resultValue => {
                expect(resultValue.formatted_address).toEqual('NE Crescent Ave & Main St, Peoria, IL 61602, USA');
                done();
              }
            )
        }, errors)
      );
    },
    20000);


  test('geocodeAddressWithBothIntersectionOrdersTaskBadLocation', done => {
    const errors = [];
    geocodeAddressWithBothIntersectionOrdersTask({
        "intersections": [{
          data: {
            streets:
              [
                "134th Street",
                "149th Avenue"
              ]
          }
        },
          {
            data: {
              streets: [
                "134th Street",
                "South Conduit Avenue"
              ]
            }
          }
        ],
        "dataComplete": false,
        "data": {},
        "version": 2,
        "geojson": {
          "type": "FeatureCollection",
          "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
          "features": [
            {
              "type": "Feature",
              "id": "node/42875319",
              "properties": {
                "type": "node",
                "id": 42875319,
                "tags": {},
                "relations": [],
                "meta": {}
              },
              "geometry": {
                "type": "Point",
                "coordinates": [
                  -73.8057802,
                  40.6661498
                ]
              }
            },
            {
              "type": "Feature",
              "id": "node/42901997",
              "properties": {
                "type": "node",
                "id": 42901997,
                "tags": {},
                "relations": [],
                "meta": {}
              },
              "geometry": {
                "type": "Point",
                "coordinates": [
                  -73.806031,
                  40.665278
                ]
              }
            }
          ]
        }
      }
    ).run().listen(
      defaultRunConfig({
        onResolved:
          result => result.mapError(
            errorValue => {
              // This should not happen
              expect(R.length(errorValue.results)).toEqual(1);
            }
          ).map(
            resultValue => {
              expect(resultValue.formatted_address).toEqual('149th Ave & 134th St, Queens, NY 11430, USA');
            }
          )
      }, errors, done)
    );
  }, 20000);

  test('geocodeAddressWithBothIntersectionOrdersFailsTask', done => {
      const errors = [];
      geocodeAddressWithBothIntersectionOrdersTask({
        country: 'USA',
        state: 'IL',
        city: 'Peoria',
        // Google can't find this, but if you reverse these names it does find it, sigh
        // This test shows that are code will reverse the intersection if it fails the first time
        intersections: [{data: {streets: ['W Main St', 'N Maplewood Ave']}}]
      }).orElse(reason => {
        // Our task reject handler takes the reason and pushes it too, then rejects again
        errors.push(reason);
        // This reason is the error that goes to defaultOnRejected
        return rejected(reason);
      }).run().listen(
        defaultRunConfig({
          onResolved:
            result => result.mapError(
              errorValue => {
                expect(errorValue.error).toBeTruthy();
              }
            )
        }, errors, done)
      );
    },
    20000
  );

  test('Resolve correct geocodeAddressResultTask with two results', done => {
    const errors = [];
    const ambiguousIntersections = [
      {data: {streets: ['Monroe', '13th']}},
      {data: {streets: ['Monroe', 'Holmead']}}
    ];
    // Don't worry which street is listed first
    const expected = actual => R.filter(R.flip(R.contains)([
      "Monroe St NW & 13th St NW, Washington, DC 20010, USA",
      "13th St NW & Monroe St NW, Washington, DC 20010, USA",
      "Holmead Pl NW & Monroe St NW, Washington, DC 20010, USA",
      "Monroe St NW & Holmead Pl NW, Washington, DC 20010, USA"
    ]), actual);
    geocodeBlockAddressesResultTask({
      country: 'USA',
      state: 'DC',
      city: 'Washington',
      intersections: ambiguousIntersections
    }).run().listen(
      defaultRunToResultConfig({
        onResolved: results => {
          const actual = R.map(R.prop('formatted_address'), results);
          expect(actual).toEqual(expected(actual));
        }}, errors, done)
    );
  });

  test('geojsonCenterOfBlockAddress', done => {
    const intersections = [
      {data: {streets: ['Monroe St NW', '13th St NW']}},
      {data: {streets: ['Monroe St NW', 'Holmead Pl NW']}}
    ];
    const errors = [];
    geojsonCenterOfBlockAddress({country: 'USA', state: 'DC', city: 'Washington', intersections}).run().listen(
      defaultRunConfig({
        onResolved: resultResult => resultResult.mapError(
          errorValue => {
            throw new Error(errorValue);
          }
        ).map(
          centerPoint => {
            // Finally return a simple lat, lng array
            expect(turfPointToLocation(centerPoint)).toMatchSnapshot();
            done();
          }
        )
      }, errors, done)
    );
  });

  test('createOpposingRoutesFromOriginAndDestination', done => {
    const errors = [];
    createOpposingRoutesFromOriginAndDestination(
      initDirectionsService(process.env['GOOGLE_API_KEY']),
      {country: 'USA', state: 'Texas', city: 'Austin', intersections: austinIntersections}
    ).run().listen(
      defaultRunConfig({
        onResolved: routesResult => {
          routesResult.map(routes => {
            expect(R.map(
              route => R.head(reqStrPathThrowing('data.routes', route)).summary, routes)
            ).toEqual(['E 21st St', 'E 21st St']);
          });
        }
      }, errors, done)
    );
  }, 100000);

  test('calculateRouteTask', done => {
    const errors = [];
    const origin = {
      "formatted_address": "Salina St & E 21st St, Austin, TX 78722, USA",
      "geometry": {
        "location": {
          "lat": 30.2816082,
          "lng": -97.72263489999999
        },
        "viewport": {
          "northeast": {
            "lat": 30.2829571802915,
            "lng": -97.72128591970849
          },
          "southwest": {
            "lat": 30.2802592197085,
            "lng": -97.7239838802915
          }
        }
      },
      "geojson": {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            -97.72263489999999,
            30.2816082
          ]
        }
      }
    };
    const destination = {
      "formatted_address": "E 21st St & Leona St, Austin, TX 78722, USA",
      "geometry": {
        "location": {
          "lat": 30.2814621,
          "lng": -97.72360929999999
        },
        "location_type": "GEOMETRIC_CENTER",
        "viewport": {
          "northeast": {
            "lat": 30.2828110802915,
            "lng": -97.72226031970848
          },
          "southwest": {
            "lat": 30.2801131197085,
            "lng": -97.7249582802915
          }
        }
      },
      "geojson": {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Point",
          "coordinates": [
            -97.72360929999999,
            30.2814621
          ]
        }
      }
    };
    calculateRouteTask(initDirectionsService(process.env['GOOGLE_API_KEY']), origin, destination).run().listen(
      defaultRunConfig({
        onResolved: routeResult => {
          routeResult.map(route => {
            expect(R.head(route.data.routes).summary).toMatchSnapshot();
          });
        }
      }, errors, done)
    );
  });

  test('googleIntersectionTask', done => {
    const location = {
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      // Intentionally put Grand Ave a different positions
      intersections: [{data: {streets: ['Grand Ave', 'Perkins St']}}, {data: {streets: ['Lee St', 'Grand Ave']}}],
      blockname: 'Grand Ave'
    };
    googleIntersectionTask(location).run().listen(
      defaultRunConfig({
        onResolved: responseResult => responseResult.map(
          responses => {
            // Sort to make each pair alphabetical
            expect(R.map(response => R.sortBy(R.identity, response.intersection), responses)).toEqual([
              [
                'Grand Avenue', 'Perkins Street'
              ],
              [
                'Grand Avenue', 'Lee Street'
              ]
            ]);
            done();
          }
        )
      })
    );
  });

  test('resolveGeoLocationTask country', done => {
    const location = {
      country: 'USA',
      state: 'NM',
      city: 'Albuquerque'
    };
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(response => {

        expect(R.map(f => f.toFixed(3), response)).toEqual(["35.084", "-106.650"]);
        done();
      }).mapError(reject => {
        throw new Error(reject);
      })
    });
  });

  test('resolveGeoLocationTask with lat/lon', done => {
    const location = {
      id: 1,
      latitude: 47,
      longitude: 1
    };
    // Resolves synchronously, but returns a Task nevertheless
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(response => {
        expect(response).toEqual([47, 1]);
        done();
      }).mapError(reject => {
        throw new Error(reject);
      })
    });
  });


  test('resolveGeoLocationTask with 2 intersections', done => {
    const location = {
      id: 1,
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point',
      intersections: [
        {data: {streets: ['Grand Ave', 'Bay Pl']}},
        {data: {streets: ['Grand Ave', 'Harrison St']}}
      ]
    };
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(response => {

        expect(R.map(f => f.toFixed(3), response)).toEqual(["37.811", "-122.261"]);
        done();
      }).mapError(reject => {
        throw new Error(reject);
      })
    });
  });

  test('resolveGeoLocationTask with 1 intersections', done => {
    const location = {
      id: 1,
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point',
      street: 'Grand Ave',
      intersections: [
        {data: {streets: ['Grand Ave', 'Bay Pl']}}
      ]
    };
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(response => {

        expect(R.map(f => f.toFixed(3), response)).toEqual(["37.811", "-122.261"]);
        done();
      }).mapError(reject => {
        throw new Error(reject);
      })
    });
  });

  test('resolveGeoLocationWithoutIntersections', done => {
    const location = {
      id: 1,
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point'
    };
    // Resolves asynchronously
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(
        response => {
          expect(R.map(f => f.toFixed(3), response)).toEqual(["37.812", "-122.255"]);
          done();
        }
      ).mapError(
        error => {
          throw new Error(error);
        }
      )
    });
  }, 20000);

  test('resolveGeojsonFromApi', (done) => {
    // Goes to the api to resolve
    // Resolves synchronously
    const location = {
      id: 1,
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      neighborhood: 'Adams Point',
      intersections: [
        {data: {streets: ['Grand Ave', 'Bay Pl']}},
        {data: {streets: ['Grand Ave', 'Harrison St']}}
      ]
    };
    // Resolves asynchronously
    resolveGeojsonTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(
        response => {
          const actual = R.flatten(reqStrPathThrowing('geometry.coordinates', response));
          const expected = R.flatten([[-122.2605531, 37.810549], [-122.2623298, 37.8108424]]);
          // These coords seems to change from search to search, so check approximately
          R.zipWith(
            (actual, expected) => expect(actual).toBeCloseTo(expected, 3),
            actual,
            expected
          );
          done();
        }
      ).mapError(error => {
          throw new Error(error);
        }
      )
    });
  }, 20000);
});