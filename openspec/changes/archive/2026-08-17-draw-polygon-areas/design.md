## Context

See proposal.md — Why for the defect and where each half of it lives.

Three facts about the current code shape the approach:

- **The data already arrives.** Parsing, note ownership, datum projection,
  memoization, and framing all handle a polygon correctly today; only the draw
  step is absent. So this is a rendering change, not a pipeline change, and
  nothing upstream of `drawTracks()` needs to move.
- **Both map surfaces share one layer group.** `addTrackLayers()`,
  `drawTracks()`, `removeTrackLayers()`, and `applyTrackPaint()` are called by
  `TrackLayer` (native base maps) and by `TrackEmbed` (inline maps) alike, so a
  layer added once appears on both. The embed needs no code of its own.
- **Interaction is decided by registration order, not by z-order.** The comment
  at `src/track-layer.ts:995` states it: MapLibre delegates an overlapping DOM
  event in registration order, and both `open()` and `hover()` act on the first
  delivery only. A new layer therefore inherits a priority from where it is put
  in one array.

## Goals / Non-Goals

**Goals:**

- A file whose only geometry is an area draws that area where the camera already
  goes for it.
- An area never becomes the interaction target for anything drawn over it.
- KML polygons keep their holes.
- No new setting, no new localized string, no new dependency.

**Non-Goals:**

- Editing or authoring areas. This change draws what a file already contains.
- Area measurements — square kilometres, perimeter, centroid. `stats.ts` is
  about routes; an area statistic is a separate question with its own units,
  its own datum caveat, and its own place in the stats bar.
- Antimeridian correctness. A polygon that crosses 180° will be tessellated the
  wrong way round, exactly as a line crossing it is drawn the wrong way round
  today. That defect is shared, older, and belongs in its own change.
- Per-area styling from file properties (`fill`, `stroke`, `fill-opacity` as
  simplestyle keys). Ownership colour is the plugin's existing contract for
  every drawn feature; changing that is a display-rules question.
- GPX and TCX. Neither format has an area.

## Decisions

### D1 — A dedicated fill layer, at the bottom of the owned group

Add one `fill` layer filtered to `Polygon`/`MultiPolygon`, added first in
`addTrackLayers()` so every other owned layer draws over it, and still passed the
same `before: MARKER_LAYER` anchor so the whole group stays beneath native pins.

_Why:_ the alternative — drawing areas with the existing line layer and no fill —
is what KML accidentally does today, and it is exactly the case the proposal
calls indistinguishable from an empty file at anything below full zoom. A fill is
the only rendering that answers "is there something here?" at a glance.

_Why not extend an existing layer instead:_ MapLibre has no layer type that
strokes lines and fills areas from one spec. Two layers is the minimum.

### D2 — The boundary is stroked by the existing line layer

Add `Polygon`/`MultiPolygon` to `lineLayerSpec.filter`. MapLibre's `line` type
renders a polygon's rings as closed lines, so the boundary picks up `amColor`,
`trackWeight`, and `trackOpacity` with no second paint path.

_Why:_ a fill alone has a soft edge against a busy basemap, and a separate
outline layer would need its own copy of every paint property `applyTrackPaint()`
already sets on the line layer. This keeps one place where a track's stroke is
defined.

_What must not follow it:_ `arrowLayerSpec` carries the same
LineString/MultiLineString filter and must keep it. An area has no travel
direction, and arrows marching around a country's border would state one.
`lineEndpoints()` already returns `null` for anything that is not a line, so
start/end markers need no guard added — that is behaviour to lock in a test, not
code to write.

### D3 — Fill opacity is derived from `trackOpacity`, not configured

One constant, `FILL_OPACITY_RATIO`, multiplies the resolved track opacity to give
`fill-opacity`. `applyTrackPaint()` sets it on every sync, like every other
appearance property.

_Why derived:_ the fill and its own boundary are one object to a reader; a
setting that let them disagree buys nothing. Deriving keeps the existing opacity
slider meaningful for areas and adds no settings field, no `DEFAULTS` entry, no
refresh-key entry, and no pair of i18n strings in two languages.

_Why a ratio rather than a fixed value:_ at the default 85% track opacity a fill
at the same value hides the basemap under it — roads and labels a reader needs to
place the area. The ratio keeps "more opaque tracks means more opaque areas"
true while landing the default fill near 20%.

_Alternative considered:_ a `trackFillOpacity` knob. Rejected for now, not
forever; the ratio is one constant to promote to a knob later if real areas ask
for it, and the spec fixes only that the fill follows the opacity setting.

### D4 — The area is registered last, and asks whether a native pin holds the pointer

Append the fill layer to the end of the interaction array in
`TrackLayer.bindInteractions()`, after `ARROW_LAYER` — and, for that layer only,
wrap its click and mousemove callbacks in a check for a native marker under
`ev.point`.

_Why registered last:_ an area is the one owned feature that can cover the whole
viewport. Every other stacking question in this codebase is between features of
comparable size, where either answer is defensible; here it is not. A click on a
photo sitting inside a region must open the photo, and a hover over a track
crossing a region must describe the track. Registering last is the existing
mechanism for saying so, and the existing `handledClick` / first-delivery guards
then discard the area's duplicate delivery of the same DOM event.

