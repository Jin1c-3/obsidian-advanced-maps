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
note's own popup — and that popup is the native manager's.

The landing place already exists: `hover()` in `track-layer.ts` reuses the
native popup when the cursor is over a track. So the question is what goes into
that card, and the card belongs to a **note**, which may carry several tracks.
Three answers, and the first is the one to try:

- **Whichever track is under the cursor.** Cleanest meaning, and it needs one
  more data change on top of what start/end markers already added: a track
  feature's properties are `{ amColor, amIndex, amName?, amRole? }`, and
  `amIndex` points at the _note_ — the loop that builds them walks
  `item.trackFiles` and stamps them all with the same index. Per-track numbers
  need a second index alongside it.
- **The note's tracks summed.** No data change, and a morning hike plus an
  afternoon ride add up to a number that describes neither.
- **A panel of our own on click.** Most freedom, but it leaves the native look
  behind, which is the thing this plugin is for.

One unknown to probe rather than assume: `PopupManager` declares `showPopup` and
`hidePopup` and no handle on the element, so appending to the card means finding
it after `showPopup` returns. Measure it with `obsidian eval` first.

The elevation profile stays inline. A popup is narrow and the SVG needs width.

### Waypoint names on hover, on a base map

A waypoint's own name shows on hover today, but only on an inline
`![[track.gpx]]` embed — see CLAUDE.md's "Start/end markers, direction and
waypoint names". The embed half shipped; the base-view half did not, for the
same reason the section above is still open: hovering a track on a **base**
view already opens the row's own popup, through `hover()` in `track-layer.ts`
calling `popupManager.showPopup`, and a second, independent tooltip on that
same hover risks visually fighting it — two floating boxes, or one hiding the
other — with `PopupManager` owning DOM neither this plugin nor a hand-built
tooltip has a handle on.

The two gaps are almost certainly the same seam. Whatever eventually reaches
_inside_ that popup's own content — to add per-track statistics, the entry
directly above this one — is probably the same mechanism a waypoint's name
under the cursor should go through too, rather than two separate answers to
"how does this plugin add something to a popup it does not own."

### Photo thumbnails on hover, on a base map

A third twin of the same gap. A photo pin's own thumbnail shows on hover today
— see CLAUDE.md's "Coordinates from a photo's EXIF" — but only on an inline
`![[photo.jpg]]` embed, for the identical reason a waypoint's name is
embed-only: hovering a track (or, now, a photo) on a **base** view already
opens the row's own popup through `hover()` in `track-layer.ts` calling
`popupManager.showPopup`, and a second, independent tooltip on that same hover
risks fighting it — two floating boxes, or one hiding the other — with
`PopupManager` owning DOM this plugin has no handle on.

Not a fourth answer to "how does this plugin add something to a popup it does
not own" — it is the same open question as the two entries above it, and
whatever eventually answers one almost certainly answers all three: a
per-track statistics line, a waypoint's name, and a photo's own thumbnail are
all "one more thing this plugin wants inside a card it did not build."

## Worth doing

### Polygons, which a linked file can already hold

`layers.ts` draws lines, waypoint dots, endpoints, arrows and photos. The line
layer filters `LineString` and `MultiLineString`, the circle layer filters
`Point` and `MultiPoint`, and nothing filters `Polygon` at all. So a `.geojson`
holding one — an administrative boundary, a park, a Google Earth area — draws
**nothing**, while `extendBounds` still walks its ring, counts the vertices and
pulls zoom-to-fit onto a blank patch of map. KML comes off better by accident:
`parse.ts` reads a `<Polygon>`'s `<LinearRing>` as a LineString, so the outline
survives and the fill never existed.

One `fill` layer below the line layer closes it, reading the same `amColor` the
other layers read and following the same add and remove ordering. It is also
the missing half of _Lighting up where you have been_ below, which has been
waiting on exactly this.

