import {hashPoint, wayFeatureToCoordinates} from './overpassFeatureHelpers';
import * as R from 'ramda';
import {composeWithChainMDeep} from 'rescape-ramda';
import {organizeResponseFeaturesResultsTask} from './overpassAllBlocksHelpers';
import {featureWithReversedCoordinates, nodeFromCoordinate} from './locationHelpers';

/**
 * Created by Andy Likuski on 2020.01.21
 * Copyright (c) 2020 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Converts geojson line features, such as from an ESRI file, to OpenStreetMap compatible way features.
 * Namely it adds a name property to properties and an id in the form way/fakeN so that the id form matches
 * that of OSM but we know it's not a real OSM id
 * @param {Object} config
 * @param {String} config.nameProp Extracts the prop from the properties to use for name. If name is already
 * specified just pass 'name'
 * @param {Object} lineGeojson FeatureCollection of lines
 * @param {Object} lineGeojson.features The lines features
 * @return {[Object]} A list of unique way features with fake ids and a name property
 */
export const osmCompatibleWayFeaturesFromGeojson = ({nameProp}, lineGeojson) => {
  // Add an id and name to each way feature.properties.tags.name
  return R.addIndex(R.map)(
    (feature, index) => R.compose(
      feature => {
        // Create a fake id that matches the OSM way/ id syntax.
        return R.set(R.lensProp('id'), `way/fake${index}`, feature);
      },
      feature => {
        return R.over(
          R.lensProp('properties'),
          properties => R.over(
            R.lensProp('tags'),
            tags => R.merge(tags || {}, {
              name: R.prop(nameProp, properties)
            }),
            properties
          ),
          feature
        );
      }
    )(feature),
    R.prop('features', lineGeojson)
  );
};
/**
 * Creates partial blocks from wayFeatures created with osmCompatibleWayFeaturesFromGeojson
 * Each partial block contains one of wayFeature or the reverse of one of wayFeature and a node that
 * is the first coordinate of the wayFeature
 * @param {[Object]} wayFeatures The wayFeatures
 * @return {[Object]} wayFeatures * 2. Objects with ways: [] and nodes: []. ways and nodes each contain
 * exactly one item, one of the wayFeatures or reversed wayFeatures and one node formed from the first coordinate
 * of the wayFeature with an id based on hashing the coordinate in the form 'node/hash' The id must be based on a hash
 * so that nodes shared among wayFeatures that meet at an intersection have the same id and are a similuation of
 * a single OSM node
 */
export const partialBlocksFromNonOsmWayFeatures = wayFeatures => {
  // From the lines create a line in each direction and a node at the start of that line
  return composeWithChainMDeep(1, [
    // Chain each item to ways, nodes
    geojsonLineFeature => {
      // Get the firstCoordinate of the lineFeature to produce a node.
      const firstCoordinate = R.head(wayFeatureToCoordinates(geojsonLineFeature));
      return {
        ways: Array.of(geojsonLineFeature),
        nodes: Array.of(
          nodeFromCoordinate(
            // Nodes to need an id based on their position to match other way ends
            {
              id: `node/${hashPoint(firstCoordinate)}`
            },
            firstCoordinate
          )
        )
      };
    },
    // Produce a flat list of each line in both directions
    features => R.chain(
      geojsonLine => {
        return [geojsonLine, featureWithReversedCoordinates(geojsonLine)];
      },
      features
    )
  ])(wayFeatures);
};
/**
 * Converts geojsonLines from a nonOSM source, like ESRI files to location blocks.
 * TODO To convert ESRI files, use online tools or integrate a library that property converts here
 * @param {Object} config
 * @param {Object} config.osmConfig The OSM Config. This will be merged with disableNodesOfWayQueries: true to prevent
 * querying OpenStreetMap for missing way information about the lines, since the lines aren't from OSM
 * @param {Object} featureConfig
 * @param {Object} featureConfig.location The location info to merge into each street. This is normally
 * {country:, [state:], city:} TODO If using geojson that comes from different jurisdictions, this property needs
 * to be updated to be a function that accepts each feature and extracts juridiction information from the feature
 * properties
 * @param {String} featureConfig.nameProp Used to give the lines a name from one of the properties in
 * feature.properties. If feature.properties already has a name just specify 'name'. It's required that each way have a
 * name property so we know what to name of the street.
 * @param {Object} lineGeojson The feature lines
 * @return {Task<Object>} Task that resolves to success blocks under Ok: [], and errors under Error: []. Note that
 * this isn't really async just uses OSM code paths that needs to query OSM when osmConfig.disableNodesOfWayQueries
 * is false
 */
export const nonOsmGeojsonLinesToBlocksResultsTask = ({osmConfig}, {location, nameProp}, lineGeojson) => {
  const wayFeatures = osmCompatibleWayFeaturesFromGeojson({nameProp}, lineGeojson);
  const partialBlocks = partialBlocksFromNonOsmWayFeatures(wayFeatures);
  return organizeResponseFeaturesResultsTask(
    R.merge(osmConfig, {disableNodesOfWayQueries: true}),
    location,
    {partialBlocks}
  );
};