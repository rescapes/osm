/**
 * Created by Andy Likuski on 2019.08.14
 * Copyright (c) 2019 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  _cleanGeojson, _intersectionStreetNamesFromWaysAndNodes
} from './overpassFeatureHelpers';
import * as R from 'ramda';

describe('overpassFeatureHelpers', () => {

  test('cleanGeojson', () => {
    const feature =
      {
        type: "Feature",
        id: "way/24461945",
        properties: {
          type: "way",
          id: 24461945,
          tags: {
            highway: "tertiary",
            maxspeed: "30",
            // Offending tag. This needs to be converted
            'maxspeed:type': "sign",
            name: "Hospitalsgata",
            surface: "asphalt"
          },
          relations: [],
          meta: {}
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [
              5.7362284,
              58.9702788
            ],
            [
              5.7356397,
              58.9703641
            ]
          ]
        }
      };
    expect(_cleanGeojson(feature)).toEqual(
      R.over(
        R.lensPath(['properties', 'tags']),
        obj => R.set(R.lensProp('maxspeed__type'), 'sign', R.omit(['maxspeed:type'], obj)),
        feature
      )
    );
  });

  test('_intersectionStreetNamesFromWaysAndNodes', () => {
      const wayFeatures = [
        {
          "type": "Feature",
          "id": "way/5707230",
          "properties": {
            "type": "way",
            "id": 5707230,
            "tags": {
              "name": "134th Street"
            }
          }
        }
      ];
      const nodeFeatures = [
        {
          "id": "node/42875319"
        },
        {
          "id": "node/42901997"
        }
      ];
      const nodeIdToWaysOfNodeFeatures = {
        "42875319": [
          {
            "type": "Feature",
            "id": "way/5707230",
            "properties": {
              "type": "way",
              "id": 5707230,
              "tags": {
                "name": "134th Street"
              }
            }
          },
          {
            "type": "Feature",
            "id": "way/122633464",
            "properties": {
              "type": "way",
              "id": 122633464,
              "tags": {
                "name": "South Conduit Avenue"
              }
            }
          },
          {
            "type": "Feature",
            "id": "way/220107105",
            "properties": {
              "type": "way",
              "id": 220107105,
              "tags": {
                "name": "South Conduit Avenue"
              }
            }
          }
        ],
        "42901997": [
          {
            "type": "Feature",
            "id": "way/5707230",
            "properties": {
              "type": "way",
              "id": 5707230,
              "tags": {
                "name": "134th Street"
              }
            }
          },
          {
            "type": "Feature",
            "id": "way/219610989",
            "properties": {
              "type": "way",
              "id": 219610989,
              "tags": {
                "name": "149th Avenue"
              }
            }
          },
          {
            "type": "Feature",
            "id": "way/219610991",
            "properties": {
              "type": "way",
              "id": 219610991,
              "tags": {
                "name": "134th Street"
              }
            }
          }
        ]
      };
      expect(
        _intersectionStreetNamesFromWaysAndNodes(wayFeatures, nodeFeatures, nodeIdToWaysOfNodeFeatures)
      ).toEqual(
        {"42875319": ["134th Street", "South Conduit Avenue"], "42901997": ["134th Street", "149th Avenue"]}
      );
    }
  );
});