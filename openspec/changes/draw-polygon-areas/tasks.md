## 1. Area layer

- [x] 1.1 Add the fill layer id and `FILL_OPACITY_RATIO` to `src/constants.ts`, next to the existing track layer ids and `TRACK_KNOBS`, with a comment stating the ratio's unit and the design.md D3 rationale for deriving it rather than configuring it
- [x] 1.2 Add the fill spec to `src/layers.ts` filtered to `Polygon`/`MultiPolygon`, painted with `amColor`
- [x] 1.3 Add it first in `addTrackLayers()` so every other owned layer draws over it, keeping the `before: MARKER_LAYER` anchor so the group stays beneath native pins
- [x] 1.4 Add its id to `removeTrackLayers()`, and update the layer counts in `drawTracks()`'s rollback comment and in `bindInteractions()`'s ordering comment now that the group is seven layers
- [x] 1.5 Set `fill-opacity` from the resolved track opacity in `applyTrackPaint()`, so a settings-only change reaches live maps and embeds without a file edit

## 2. Boundaries and route furniture

- [x] 2.1 Add `Polygon`/`MultiPolygon` to `lineLayerSpec.filter` so boundaries are stroked by the existing line paint
- [x] 2.2 Confirm `arrowLayerSpec` keeps its LineString-only filter, and note in the source why the two filters deliberately differ
- [x] 2.3 Confirm `lineEndpoints()` needs no change — it already answers `null` for anything that is not a line — and cover that with a test rather than a guard

## 3. KML polygons

- [x] 3.1 Read `<Polygon>` in `src/parse.ts`: the `<outerBoundaryIs>` ring first, then each `<innerBoundaryIs>` ring as a hole, carrying the enclosing placemark's name as today
- [x] 3.2 Stop emitting a ring as a line once a polygon has claimed it, while keeping a `<LinearRing>` outside any `<Polygon>` read as a line
- [x] 3.3 Move the existing `<LinearRing>`-reads-as-a-line expectation in `tests/parse.test.ts` to the bare-ring case, and add coverage for outer ring, holes, ring order, and several polygons inside one `<MultiGeometry>`

## 4. Interaction priority

- [x] 4.1 Append the fill layer to the interaction layer list in `TrackLayer.bindInteractions()`, after `ARROW_LAYER`, so an overlapping DOM event reaches every other owned layer first
- [x] 4.2 Test that a click and a hover on a point where an area overlaps a line, a waypoint, and a photo act on the feature above the area, and that an area alone still opens and describes its owning note
- [x] 4.3 Confirm the context menu is unaffected — it comes from the wrapped `view.showMapContextMenu`, not from a layer-scoped handler — and that its coordinates still read as WGS-84 over an area

## 5. Rendering and framing coverage

- [x] 5.1 Test that an area-only file draws a fill and a boundary, and that the framing it already produced now has something in it
- [x] 5.2 Test that a polygon's rings survive `projectGeometry` into GCJ-02 and BD-09 with their nesting and hole order intact
- [x] 5.3 Test that `trackStats()` reports zero distance and no extra figure for an area-only file — the exact condition the embed's statistics bar and profile are gated on, whose rendered half belongs to the live check below

## 6. Verification

- [x] 6.1 Run `npm run check`
- [ ] 6.2 Live-verify in the test vault: a GeoJSON polygon, a polygon with a hole, and a KML polygon each draw on a base map and in an inline embed; an area-only embed shows no statistics bar and no profile; the opacity slider moves fill and boundary together; a photo inside an area still opens on click and the map context menu still opens over one; `dev:errors` stays clean across a background switch to Chinese tiles and back
- [ ] 6.3 Note the KML rendering change (outline becomes filled) for the release notes