Map View has both halves open as requests — esm7/obsidian-map-view#292 for
areas as things you can attach a note to, and #356 because a filled polygon
swallows the right-click that would have put a note inside it. The second is
worth answering in the same change: a fill that eats the map's own context menu
trades one feature for another.

### Track statistics where a filter can reach them

`trackStats()` already computes distance, ascent, descent, elevation range,
elapsed and moving time, and pace — and they exist only under an inline
`![[track.gpx]]`. A command that writes them into the owning note's frontmatter,
through the `processFrontMatter` seam _Fill coordinates from a photo_ already
uses, turns them into something Bases sorts, filters, and shows as a column.

It is also the cheap half of _Statistics on a base map_ at the top of this file.
That entry is blocked on reaching inside a popup this plugin does not own; a
number living in a property does not need the popup at all. Not a substitute —
hovering one track still wants that track's own numbers — but it ships without
solving the hard one first.

Two rules if it gets built: it writes when asked and never during a scan, and it
does not overwrite a value the reader put there. Map View has the same gap from
the other side, esm7/obsidian-map-view#376 — a saved route keeps its geometry
and loses its numbers.

### Basemap tiles that are already on disk

This entry used to sit under _Deliberately not_, on the grounds that MapLibre's
`addProtocol` is a module-level export and `transformRequest` a constructor
option, and this plugin has neither. That is true, and it is not what a local
basemap needs. Measured against a live map view rather than argued:

- The native background setting validates nothing. `settings.ts` stores whatever
  string is typed, and `style.ts` asks only whether it contains `{z}`, `{x}` or
  `{y}` — if it does, that string becomes the `tiles` array of a raster source
  and reaches MapLibre without ever passing through `requestUrl`.
- MapLibre fetches raster tiles from `app://…/{z}/{x}/{y}.png` on the main
  thread: sixteen tiles, sixteen 200s, no map errors, and the pixels confirmed by
  reading the canvas back. The path may sit outside the vault, so a tile pack
  does not have to be a folder Obsidian indexes.
- This plugin's own layers survive the style swap. After `updateMapStyle()` the
  style held `custom-tiles-0`, every `advanced-maps-*` layer, and `marker-pins`.

Two things do stand in the way, and both are the plugin's to solve:

- **The `app://` token is per-launch.** The main process builds it as
  `"app://" + Ut(36) + "/"`, `Ut` being a `Math.random()` hex generator, hands it
  to the renderer over the `file-url` IPC, and persists it nowhere. A URL typed
  into the native setting by hand therefore rots at the next restart, which is
  why this is a feature rather than a paragraph of documentation: the current
  `app.vault.adapter.resourcePathPrefix` has to be written in at attach time.
- **The native raster source states no `maxzoom`**, so it defaults to 22 and
  every zoom past the pack's deepest level asks for tiles that are not there —
  twenty-eight `Failed to fetch` errors on one zoom-in. MapLibre keeps drawing
  over-zoomed parents, so the map goes blurry rather than blank, and setting
  `maxzoom` followed by `setTiles` on the source took the count to zero.

What this is not is a **download** button. Bulk-fetching a provider's tiles is
their terms to give and not this plugin's to assume; the feature is pointing at
a pack the reader already holds. A single-file `.pmtiles` or `.mbtiles` does
still need `addProtocol` and stays out of reach, so the shape is a directory
tree of tiles, unpacked once, plus a source this plugin owns and can bound.
Mobile (`capacitor://`) is untested.

### Adding a coordinate to an existing note from the map

The map's right-click menu creates a **new** note at the click, and opens the
spot in an external map app. Stamping a note that already exists is the missing
third: you wrote _楼外楼_ months ago with no coordinate, and you are looking
straight at where it is.

Needs a note picker — a `FuzzySuggestModal`, which this plugin does not have yet
— and `processFrontMatter`. The coordinate must be un-shifted exactly once; zero
and two look identical on screen and land the pin ~500 m out.

