## Why

A polygon that reaches this plugin today is handled everywhere except the one
place a reader can see. `trackFeatures()` pushes every parsed feature into the
drawn collection without inspecting its geometry type (`src/geometry.ts:161`);
`projectGeometry()` shifts its rings into the tile datum with the nesting
preserved (`src/coords.ts:151`, covered by `tests/coords.test.ts:188`); and
`extendBounds()` counts every one of its vertices toward automatic framing
(`src/geometry.ts:29`, covered by `tests/geometry.test.ts:250`). No layer draws
it: the line layer's filter admits `LineString`/`MultiLineString` only
(`src/layers.ts:132`) and the point layer's admits `Point`/`MultiPoint`
(`src/layers.ts:144`).

The observable result is not a missing feature but a wrong one. A GeoJSON file
holding a boundary, a park, a search area, or a country outline makes the camera
fly to that area's bounds and show nothing there, with no error and no way for
the reader to tell an unsupported geometry from an empty file. KML fares
accidentally better: `parse.ts` reads a `<LinearRing>` as a `LineString`, so a
KML polygon draws as an unfilled outline.

Areas are also the missing half of two roadmap entries — a place footprint map,
and importing a KML's placemarks — neither of which can be attempted while the
renderer has no notion of an area.

## What Changes

- Draw area geometry. `Polygon` and `MultiPolygon` features get a filled layer
  beneath every other owned layer, in the owning note's colour, and their
  boundaries are stroked by the existing track-line layer.
- Read KML `<Polygon>` as a polygon: `<outerBoundaryIs>` becomes the outer ring
  and each `<innerBoundaryIs>` becomes a hole, so an area with a hole renders
  with its hole. **BREAKING for KML rendering only:** a ring that today draws as
  an unfilled outline will draw as a filled area. A `<LinearRing>` that is not
  inside a `<Polygon>` keeps drawing as a line.
- Give areas no route furniture. Direction arrows and start/end markers stay
  line-only, and areas keep contributing nothing to distance, ascent, duration,
  or the elevation profile.
- Make the area the lowest-priority interaction target, so a fill covering half
  the viewport can never take a click or a hover away from a line, waypoint,
  photo, or native pin drawn over it.
- Derive fill opacity from the existing track-opacity setting rather than adding
  a knob. No new setting, no new localized string.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `track-map-rendering`: adds a requirement that area geometry is drawn wherever
  it is already framed, in the owning note's colour, without becoming the
  interaction target for features drawn above it; extends the format requirement
  to state that a KML polygon's boundaries and holes survive reading; and
  extends the route-features requirement to state that an area is not given the
  direction and endpoint roles a route gets.
- `inline-track-maps`: extends the statistics requirement to state that geometry
  which is not a route contributes nothing to the figures, so an area-only embed
  draws its area and shows no statistics bar or profile rather than an empty map.

## Impact

- `src/constants.ts` — one layer id and one fill-opacity ratio, alongside the
  existing track layer ids and `TRACK_KNOBS`.
- `src/layers.ts` — the new fill spec; the line layer's filter; add, remove, and
  paint order across what becomes seven owned layers.
- `src/parse.ts` — KML polygon boundaries and holes; `<LinearRing>` outside a
  `<Polygon>` unchanged.
- `src/track-layer.ts` — the interaction layer list, whose registration order
  decides which of two stacked features wins.
- `tests/` — `parse.test.ts` (the existing `<LinearRing>` expectation moves to
  the bare-ring case), plus new layer, geometry, and interaction coverage.
- No dependency, setting, persisted-data, localization, or manifest change.
- `src/embed.ts`, `src/stats.ts`, `src/spread.ts`, and `src/geometry.ts` are
  deliberately untouched: the embed picks up the shared layer automatically, and
  the other three are already correct for areas.
