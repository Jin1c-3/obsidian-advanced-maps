## Why

A route that crosses the 180th meridian is drawn the long way round the planet
and framed to the whole globe. Measured against a live Bases map with a 166 km
GeoJSON track off Fiji (179.2°E to 179.3°W):

- `TrackLayer.bounds()` answered west −179.7, east +179.95 — a span of 359.65°
  for geometry 1.5° wide — so automatic framing fitted the entire world at
  zoom 0.87.
- MapLibre drew the crossing segment as a straight line across Australia,
  Africa and South America, with the direction arrows pointing the wrong way and
  the start and end markers pushed to opposite screen edges.

Nothing in the plugin looks at the 180th meridian: the coordinates are handed to
`bounds.extend()` and to the GeoJSON source exactly as the file wrote them, and
both read `179.95 → -179.7` as a jump most of the way around the world rather
than the 38.8 km step it is.

The statistics are already right, and stay out of this change. `haversine()`
works on `sin(dLon/2)²`, whose trigonometry wraps on its own: the same track
measures 165.6 km end to end and 38.8 km across the crossing segment.

## What Changes

- Unwrap the longitudes of each drawn line and ring so no step between
  consecutive positions exceeds 180°, before the geometry reaches the map source
  or the bounds. A track that crosses the meridian eastward continues past 180°
  rather than restarting at −180°.
- Do it at the draw boundary only. The parsed record keeps the file's own
  coordinates, so statistics, the elevation profile, the hover corridor and
  every value shown, copied or written stay in ordinary WGS-84 range.
- Leave standalone points alone. A single position cannot cross anything, and
  choosing a meridian for a scattered set of them is a different problem.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `track-map-rendering`: adds a requirement that geometry crossing the 180th
  meridian is drawn along the ground it covers and framed to that ground, rather
  than to the numeric range of its longitudes.
- `inline-track-maps`: extends the inline framing requirement to state that
  framing covers the ground the drawn data occupies, so an embedded crossing
  track frames its own route rather than the world.

## Impact

- `src/geometry.ts` — `trackFeatures()`, where the drawn feature list is built
  and where both the map source and both bounds call sites read from.
- `tests/` — `geometry.test.ts` for the unwrapping itself and for the endpoints
  minted from an unwrapped line.
- No change to `src/parse.ts`, `src/track-cache.ts`, `src/stats.ts`,
  `src/coords.ts`, `src/layers.ts`, or any setting, dependency or persisted file.
  The record a file parses to is untouched, and the datum transform continues to
  see the coordinates the file stated.
