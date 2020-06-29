/**
 * Created by Andy Likuski on 2019.09.13
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import * as R from 'ramda';
import {toArrayIfNot} from 'rescape-ramda';
import {loggers} from 'rescape-log';
import "regenerator-runtime/runtime";

const log = loggers.get('rescapeDefault');

/**
 * Process an imported json params or js file's default import
 * @param {Object|[Object]} params List of param objects or single param object or the same at {default:...}
 * @returns {[Object]} The params as one or more objects of a list
 */
export const processParamsFromJsonOrJsToList = params => {
  // Process .json or the default value of a .js file export
  return R.compose(
    toArrayIfNot,
    params => R.when(R.has('default'), R.prop('default'))(params)
  )(params);
};
