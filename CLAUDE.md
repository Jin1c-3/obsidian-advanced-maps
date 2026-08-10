# CLAUDE.md

Working notes for this repo: how the plugin hooks into Obsidian, why each piece is
shaped the way it is, and what not to undo. The README is the user-facing
document; this file is the technical one.

## What this plugin is

Advanced Maps **extends** the first-party **Maps** view that Bases registers. It
never subclasses, forks or vendors it. There is no Leaflet, no bundled map
library, and no runtime dependency at all — MapLibre comes from the native view.

Requires Obsidian 1.13.1+ with **Bases** enabled and the first-party **Maps**
plugin installed. Without Maps there is nothing to extend, and the plugin says so
and stands down.

## Commands

```bash
npm run dev         # esbuild watch → OBSIDIAN_PLUGIN_DIR, plus a .hotreload marker
npm run build       # typecheck, then a minified bundle at the repo root
npm run deploy      # one-off production build into the vault
npm test            # vitest (also test:watch, test:coverage)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (lint:fix to fix)
npm run format      # prettier (format:check to verify)
npm run check       # everything, in CI's order — run this before a PR
```

`.env` (copied from `.env.example`) points `OBSIDIAN_PLUGIN_DIR` at a vault's
plugin folder. With [pjeby/hot-reload](https://github.com/pjeby/hot-reload)
installed in that vault, every save reloads the plugin.

## Layout

```
src/
  main.ts            plugin class, registry patch, commands, "open in map", location
  map-block.ts       the "Around" view and its embed line   ← pure, tested
  track-layer.ts     everything added to one native map view
  embed.ts           inline ![[track.gpx]]
  modal.ts           the "open in map" pop-up
  settings.ts        settings tab and defaults
  locate.ts          device location, and when to stop asking ← tested
  geolink.ts         coordinates out of a pasted map link ← pure, tested
  link-modal.ts      the paste box for the above
  geocode.ts         place search: request building and reading ← pure, tested
  search-modal.ts    the search box, and the only network call
  maplinks.ts        a coordinate out to an external map app ← pure, tested
  coords.ts          GCJ-02 / BD-09 conversion            ← pure, tested
  parse.ts           GPX / GeoJSON / KML / TCX readers    ← pure, tested
  stats.ts           distance, ascent, moving time, profile ← pure, tested
  geometry.ts        bounds, clamping, the style gate     ← pure, tested
  view-options.ts    the two option groups and where they go
  track-cache.ts     parsed tracks, keyed by path, invalidated by mtime
  layers.ts          the track layers, drawing, framing, locate-button guard
  i18n.ts            en / zh tables
  constants.ts       source and layer ids, track extensions, the track knobs
  types/obsidian-internals.d.ts   the undocumented surface this leans on
tests/               vitest, happy-dom, no vault required
```

## How the patch works

Bases keeps its view types in a plain, writable object:

```
app.internalPlugins.getPluginById('bases').instance.registrations.map
  → { name, icon, factory, options }
```

`factory` is replaced with one that builds the native view and then attaches a
`TrackLayer` to the instance; `options` is replaced with one that splices extra
groups into the list. The native class is never subclassed or edited, so an
Obsidian update to Maps lands here untouched.

`TrackLayer` wraps methods **on the instance** — `initializeMap`, `destroyMap`,
`onunload`, `loadConfig`, `switchToTileSet`, `showMapContextMenu` — plus
`markerManager.updateMarkers`, `markerManager.createGeoJSONFeatures` and
`popupManager.showPopup`. Instance wrappers die with the view, and `delete`
restores the untouched prototype.

They all go through one `wrap()` helper that remembers how to put each method
back, so `detach()` is a loop rather than a second list to keep in step with the
first. Where the native code assigned the method as an own property itself,
`wrap` restores the saved value instead of deleting.

`updateMarkers` is the seam worth knowing about. The native view calls it once
the map exists, again on every data change, and again on `styledata` after a new
style has wiped every source — which is exactly the set of moments the tracks
need redrawing too.

### House rules for the patching code

- **Wrap instances, never prototypes.** An instance wrapper dies with the view; a
  prototype patch outlives the plugin.
- **Check before you reach.** Every entry point verifies the shape it expects and
  stands down quietly when Obsidian has moved on. A missing internal is an
  expected outcome, not an exception to throw.
- **Declare internals in `src/types/obsidian-internals.d.ts`**, with a note on
  where they came from, rather than casting to `any` at the call site. That file
  is the written record of what this plugin assumes.

## How tracks find their way onto the map

Tracks are **not** pulled from the query result. For every note in the base, the
plugin reads that note's embeds from the metadata cache and resolves any link
whose extension is in `TRACK_EXTS` — `.gpx`, `.geojson`, `.kml`, `.tcx`:

```
moments/20260412191024.md  ──embeds──▶  assets/2026年4月12日 下午831.gpx
```

Two consequences:

- The base's own filters keep working untouched. No need to widen a filter to let
  attachment files into the result set.
- A track is drawn in **its note's colour** — resolved through the same
  `markerManager.getCustomColor` the pins use — because it belongs to that note.
  Hovering the track shows that note's popup; clicking it opens the note.

A track file that appears in the query result directly is also drawn, so
`file.ext == "gpx"` style bases work too.

Every track becomes one GeoJSON source with two layers: a `line` layer and a
`circle` layer for waypoints, both coloured per-feature via `['get','amColor']`.

Auto-fit covers markers _and_ tracks, and stands down when the view pins a
`center` or a `defaultZoom`, or once the user pans or zooms. The ⛶ control
re-frames on demand and ignores all of that.

## Coordinate systems (GCJ-02 / BD-09)

Chinese tile providers do not serve WGS-84. 高德 and 腾讯 serve **GCJ-02**, 百度
serves **BD-09** — deliberate, non-linear offsets that land 300–600 m (GCJ) or
about 1 km (BD) from the true position. Point a Maps tile set at
`webrd01.is.autonavi.com` and every pin floats several streets away.

Raster tiles cannot be nudged back, so the data moves instead. Every coordinate
is converted on its way onto the map and converted back on the way out; MapLibre
never learns the difference. **Nothing on disk is touched** — notes and `.gpx`
files stay WGS-84, and switching back restores the original positions to the
metre.

The system is a property of the **tile source**, not of the view, so the default
mode is `auto`: it reads the answer off the tile URL. That is what makes the
mixed case work — one note can hold an OpenStreetMap embed and a 高德 base view at
once, each correct — and the ⧉ background switcher flips the system live.

| Mode           | When                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| Auto (default) | Match the tile URL against known 高德/腾讯/百度/Google-CN hosts         |
| WGS-84         | OpenStreetMap, ArcGIS, 天地图 (CGCS2000; the difference is centimetres) |
| GCJ-02         | Force it — a proxied or self-hosted 高德 mirror the URL cannot reveal   |
| BD-09          | Same, for 百度                                                          |

### Every place a coordinate crosses the line

Two directions, and both have to be covered. Anything **drawn** is moved into
tile space; anything **read back** — shown to the reader, copied, or written to a
file — is moved out of it again. A seam missed in either direction is a bug that
looks like the map is fine and the data is wrong, or the reverse.

Drawn, so shifted **in**:

- **Markers** — `markerManager.createGeoJSONFeatures` is the single point where
  pin coordinates are minted, so wrapping it covers every pin.
- **Tracks** — memoised per file per system; an 11 k-point export is transformed
  once, not on every redraw.
- **The configured `center`** — converted inside the `loadConfig` wrapper, where
  the config object is born. Patching `initializeMap` or `updateCenter` alone
  makes the two fight over the centre. The untouched WGS-84 value is kept on the
  config as `__amCenterWgs`, and the shifted value beside it as `__amCenterOut`,
  so a later tile switch can re-derive it — and so a write from anywhere else is
  recognised rather than shifted twice.
- **Marker popups** — `popupManager.showPopup` is handed the note's own value,
  not the feature that was drawn, because the native manager keeps the two apart.
  Left alone, a pin's popup opens a few streets from its own pin.
- **The device fix** — the built-in locate button (mobile only) feeds
  `navigator.geolocation` straight to the map. `updatePosition` is the one door
  it comes through; `guardLocateControl` in `layers.ts` wraps it for both the
  base views and the inline embeds.
- **The camera** — the map's centre is in tile space like everything else, so a
  background switch that changes the system leaves it looking somewhere else.
  `realignCamera()` carries it across; `fit()` cannot, since it stands down
  whenever a view pins a `center`.

Read back, so shifted **out**:

- **Auto-fit bounds** — native `getBounds()` still answers in WGS-84, so
  `bounds()` reads the moved features instead.
- **The map's own right-click menu** — "New note" writes the click into the new
  note's frontmatter, "Copy coordinates" puts it on the clipboard, and "Set
  default center point" stores it in the base file, where `loadConfig` would
  shift it a second time. All three take it from `map.unproject`, which answers
  in tile space; the `showMapContextMenu` wrapper un-shifts what `unproject`
  answers for the length of that one synchronous call. Of everything here this is
  the seam that mattered most — it is the only one that writes to disk.

`markerManager.markers` keeps the untouched note values, which is why "Copy
coordinates" **on a pin** was already right and needed nothing.

Accuracy: GCJ round-trips to under a nanometre, BD to under 0.2 m; outside China
both are the identity. `tests/coords.test.ts` holds those figures to account.

## "Open in map"

Renders the base as a ` ```base ` block rather than constructing a view directly
— that is what carries the base's filters, formulas and properties across. Build
the view spec by hand and you lose the icons, the colours and the scope. The spec
overrides `center`, `defaultZoom` and `mapHeight` only, and sets both `center`
and `defaultZoom` because an explicit centre without an explicit zoom just gets
auto-fit back to the whole data set.

The ⋮ menu item and the command only appear on markdown notes that actually hold
the coordinate property. Changing the label updates the ⋮ menu immediately; the
command palette entry picks up the new name after a plugin reload.

## A map of the notes around a note

The command adds **one view to the base file** and writes **one embed line** into
the note:

```
![[moments.base#Around]]
```

That is the whole feature — there is no state, no drop handler and nothing to
keep in step, because the question "which notes" is one Bases already answers:

```yaml
or:
  - this.file.hasLink(file) # the notes this note links to
  - file.hasLink(this.file) # the notes that link to it
  - and: # …and this note itself,
      - file == this.file #   once it holds
      - '!this["coords"].isEmpty()' #   a coordinate of its own
```

Inside an **embedded** base, `this` is the _embedding_ file rather than the base
file, so that filter reads the host note's own links. Adding a place is dragging
a note into the body — Obsidian's own behaviour — and Bases re-runs the filter.

The host's own clause is **stated as a filter, not decided when the block is
written**, so it stays true in both directions: a note that gains a coordinate
later appears with nothing touched, and one that never has a coordinate is never
a result that draws no pin. `this["coords"]` uses brackets because the property
name is configurable and `this.my coords` is a syntax error.

**The two link clauses are not mirror images of each other.** Written the wrong
way round they still parse and still return notes, which is what makes it worth
stating: `this.file.hasLink(file)` reads one file's links, the host's;
`file.hasLink(this.file)` reads the links of every row the base offers. And
`file.backlinks.contains(this)` is _not_ the backlink direction despite its name
— a row whose backlinks hold the host is a row the host links to, so it is the
first clause again. Measured: the two return the same set.

### Why the view lives in the base and not in the note

The first shape of this copied the whole base spec into a ` ```base ` block in
the note. Self-contained, and wrong: a copy freezes the base's formulas at the
moment it was written, so changing a colour rule leaves every map inserted before
then on the old one, silently. That is what a "refresh" command would have
existed to paper over. Referencing the view instead means there is nothing to
refresh because nothing can go stale, and the note carries one line rather than
sixty.

The cost is real and is not hidden: **the link names the view**. Rename it in
Bases and every embed stops resolving, with no error — Obsidian does not rewrite
`#view` fragments. The setting that holds the name says so.

Four things are load-bearing:

- **The added view is copied from a view the base already has**, never written
  from scratch — same lesson as "open in map". `coordinates`, `markerIcon` and
  `markerColor` come with it; a hand-built view loses the icons and the colours.
  The base's top-level filters and formulas need no copying at all now: the view
  is inside the base.
- **`center` and `defaultZoom` are dropped.** `fit()` stands down whenever a view
  pins either, and a map of the notes around this one that opens somewhere else
  is the one thing it must not do.
- **The pointer is ANDed in, not assigned.** The copied view may already filter
  on something. Only the `and` case can be appended to; every other shape — a
  bare expression, an `or`, a `not` — is nested under a fresh `and`, which means
  the same thing and cannot misread the original.
- **An existing view by that name is never rewritten.** `withAroundView` answers
  null, which is the signal to leave the base file alone entirely — so a view the
  reader has since edited keeps its edits, and a second insert costs no write.

The base is re-read **inside** `vault.process` rather than reusing what
`loadBase` parsed: there is an await between the two, and the base is a file
Bases itself writes to.

Rewriting the file means re-serializing all of it, which was the one thing worth
measuring before shipping. Against a real 8.8 kB base with nine views and a
screenful of nested-`if` formulas, `parseYaml` → `stringifyYaml` produced a
**30-line diff, every line an addition** (`292a293,322`) — nothing removed,
nothing reflowed, and the parsed structure identical but for the added view. It
was measured on a copy; the real base was never written to.

**The base's own top-level filter still applies**, which is the one sharp edge:
under `file.inFolder("moments")` a host note kept anywhere else can never include
itself, coordinate or not. Measured — a root-level note with `coords` and one
link rendered exactly one row, the link.

Verified against a running Obsidian 1.13 rather than assumed. Both
`this.file.hasLink(file)` and `file.backlinks.contains(this)` return exactly the
linked notes; the first is used because the docs call `file.backlinks`
performance heavy. `file == this.file` and the bracket form of a property both
parse — the bracket form was measured after a first attempt whose YAML escaping
was wrong and which therefore proved nothing. With three links in the host note
the embedded view reported `data.data.length === 3`,
`config.get('markerIcon') === 'formula.icon'`, `mapConfig.center === null` and
`hasConfiguredZoom() === false` — the last two being what leaves auto-fit free.
Adding a fourth link took it to four with no further action. Deleting the host's
`coords` took a three-row map to two and restoring it took it back to three,
with nothing touched. A host note with one outward link, one note pointing back
at it and a coordinate of its own rendered all three rows — one per clause.

`this` resolves to the embedding note for a **file** embed as well as for a code
block, which is what makes the one-line form possible: `![[x.base]]` in a note
returned that note's outward link, where a base-file `this` would have returned
nothing. `![[base#view]]` selects by view name — `![[moments.base#地图]]`
rendered 369 rows carrying `formula.icon`. Running the command twice left the
base byte-for-byte identical the second time.

The command is `editorCheckCallback`, so it is absent in reading view. That is
correct — it writes at a cursor — but it also means `executeCommandById` from
`obsidian eval` does nothing until the leaf is in source mode. It looks exactly
like a broken command; it is not.

## Coordinates from a map link

`geolink.ts` reads a coordinate out of pasted text; `link-modal.ts` is the box
you paste into. Both are new seams, and three decisions in them are load-bearing:

- **Per-provider readers, never one clever regex.** 高德 writes `position=lng,lat`
  and 百度 writes `location=lat,lng`; a single pattern that matched both would
  swap the axes on one of them and land the pin a province away with nothing on
  screen to say so. Routing is by hostname first, and only text with no host at
  all falls through to `geo:` / DMS / bare numbers.
- **The datum is stated, not inferred, wherever a provider states it.** 百度's
  `coord_type` is believed when present. Google and Apple say nothing, so
  `chinaAware()` asks `outOfChina` — both serve GCJ-02 inside China and WGS-84
  everywhere else.
- **Short links are recognised and refused.** `surl.amap.com`,
  `maps.app.goo.gl`, `j.map.baidu.com` carry no coordinate; resolving one means
  handing a third party the link, which is a different kind of decision from
  parsing text. `shortLink()` exists so the modal can say what would fix it.

Two traps worth remembering. `Number(q.get('lat'))` is `0`, not `NaN`, when the
parameter is absent — an absent latitude reads as a perfectly finite equator, and
the null-island guard then returns null from a branch that should have fallen
through. Use `numParam()`. And a `geo:` URI whose CRS is not WGS-84 must be
terminal: fall through and the bare-number reader parses the very same digits and
relabels them WGS-84.

The command is deliberately **not** behind **Enable location**. That switch is
about raising a permission prompt and recording where notes were written; pasting
a link a person already has does neither.

## Place search

`geocode.ts` builds the request and reads the answer; `search-modal.ts` holds the
one line that goes to the network. Splitting it that way is what lets both
providers' quirks be tested with no network at all.

- **Two providers, because one will not do.** Nominatim needs no key and is thin
  on Chinese POIs — it finds 西湖 and not 楼外楼. 高德 needs a free web-service
  key (the _Web service_ kind, not JS API) and answers in **GCJ-02**, which is
  stated on the `Place` and converted by coords.ts on the way to the note, the
  same as a pasted link.
- **高德 signals failure with HTTP 200.** `status` is `"1"` or `"0"` and a bad
  key is a perfectly well-formed success, so `parseAmap` checks the status before
  the array and surfaces `info` verbatim. `address` is documented as a string and
  arrives as an empty array when there is none.
- **A SuggestModal fires per keystroke**, which is one request per character —
  past what Nominatim's policy allows. `QUIET_MS` waits out the typing and a
  superseded query resolves to nothing; answers are cached for the life of the
  modal.

**Do not add a `Referer` header.** It looks like ordinary politeness and
Electron refuses the whole request with `net::ERR_BLOCKED_BY_CLIENT` — which,
measured through `requestUrl`, is a promise that never settles rather than an
error. The symptom is a search box that stays empty forever with nothing in the
console. `User-Agent` alone goes through and is what Nominatim asks for. Verified
live: with both headers the request hung indefinitely; with User-Agent only it
returned 200 and ten results.

## Location

Fills a note's coordinate property from the device, two ways: automatically when
the property is **present but empty**, and on demand through the _Fill
coordinates from current location_ command, which overwrites.

Invariants worth keeping:

- **Absent is not blank.** A note with no coordinate property never gets one —
  only a template's blank counts as an invitation. A property that already holds
  something is never overwritten by the automatic path.
- **Re-check after the await.** Seconds pass waiting for a fix; the blank may
  have been filled by hand or the property dropped, so `processFrontMatter`
  verifies again before writing.
- **The automatic path runs on every metadata change to the active note**, so
  everything before the `await` is a property lookup or a substring scan.
  Deliberately so.
- **Only the active note.** A sync writing files in the background must not get
  stamped with wherever this device happens to be. The `metadataCache.on(
'changed')` handler exists because a template's frontmatter usually lands a
  beat after `file-open`.
- Both paths are off until **Enable location** is on: the first request raises a
  permission prompt, and recording where each note was written is a decision, not
  a default.

Written value: `lat,lng` at six decimal places (`28.624415,115.788091`), always
**WGS-84**. Six decimals is far past what any GPS delivers, but rounding harder
would make a re-stamp of the same spot look like the note had moved.

### Why location is not mobile-only

Both map plugins that came before this one register location on mobile alone. The
built-in Maps plugin says why in one line:

```ts
// Only registered on mobile, since desktop has no location provider
if (Platform.isMobileApp) { ... }
```

Map View does the same in `addFrontMatterLocationIfEmpty`:

```ts
if (!utils.isMobile(this.app)) return;
```

That was true of older Electron. Chromium's only desktop fallback was Google's
network location service, whose API key is a build-time secret Electron does not
ship, so the request failed no matter what the OS knew. Current Chromium asks the
**operating system** instead — the Windows location service, CoreLocation on
macOS — with no API key involved. Obsidian 1.13 carries Chromium 150, well past
that change.

The claim is platform-dependent: it needs the OS location service on, and on
Linux a working GeoClue, which often is missing. So the plugin does not assume —
it asks, once. The first failure that arrives before any success trips a breaker
and nothing is asked again for the rest of the session, which keeps a machine
that genuinely cannot answer from prompting on every note opened. Running the
command by hand resets the breaker, on the grounds that asking deliberately means
something has changed.

To check a given desktop, in the developer console (`Ctrl+Shift+I`):

```js
navigator.geolocation.getCurrentPosition(
  (p) => console.log('OK', p.coords.latitude, p.coords.longitude, '±' + p.coords.accuracy + 'm'),
  (e) => console.log('FAIL', e.code, e.message),
  { enableHighAccuracy: true, timeout: 15000 }
);
```

## Inline `![[track.gpx]]`

There is no exported MapLibre to build a map with, so the embed borrows the
built-in view: the native factory is called with a stub controller (`{app}` plus
a `config` that answers nothing), which yields a fully configured map — tiles,
dark mode, zoom controls, background switcher — that happens to have no rows
behind it. The track is then drawn on top. Such a view is flagged
`__advancedMapsHeadless` so `enhance()` leaves it alone; a `TrackLayer` would
think the result set is empty and wipe the track.

Each map holds a WebGL context and browsers cap how many can be alive at once, so
an embed only builds once it scrolls into view.

The native `onload` never runs on such a view — nobody adds it as a child
component — which is why the embed registers its own `css-change` handler, and
why the map's right-click menu, bound there with `registerDomEvent`, does not
exist on an embed and needs no correcting. `initializeMap` does run, so the
locate button **is** added on mobile, and it gets the same guard the base views
get. Both halves of that are worth knowing before assuming an embed behaves like
a base view, in either direction.

Extensions are claimed only if nothing else has them, so a plugin that already
renders `.gpx` keeps working alongside this one.

## Track statistics

`stats.ts` is pure arithmetic over the features `parse.ts` produced; `embed.ts`
puts the numbers and the profile under an inline map. Both are behind settings,
both default on, and both are absent from base map views — see the roadmap for
why that is a design question rather than a missing call.

`parse.ts` had to grow first. Elevation is the third member of a position, which
GeoJSON allows and `projectGeometry` already carried through untouched. A
timestamp has nowhere to live in a position at all, so it rides in feature
properties as `times: (number | null)[]`, one entry per coordinate, `null` for a
point whose source gave none — a hole rather than a dropped point, because
dropping one would desync the array from the coordinates it describes. A feature
with nothing extra to say still gets `properties: null`, which is what every
existing caller assumes.

**Measure `rec.features`, never `projectedFeatures()`.** The GCJ and BD offsets
are non-linear, so a distance taken in tile space is a distance in the wrong
space — wrong by little enough to look right. `projectedFeatures` also drops
`properties`, so the times would vanish too; that is the cheap proof, not the
reason.

Two numbers are judgement calls and both are written down where they are set:

- **Ascent uses hysteresis, not a sum of positive deltas.** Consumer elevation
  is noisy at ±3–5 m and a naive sum turns a flat ride into hundreds of metres
  of climb. Only a monotone change past `ASCENT_THRESHOLD_M` (5 m) commits.
  Measured on the real 3.2 km stair climb the screenshots use: naive 335 m,
  hysteresis 300 m, against 183 m of net gain.
- **`MOVING_SPEED_MPS` is 0.25, not the usual 0.5.** That was measured, not
  chosen: at 0.5 m/s the same walk reported 45:36 of moving time against 1:14:57
  elapsed, having thrown away nearly twenty minutes of genuine uphill walking.
  1.8 km/h is an ordinary pace on steps, so a threshold there does not separate
  resting from climbing — it penalises climbing. At 0.25 it reports the ten
  minutes the walk actually stopped for.

The elevation profile is hand-rolled inline SVG — there is no chart library to
reach for, same as there is no map library — and `elevationProfile()` downsamples
so an 11 k-point export does not become an 11 k-point path.

### KML and TCX

Both are XML and both go through the same `DOMParser` GPX already used. TCX is
the richest of the four: every field GPX may omit, a Garmin export states. A
`<Trackpoint>` with no `<Position>` is a heart-rate-only sample and is skipped
rather than read as `0,0`.

KML is looked up **by local name**, not by tag string. `getElementsByTagName(
'gx:coord')` matches that exact prefix and nothing else, so a document that
aliases the namespace differently — or prefixes the whole file `kml:` — silently
yields nothing. Both shapes are in the tests. `<gx:Track>` is KML's only
time-carrying form, and its `<gx:coord>` is space-separated where `<coordinates>`
is comma-separated inside a tuple and whitespace-separated between them.

## Opening a spot in another map app

`maplinks.ts` is the exact inverse of `geolink.ts` and mirrors its decisions
rather than re-making them: 高德 writes longitude first and 百度 latitude first,
高德/腾讯 are GCJ-02, 百度 BD-09, and Google/Apple are GCJ-02 inside China and
WGS-84 outside by `outOfChina`. Order is by locale, not by the view's basemap —
which tiles a map happens to draw says nothing about which app is on the reader's
phone.

Two things in the menu wiring are worth keeping:

- **`Menu.forEvent(ev)` is the seam, and nothing is patched.** The native
  `showMapContextMenu` builds its menu that way, and `forEvent` is a
  lookup-or-build against a `WeakMap<Event, Menu>` whose `showAtMouseEvent` is
  deferred to a `setTimeout(0)` — read out of `obsidian.asar`, not assumed. So
  calling it again synchronously in the same task finds the same menu, and the
  items land before the reader sees it open. No prototype patch, no rebuilt menu.
- **The coordinate is un-shifted exactly once.** `addExternalMapItems` runs
  _after_ the `unproject` swap has been restored, so it reads tile space and does
  its own single `toWgs84`. Zero un-shifts double-convert; two cancel out. Both
  are invisible on screen. Verified live on 高德 tiles: the 高德 URL came back
  carrying the clicked pixel's own tile-space coordinate to six decimals, and the
  OpenStreetMap URL carried `gcj2wgs` of it to 0.05 m — against a local GCJ
  offset of 525.3 m, which is what either mistake would have cost.

`MenuItem.setSubmenu` is undeclared in `obsidian.d.ts` but present in the shipped
build and used by Obsidian's own menus, so it is declared in
`types/obsidian-internals.d.ts` and probed for at runtime, with six flat items as
the fallback. The probe runs on a throwaway `Menu` that is never shown: a
`MenuItem` is only reachable from inside `addItem`, and probing on the real menu
would leave an empty entry behind that no API can remove.

## Non-obvious things to leave alone

All of them cost real debugging time. Read this before "simplifying" any of them.

1. **`isStyleLoaded()` is the wrong gate.** It stays false until every _tile_ has
   arrived, so waiting on it before `addSource` costs seconds on a busy map —
   long enough that a background switch looks like it dropped the tracks.
   `styleUsable()` reads `map.style._loaded` instead, which is the flag
   `addSource` itself checks.

2. **Tracks are re-added on `style.load`, not on the native `styledata` hook.**
   The built-in view arms a _one-shot_ `styledata` listener to restore its
   markers. Riding that would work exactly once per style change and is not ours
   to depend on.

3. **Track layers are inserted below `marker-pins`.** Otherwise a pin sitting on
   its own track is unclickable.

4. **Already-open views are adopted on load.** A map view built before the patch
   never passed through the patched factory, so enabling the plugin — or Maps
   reloading — would leave it plain until the tab was reopened.
   `adoptOpenViews()` walks the component tree and picks those up, then replays
   `onMapCreated` and `reproject()` by hand since `initializeMap` will never fire
   for them.

5. **The patch is re-applied on `layout-change`.** Maps re-registers its view
   whenever it reloads, which drops the wrapper on the floor. The check is a
   property lookup, so running it that often is free.

6. **`switchToTileSet` never goes back through `loadConfig`.** It rewrites
   `mapConfig.mapTiles` in place, so under `auto` the coordinate system can change
   without the configured centre hearing about it. It is wrapped too, and
   re-derives the centre from the WGS-84 value kept beside it.

7. **The context-menu fix swaps `map.unproject`, not the menu.** Every item in
   `showMapContextMenu` reads its coordinate off one `unproject` call,
   synchronously, before the menu is shown — so replacing `unproject` for the
   length of that call and restoring it in a `finally` reaches all of them at
   once. Rebuilding the menu would mean re-implementing four native items and
   losing whatever a future one adds; wrapping `unproject` for good would corrupt
   every internal use MapLibre makes of it.

8. **`sync()` skips only the upload, never the framing.** Bases replaces its
   result set on _any_ vault change while a map view is open — not just changes
   to notes the base matches — so `sync()` runs far more often than the tracks
   change. `setData` hands every position to MapLibre's worker and re-tiles the
   lot, so it is guarded by a signature over the files, their mtimes, their
   colours and the coordinate system. Everything after it — paint, interactions,
   `fit()` — still runs every time, deliberately: a row that arrives carrying a
   pin and no track changes no signature but must still re-frame the map. The
   guard also requires the source to still exist, because a style swap wipes
   every source and `style.load` then re-enters with an unchanged signature.

9. **`TRACK_KNOBS` has both a `max` and a `hardMax`, and they are not the same
   number.** `max` is what the sliders offer; `hardMax` is what a value is
   clamped to at runtime. A base file is YAML somebody can edit by hand, and a
   `trackWeight: 20` typed in there is honoured rather than clipped back to the
   slider's 12. Collapsing the two to one number quietly re-clamps every
   hand-written base.

10. **`resolveTracks` memoises on the `CachedMetadata` object, not on the path.**
    That is what makes it self-invalidating — re-indexing a note hands back a new
    cache object, which is a miss. But which file a `![[track.gpx]]` resolves to
    can change with the note untouched (creating the attachment it already links
    to), so the whole memo is dropped on vault create/rename/delete. Keep those
    three listeners together with it.

## Testing

`src/coords.ts`, `src/parse.ts`, `src/stats.ts`, `src/maplinks.ts`,
`src/geometry.ts`, `src/locate.ts`, `src/view-options.ts`, `src/map-block.ts`,
`src/geolink.ts`, `src/geocode.ts` and `src/i18n.ts` run outside Obsidian and are
held above 90 % coverage in CI (the list lives in `vitest.config.ts`). Anything
touching the coordinate maths, a parser, the statistics or the locator needs a
test in the same PR.

One kind of test is worth more than its line count: **the same track in four
formats must produce the same numbers**. Geometry and elevation are identical
across a GPX, a TCX and both KML forms of one walk by construction, so distance
and ascent agreeing to the metre says far more than each reader drawing
something. It caught nothing, but it is what makes a fifth format cheap to add.

The view wrappers need a live Bases map, but that does not put them out of reach:
the [Obsidian CLI](https://help.obsidian.md/cli) runs arbitrary code inside the
running app, so they can be driven and measured directly.

```bash
npm run deploy                                  # or npm run dev, with hot-reload
obsidian plugin:reload id=advanced-maps
obsidian eval code="[...app.plugins.plugins['advanced-maps'].layers][0].appliedSystem"
obsidian dev:errors                             # and dev:console, dev:screenshot
```

`plugin.layers` is the way in: each `TrackLayer` holds its `view`, and esbuild
does not mangle property names, so `layer.appliedSystem`, `layer.locate` and the
private methods are all reachable from `eval`. What is worth asserting on:

- **The wrappers are installed** — `hasOwnProperty` for each wrapped method on
  the view, its `markerManager` and its `popupManager`.
- **A conversion is exact, not merely different.** Read the value the native code
  received and check it against `wgs2gcj` from a standalone build of `coords.ts`
  (`npx esbuild src/coords.ts --bundle --format=cjs`). "It moved 500 m" is not a
  pass; "it round-trips to 10⁻⁸ m" is. Both errors look identical on screen.
- **The seam, by making its output observable.** For the context menu, hand
  `unproject` a return value whose `constructor` is a recording class — that is
  the constructor `showMapContextMenu`'s wrapper calls, so it captures exactly
  what the native menu items closed over, with nothing written to disk.
- **Restoration** — that the temporarily-swapped method is the original again
  afterwards.

Two traps. `switchToTileSet` is followed asynchronously by `style.load` →
`sync()` → `fit()`, so **settle before measuring**: a camera reading taken
straight after the `await` is pre-`fit` and will look wrong. And `fit()` is the
last word whenever a view pins neither `center` nor a zoom, so a camera assertion
belongs on a view that pins one — otherwise it is asserting on `fitBounds`.

The built-in locate control cannot be reached this way: it is registered under
`Platform.isMobileApp`, which `obsidian dev:mobile on` does not flip. Push a stub
with `updatePosition` on its prototype into `map._controls` and call
`onMapCreated` — that exercises `guardLocateControl` for real, and the native
control's shape is pinned by reading `obsidian-maps/src/map/controls/`.

Say in the PR what was tried and what the numbers were.

## Linting, and the community scorecard

`community.obsidian.md/plugins/advanced-maps` runs its own scans on each release
and publishes the findings. They are worth reading, but they are not worth
finding out about **from a web page after a release** — so the repo lints with
the same two things the scorecard does, and `npm run lint` fails on what it would
have reported:

- **`typescript-eslint`'s type-checked rules**, not just the syntactic ones. That
  is what catches `any` escaping `JSON.parse` and the undeclared internals into
  code that then reads properties off it, and it needs `projectService: true`.
- **`eslint-plugin-obsidianmd`**, which knows the things only Obsidian knows:
  `createEl` over `document.createElement`, `instanceof TFile` over a cast,
  deprecated settings API.

Both are scoped to plugin code. Build scripts under `.github/` and
`esbuild.config.mjs` are Node by definition and print as they work, so
`no-nodejs-modules` and the `no-console` message are off there; the stub in
`tests/` exists to _provide_ `createDiv`, so it cannot be written with it.

The first run of this turned up 44 findings, and one was a real bug rather than a
style point: `vault.process` was called without `await` inside a `try`/`catch`,
so a failed write to the base file rejected into nothing and the notice that
exists to report it could never fire.

Release assets carry **GitHub build provenance** (`actions/attest-build-provenance`),
so `gh attestation verify main.js --repo Jin1c-3/obsidian-advanced-maps` ties the
downloaded bytes to the workflow run and commit that produced them. That needs
`id-token: write` and `attestations: write` on the release job.

### The settings tab is declared, not drawn

`getSettingDefinitions()` rather than `display()`. Obsidian 1.13 indexes what it
renders from definitions, so every setting is reachable from the search box at
the top of the settings window; a tab that paints itself is invisible to it. The
plugin already requires 1.13.1, so there was no older path to keep.

Three things were measured rather than assumed, because none are in the docs:

- **A definition with neither a `control` nor a `render` never reaches the DOM.**
  The one-line intro under each heading was written as `{ name: '', desc }` first
  and rendered nothing at all. Obsidian's own keychain tab does prose as
  `{ name: '', render(setting) { … } }`; so does this.
- **`visible` works, including on first paint.** It resolves through the same
  helper on render and on `refreshDomState`, and a false one leaves the row in
  the DOM with `display: none` — which is why "the row is in
  `querySelectorAll('.setting-item')`" proves nothing. Filter on computed style.
- **Re-opening the tab without closing the window leaves the previous render in
  the DOM.** A stale copy of a row is why the Amap key looked visible when it was
  not. Measure from a closed settings window.

`setControlValue` is the one seam for everything that used to live in an
`onChange`: it trims, applies the two fallbacks that a cleared field has, checks
the two dropdown values against their own lists, and then does the side effects —
`reprojectAll`, `resetLocator`, `refreshTracks`, and `update()` for the Amap key
row that states its own visibility.

## Translations

`src/i18n.ts` holds one flat table per language. English is the source of truth
and its keys are the key type, so a missing entry is a compile error. A new
language is one object plus one line in `LOCALES`; `tests/i18n.test.ts` checks
placeholders match across languages.

## Releasing

```bash
npm version patch|minor|major   # version-bump.mjs syncs manifest.json + versions.json
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`, which re-runs every check,
refuses to continue if the tag and `manifest.json` disagree, and publishes a
release with `main.js`, `manifest.json` and `styles.css` attached.
