# Roadmap

What might come next, what probably will not, and why. Nothing here is a
promise — it is the thinking written down so it does not have to be redone, and
so anyone who wants to pick something up knows where the seam is.

The shape of this plugin decides most of it. Advanced Maps **extends** the
first-party Maps view rather than replacing it, and owns no map library of its
own. That makes some features nearly free — anything reachable from a wrapper
already installed on the view — and others disproportionately expensive.

## Next

### Statistics on a base map, not just inline

The numbers under an inline `![[track.gpx]]` exist now. A track drawn on a
**base** map view shows none of them, because the surface it would use is the
note's own popup — and that popup is the native manager's, handed the note's
property value rather than the feature that was drawn. Adding to it means
deciding what a popup is for when the note holds several tracks.

Cheap part: `trackStats` is already a pure function over `rec.features` and the
cache already holds the parse. Expensive part is entirely the question above.

## Worth doing

### Adding a coordinate to an existing note from the map

The map's right-click menu creates a **new** note at the click, and now opens
the spot in an external map app. Stamping a note that already exists is the
missing third: it needs a note picker, which is a modal this plugin does not yet
have — `search-modal.ts` is the closest shape to copy.

The menu seam itself is solved and costs nothing to reuse: the native view
builds its menu with `Menu.forEvent(evt)`, which is Obsidian's public way for
several contributors to share one menu, so items can be appended after the
native call returns without patching anything.

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
  be hand-rolled from pointer events. The elevation profile under an inline map
  is hand-rolled SVG for the same reason, and is about the size such a thing can
  reasonably get before the argument stops holding.
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