_Why that is not enough:_ measured on a live map, the native view binds its own
`marker-pins` handlers **after** this plugin's — the delegated-listener table
reads `…, advanced-maps-track-areas, marker-pins`. Registration order therefore
hands an overlapping click to the area first, and a click on a pin standing
inside a region opened two notes: the area's, then the pin's. Order can rank the
plugin's own layers against each other; it cannot rank one of them against a
native layer bound later. Asking what is rendered under the pointer can, so the
area asks.

_Why only the area asks:_ every other owned feature is small enough that landing
on one is a deliberate choice, and a photo or waypoint over a pin is a case where
the owned feature is the more specific answer. Broadening the check would change
behaviour that is already correct.

_Cost:_ one `queryRenderedFeatures` restricted to a single layer, on area clicks
and on pointer samples that reach the area — not on samples over any other owned
feature, since those never reach the area's handler at all.

_What this does not affect:_ the map context menu. This plugin reaches it by
wrapping `view.showMapContextMenu` (`src/track-layer.ts:296`), a view method
driven by a map-level DOM event, not by a layer-scoped MapLibre handler. A fill
covering the pointer cannot suppress it, and "Copy coordinates" and the
external-map items keep working over an area. This is worth stating because it
is the failure other implementations report from adding fills, and here the
answer is structural rather than something to be careful about.

_Consequence to accept:_ an area with nothing over it does answer hover and
click, opening its owning note — which is the point. The cursor changes over it
the same way it does over a track.

_Provenance:_ `queryRenderedFeatures` is public MapLibre API, but this plugin
carries no `maplibre-gl` dependency, so it is declared in
`obsidian-internals.d.ts` like every other map member — optional, shape-checked
before use, and standing down to "no pin here" when absent.

### D5 — KML `<Polygon>` becomes a polygon; a bare `<LinearRing>` stays a line

Read `<Polygon>` directly: the ring under `<outerBoundaryIs>` is the outer ring,
each ring under `<innerBoundaryIs>` is a hole, in that order. Rings already
consumed by a `<Polygon>` are not also emitted as lines. A `<LinearRing>` with no
enclosing `<Polygon>` keeps its current LineString reading.

_Why:_ `parse.ts` currently iterates `byLocalName(doc, 'LinearRing')` with no
regard for what encloses it, which is why holes and outer rings are
indistinguishable in the output — a hole is drawn as another line. Reading the
container is what makes a hole expressible at all, and GeoJSON's ring order
(outer first) is what MapLibre needs anyway.

_Why keep the bare-ring case:_ `<LinearRing>` is legal outside `<Polygon>`, the
existing test asserts that reading, and a ring that nobody declared as a boundary
has no interior to claim.

_Accepted behaviour change:_ KML areas that draw as outlines today will draw
filled. This is the change asking to be made, but it is visible to anyone already
mapping KML, so it belongs in the release note rather than only in the spec.

### D6 — `MultiGeometry` needs no special case

KML wraps multiple geometries in `<MultiGeometry>`; `byLocalName` already walks
the whole document and finds each `<Polygon>` inside one. Several polygons in one
placemark become several features that share the placemark's name, which is what
the existing code does for several `<LineString>`s.

## Risks / Trade-offs

- **A malformed ring tessellates strangely** → MapLibre's fill tessellation
  tolerates self-intersecting and unclosed rings by producing an odd shape, not
  by throwing. That matches how this codebase treats every other malformed
  input: draw what was written rather than guess at what was meant.
- **A very large area over a busy basemap hides context** → the derived opacity
  is the mitigation, and the existing opacity slider is the reader's control.
- **KML users see a visual change without asking for one** → called out in the
  proposal as breaking for KML rendering and belonging in the release note.
- **The interaction array grows to seven layers** → each stacked layer means one
  more duplicate delivery for the same DOM event, all collapsed by the existing
  `handledClick` and unchanged-feature guards. The cost is per pointer sample and
  already measured for six.
- **`drawTracks()`'s rollback must cover the new layer** → its `catch` calls
  `removeTrackLayers()` precisely so a partial add cannot strand the group in a
  state where `setData` succeeds forever and the missing layers never return. The
  new id has to be in that removal list, and its absence would be invisible until
  a style swap raced an add.
- **Areas reach `spread.ts`** → they do not. Pin spreading operates on marker
  points; an area has no pin to spread and no anchor to offset.

## Migration Plan

None. No persisted data, no settings, no manifest change. A vault whose files
contain no areas renders identically. Rollback is reverting the change; KML
outlines return to being outlines.

## Open Questions

- Whether `FILL_OPACITY_RATIO` should become a setting. Deferrable: it changes a
  constant into a knob without changing the spec, the approach, or the tasks.
- Whether an area should contribute a hover popup at all, or only a click.
  Current answer is both, matching tracks; revisit only if real use shows areas
  raising popups where a reader wanted the basemap.
