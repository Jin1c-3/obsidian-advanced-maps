## Context

See proposal.md — Why. The shape of the work is set by three things that were
already true of this codebase.

- A vault coordinate is WGS-84 and a drawn one is in the tile datum, crossed
  exactly once at the map boundary. A tape is one more thing that crosses it, and
  it crosses in both directions: `ev.lngLat` back to WGS-84 to be measured,
  WGS-84 forward to tile space to be drawn.
- Every listener put on a MapLibre map needs its exact `off`, because a native
  map outlives this plugin's hold on it. A tape is taken out and put away many
  times over one map's life, so this is the rule it exercises hardest.
- The distances themselves are already written. `haversine()` is the arithmetic,
  `formatDistance()` is the wording, and `unwrapGeometry()` already knows what to
  do about a line that crosses the 180th meridian.

Measured against the first-party Maps source rather than assumed
(`obsidian-maps/src/map/markers.ts`, `src/map-view.ts`): a click on a native pin
calls `onOpenFile` directly, `mouseenter` on a pin raises the popup, the map's
own context menu is a DOM `contextmenu` listener on the map element, and the
plugin's controls stack in the top-right corner. Each of those decided one line
of this design.

## Goals / Non-Goals

**Goals:**

- Answer "how far is that from this" in one gesture, and forget the answer.
- The whole arithmetic and drawing model testable without Obsidian: one pure
  function from a list of points and a projection to features and labels.
- Every borrowed thing given back — listeners, layers, source, the canvas class,
  the double-click zoom, and the control — by one method that is also `dispose`.

**Non-Goals:**

- **Drawing and editing shapes.** Still out; see ROADMAP.md. A measurement is
  appended to, undone and discarded — no vertex dragging, no shape kinds, no
  persistence — which is why it fits in three layers and one class.
- **Measuring area.** The name says distance. A closed ring is the first step
  towards the shape editor above, and nobody asked for it.
- **A tape on inline maps.** An `![[track.gpx]]` embed is one route at a fixed
  size with a bounded WebGL lifecycle; its question is already answered by the
  statistics under it.
- **A setting for the button.** Zoom-to-fit and follow have never had one, and a
  toggle per control is settings surface rather than a decision anyone makes.
- **Snapping to a track or a pin.** A tape measures where the reader pointed. A
  point that quietly moves to something nearby answers a question they did not
  ask.

## Decisions

### D1 — The points are WGS-84, and only the drawing is projected

`MeasureTool` holds `{lng, lat}` in vault space. `measureDrawing()` takes a
projection and applies it to build features and label anchors; nothing else in
the module knows a datum exists.

Two consequences, and both are the point. Distances are the ground distance
between the places clicked rather than between their offset copies — a few
hundred metres of error per point on a mainland background. And switching the
background under a live measurement redraws the same places where the new tiles
put them, without changing what the tape says.

### D2 — One unwrapped path feeds both the line and the labels

`unwrapGeometry()` is applied once, to the projected points including the one
under the pointer, and the line, the handles and the label anchors are all read
off the result. Unwrapping the line and placing the labels separately would put a
label a whole world away from its own segment for a measurement crossing the
180th meridian.

### D3 — The labels are DOM, not a symbol layer

A MapLibre `symbol` layer with text needs glyphs from the style. The styles this
plugin has to work under include a raster pack on disk, which has none. Absolutely
positioned elements over the canvas work on any style, follow the Obsidian theme
without a colour being resolved, and cost one `map.project()` per label per camera
frame — the same thing MapLibre's own markers do. They live inside the canvas
container, which is exactly the box `map.project()` answers in, so no offset
correction is needed.

### D4 — What the tape takes away, and how

While it is out, a click is a point. Three seams already open in `TrackLayer` are
used rather than new interception:

- this plugin's own `open()` and `hover()` return early;
- the wrapper on `popupManager.showPopup` swallows the call, so no card covers
  the ground being measured;
- the wrapper on `markerManager.onOpenFile` swallows it too — without this a
  point placed on top of a pin would also open that pin's note, because that is
  what a marker click does natively.

Beside them, `doubleClickZoom` is disabled, so two quickly-placed points are two
points rather than a zoom, and re-enabled only if it was enabled to begin with:
turning back on a handler the reader had deliberately turned off would be this
plugin changing a native map setting behind them.

The map's own context menu is deliberately **left alone**. Right-click-to-undo is
the convention in dedicated measuring tools, but here the right button already
means something on this map, and it means two different things depending on
whether a pin is under the pointer — the native marker layer has a `contextmenu`
handler of its own. Undo is the ↺ in the readout and **Backspace**, which are
unambiguous.

### D5 — The pointer's leg is drawn apart and counted apart

A dashed segment runs from the last point to the pointer, labelled with the total
including it; the readout shows only what has been placed. `line-dasharray` takes
no data-driven expression, so the preview is a second layer with its own filter
rather than a second paint value. It is a second layer for a second reason too:
it says "not yet" without a word.

On touch there is no pointer to follow, and the preview simply never appears —
the committed line, the labels and the readout are the whole tool there.

### D6 — Keystrokes are scoped to the map

`keydown` is bound to the map's canvas container, not the document. Escape
belongs to whatever the reader is actually in, and the canvas has it only once
they have clicked the map — which is also when they have started measuring.
Every key but Escape, Backspace and Delete is left to Obsidian and to MapLibre's
own keyboard panning.

## Risks / Trade-offs

- **A right-click mid-measurement still offers "New note here".** Accepted, per
  D4: a menu is dismissible, and the alternative behaves differently over a pin.
- **The label count is the reader's own hand.** No cap: a point costs one
  deliberate click, one circle feature and one small element, and the per-frame
  work is a `project()` and two style writes each. A bound here would be a number
  invented to look careful.
- **`doubleClickZoom` is undeclared host surface.** It is public MapLibre API,
  declared optional in `obsidian-internals.d.ts` like everything else this plugin
  reaches for, and shape-checked before use; a MapLibre without it simply keeps
  its double-click zoom.
- **`!important` on the measuring cursor.** The native view sets `is-over-marker`
  on the same element to ask for a pointer. While the tape is out the whole map
  is one measuring surface regardless of what is under the pointer, and the two
  rules differ only in order.
