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


import T from 'folktale/concurrency/task/index.js';
const {of, rejected} = T;
import {osmResultTask} from './overpassHelpers.js';
import {defaultRunToResultConfig} from '@rescapes/ramda';

describe('overpass', () => {

  test('osmResultTask', done => {
    const errors = [];
    // Pretend that all but the last task fail
    const tasks = [
      url => rejected(url),
      url => rejected(url),
      url => rejected(url),
      url => of(url),
      // Shouldn't be called
      url => rejected(url),
      url => rejected(url),
      url => of(url)
    ];
    const getTaskResult = (i, url) => tasks[i](url);

    let i = 0;
    osmResultTask({name: 'testOsmResultTask', tries: 4},
      overpassUrl => {
        return getTaskResult(i++, overpassUrl);
      }
    ).run().listen(defaultRunToResultConfig(
      {
        onResolved:
          response => {
            expect(response).toBeTruthy();
            done();
          }
      },
      errors,
      done
    ));
  });
});
