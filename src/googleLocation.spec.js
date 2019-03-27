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
  initDirectionsService,
  createOpposingRoutesFromOriginAndDestination,
  geocodeAddressTask,
  geojsonCenterOfBlockAddress, googleIntersectionTask, resolveGeojsonTask, resolveGeoLocationTask,
  geocodeBlockAddressesTask, createRouteFromOriginDestinationGeocodes, calculateRouteTask,
  geocodeAddressWithBothIntersectionOrdersTask
} from './googleLocation';
import * as R from 'ramda';
import {defaultRunConfig, reqStrPathThrowing} from 'rescape-ramda';
import {turfPointToLocation} from 'rescape-helpers';

const austinIntersections = [['Salina St', 'E 21st St'], ['Leona St and E 21st St']];

describe('googleLocation', () => {
  test('geocodeAddressTask', done => {
      geocodeAddressTask({
        country: 'USA',
        state: 'DC',
        city: 'Washington',
        intersections: ['Monroe St', '13th NE']
      }, 'Monroe St and 13th NE, Washington, DC, USA').run().listen(
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
                expect(resultValue.formatted_address).toEqual('13th St NE & Monroe St NE, Washington, DC 20017, USA');
                // Make sure we can get full street names
                expect(resultValue.address_components[0].long_name).toEqual('13th Street Northeast & Monroe Street Northeast');
                done();
              }
            )
        })
      );
    },
    5000);

  test('geocodeAddressApproximate', done => {
      // This request for a city returns an approximate location, which is ok. It's not okay for intersections
      // to be approximate
      geocodeAddressTask({
        country: 'USA',
        state: 'CA',
        city: 'Irvine',
        locations: []
      }, 'Irvine, CA, USA').run().listen(
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
                done();
              }
            )
        })
      );
    },
    5000);

  test('geocodeIntersectionWithWordNorthInName', done => {
      geocodeAddressTask({
        country: 'USA',
        state: 'IL',
        city: 'Peoria',
        // Google can't handle North North St even though it returns that.
        // Our code overrides values like North that google doesn't like
        intersections: [['Main St', 'N North St']]
      }, null).run().listen(
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
                // Yes this returns Street and St. Cmon Google!
                expect(resultValue.formatted_address).toEqual('North North Street & Main St, Peoria, IL 61602, USA');
                done();
              }
            )
        })
      );
    },
    20000);

  test('geocodeAddressWithBothIntersectionOrdersTask', done => {
      geocodeAddressWithBothIntersectionOrdersTask({
        country: 'USA',
        state: 'IL',
        city: 'Peoria',
        // Google can't find this, but if you reverse these names it does find it, sigh
        // This test shows that are code will reverse the intersection if it fails the first time
        intersections: [['W Main St', 'NE Crescent Ave']]
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
        })
      );
    },
    20000);

  test('geocodeAddressWithBothIntersectionOrdersFailesTask', done => {
      geocodeAddressWithBothIntersectionOrdersTask({
        country: 'USA',
        state: 'IL',
        city: 'Peoria',
        // Google can't find this, but if you reverse these names it does find it, sigh
        // This test shows that are code will reverse the intersection if it fails the first time
        intersections: [['W Main St', 'N Maplewood Ave']]
      }).run().listen(
        defaultRunConfig({
          onResolved:
            result => result.mapError(
              errorValue => {
                expect(errorValue.error).toBeTruthy()
                done();
              }
            )
        })
      );
    },
    20000);
  test('geocodeAddressWithBothIntersectionOrdersTaskWithLatLon', done => {
      geocodeAddressWithBothIntersectionOrdersTask({
        country: 'USA',
        state: 'IL',
        city: 'Peoria',
        intersections: ['40.699546, -89.597790']
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
                // We just get back the coords. No need to geocode
                expect(resultValue.geojson.geometry.coordinates).toEqual([-89.597790, 40.699546]);
                done();
              }
            )
        })
      );
    },
    20000);

  test('geocodeAddressWithLatLng', done => {
      const somewhereSpecial = [60.004471, -44.663669];
      // Leave the location blank since we don't need it when we use a lat/lng
      geocodeAddressTask({}, R.join(', ', somewhereSpecial)).run().listen(
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
                // Reverse the point to match the geojson format
                expect(resultValue.geojson.geometry.coordinates).toEqual(R.reverse(somewhereSpecial));
                done();
              }
            )
        })
      );
    },
    5000);


  test('Resolve correct geocodeAddressTask with two results', done => {
    const ambiguousIntersections = [
      ['Monroe', '13th'],
      ['Monroe', 'Holmead']
    ];
    // Don't worry which street is listed first
    const expected = actual => R.filter(R.flip(R.contains)([
      "Monroe St NW & 13th St NW, Washington, DC 20010, USA",
      "13th St NW & Monroe St NW, Washington, DC 20010, USA",
      "Holmead Pl NW & Monroe St NW, Washington, DC 20010, USA",
      "Monroe St NW & Holmead Pl NW, Washington, DC 20010, USA"
    ]), actual);
    geocodeBlockAddressesTask({
      country: 'USA',
      state: 'DC',
      city: 'Washington',
      intersections: ambiguousIntersections
    }).run().listen(
      defaultRunConfig({
        onResolved: resultsResult => resultsResult.map(results => {
          const actual = R.map(R.prop('formatted_address'), results);
          expect(actual).toEqual(expected(actual));
          done();
        })
      })
    );
  });

  test('geocodeBlockAddress with lat/lng', done => {
    const ambiguousBlockAddresses = [
      ['Monroe', '13th'],
      '38.931990, -77.030890'
    ];
    // Don't worry which street is listed first
    const expected = actual => R.head(R.filter(R.contains(actual), [
      "Monroe St NW & 13th St NW, Washington, DC 20010, USA",
      "13th St NW & Monroe St NW, Washington, DC 20010, USA"
    ]));
    geocodeBlockAddressesTask({
      country: 'USA',
      state: 'DC',
      city: 'Washington',
      intersections: ambiguousBlockAddresses
    }).run().listen(
      defaultRunConfig({
        onResolved: resultsResult => resultsResult.map(results => {
          const actualFirst = R.view(R.lensPath([0, 'formatted_address']), results);
          expect(actualFirst).toEqual(expected(actualFirst));
          // We expect a geojson point from the lat,lng. Flip the coordinates and stringify to match original
          const actualSecond = R.join(', ', R.reverse(R.view(R.lensPath([1, 'geojson', 'geometry', 'coordinates']), results)));
          // Turf rounds off the end 0s
          expect(actualSecond).toEqual('38.93199, -77.03089');
          done();
        })
      })
    );
  });



  test('geojsonCenterOfBlockAddress', done => {
    const intersections = [
      ['Monroe St NW', '13th St NW'],
      ['Monroe St NW', 'Holmead Pl NW']
    ];
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
      })
    );
  });

  test('createOpposingRoutesFromOriginAndDestination', done => {
    createOpposingRoutesFromOriginAndDestination(
      initDirectionsService(),
      {country: 'USA', state: 'Texas', city: 'Austin', intersections: austinIntersections}
    ).run().listen(
      defaultRunConfig({
        onResolved: routesResult => {
          routesResult.map(routes => {
            expect(R.map(
              route => R.head(route.json.routes).summary, routes)
            ).toMatchSnapshot();
            done();
          });
        }
      })
    );
  });

  test('calculateRouteTask', done => {
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
    calculateRouteTask(initDirectionsService(), origin, destination).run().listen(
      defaultRunConfig({
        onResolved: routeResult => {
          routeResult.map(route => {
            expect(R.head(route.json.routes).summary).toMatchSnapshot();
            done();
          });
        }
      })
    );
  });

  test('googleIntersectionTask', done => {
    const location = {
      country: 'USA',
      state: 'California',
      city: 'Oakland',
      // Intentionally put Grand Ave a different positions
      intersections: [['Grand Ave', 'Perkins St'], ['Lee St', 'Grand Ave']]
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
        ['Grand Ave', 'Bay Pl'],
        ['Grand Ave', 'Harrison St']
      ]
    };
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(response => {

        expect(R.map(f => f.toFixed(4), response)).toEqual(["37.8107", "-122.2614"]);
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
      intersections: [
        ['Grand Ave', 'Bay Pl']
      ]
    };
    resolveGeoLocationTask(location).run().listen({
      onRejected: reject => {
        throw new Error(reject);
      },
      onResolved: responseResult => responseResult.map(response => {

        expect(R.map(f => f.toFixed(4), response)).toEqual( ["37.8105", "-122.2604"]);
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
          expect(R.map(f => f.toFixed(4), response)).toEqual(["37.8116", "-122.2555"]);
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
        ['Grand Ave', 'Bay Pl'],
        ['Grand Ave', 'Harrison St']
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