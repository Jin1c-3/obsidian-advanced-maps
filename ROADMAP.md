# Roadmap

What might come next, what probably will not, and why. Nothing here is a
promise — it is the thinking written down so it does not have to be redone, and
so anyone who wants to pick something up knows where the seam is.

The shape of this plugin decides most of it. Advanced Maps **extends** the
first-party Maps view rather than replacing it, and owns no map library of its
own. That makes some features nearly free — anything reachable from a wrapper
already installed on the view — and others disproportionately expensive.

## Next

### "Convert to coordinates" in the editor's menu

Promoted once the offline basemap that stood here shipped, and picked for the
same reason that one was: there is no unknown left in it. `geolink.ts` already
reads a coordinate out of pasted text, behind a modal opened from the command
palette. A link sitting in a note could go through the same reader from the
editor's own right-click menu, with no box to open — `editor-menu` is a
documented workspace event, the selection is in hand, and the write is the
`processFrontMatter` seam every other coordinate command already uses.

Cheap, and it is where somebody who has just pasted a share link actually is.

The neighbouring entry, _Dropping a note onto the map to place it_, stays under
_Worth doing_ deliberately: its one open question — whether a real drag from the
file explorer reaches the map container, or is taken by the workspace's own
drag-over pipeline first — cannot be answered by a synthetic `DragEvent`. It
needs a human hand on a real drag, and until somebody does that the work cannot
be scoped.

## Worth doing

### Dropping a note onto the map to place it

The menu half of this is done: **Set a note's coordinates here** picks a note and
writes the clicked coordinate into it, through `clickedCoordinate()` in
`track-layer.ts` and the same `processFrontMatter` seam every other coordinate
command uses. Dropping a note from the file explorer onto the map is the second
trigger, asked for as esm7/obsidian-map-view#49, and it reuses all of that — what
is missing is only the drop itself.

Measured rather than assumed, so the next attempt does not start from scratch:

- `app.dragManager` exists and exposes `draggable`, `dragFile`, `handleDrag`,
  `handleDrop`, `onDragOver`, `showOverlay` and an `isDragOverHandled` flag.
  Entirely undocumented, so it would need a declaration with provenance in
  `src/types/obsidian-internals.d.ts`.
- `dragManager.dragFile(event, file)` returns `{source, type: 'file', icon,
title, file}` **and** writes into the event's `dataTransfer`: `text/plain` and
  `text/uri-list` both carry `obsidian://open?vault=<name>&file=<path>`, the
  app's own public URI with the extension dropped. A drop handler therefore has a
  documented payload to read and need not depend on the internal at all.
- What is unmeasured is the part that decides it: whether a real drag from the
  file explorer reaches the map container, or is taken by the workspace's own
  drag-over pipeline first. A synthetic `DragEvent` proves only that a listener
  is wired; this one needs a human dragging a file.

Dragging an existing **pin** is still the one to leave alone (#43, #236, and an
open pull request there). Those markers belong to the native manager, and moving
one means owning it.

### Lighting up where you have been

Filling in the provinces or cities a vault has notes in — the "footprint map"
every Chinese travel app is built around. The fill layer it needs is no longer
missing: since 1.14.0 a GeoJSON or KML holding a region is drawn as an area, in
the colour of the note that links it.

Naming a coordinate is no longer the missing half: `reverseRequest`/
`parseReverse` in `geocode.ts` and the _Fill place name from coordinates_
command answer "what is at this point" today, through the same two providers
place search already uses. Where a coordinate itself comes from is also wider
than it was: a geotagged photo now reaches a coordinate through the exact same
pipeline a note's own `coords` property does — see CLAUDE.md's "Coordinates
from a photo's EXIF" — so a footprint built from every note's coordinate could
just as well be built from every photo's, without a second reader to write.
What is still undone is the one part that was never about geocoding, and it is
now the only part: the boundaries themselves — a GeoJSON file **the reader keeps
in their vault** rather than data bundled into the plugin — and the join between
them and the notes, deciding which region a coordinate falls inside and colouring
that region by how many landed there rather than by whichever note linked the
file. Drawing an area is solved; asking what is inside one is not.

Map View has the neighbouring half open as esm7/obsidian-map-view#292, areas as
things a note can be attached to, and #356 because a filled polygon there
swallows the right-click that would have put a note inside it. The second is
already answered here — an area is the lowest-priority pointer target, so the
map's own context menu opens over one exactly as it does anywhere else.

### Edges between linked notes

Map View draws lines between the markers of notes that link to each other. One
more GeoJSON source and one more line layer — the shape `layers.ts` already has
— and the same idea as _a map of the notes around a note_, drawn instead of
filtered. Worth a guard: it is recomputed on every metadata change, and Map
View's own documentation warns about thousands of edges. An edge between a note
in Fiji and a note in Chile is a line across the antimeridian, which 1.14.0
already unwraps for tracks — `unwrapGeometry()` in `geometry.ts` is the same
arithmetic, reached the same way.

### Obsidian CLI commands, and a skill

Map View registers `mv-geosearch`, `mv-calc-distance`, `mv-query` and ships a
Claude skill that uses them for trip planning. The CLI is already how the view
wrappers here get tested, so registering a few real commands — place search,
track statistics, a coordinate conversion — is a short step. It is also the only
honest way to do the "paste a travel guide and get places out" feature those
apps have: extracting place names from prose is a job for a model, not for a
regex.

## Deliberately not

Each of these is a real feature that other map plugins, or the travel apps this
was compared against, have. They are listed here so the question does not keep
getting reopened.

- **Route planning.** Needs a routing service and an API key, and the free tiers
  are not usable in every country this plugin's users are in. It is a whole
  product, not a feature.
- **Downloading tiles for offline use.** Serving tiles that are already on disk
  turned out to be reachable and has shipped. Fetching them in bulk from a
  provider did not: that is their terms of service to grant, and a plugin that
  ships a "download this area" button grants it on the reader's behalf. A
  single-file `.pmtiles` or `.mbtiles` is out for the original reason — it needs
  `addProtocol`, which is a module-level export of a MapLibre this plugin does
  not bundle — so a pack has to be unpacked into a directory tree first.
- **Drawing and editing shapes on the map.** No drawing library is reachable, so
  it would be hand-rolled from pointer events. The elevation profile under an
  inline map is hand-rolled SVG for the same reason, and is about the size such
  a thing can reasonably get before the argument stops holding.
- **Display rules and a query language.** Bases already has filters, formulas and
  per-note colours and icons, and the map view reads them. Building a second
  system beside it would duplicate the host and undercut the one thing this
  plugin is for: making the built-in view better rather than replacing it. The
  most-argued request in that plugin's tracker is the tempting exception —
  esm7/obsidian-map-view#183, a note's own image as its marker — and the photo
  symbol layer here could draw it tomorrow. What it cannot do is put it where
  the native pin already is: two markers land on one coordinate, and the answer
  is either an offset that lies about the position or hiding a marker this
  plugin does not own.
- **Presets, and URLs that reopen a saved map.** A saved query, position and
  basemap is what a **view in a base** already is, and it is one the reader can
  name, share and edit without this plugin. Storing a second copy of that in
  plugin settings would be a parallel system with a worse editor.
- **Itinerary planning, day-by-day timelines, collaborative editing, nearby
  recommendations.** The travel apps are built around these and they are a
  different product: a sync service, a content source and a scheduler. A vault
  of notes with dates in them is already a timeline, and Bases already filters
  by date.
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
