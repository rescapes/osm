import * as R from 'ramda';
import {defaultRunToResultConfig, reqStrPathThrowing} from 'rescape-ramda';
import {getAllBlocksOfLocations} from './overpassAllBlocks';
import {nominatimResultTask} from './nominatimLocationSearch';

/**
 * Created by Andy Likuski on 2019.06.14
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

describe('overpassBlocksRegion', () => {
  test('getAllBlocksOfLocations', done => {
    const errors = [];
    const location = {
      country: 'Norway',
      city: 'Stavanger',
      neighborhood: 'Stavanger Sentrum',
    };
    expect.assertions(3);
    R.composeK(

      // 4) Return all blocks found in {Ok: []}. All ways and nodes not used in {Error: []}
      // 3) After traveling once.
      //  A) If point reached is a node, then block is created. Hash block by node ids and in between way ids
      //    (In between way ids can be fetched from the non-reduced ways) DONE
      //  B) If point is wayendnode:
      //    i) If wayendnode matches a node, this is a loop way. Make block and DONE
      //    ii) If wayendnode has has another way, travel that way (reversing its nodes if needed to travel) DONE
      //    iii) if wayendnode has no other way, dead end block. Store block by accumulated node and way(s) reduced to traversed waynodes.
      //  C) If point is waynode: store accumulated waynode and go back to step 3 CONTINUE
      // 2) Traveling. Hash the way segments by hashing the way id with the two node/endpoint id (order independent).
      //  If this segment is already in the hash, abandon this travel (segment has been traversed) DONE
      // 1) Travel from every node: Find ways of node and travel:
      //  A) If starting at way end, travel other direction. Go to step 2 for the one direction CONTINUE
      //  B) Else travel both directions to next node/way endpoint. Go to step 2 for each direction CONTINUEx2
      // For area ways (pedestrian areas) find nodes within 5 meters of each waynode. Hash way
      //    If the area way only matches one node, hash that matching waynode as a wayendnode.
      //    (Above when we travel we'll start at the matching node and go around the area until we reach another node or the wayendnode at the starting point)
      // For loop ways that match exactly 1 node in waynodehash, hash that matching waynode as a wayendnode in wayendnodehash
      //    Above when we travel we'll start at the node and stop at the wayendnode at the same place. See 3.B.i
      // Hash way endings (wayendnode) ids unless it matches a node in the nodehash (wayendnodehash)
      // Has all way ids by intersection node if any waynode matches or is and area-way (pedestrian area) within 5m (waynodehash)
      // Hash intersection nodes by id (nodehash)
      // Return all highway nodes in the area
      // Return all wighway ways in the area
      // Query OSM constrained to the area
      // Resolve the OSM area id
      locationWithOsm => getAllBlocksOfLocations({
        locations: [locationWithOsm]
      }),
      // Nominatim query on the place search string.
      location => nominatimResultTask(location)
    )(location).run().listen(defaultRunToResultConfig(
      {
        onResolved: ({Ok: locationBlocks, Errors: errors}) => {
          // Expect it to be two ways
          expect(R.map(R.prop('id'), R.prop('ways', results))).toEqual(['way/5707230']);
          expect(R.map(R.prop('id'), R.prop('nodes', results))).toEqual(['node/42875319', 'node/42901997']);
          // Expect our intersection names
          expect(reqStrPathThrowing('intersections', results)).toEqual({
            "node/42875319": [
              "134th Street",
              "South Conduit Avenue"
            ],
            "node/42901997": [
              "134th Street",
              "149th Avenue"
            ]
          });
        }
      }, errors, done)
    );
  });
});

