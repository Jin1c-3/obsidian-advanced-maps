## Why

"How far is that from this?" is the one question a map answers better than any
note, and neither the native Maps view nor this plugin could answer it. Route
statistics measure a file that already exists; there was nothing for a distance
the reader wants to know once, between two places nobody has written down.

The parts were already here. `haversine()` in `stats.ts` is the arithmetic;
`formatDistance()` is the wording; `layers.ts` owns sources and layers on a
native map, and `MapEventBindings` owns the listeners on one. What was missing
was a tool to hold them, and one decision.

**Which datum is a measurement in?** The map draws in the tile datum, which on a
mainland background is GCJ-02 — the same offset every other coordinate in this
plugin crosses exactly once. A tape measures the ground, so it holds the WGS-84
places behind the pixels and projects them only to draw. Measuring the offset
copies would answer for a pair of points that are each a few hundred metres from
where the reader clicked, and the answer would change when they switched the
background under it.

The neighbouring question is what this deliberately is not. ROADMAP.md rules out
**drawing and editing shapes on the map**, because with no drawing library
reachable it would be hand-rolled from pointer events. A measurement is not that
shape: it is appended to, undone and discarded, never edited, never named, never
saved, and it has one geometry rather than a palette of them. It costs three
layers and one class, and it leaves the map exactly as it found it.

## What Changes

- Add `src/measure.ts`: the arithmetic and the drawing model — cumulative
  distances, the features for one tape, and the labels beside it — pure, and
  taking the projection as an argument so the datum stays at the boundary.
- Add `src/measure-tool.ts`: one map's tape. Its own source and layers, DOM
  labels over the canvas, a readout control, and every listener paired with the
  `off` that removes it.
- Add a ruler control beside zoom-to-fit and follow, and generalize the pressed
  look the follow button already had into a shared toggle control.
- While the tape is out, withhold what would otherwise answer a click: this
  plugin's own note and photo opening, the native pin's popup, and the native
  pin's **open this file** — measured against the Maps source, where a marker
  click opens the note directly rather than only raising a card. Turn off the
  double-click zoom so two quickly-placed points are two points.
- Base map views only. An inline `![[track.gpx]]` map is one route at a fixed
  size with a bounded WebGL lifecycle, and a tape has nothing to add to it.
- Nothing is written to a note, and nothing survives putting the tape away.

## Impact

- Affected specs: `map-measuring` (new).
- Affected code: `src/measure.ts` (new), `src/measure-tool.ts` (new),
  `src/layers.ts`, `src/track-layer.ts`, `src/map-events.ts`,
  `src/constants.ts`, `src/i18n.ts`, `src/types/obsidian-internals.d.ts`,
  `styles.css`, `vitest.config.mts`.
- Affected docs: `docs/guide/{en,zh-cn}/around-and-navigation.md`, both README
  guide tables, and `docs/images/measure-distance.png`.
- No settings, no storage, and no change to what any existing map does until the
  ruler is pressed.
