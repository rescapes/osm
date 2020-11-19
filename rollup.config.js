import babel from 'rollup-plugin-babel';
import commonjs from 'rollup-plugin-commonjs';
import pkg from './package.json';
import R from 'ramda';

const config = {
  input: [
    'src/index.mjs',
    'src/googleLocation.js',
    'src/overpassExternalSourceBlocks.js',
    'src/locationHelpers.js',
    'src/nominatimLocationSearch.js',
    'src/overpassHelpers.js',
    'src/overpassAllBlocks.js',
    'src/overpassAllBlocksHelpers.js',
    'src/overpassBlockHelpers.js',
    'src/overpassFeatureHelpers.js',
    'src/overpassSingleBlock.js',
    'src/overpassSingleOrAllBlocks.js',
    'src/overpassStreet.js',
    'src/overpassBlocks.js',
    'src/overpassBuildBlocks.js',
    'src/overpassTransit.js'
  ],
  plugins: []
};

const externals = ['@turf', 'symbol-observable', 'folktale/concurrency/task', 'folktale/result/index.js'];

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
  /*
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
    plugins: R.concat(
      config.plugins,
      []
    )
  }

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
   */
]);
export default configs;