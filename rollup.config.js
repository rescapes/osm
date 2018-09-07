import nodeResolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';
import uglify from 'rollup-plugin-uglify';
import autoExternal from 'rollup-plugin-auto-external';

const env = process.env.NODE_ENV;
const config = {
  input: [
    'src/index.js',
    'src/auth/login.js',
    'src/client/client.js',
    'src/helpers/categorizeHelpers.js',
    'src/helpers/fetchHttpOrFile.js',
    'src/helpers/queryHelpers.js',
    'src/helpers/geojsonSelectors.js',
    'src/helpers/mapboxSelectors.js',
    'src/helpers/regionSelectors.js',
    'src/helpers/settingsSelectors.js',
    'src/helpers/storeSelectors.js',
    'src/helpers/styleSelectors.js',
    'src/helpers/userSelectors.js',
    'src/schema/selectorResolvers.js'
  ],
  plugins: [
    // Automatically exclude dependencies and peerDependencies from cjs and es builds, (and excludes
    // peerDependencies from all builds)
    autoExternal()
  ],
  experimentalCodeSplitting: true
};

if (env === 'es' || env === 'cjs') {
  config.output = {
    dir: env,
    format: env,
    indent: false,
    sourcemap: 'inline'
  };
  // folktale needs to be explicitly external because rollup can't
  // match folktale to folktale/concurrency/task
  // enzyme and enzyme-wait are dev-dependencies that are used by componentTestHelpers, so mark external here
  config.external = ['symbol-observable', 'folktale/concurrency/task', 'enzyme', 'enzyme-wait']
  config.plugins.push(
    babel({
      exclude: ['node_modules/**'],
      plugins: ['external-helpers']
    })
  );
}

if (env === 'development' || env === 'production') {
  config.output = {
    dir: 'umd',
    format: 'umd',
    name: 'Umd',
    indent: false
  };
  config.plugins.push(
    nodeResolve({
      jsnext: true
    }),
    babel({
      exclude: 'node_modules/**',
      plugins: ['external-helpers']
    }),
    replace({
      'process.env.NODE_ENV': JSON.stringify(env)
    })
  );
}

if (env === 'production') {
  config.plugins.push(
    uglify({
      compress: {
        pure_getters: true,
        unsafe: true,
        unsafe_comps: true,
        warnings: false
      }
    })
  );
}

export default config;