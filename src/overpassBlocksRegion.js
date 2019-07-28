import {reqStrPathThrowing, traverseReduceDeepResults} from 'rescape-ramda';
import * as R from 'ramda';
import {of} from 'folktale/concurrency/task';

/**
 * Created by Andy Likuski on 2019.07.26
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export const getBlocksOfBounds = ({bbox}) => {
  return traverseReduceDeepResults(2,
    // The accumulator
    (res, okObj) => R.concat(
      res,
      [okObj]
    ),
    // The accumulator of errors
    (res, errorObj) => R.concat(
      res,
      // extract the errors array, each of which has a list of errors and the location that erred
      // If there isn't an errors array just add the entire object
      R.ifElse(
        R.has('errors'),
        // TODO errorObj.errors should be an array but sometimes isn't, so wrap
        errorObj => R.compose(R.unless(Array.isArray, Array.of), reqStrPathThrowing('errors'))(errorObj),
        Array.of
      )(errorObj)
    ),
    // Our initial value is a Task with an object can contain Result.Ok and Result.Error results
    of({Ok: [], Error: []}),
    // [Object] -> [Task (Result.Ok | Result.Error)]
    R.map(
      location => _queryBlocks(
        {bbox}
      ),
      reqStrPathThrowing('locations', props)
    )
  )
};
