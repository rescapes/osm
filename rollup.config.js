import nodeResolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';
import {terser} from 'rollup-plugin-terser';
import commonjs from 'rollup-plugin-commonjs';
import pkg from './package.json';
import * as R from 'ramda';

const config = {
  input: [
    'src/index.js',
    'src/overpass.js',
    'src/overpassBlocks.js',
    'src/overpassTransit.js',
    'src/search.js',
    'src/googleLocation.js',
    'src/locationHelpers.js'
  ],
  plugins: []
};

const externals = ['symbol-observable', 'folktale/concurrency/task', 'folktale/result'];

const configs = R.map(c => {
  const x = R.merge(config, c);
  return x;
}, [
  // CommonJS
  {
    output: {
      dir: 'lib',
      format: 'cjs',
      indent: true,
      sourcemap: true
    },
    external: [
      ...externals,
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {})
    ],
    plugins: R.concat(config.plugins, [
      commonjs({
        'node_modules/folktale/result/index.js': ['Result', 'Error', 'Ok'],
        'node_modules/folktale/concurrency/task/index.js': ['task', 'rejected', 'of']
      }),
      babel()
    ])
  },
  // ES
  {
    output: {
      dir: 'esm',
      format: 'esm',
      indent: true,
      sourcemap: true
    },
    external: [
      ...externals,
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {})
    ],
    plugins: R.concat(config.plugins, [
      nodeResolve({}), babel()
    ])
  },

  // ES for Browsers
  {
    output: {
      dir: 'esm',
      chunkFileNames: "[name]-[hash].mjs",
      entryFileNames: "[name].mjs",
      format: 'esm',
      indent: true,
      sourcemap: true
    },
    external: [
      ...externals,
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {})
    ],
    plugins: R.concat(config.plugins, [
      nodeResolve({}),
      replace({
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      terser({
        compress: {
          pure_getters: true,
          unsafe: true,
          unsafe_comps: true,
          warnings: false
        }
      })
    ])
  }
]);
export default configs