import * as R from 'ramda';
import {defaultRunToResultConfig, reqStrPathThrowing} from 'rescape-ramda';
import {getBlocksOfBounds} from './overpassBlocksRegion';

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
  test('getBlocksOfBounds', () => {
    const bbox = [[58.96384417871661, 5.73110818862915], [58.9693489074284, 5.742021560668945]];
    const errors = [];
    expect.assertions(3);
    getBlocksOfBounds({
      bbox
    }).run().listen(defaultRunToResultConfig(
      {
        onResolved: ({locations}) => {
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
