/**
 * Created by Andy Likuski on 2017.04.03
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {fetchOsm, osmAlways, osmNotEqual, fetchOsmRaw} from './overpassIO';
import {defaultRunConfig, removeDuplicateObjectsByProp} from 'rescape-ramda';
import {LA_SAMPLE, LA_BOUNDS} from './queryOverpass.sample';
import {cityNominatim} from './searchIO';
import {of} from 'folktale/concurrency/task';
import * as R from 'ramda';

const mock = false;
jest.unmock('query-overpass');
//jest.mock('query-overpass');


const conditions = [
  osmAlways("railway"),
  osmNotEqual("service", "siding"),
  osmNotEqual("service", "spur")
];
const types = [
  'node', 'way', 'relation'
];

// requires are used below since the jest includes aren't available at compile time
describe('overpassHelpersUnmocked', () => {
  if (mock) {
    return;
  }
  const realBounds = [-118.24031352996826, 34.04298753935195, -118.21018695831297, 34.065209887879476];

  test('unmockedFetchTransit', done => {
    expect.assertions(1);
    // Unmocked integration test
    // We expect over 500 results. I'll leave it fuzzy in case the source dataset changes
    fetchOsm(
      {},
      {bounds: realBounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            expect(response.features.length).toBeGreaterThan(500);
            done();
          }
      }
    ));
  }, 1000000);

  test('unmockedFetchTransitCelled', done => {
    expect.assertions(1);
    // Wrap the Task in a Promise for jest's sake
    fetchOsm({
        // 1 meter cells!
        cellSize: 1,
        sleepBetweenCalls: 1000
      },
      {bounds: realBounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            expect(response.features.length).toBeGreaterThan(500);
            done();
          }
      }
    ));
  }, 1000000);


  test('fetchOsmBlock', done => {
    expect.assertions(1);
    const query = `
way[highway][name="6th Avenue"][footway!="crossing"]->.w1;
way[highway][name="West 23rd Street"][footway!="crossing"]->.w2;
way[highway][name="5th Avenue"][footway!="crossing"]->.w3;
way[highway][name="West 23rd Street"][footway!="crossing"]->.w4;
/* Get the two intersection nodes */
// node contained in w1 and w2
(node(w.w1)(w.w2);
 // node contained in w3 and w4
 node(w.w3)(w.w4);
)->.allnodes;

/* Get all ways containing one or both nodes */
way[highway](bn.allnodes)->.ways; 


/* For each way. Only one of these ways should pass to the output stage */
foreach .ways -> .singleway (
  // Get all nodes of this way
  node.allnodes(w.singleway);
  // Filter the singleWay by whether the nodes it contains equal the count
  // of allnodes. This tells us that the way represents both intersections
  way.singleway(bn)(if:count(nodes) == allnodes.count(nodes))->.winnerWay;
  // Get all nodes in singleway if singleway passed the test
  // If it didn't pass this won't match anything
  // This also returns that aren't intersection nodes
  node(w.winnerWay)->.wayNodes;
  // Get the intersection of the wayNodes with the allnodes
  node.allnodes.wayNodes->.intersectionNodes;
  // Combine the winnerWay with the two nodes representing each intersection
  (.winnerWay; .intersectionNodes;)->.winnerUnion;
  // Output the way and two nodes
  .winnerUnion out geom;
);`;
    R.composeK(
      bounds => fetchOsmRaw({bounds},  query),
      // bounding box comes as two lats, then two lon, so fix
      result => of(R.map(str => parseFloat(str), R.props([0,2,1,3], result.boundingbox))),
      location => cityNominatim(location)
    )({country: 'USA', state: 'New York', city: 'New York City'}).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            // the sample can have duplicate ids
            expect(response.features).toEqual(removeDuplicateObjectsByProp('id', LA_SAMPLE.features));
            done();
          }
      }));
  }, 1000000);
});

describe('overpassHelpers', () => {
  if (!mock) {
    return;
  }

  const bounds = LA_BOUNDS;
  test('fetchOsm', done => {
    expect.assertions(1);
    // Pass bounds in the options. Our mock query-overpass uses is to avoid parsing the query
    fetchOsm(
      {
        // Used by the mock
        testBounds: bounds
      },
      {bounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            expect(response).toEqual(LA_SAMPLE);
            done();
          }
      })
    );
  });

  test('fetchOsm in cells', done => {
    expect.assertions(1);
    fetchOsm(
      {
        cellSize: 200,
        // Used by the mock
        testBounds: bounds
      },
      {bounds, filters: conditions},
      types
    ).run().listen(defaultRunConfig(
      {
        onResolved:
          response => {
            // the sample can have duplicate ids
            expect(response.features).toEqual(removeDuplicateObjectsByProp('id', LA_SAMPLE.features));
            done();
          }
      })
    );
  });
});
