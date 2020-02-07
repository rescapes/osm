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

export {
  nonOsmGeojsonLinesToLocationBlocksResultsTask,
  osmCompatibleWayFeaturesFromGeojson,
  partialBlocksFromNonOsmWayFeatures
} from './overpassExternalSourceBlocks';

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
} from './googleLocation';

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
  locationIntersectionAsLatLng,
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
  locationHasGeojsonFeatures
} from './locationHelpers';
export {searchLocation, nominatimResultTask, mapboxGeocodeTask} from './nominatimLocationSearch';
export {fetchTransitOsm} from './overpassTransit';
export {queryLocationForOsmSingleBlockResultTask} from './overpassSingleBlock';
export {
  locationToOsmAllBlocksQueryResultsTask, nominatimOrGoogleJurisdictionGeojsonResultTask
} from './overpassAllBlocks';
export {
  osmLocationToLocationWithGeojsonResultTask,
  osmRelationshipGeojsonResultTask
} from './overpassBlocks';
export {
  queryLocationForOsmBlockOrAllResultsTask
} from './overpassSingleOrAllBlocks';
export {queryOverpassWithLocationForStreetResultTask} from './overpassStreet';
export {
  cleanGeojson,
  hashWayFeatureExtents,
  hashWayFeature,
  hashNodeFeature,
  hashPoint,
  findMatchingNodes,
  hashPointsToWayCoordinates,
  nodeMatchesWayEnd
} from './overpassFeatureHelpers';
export {
  blockToGeojson, blocksToGeojson, blocksWithLengths, lengthOfBlocks, locationsToGeojson, locationsToGeojsonWaysAndBoth, generateFileTask
} from './overpassBlockHelpers';