Two triggers, sharing everything behind them. The map's own right-click menu is
where `addExternalMapItems` in `track-layer.ts` already holds an un-shifted
WGS-84 pair for the clicked pixel. Dropping a note from the file explorer onto
the map is the other, asked for as esm7/obsidian-map-view#49, and it needs no
native marker to cooperate — which is why dragging an existing pin (#43, #236,
and an open pull request there) is the one to leave alone. Those markers belong
to the native manager, and moving one means owning it.

### Lighting up where you have been

Filling in the provinces or cities a vault has notes in — the "footprint map"
every Chinese travel app is built around. MapLibre draws it with one fill layer,
which is the same seam the tracks already use.

Naming a coordinate is no longer the missing half: `reverseRequest`/
`parseReverse` in `geocode.ts` and the _Fill place name from coordinates_
command answer "what is at this point" today, through the same two providers
place search already uses. Where a coordinate itself comes from is also wider
than it was: a geotagged photo now reaches a coordinate through the exact same
pipeline a note's own `coords` property does — see CLAUDE.md's "Coordinates
from a photo's EXIF" — so a footprint built from every note's coordinate could
just as well be built from every photo's, without a second reader to write.
What is still undone is the one part that was never about geocoding — the
boundary polygons, which should be a GeoJSON file **the reader keeps in their
vault** rather than data bundled into the plugin, and the fill layer that draws
them. That layer is now its own entry, _Polygons, which a linked file can
already hold_ above: a boundary file drawn as a shape is useful on its own, and
this is what it is useful for.

### Import a KML's placemarks as notes

A `.kml` is drawn as a track today. But a Google My Maps export is usually a
hundred **placemarks** — a saved-restaurants list — and those become circles on
a map and nothing else: not rows, no properties, nothing a filter or a formula
can reach. Reading each placemark's name, description and coordinate into a note
turns them into what the rest of the plugin already works on. `parse.ts` reads
the file already; what is missing is the writing.

### Getting places back out

The inverse of the entry above, and asked for twice: esm7/obsidian-map-view#269
wants waypoints it can carry into GaiaGPS and onto a Suunto watch, #313 wants a
KML it can hand to Google My Maps. Both are one command — take the notes a base
matched, write their coordinates as GPX waypoints, KML placemarks, or CSV rows.
No native seam is involved; it reads what the view already resolved and writes
one file, in WGS-84 like everything that leaves this plugin.

The pair is the point. A vault that a hundred saved restaurants can come into
and a watch route can come out of is a place data passes through, rather than
somewhere it goes to be retyped.

### "Convert to coordinates" in the editor's menu

`geolink.ts` already reads a coordinate out of pasted text, behind a modal. A
link sitting in a note could go through the same reader from the editor's own
right-click menu, with no box to open. Cheap, and it is where somebody who just
pasted a share link actually is.

### A line that crosses the antimeridian

Two consecutive positions on either side of ±180° are drawn the long way round
— west across Asia rather than east across the Pacific — and `extendBounds`,
seeing one longitude near −180 and the next near +180, grows a bounds spanning
the globe, so zoom-to-fit answers with the whole world. One pass before the
geometry reaches the source fixes both: unwrap each longitude so no step
exceeds 180°, letting values run past ±180 the way MapLibre expects them to.

Reported against Map View as esm7/obsidian-map-view#408, and the arithmetic
here is the same arithmetic. A GPX walk never triggers it. A flight, a ferry,
and the entry below drawing an edge between two notes all do.

### Edges between linked notes

Map View draws lines between the markers of notes that link to each other. One
more GeoJSON source and one more line layer — the shape `layers.ts` already has
— and the same idea as _a map of the notes around a note_, drawn instead of
filtered. Worth a guard: it is recomputed on every metadata change, and Map
View's own documentation warns about thousands of edges.

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
  turned out to be reachable and moved up to _Worth doing_. Fetching them in
  bulk from a provider did not: that is their terms of service to grant, and a
  plugin that ships a "download this area" button grants it on the reader's
  behalf.
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
