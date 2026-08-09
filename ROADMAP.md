# Roadmap

What might come next, what probably will not, and why. Nothing here is a
promise — it is the thinking written down so it does not have to be redone, and
so anyone who wants to pick something up knows where the seam is.

The shape of this plugin decides most of it. Advanced Maps **extends** the
first-party Maps view rather than replacing it, and owns no map library of its
own. That makes some features nearly free — anything reachable from a wrapper
already installed on the view — and others disproportionately expensive.

## Next

### Track statistics

Distance, ascent, moving time, pace — and an elevation profile. `.gpx` files
carry all of it and the plugin currently throws it away.

Not as cheap as it looks. `collectPoints` in `parse.ts` keeps `[lon, lat]` and
drops `<ele>` and `<time>` entirely, so the parser has to grow first. Elevation
is easy: GeoJSON positions allow a third member, and `projectGeometry` already
preserves trailing members through the coordinate conversion. Time has no place
in a GeoJSON position at all and would have to ride along in feature properties,
the way most GPX converters do it.

The statistics themselves are then pure functions over an array — exactly the
kind of thing this repo tests properly. One trap: measure `rec.features`, never
what `projectedFeatures()` hands back. The GCJ and BD offsets are non-linear, so
a distance taken in tile space is a distance in the wrong space — small enough
to look right, which is what makes it worth writing down.

## Worth doing

### KML and TCX

Two more branches in `parseTrack` and two more entries in `TRACK_EXTS`; the
shapes they produce are the same ones already drawn. Low glamour. The value is
mostly that a "not supported" line disappears — on a comparison table, a blank
cell puts people off more than the missing feature does.

### More on the map's right-click menu

Adding a coordinate to an **existing** note, and opening a spot in an external
map app for navigation. The native menu already creates a new note and copies
coordinates.

Feasible without re-implementing the menu: `showMapContextMenu` is wrapped
already, and the same trick used there for `unproject` — swap something for the
length of one synchronous call, restore it in a `finally` — reaches the `Menu`
the native code builds. Rebuilding the menu instead would mean re-implementing
four native items and losing whatever a future one adds.

### Follow the active note

An open map view panning to, or highlighting, the note being edited. Half the
plumbing exists in "open in map".

## Deliberately not

Each of these is a real feature that other map plugins have. They are listed
here so the question does not keep getting reopened.

- **Route planning.** Needs a routing service and an API key, and the free tiers
  are not usable in every country this plugin's users are in. It is a whole
  product, not a feature.
- **Offline tile download.** Genuinely the strongest moat of anything on this
  page, and the most expensive: raster tiles mean intercepting tile requests and
  owning a store, on a map instance this plugin does not create.
- **Drawing and editing shapes on the map.** No drawing library is reachable —
  MapLibre comes from the native view and nothing else is bundled — so it would
  be hand-rolled from pointer events.
- **Display rules and a query language.** Bases already has filters, formulas and
  per-note colours and icons, and the map view reads them. Building a second
  system beside it would duplicate the host and undercut the one thing this
  plugin is for: making the built-in view better rather than replacing it.
- **Several points inside one note.** Inline coordinates in the body, each
  becoming its own pin. The seam looked cheap — `createGeoJSONFeatures` is
  already wrapped — but a synthetic pin's popup opens at the note's own
  coordinate rather than at itself, since the native popup manager is handed the
  property value and not the feature; that is the same bug the wrapper on
  `showPopup` exists to fix, and it comes back for every appended point.
  **Done instead:** _Insert a map of the notes around this one_. A note stays one
  place, and a map of several places is one line embedding a view in your base,
  filtered to the notes around its host — linked, linking back, and itself —
  which is Bases doing what Bases is for.

## If you want to pick something up

[CLAUDE.md](CLAUDE.md) is the technical document — how the registry patch works,
every place a coordinate crosses between WGS-84 and tile space, and the
non-obvious things not to undo. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup
and the house rules for the patching code. Anything touching the coordinate
maths, a parser or the locator needs a test in the same PR.
