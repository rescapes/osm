/**
 * Created by Andy Likuski on 2018.04.28
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export {processParamsFromJsonOrJsToList} from './scripts/scriptHelpers.js';

export {
  nonOsmGeojsonLinesToLocationBlocksResultsTask,
  osmCompatibleWayFeaturesFromGeojson,
  partialBlocksFromNonOsmWayFeatures
} from './overpassExternalSourceBlocks.js';

export {
  calculateRouteTask,
  calculateOpposingRoutesTask,
  createOpposingRoutesFromOriginAndDestination,
  findClosest,
  geocodeAddressResultTask,
  geocodeBlockAddressesResultTask,
  geocodeAddressWithBothIntersectionOrdersTask,
  geojsonCenterOfBlockAddress,
  googleIntersectionTask,
  routeFromOriginAndDestination,
  initDirectionsService,
  resolveGeoLocationTask,
  resolveGeojsonTask,
  resolveJurisdictionFromGeocodeResult
} from './googleLocation.js';

export {
  addressString,
  addressPair,
  addressStrings,
  jurisdictionString,
  removeStateFromSomeCountriesForSearch,
  intersectionsByNodeIdToSortedIntersections,
  isResolvableSingleBlockLocation,
  isResolvableAllBlocksLocation,
  locationHasLocationPoints,
  wayFeatureName,
  wayFeatureNameOrDefault,
  locationAndOsmBlocksToLocationWithGeojson,
  normalizedIntersectionNames,
  addressStringForBlock,
  locationWithLocationPoints,
  locationWithIntersectionInBothOrders,
  commonStreetOfLocation,
  aggregateLocation,
  oneLocationIntersectionsFromLocation,
  stateCodeLookup,
  isOsmType,
  featuresByOsmType,
  featuresOfOsmType,
  osmFeaturesOfLocationForType,
  locationIntersectionLocationToTurfPoints,
  geojsonFeaturesHaveRadii,
  mapGeojsonFeaturesHaveRadiiToPolygon,
  featureRepresentsCircle,
  geojsonFeaturesHaveShape,
  geojsonFeaturesHaveShapeOrRadii,
  geojsonFeaturesIsPoint,
  isLatLng,
  isNominatimEligible,
  locationHasGeojsonFeatures,
  fixWordsThatTripUpGoogle
} from './locationHelpers.js';
export {searchLocation, nominatimResultTask, mapboxGeocodeTask} from './nominatimLocationSearch.js';
export {fetchTransitOsm} from './overpassTransit.js';
export {
  queryLocationForOsmSingleBlockResultTask, queryLocationForOsmSingleBlocksResultsTask
} from './overpassSingleBlock.js';
export {
  locationToOsmAllBlocksQueryResultsTask,
  nominatimOrGoogleJurisdictionGeojsonResultTask,
  bufferedFeaturesToOsmAllBlocksQueryResultsTask,
  locationToOsmAllBlocksThenBufferedMoreBlocksResultsTask
} from './overpassAllBlocks.js';
export {
  osmLocationToLocationWithGeojsonResultTask,
  osmRelationshipGeojsonResultTask
} from './overpassBlocks.js';
export {
  queryLocationForOsmBlockOrAllResultsTask
} from './overpassSingleOrAllBlocks.js';
export {queryOverpassWithLocationForStreetResultTask} from './overpassStreet.js';
export {
  cleanGeojson,
  hashWayFeatureExtents,
  hashWayFeature,
  hashWayFeaturesOfLocation,
  hashNodeFeature,
  hashPoint,
  findMatchingNodes,
  hashPointsToWayCoordinates,
  nodeMatchesWayEnd,
  chainWayCoordinates
} from './overpassFeatureHelpers.js';
export {
  blockToGeojson,
  blocksToGeojson,
  blocksWithLengths,
  lengthOfBlocks,
  locationsToGeojson,
  locationsToGeojsonWaysAndBoth,
  generateFileTask,
  locationsToGeojsonFileResultTask,
  locationsToGeojsonString
} from './overpassBlockHelpers.js';

export {
  bufferAndUnionGeojson,
  oldIntersectionUpgrade,
  isBlockLocation
} from './locationHelpers.js'
