import R from 'ramda';
import {composeWithChain, defaultRunConfig, defaultRunToResultConfig, traverseReduce} from 'rescape-ramda';
import {
  locationToOsmAllBlocksQueryResultsTask,
  locationToOsmAllBlocksThenBufferedMoreBlocksResultsTask
} from './overpassAllBlocks';
import {
  blocksToGeojson,
  blocksWithLengths,
  blockToGeojson,
  locationsToGeojson,
  locationsToGeojsonFileResultTask
} from './overpassBlockHelpers';
import {queryLocationForOsmBlockOrAllResultsTask} from './overpassSingleOrAllBlocks';
import {_recursivelyBuildBlockAndReturnRemainingPartialBlocksResultTask} from './overpassBuildBlocks';

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


describe('overpassAllBlocks', () => {
  // This mocks the overall response but has to go to the server to get node dead end queries.
  // There are too many of the latter to bother mocking and they run fast on the server
  // TOO Slow
  /*
  test('locationToOsmAllBlocksQueryResultsTask', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'Canada',
      state: 'BC',
      city: 'Fernie'
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          //blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toBeGreaterThan(500)
        }
      }, errors, done)
    );
  }, 1000000);
   */



  test('Remove blocks that are too short', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      geojson: {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "properties": {},
            "geometry": {
              "type": "Polygon",
              "coordinates": [
                [
                  [
                    34.791855812072754,
                    31.236389550690053
                  ],
                  [
                    34.793561697006226,
                    31.236389550690053
                  ],
                  [
                    34.793561697006226,
                    31.23777474374497
                  ],
                  [
                    34.791855812072754,
                    31.23777474374497
                  ],
                  [
                    34.791855812072754,
                    31.236389550690053
                  ]
                ]
              ]
            }
          }
        ]
      }
    };
    queryLocationForOsmBlockOrAllResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          blocksWithLengths(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toEqual(22);
        }
      }, errors, done)
    );
  }, 2000000);

  test('Test PointBuffer locations', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: "Feature",
            properties: {
              radius: 100
            },
            geometry: {
              type: "Point",
              coordinates: [
                -80.18231999999999,
                26.098829
              ]
            }
          }
        ]
      }
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          //blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toEqual(9);
        }
      }, errors, done)
    );
  }, 1000000);

  test('Test Jurisdiction Point Buffer locations', done => {
    expect.assertions(1);
    const errors = [];
    const location = {
      country: 'Norway',
      city: 'Oslo',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: "Feature",
            properties: {
              radius: 50,
              jurisdictionCenterPoint: true
            }
          }
        ]
      }
    };
    locationToOsmAllBlocksQueryResultsTask({}, location).run().listen(defaultRunConfig(
      {
        onResolved: ({Ok: locationsWithBlocks, Error: errors}) => {
          // Paste the results of this into a geojson viewer for debugging
          //blocksToGeojson(R.map(R.prop('block'), locationsWithBlocks));
          expect(R.length(locationsWithBlocks)).toEqual(4);
        }
      }, errors, done)
    );
  }, 1000000);


  /*
  Workflow test, remove or codify
  test('locationToOsmAllBlocksThenBufferedMoreBlocksResultsTask', done => {
    expect.assertions(1);
    const errors = [];

    // This calls _constructStreetQuery indirectly
    locationToOsmAllBlocksThenBufferedMoreBlocksResultsTask({osmConfig: {}, bufferConfig: {radius: 50, units: 'meters', unionFeatures: true}}, {
      country: 'China 中国',
      city: '香港 Hong Kong',
      street: 'Des Voeux Road Central'
    }).run().listen(defaultRunConfig({
      onResolved: ({Ok: componentLocationResponses}) => {
        //locationsToGeojson(R.map(R.prop('location'), componentLocationResponses));
        expect(R.length(componentLocationResponses)).toEqual(2);
      }
    }, errors, done));
  }, 2000000);

  const sequencedTask = composeWithChain([
    results => {
      return locationsToGeojsonFileResultTask(
        '/tmp',
        `rescapeOsmlocationsToGeojsonFileResultTask_${moment().format('YYYY-MM-DD-HH-mm-SS')}`,
        results
      );
    },
    propSets => traverseReduce(
      // The accumulator
      (res, results) => {
        return R.mergeWith(R.concat, res, results);
      },
      of({Ok: [], Error: []}),
      R.map(
        location => locationToOsmAllBlocksQueryResultsTask(osmConfig, location),
        propSets
      )
    )])(propSets);

  const errors = [];
  sequencedTask.run().listen(
    defaultRunConfig({
      onResolved: results => {
        // Use Dump results to json streetviewConfig to figure out output dir
        log.debug(`Finished all propsets. Dumping results with processQueryForStreetviewResults`);
      }
    }, errors, () => {
    })
  )
  */
});
