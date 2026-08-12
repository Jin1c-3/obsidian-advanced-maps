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
  modal.ts           the pop-up form of "open in map"
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
plugin reads that note's own references out of the metadata cache and resolves
any whose extension is in `TRACK_EXTS` — `.gpx`, `.geojson`, `.kml`, `.tcx`:

```
moments/20260412191024.md  ──points at──▶  assets/2026年4月12日 下午831.gpx
```

Two consequences:

- The base's own filters keep working untouched. No need to widen a filter to let
  attachment files into the result set.
- A track is drawn in **its note's colour** — resolved through the same
  `markerManager.getCustomColor` the pins use — because it belongs to that note.
  Hovering the track shows that note's popup; clicking it opens the note.

A track file that appears in the query result directly is also drawn, so
`file.ext == "gpx"` style bases work too.

### All three ways of pointing at a file count, and `!` is the difference

`resolveTracks` reads `cache.embeds`, `cache.links` **and**
`cache.frontmatterLinks` — `![[x.gpx]]`, `[[x.gpx]]` in the body, and
`track: "[[x.gpx]]"` in a property all put the line on the base map. Only the
first of the three also renders an inline map, because that is what
`embedRegistry` is handed and `!` is Obsidian's own mark for "render it here".

That split is the feature, not an implementation detail. While an embed was the
only way in, the two halves of this plugin could not be asked for separately:
`![[x.gpx]]` was the sole way to get a track onto a base map, and it dragged an
inline map into the note along with it. The reported symptom (issue #6) was a
note holding an embedded base map — showing the note's pin _and_ its track,
correctly — with a second, unwanted map underneath it, and no setting anywhere
that could turn one of them off. A plain link is the off switch, and it needs no
setting: `!` means both, no `!` means the base map only.

Measured live, on one note carrying all three forms at once: `cache.embeds`,
`cache.links` and `cache.frontmatterLinks` each held exactly their own one, and
`resolveTracks` answered all three files in that order. A note whose body both
embeds and links the _same_ file answered it once —
`getFirstLinkpathDest` returns the same `TFile` for both, so the identity check
is enough and no path comparison is needed. And a note with a plain link and no
embed rendered `0` elements matching `.advanced-maps-embed` while still
resolving its track, which is the whole of what #6 asked for.

Do not "tidy" this into a single array read off `cache`. The three lists are
separate in `CachedMetadata` and a note can carry the same file in all three.

Every track becomes one GeoJSON source with four layers: a `line` layer, a
`circle` layer for waypoints, and — see "Start/end markers, direction and
waypoint names" below — a direction-arrow layer and a start/end-pin layer, all
four coloured per-feature via `['get','amColor']` or, for the two symbol
layers, by which hand-drawn image `amRole` points at.

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

## "Open in map", and following the active note

Both are the same move: **point a camera at a note**. Neither copies the base,
neither writes anything, and the whole of it is `TrackLayer.focus()` plus two
callers.

The first shape of "open in map" did copy: `parseYaml` → splice `center`,
`defaultZoom` and `mapHeight` into the view → `stringifyYaml` → render as a
` ```base ` block. It worked, and it was wrong twice over. A copy freezes the
base's formulas at the moment the pop-up opened — the same lesson written down
under "a map of the notes around a note" — and **nothing changed inside it goes
anywhere**: measured, `config.set('defaultZoom', 7)` in that pop-up neither
throws nor reaches disk. The value changes in memory, the file does not move.

So the base is referenced instead, and where it is opened is a setting:

- **`openIn: 'tab'`** (the default) opens the base file itself, preferring a leaf
  that already shows it. The view is selected through the leaf's own state —
  `{ type: 'bases', state: { file, viewName } }`, read off a running Obsidian —
  and this is the only one of the two whose edits are kept, because a file view
  writes its config back to the file. Measured both ways: the same `config.set`
  that vanishes from a pop-up rewrites `moments.base` from a tab.
- **`openIn: 'modal'`** renders one line, `![[moments.base#地图]]`, through
  `MarkdownRenderer`. An embedded base is a reference, so nothing is frozen — but
  it has nowhere to write a view option back to either, so its edits are lost
  exactly as the code block's were. The settings text says so rather than leaving
  it to be discovered.

The pop-up cannot override `mapHeight` any more, since that would mean writing to
the base. `applyMapHeight` sets it inline on the map element from the view's own
config, so the one `!important` in `styles.css` is what gives the pop-up its
height.

The ⋮ menu item and the command only appear on markdown notes that actually hold
the coordinate property. Changing the label updates the ⋮ menu immediately; the
command palette entry picks up the new name after a plugin reload.

### `focus()`, and the three things that take the camera back

`TrackLayer.focus({ lat, lng, zoom?, animate?, file? })` takes WGS-84 — the space
the note is written in — converts into tile space (same rule as everywhere else;
on 高德 tiles a missed conversion is 500 m and looks fine), and moves the camera:
`flyTo` for a map already on screen, `jumpTo` for one that has just been built.

Pointing it is the easy half. **Keeping it there** is three separate fights, and
two of them were only found on a phone:

1. **`fit()`, on the next sync** — and Bases syncs on _any_ vault change while a
   map is open. `held`, the last target, is what stands it down. `fit(true)` from
   the ⛶ control still wins, because that is what `force` means.
2. **The configured centre**, applied while the map is built. Handled by telling
   the view its camera is under outside control, through the
   `setEphemeralState({ center, zoom })` seam Obsidian's own back/forward restore
   uses: `initializeMap` then builds the map with `pendingMapState` in place of
   the configured centre.
3. **The view's own `load` handler**, which frames every marker with
   `fitBounds(bounds, { padding: 20 })` — **animated**, since it passes no
   `animate: false`.

The third is the one that made a map open on the right note and then glide out to
the whole vault a few seconds later, on mobile only. Two facts collide:

- **`pendingMapState` is one-shot.** The native data path is
  `await markerManager.updateMarkers(data)` and then, if a pending state is
  there, apply it and `this.pendingMapState = null`. So the guard that both the
  `load` handler and `applyConfigToMap` consult dies at the first data update.
  (`obsidian-maps/src/map-view.ts` — the consume at ~302, the `load` handler at
  ~228. Read the checked-out source rather than the minified `main.js`.)
- **`load` and that first data update are a race.** Measured on the desktop:
  `load` at 1.07 s, the consume at 1.91 s — the handler stands down and nothing
  is wrong. On a phone the tiles, glyphs and sprites are slower, `load` lands
  after the consume, and the handler frames everything instead.

So the fix is not to guard harder but to **put the camera back**: a `load`
listener registered in `onMapCreated` — after the native one, so it runs in the
same dispatch — re-aims at `held` unless the reader has since moved the map
themselves. The animation the native handler started is cancelled by the new
camera command rather than watched out.

Reproduce it on a desktop without a phone: open a map on a note, then
`view.pendingMapState = null; map.fire('load')`. Before the fix that lands on the
whole data set; after it the camera does not move.

Two timing facts, both measured rather than assumed:

- A base opened in a leaf **has its TrackLayer before `openFile` resolves, but
  not its map** — `view.map` is still null at that point and exists ~300 ms
  later. Hence `pendingFocus`, applied in `onMapCreated`: the target is held as
  WGS-84 because converting it early would mean converting it against a
  `mapConfig` that does not exist yet.
- An **embedded** base arrives whenever the embed decides to load, and there is
  nothing to await. `focusIn(container, target)` therefore retries — bounded by
  `FOCUS_TRIES`, and stopping the moment the container leaves the DOM.

The popup is opened by handing `popupManager.showPopup` the note's own **WGS-84**
value, because the wrapper on `showPopup` is what moves it into tile space; a
converted one would be moved twice. A view has its map before it has its rows, so
a target whose row is not there yet is kept for the end of the next `sync()` —
once, then dropped, so a card cannot open by itself minutes later on a map that
has since moved.

### Following

`file-open` → the note's coordinate → `focus()` on every layer whose own follow
button is pressed. Three decisions:

- **The camera moves, never the query.** Map View does this by rewriting its
  filter to `path:"$PATH$"`; here the filter belongs to Bases and to whoever
  wrote the base.
- **Which maps follow is a button on each map, not a rule about where it sits.**
  See below — this was `leaf.getRoot() !== workspace.rootSplit` for two versions
  and the rule was wrong.
- **The zoom is left alone** — no `zoom` in the target, so MapLibre keeps it.
  Measured: 3.1187 in, 3.1187 out, and 3.5588 across two follows in the split
  test below. Zoom to where you want to sit and following stays there; "open in
  map" passes `openZoom` because that is a jump to a subject rather than a look
  around one.

Measured live, on a real 292-note base: on WGS-84 tiles the camera lands on
`30.281019,120.119698` exactly; on 高德 tiles it lands on
`30.278740152713375,120.12447989117803`, which is `wgs2gcj` of the same point to
the last digit — 525 m away, the size of the error either a missing or a doubled
conversion would have made. A `sync()`, a `reproject()` and a late `load` all
leave both unchanged, with `userMoved` still false — and `fit(true)` from the ⛶
control still frames everything, which is the line between "the reader asked" and
"something re-framed underneath them".

#### Sidebar-only was the wrong rule, and a button is the right one

The first version followed on `leaf.getRoot() !== workspace.rootSplit` — sidebar
maps only — on the grounds that a map in the main area is something being read or
arranged rather than a viewfinder, and moving it because a note was clicked in
the file explorer is an overreach.

That reasoning is sound and the rule it produced is not, because it does not
separate the two main-area cases. A map **sharing a tab group** with the note is
hidden the moment that note opens, so following it is pointless. A map in the
**next tab group over** — a note on the left, a map on the right, which is the
layout people actually mean by "follow" — is the sidebar case with a different
parent, and it was the one case the rule excluded. Position cannot tell them
apart, and neither can visibility (`containerEl.isShown()`, which is public API
and does work): a background tab a reader parked deliberately and a background
tab they never think about look identical from here. Only the reader knows, so
the answer is to ask them once, with a control on the map itself.

Map View reached the same conclusion by a different road: `followActiveNote` is a
field of its `MapState` (`mapState.ts`), toggled from the view's own control
panel (`ViewControlsPanel.svelte`), and it has no notion of sidebars anywhere.
Two things there are worth _not_ copying. It registers `file-open` and
`active-leaf-change` per view in `BaseMapView`'s constructor with a bare
`workspace.on()` and never offrefs them; and it follows by rewriting the query,
which is the decision above.

Four things hold this shape together:

- **The flag lives on the `TrackLayer`, so it is per open map.** Not on the base
  view (which is per _view_ — the same view open twice would share one answer,
  and it would mean writing to the reader's `.base` file), and not in settings.
- **The setting is now a default, read once in the constructor.** Consulting
  `settings.followActiveNote` on every `file-open` instead would let a settings
  change re-arm a map whose button the reader had since pressed.
- **Nothing is persisted.** A reopened tab starts from the setting again. The two
  places that could hold it are the base file and plugin-owned state, and both
  cost more than the feature.
- **Turning it off clears `held`.** `held` is what stands `fit()` down (guard #8
  and `fit()`'s own list), so leaving it set would freeze the map on the last
  note it followed — auto-fit still deferring to a target nothing aims at.
  Measured: with following off, `fit(false)` re-framed from the note to the whole
  data set, which it could not have done with `held` still in place.

Turning it **on** calls `plugin.followNow(layer)` rather than waiting for the
next `file-open`. A toggle that appears to do nothing until you click away and
back reads as broken.

Measured live in exactly the layout the old rule got wrong — a note in one
main-area tab group, `moments.base` in the next one over, nothing in a sidebar:
switching notes put the camera on `120.119698,30.281019` and then
`120.121950,30.264949`, both the notes' own coordinates to six decimals, with the
zoom unchanged at 3.5588 across both. Then, through the button's own DOM click
rather than the method behind it: off left `aria-pressed="false"` and dropped the
`is-active` class, `fit(false)` re-framed to `112.952458,33.188151`, opening
another note moved nothing, and pressing it again flew straight to that note
without any `file-open` at all.

#### The two things that made a following map unusable beside a note

Both only show up in the split layout, which is why neither was found while
following was sidebar-only, and both are about a map that moves without being
asked reaching further than the camera.

**The popup takes the keyboard.** A MapLibre `Popup` focuses itself when it
opens — `focusAfterOpen`, which defaults to true and which the native
`PopupManager` never sets — so it grabs the first focusable thing inside itself,
the note link. Measured: with a note focused in one pane, a follow moved
`document.activeElement` from the editor to `a.internal-link` inside the map's
popup. Every switch between notes therefore took the caret out of the editor,
which makes the feature worse than useless — you cannot type.

`restoreFocus()` in `track-layer.ts` puts it back, around both the immediate
popup and the deferred one `sync()` opens for a row that had not arrived yet.
Restoring afterwards rather than turning `focusAfterOpen` off on the shared
popup: the flag is MapLibre's and the popup is the native manager's, and a reader
who opened a popup by hovering a pin should still be able to tab into it. The
gate is `keepFocus` on the `FocusTarget`, set by following and not by "open in
map" — the difference is whether the reader asked to be over here. Measured after
the fix, in source mode: `div.cm-content` before, `div.cm-content` after, with
the popup open and the camera moved.

**A click on a pin ate the map.** The native view opens a marker's note with
`(path, newLeaf) => openLinkText(path, '', newLeaf)`, an own property of the
`MarkerManager` (`obsidian-maps/src/map-view.ts`), so it lands in the active
leaf — and clicking a map is exactly what makes that leaf the map's own. A
following map answered a click by replacing itself with the note it had been
pointing at.

There is no "the other pane" to ask Obsidian for: measured with the map's leaf
active, both `getMostRecentLeaf()` and `getLeaf(false)` answer the map's leaf.
Map View keeps its own MRU list (`utils.lastUsedLeaves`) for this reason. This
does not need one, because following already knows the answer: `followPane` is
recorded in `followActiveNote`, **after** `noteTarget` has confirmed a readable
coordinate — a base file opening in a leaf fires `file-open` too, and that check
is what keeps the pane pointer off a map. So the rule is one sentence: **a
following map opens notes in the pane it is following.**

`openNote()` is the one door for both click paths — the wrapped `onOpenFile` for
pins and `open()` for tracks — and it falls through to the native call for a
mod-click, for a map that is not following, and for a `followPane` that has since
closed or turns out to be this very map. Measured, with the map's leaf active
and a pin click driven through `markerManager.onOpenFile`: following on put the
note in the **left** pane and left `bases:moments.base` and its layer intact;
following off replaced the map pane with the note, which is the untouched
behaviour everyone not following still gets.

Two traps met while measuring, both worth knowing. `iterateAllLeaves` **stops on
a truthy callback return**, so a diagnostic whose body is `leaves.push(l)` — which
returns the new length — reports one leaf per split and looks exactly like
Obsidian hiding `bases` leaves from it. The plugin's own callbacks return
`undefined` and are fine. And a Bases **map view is not a workspace view**: it
has no `.leaf`, so `layer.view.leaf` is undefined and the leaf tree has to be
walked from `rootSplit` instead.

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

### Where the 高德 key lives, and why that is the reader's call

Two stores, chosen by `amapKeyStore`, because neither one is right for everybody:
Obsidian's **SecretStorage** keeps the key out of `data.json` — never synced,
never backed up, never committed, and unreadable by other plugins — at the cost
of staying on the one device, so every device searches only once its own copy is
entered. **Plugin settings** is the old behaviour: one entry covers every device,
in plain text. The settings pane states both costs and does not pick for anyone.

Four things are load-bearing:

- **`amapSecretId` holds a secret's _name_, never a key.** `SecretComponent`
  writes the name; `app.secretStorage.getSecret(id)` resolves it at the point of
  use in `amapKey()`. It answers `null` for a secret renamed or deleted since,
  which lands on the same empty string an unconfigured key does — so `needsKey`
  catches it and says so, instead of 高德 rejecting the request and the search
  looking like it found nothing.
- **The secret row is drawn, not declared.** `SettingControl` has no `secret`
  member — checked against the shipped `obsidian.d.ts`, not assumed — and
  `SecretComponent`'s constructor needs the `App` that the declarative controls
  never see. So it is a `SettingDefinitionRender` calling `setting.addComponent`,
  and its `onChange` goes through `setControlValue` by hand to keep that the one
  seam. `render` returns void or a cleanup function, so the chained
  `addComponent` call cannot be the arrow's body.
- **Switching to secret storage _moves_ the key; switching back does not copy it
  out.** The asymmetry is the point. Leaving the plain copy behind would make the
  setting a lie — the pane would say secret storage while `data.json` still
  synced the key — and clearing it instead would lose a key to a dropdown. The
  reverse would write a key to disk in plain text as a side effect of a menu,
  which is not a thing to do on somebody's behalf. `adoptPlainKey` only mints
  when no secret is named yet, so a reader who switched away and back gets the
  one they named. There is **no `deleteSecret`** in the API, which is worth
  knowing before writing a test that calls `setSecret`: what it creates stays.
- **The default is `secret`, but not for a key already on disk.** `loadSettings`
  derives `plugin` once when the loaded data has an `amapKey` and no
  `amapKeyStore`, and persists it. Applying the new default to an existing key
  would move it into a store the reader's other devices cannot read and break
  search there silently; persisting rather than re-deriving stops a later
  clearing of the box from flipping the store on the next start.

`SecretComponent` is `@since 1.11.1` and `SecretStorage` `@since 1.11.4`, both
under the 1.13.1 this plugin already requires, and both public — so no entry in
`types/obsidian-internals.d.ts` and no runtime probe.

## Reverse geocoding

"Fill place name from coordinates" is place search's mirror image: a coordinate
in, an address out. It reuses `geocodeProvider`, `amapKeyStore`, `amapKey` and
`amapSecretId` as they stand rather than introducing a second provider concept
— a 高德 Web-service key already covers `/v3/place/text` and `/v3/geocode/regeo`
alike, so a second dropdown would be one question asked twice. The only new
setting this feature needed is where the answer goes: `placeProperty`, default
`location` — deliberately not `coordsProperty`'s default of `coords`, so a
fresh install has the two apart. Nothing stops a reader from pointing both at
the same property by hand, though — typing `coords` into the new field, or
renaming `coordsProperty` to `location` while `placeProperty` sits at its
default — and reading and writing the same property would make the command
overwrite the very thing it reads. So `reverseGeocodeCurrent` checks the two
settings against each other before touching the note, the same way it checks
`needsKey` before spending a request, and refuses with a notice rather than
silently turning a note's coordinate into an address string.

`reverseRequest`/`parseReverse` in `geocode.ts` route to `nominatimReverseRequest`
/`parseNominatimReverse` or `amapReverseRequest`/`parseAmapReverse`, exactly as
`geocodeRequest`/`parseGeocode` route the forward case. Nominatim's `/reverse`
answers one object rather than an array — there is only ever one address for a
point — and, verified live, still signals failure with HTTP 200: an
out-of-range or oceanic point comes back `{"error":"Unable to geocode"}` rather
than a 4xx. 高德's `/v3/geocode/regeo` reuses the same `status`/`info` gate
`parseAmap` already has, verified live against a real invalid key.

**The seam that matters:** 高德's reverse geocoder takes GCJ-02 input, the one
place in this plugin where 高德 does not itself answer in the datum it also
expects. Every note's coordinate is WGS-84, so `amapReverseRequest` runs it
through `wgs2gcj` before it goes in the `location` param — mirroring
`maplinks.ts`'s `externalMapUrl`, which already does its own provider-specific
shift rather than trusting the caller to have done it. The shift lives inside
`amapReverseRequest` itself, in `geocode.ts`, rather than in `main.ts`'s
caller — which is also why it sits inside the 90 %/85 %-gated pure file instead
of behind a live-only Obsidian probe: a wrong direction here is invisible on
screen and lands the answer on a street ~500 m from the one that was actually
clicked, and that is exactly the kind of mistake this repo tests rather than
eyeballs.

Not behind **Enable location**, for the same reason the link-paste command is
not: it raises no permission prompt and records nothing about where this
device is. Unlike link-paste, though, it does put a coordinate the reader
already had on the wire — the one place this repo's "nothing leaves the vault
you didn't ask to leave" claim needed an asterisk, which is why both READMEs
say so.

`needsKey` is checked inside the command's handler, at the moment it runs, not
inside `checkCallback` — checking it there would make the command silently
vanish from the palette whenever 高德 is picked with no key configured, which
is worse than the notice `registerPlaceSearch` already shows for the same
condition.

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
space — wrong by little enough to look right. `projectedFeatures` still drops
`times`, so the ascent/duration/speed math would have nothing to read either;
that is the cheap proof, not the reason. It does carry a waypoint's own `name`
across the shift, for the markers below — the one exception to "properties are
dropped" now that something downstream reads one.

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

### The profile ↔ map hover link

Inline embeds only — a base map view has no profile to link to, so unlike
start/end markers below this has no base-view half at all, not even a partial
one. Hovering the profile draws a point on the map at that spot on the track,
plus a vertical rule and a distance/elevation readout on the profile itself;
hovering the track on the map does the same thing from the other direction.
Both leave when the pointer does.

**The moving dot is a GeoJSON layer (`CURSOR_SRC`/`CURSOR_LAYER`), not a
`maplibregl.Marker` and not a DOM element tracked with `map.project()`.**
There is no exported MapLibre to construct a `Marker` from — the same reason
the tracks themselves are a source and a layer rather than any kind of
Marker — and a layer-backed point gets correct screen placement through every
pan and zoom for free, with nothing to update but its data.

**Hit-testing goes through a private, invisible, wide copy of the line —
`HIT_SRC`/`HIT_LAYER` — never the visible `LINE_LAYER` itself.** MapLibre
hits a line layer against its own rendered width, and `trackWeight`'s own
minimum (1 px, `TRACK_KNOBS`) is not something a reader can reliably point
at, so `ensureHoverLayers()` in `embed.ts` holds the hit corridor at
`Math.max(18, weight * 1.5)` regardless of how thin the visible line is
drawn. It is its own source rather than a second layer reading `SRC` because
`removeTrackLayers()` in `layers.ts` — shared with the base-view
`TrackLayer` — knows nothing about `HIT_LAYER` and calls `removeSource(SRC)`
unconditionally; a foreign layer still referencing `SRC` at that point would
make that call throw, inside a `catch` that exists for an unrelated reason,
and leave `SRC` behind for `drawTracks()`'s next call to take the
`setData()` branch instead of re-adding the layers `removeTrackLayers()` had
just removed — the visible track gone until a full style reload. A private
source sidesteps the whole hazard by construction rather than by a rule to
remember.

**Both hover layers are torn down and rebuilt on `refresh()`, not left in
place across it.** `removeTrackLayers()` only knows the four shared track
layers, so if `refresh()` left the hover layers alone, they would survive
while the track layers it just removed come back — and a fresh `addLayer()`
always lands on top of whatever is already in the stack, so the newly
re-added `LINE_LAYER`/`POINT_LAYER`/etc. would end up drawn _over_ the
never-removed cursor dot, burying it under the redrawn line on every
settings toggle or re-parsed file after the first. `refresh()` therefore
calls `removeHoverLayers()` right beside `removeTrackLayers()`, so `draw()`
always rebuilds track-then-hover-link in that order and the dot stays on
top. `style.load` never has this problem: a style swap wipes every source
and layer at once, so there is nothing stale left to bury anything under.

**Two coordinate-space seams, in opposite directions, same discipline as
everywhere else in this file.** `renderProfile()`'s `highlightAt()` knows a
sample's `lng`/`lat` in WGS-84 (see `stats.ts` above) and shifts it _into_
tile space — `toTileSpace(this.system(), s.lng, s.lat)` — before calling
`setCursorPoint()`. `hoverTrack()` is handed an `ev.lngLat` that is already
tile space and shifts it _back_ — `toWgs84()` — before comparing it against
the WGS-84 samples with `nearestByPosition()`. Reversed or omitted in either
direction, the search runs against the wrong space and, on Chinese tiles,
quietly picks a plausible-but-wrong sample — never an error, never visibly
off enough to notice by eye.

**`elevationProfile()`'s samples carry their own WGS-84 `lng`/`lat` now, for
free** — the downsampled series already walked every coordinate on its way
to computing `d`, and `pos[0]`/`pos[1]` were sitting right there. Two small
search helpers, `nearestByDistance` and `nearestByPosition`, are both plain
O(n) linear scans over the ≤160-sample array, run on every `mousemove` — a
judgement call rather than a measured one: cheap enough on that few
candidates not to be worth a binary search or a spatial index, and simple
enough to read correctly at a glance, which a binary search leaning on `d`'s
monotonicity would not buy anything a reader could feel. `nearestByPosition`
uses squared planar distance in degree-space rather than haversine, on the
same reasoning: picking the nearest of a few dozen candidates already known
to lie along one track is not the same problem haversine solves, and its
distortion-correction buys nothing here. It does not disambiguate an
out-and-back or looped track, where two different along-track distances can
land at nearly the same physical point — a known, accepted gap (fixing it
would mean tagging every sample with which `LineString` it came from), not
an oversight.

**Map → profile hover reuses the exact same `highlightAt()` closure —
including its own `setCursorPoint()` call — that profile → map hover
uses**, rather than a second, leaner path that only touches the rule and the
readout. Hovering the track directly therefore also redraws the tiny dot
exactly under the pointer that is already there, which is harmless and
arguably useful; the alternative is two functions that both know how to
"highlight sample `i`," and this codebase already has scar tissue about that
particular kind of duplication drifting apart later.

Not live-verified against a running Obsidian — this landed without a vault to
test in, unlike most of the rest of this file. `ensureHoverLayers()`,
`bindInteractions()`'s two new listeners, and the hit corridor's actual
pointer tolerance in a real browser are all reasoned through, not measured;
treat the 18 px / 1.5× numbers as starting points rather than measured ones
until someone checks them with `obsidian eval`, the way "Testing" below
already asks for.

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

## Start/end markers, direction and waypoint names

Every drawn track gets a start pin, an end pin, direction arrows along the
line, and — on inline embeds — a waypoint's own name on hover. One setting,
`trackMarkers`, defaults on, sits beside track statistics and the elevation
profile, and covers all three at once: they are one visual idea (which way did
this go, and where does it begin), not three features that happen to share a
toggle.

**Hand-drawn canvas icons, not SDF plus `icon-color`, not Lucide through
`setIcon()`.** The native raster style ships no glyphs and no sprite
(`obsidian-maps/src/map/style.ts` is version 8, sources and layers, nothing
else), so a `text-field` renders nothing on it — a waypoint's name has to be a
tooltip, not a label on the map, and a start/end marker has to be an image,
not text. `map.addImage()` is the native marker code's own door
(`markers.ts`'s `createCompositeMarkerImage`), so this follows it rather than
opening a new one — but not its async canvas→blob→`Image()`→decode round trip,
which exists there only to rasterize an untrusted, dynamically-chosen Lucide
SVG through an `<img>` src. These three icons are plain canvas path fills with
nothing to decode, so `ctx.getImageData()` hands `addImage()` a synchronous
`ImageData` instead, and `addTrackLayers()`/`drawTracks()` stay the
synchronous functions every existing caller already assumes. A Lucide name was
the other option and was rejected for a sharper reason than "one more
dependency": an icon name Obsidian's bundled set does not have renders
nothing, silently, and there is no way to probe for that from outside a
running Obsidian — a hand-drawn canvas path cannot fail that way.

Which shapes took a phone to settle, and two of the first three were wrong.
See "the shapes were wrong twice" below: a canvas path that cannot fail to
render can still fail to be read, and that half is not visible in the source.

No SDF and no `icon-color`. `icon-color` only tints an SDF-marked image, and a
hand-authored true distance field is the kind of thing that looks fine until
it is rendered at a couple of zoom levels and turns out aliased at one of
them — exactly the "fiddly" a per-note track colour on these icons would have
been. The colour is baked into the pixels instead, which is also why there is
no per-note colour here: **robust beats pretty**. `ensureTrackIcons()` in
`layers.ts` draws with a fixed, theme-aware palette — start = `var(
--text-success)`, end = `var(--text-error)`, the arrow = `var(--text-muted)`,
every one haloed in `var(--background-primary)`, the same halo idiom the
waypoint circles already use via `circle-stroke-color`. `text-success`/
`text-error`/`text-muted` against `background-primary` is the base contrast
pairing Obsidian's own theme system already guarantees on both a light and a
dark theme, not a colour this plugin picked and hoped works, and it reads over
any track colour because it never has to compete with one — the marker's fill
is not the track's fill.

**`amRole`/`amName`, and why `trackFeatures()` lives in `geometry.ts`.** A
synthetic start/end point shares the track's own GeoJSON source — a second
source was not worth the extra `addSource`/`addLayer` bookkeeping for two
points per line — so it needs a way to tell itself apart from a real waypoint.
`amRole: 'start' | 'end'` is that tag, and `layers.ts`'s waypoint-circle filter
grew a `['!', ['has', 'amRole']]` clause the moment a synthetic point could
land in the same source: get that backwards and every track grows two extra
"waypoint" dots at its ends. `amName` is deliberately **Point-only** — a KML
`<Placemark>` can name a LineString too (`tests/parse.test.ts` proves it with
'Trail A'), but nothing reads a name off a line, and carrying it through would
only invite a future hover handler to bind a track's name to whichever point
happens to be under the cursor. Both live on `TrackFeatureProps` in
`geometry.ts`, and the function that stamps them — `trackFeatures()` — lives
there too rather than in `layers.ts`, specifically so it sits on the
90%-covered pure-file list and is testable with no MapLibre stub: it is the
one shared helper both `TrackLayer.build()` (base views) and `TrackEmbed.draw()`
(inline embeds) call, which is what keeps the two draw paths from drifting
apart on what a feature carries — the trap this repo has already paid for once,
in "How tracks find their way onto the map".

**Layer order is four decisions, not one "below the pins."** `addLayer`'s
`before` argument only orders a new layer relative to _one_ named layer, so
getting all four right _relative to each other_ means calling `addLayer` in a
deliberate order — line, then arrow, then point, then endpoint, every one
anchored `before: marker-pins` — rather than trusting the same anchor to sort
them. Endpoint above point is what keeps a start/end pin sitting exactly on a
waypoint dot from vanishing underneath it. `icon-allow-overlap` and
`icon-ignore-placement` are both `true` on both symbol layers for the same
reason native `marker-pins` sets them (`markers.ts`): a symbol layer collides
with itself by default, and a loop route puts the start and end pin on the
same pixel — without both flags MapLibre would silently keep one and drop the
other, and a busy zoomed-out map would thin its arrows for no visible reason.

**`showMarkers` goes through `applyTrackPaint()`, never through
`signature()`.** `applyTrackPaint()` already runs unconditionally on every
`sync()`/`draw()` — weight and opacity work exactly this way today — so
threading `trackMarkers` through it as a fifth argument is what lets the _Show
track markers_ toggle take effect on an already-open map at once. **This must
not move.** Folding visibility into `TrackLayer.signature()`'s upload-skip gate
instead would mean a plain settings toggle changes nothing the signature can
see, and the two new layers would keep whatever visibility they last had until
some unrelated change — a recolour, a track file edit, a theme swap — happened
to force a redraw anyway. That is the exact class of bug guard #8 in
"Non-obvious things to leave alone" already documents for paint and framing;
this is the same guard applying to a fourth and fifth layer.

**Waypoint-name-on-hover ships on embeds only.** A base view already shows a
note's own popup on hovering any part of its track, through
`popupManager.showPopup` — see `hover()` in `track-layer.ts` — and this plugin
has no handle on that popup's DOM to append a name to rather than fight: two
floating boxes, or one hiding the other, is worse than the gap. An embed has
no interactivity of its own to collide with, so `TrackEmbed` binds its own
`mousemove`/`mouseleave` on the waypoint-circle layer and positions a small
`div` off the MapLibre event's own `point` field — container-relative pixels,
not `originalEvent.offsetX/offsetY`, which is relative to whatever element the
browser happened to pick as the event target. The base-view half is a written
gap in the roadmap, not a silently missing feature — see "Waypoint names on
hover, on a base map".

### The arrow was wrong twice, and only a phone said so

Three separate mistakes here, on two rounds of looking at a real screenshot. The
one worth reading first, because it is invisible in the source and silent at
runtime:

**An arrow icon on a line placement must be drawn pointing RIGHT, not up.**
`icon-rotation-alignment: 'map'` under `symbol-placement: 'line'` rotates the
image's **+x axis** onto the line's bearing — the same convention as text along
a line, which reads left-to-right in the direction of travel, and the reason
every OSM one-way arrow sprite is drawn pointing right. Drawn pointing up, as
this shipped, the arrows still sit on the line and still turn as it turns; they
just point **across** it for its whole length. Nothing errors, the rotation code
is doing exactly what it says, and on a mostly-straight segment the result looks
enough like a decoration that the first screenshot did not give it away — it
took a second one, on a stretch with a bend in it, for "these point the wrong
way" to become "these point at 90° to the wrong way".

The other two were the shapes. The first version of the three icons was a filled
circle, a filled square and a filled triangle, at 20 px / 20 px / 12 px, with
the sizes and `symbol-spacing` written down as reasoned starting points rather
than measured numbers. The reasoning held for the circle and failed for the
other two, and neither failure is visible in the source either:

- **A filled triangle does not read as an arrow at 12 px.** It was drawn
  `(6,0) → (12,12) → (0,12)`, so the apex sat 6 px from either base corner and
  nothing said which of the three corners was the front. It is now an arrowhead
  with a **notched tail**: one concave end, which a viewer reads as "the back"
  immediately, where they do not read a marginally sharper corner as "the
  front". 18 px rather than 12, and the halo 1.2 px rather than 1.5: at 12 the
  halo was closing the notch back up, and at 14 — measured against a real 5.8 km
  track at the zoom `fit()` picks for it — the arrows were legible only once you
  knew to look for them. Worth noticing that this failure **masked** the rotation
  one above: a shape with no legible direction cannot look like it is pointing
  the wrong way.

  Do not answer "still too small" by raising `ARROW_PX` much further, and
  **especially** not by raising `applyTrackPaint()`'s `Math.min(1.6, …)` clamp on
  `icon-size`. A line-placed symbol MapLibre cannot fit on its segment is
  **dropped, not shrunk**: measured on that same track, `icon-size: 4` removed
  every arrow from the map rather than making any of them bigger. The failure
  looks exactly like the feature being switched off, and `18 × 1.6` is already
  close to where placement starts refusing.

- **An axis-aligned filled square reads as a broken image.** Beside Obsidian's
  own rounded map controls, a hard-edged red rectangle with a 2 px light border
  is what a failed `<img>` looks like. It is now a **ring** at the start disc's
  own diameter: solid-versus-ring, which also carries the pair for a reader who
  cannot separate `text-success` from `text-error`, where colour alone would
  not. The hole is filled with the halo colour rather than left transparent,
  since a transparent one shows the track's own line running through the middle
  of the marker that marks its end.

`ICON_SCALE`/`pixelRatio` were **not** the problem, which is worth saying
because a hard-edged blob on a phone looks exactly like a 1× bitmap on a 3×
screen. They were already 3 and matched; the shapes were simply unreadable at
any resolution.

**How to check any of this without a phone**, which is what made the second and
third rounds cheap: the CLI reaches a live inline map. `plugin.embeds` is a Set
of `TrackEmbed`, and esbuild mangles nothing, so `map` and `rec` are both
reachable — pick the entry that has them (a torn-down embed is still in the Set
with `map: null`), read the last dozen coordinates of a LineString to get a
segment whose bearing you know from the data, aim the camera at it, and screenshot:

```bash
obsidian open path="moments/….md"        # then wait for the embed to build
obsidian eval code="const e=[...app.plugins.plugins['advanced-maps'].embeds].filter(e=>e.map)[0]; e.map.jumpTo({center:[120.126525,30.249265],zoom:17.6}); 'aimed'"
obsidian dev:screenshot path=/tmp/arrows.png
```

Two traps in that loop. A fresh `draw()` ends in `fit()`, so a `jumpTo` issued
while the embed is still building is overwritten a moment later — aim it after
the map has settled, or accept the framed overview. And `plugin:reload` destroys
every embed, so the note has to be re-rendered (switch away and back) before
there is a map to aim at all.

Still unmeasured, and still worth a live pass: `symbol-spacing` (90 px) on a
busy zoomed-out multi-track view, and whether a loop route — start and end on
the same pixel — reads as two markers stacked rather than as one hiding the
other. `icon-allow-overlap`/`icon-ignore-placement` are set for that case, so
the question is whether it _reads_, not whether both are drawn.

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

### The two lists behind that menu

What the menu offers is a setting: the six built-ins can be reordered and
switched off, and a reader can add their own entries. Four things are
load-bearing.

- **A custom entry states its datum; it cannot be templated.** `{lat}`/`{lng}`
  substitution covers axis order, which is the only _shape_ difference between
  providers. It cannot cover the conversion, which is the difference that
  matters — and the host cannot be read for it either, since a self-hosted 高德
  mirror looks like any other domain. So `CustomMap` carries `wgs84 | gcj02 |
bd09` and `shiftTo` applies it, exactly as `externalMapUrl` does for the six.
- **Substitution is on the raw string, never through `new URL()`.** `{` and `}`
  are in the WHATWG _path_ percent-encode set, so a round trip turns
  `https://x/{lat}/{lng}` into `%7Blat%7D` and leaves nothing to substitute. A
  placeholder in the _query_ survives untouched, which is what makes this worth
  writing down — half the templates would have kept working.
- **Schemes are a deny list, not an allow list.** The value reaches
  `window.open`, so `javascript:`, `data:`, `vbscript:`, `blob:` and `file:` are
  refused. Narrowing it to `http`/`https` instead would refuse `iosamap://`,
  `waze://` and `comgooglemaps://` — which is the case a custom entry exists for
  on a phone.
- **Empty means "follow the locale", so the six are not written out.**
  `resolveBuiltins(stored, locale)` derives the default order at the point of
  use; persisting it on first render would freeze one locale's order into
  `data.json`, and a reader who later switches Obsidian to Chinese would get an
  English menu with no setting on screen admitting to it. The same function
  drops an unknown id, takes a duplicate once, and appends a provider a later
  version adds — so the stored list stays whole across versions.

`type: 'list'` supplies the affordances — a ✕ per row, a drag handle, a `+` in
the header — and each row's control names its entry by index
(`customMaps.2.url`), with `getControlValue`/`setControlValue` understanding the
path. That keeps `setControlValue` the one write seam for list rows too.
`update()` re-renders a list from a fresh `getSettingDefinitions()`, and is
called only for add, delete and reorder — never for a field edit, because a text
control writes on every keystroke and a re-render mid-word takes the focus with
it.

**A `type: 'page'` row inside a list can neither be deleted nor dragged.** This
one cost a shipped bug: an entry as a navigable sub-page looks like the tidy
answer — three labelled fields, declarative controls, a `validate` hook — and it
renders a row with nothing but a chevron. Read out of `obsidian.asar`
afterwards, `n6` returns at `setNavigable(…)` for a page **before** the branch
that appends the delete button and the drag handle, and the keyboard delete
(`onDeleteItem`, which is Delete/Backspace on a focused row and is the only
delete `onDelete` ever wires) looks the row up in `group.settings`, which a page
never joins. So a custom entry is **one ordinary row carrying three components**
— drawn, not declared, which is the one place in this tab where that is forced
rather than preferred: one row has to be one entry, because `onDelete(index)`
and `onReorder(from, to)` count rows.

Two smaller things fell out of the same reading. Row identity is
`K2(def, i)`: `page:<name>`, else `ctrl:<control.key>`, else `name:<name>`, else
`item#<i>` — so two untitled pages collided on `page:未命名` and Obsidian logged
`duplicate setting key`, while a nameless `render` row keys on its index and
cannot. And `Setting.setErrorMessage` is public, which is what a drawn row uses
to say why a URL is unusable — stated on arrival too, not only while typing,
since a URL saved by an older version is exactly the one nobody is about to
retype.

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

Three traps. **Repeated `plugin:reload` can leave a view nobody owns.** Bases
reuses its map view objects, and `__advancedMapsLayer` lives on the view — so a
view enhanced by an instance that went away without detaching keeps the flag,
`enhance()` skips it as "already ours" forever, and `plugin.layers` stays empty
while everything on screen looks fine. It is self-sustaining: with no layer to
detach, disabling the plugin cannot clear it either. The symptom is a feature
that measures as doing nothing at all. `obsidian reload` — the whole window —
clears it; a `delete view.__advancedMapsLayer` followed by `adoptOpenViews()`
does too, if you want to see it recover. Measure a camera feature from a freshly
reloaded window.

`switchToTileSet` is followed asynchronously by `style.load` →
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

Four things were measured rather than assumed, and the last one contradicts the
doc comment:

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
- **`getSettingDefinitions()` is _not_ called on every display**, whatever its
  doc comment says. It runs when the tab is added and on `update()`, which stores
  the result as `settingItems`; the pane renders from those, and its DOM is kept
  and re-attached. Measured by wrapping all five of `display`, `hide`, `update`,
  `getSettingDefinitions` and `refreshDomState` on a live tab and switching away
  and back: `hide` fires on the way out, and **nothing at all** fires on the way
  back — not even `display`. Anything that has to be fresh when the reader looks
  at it therefore has to be refreshed on the way _out_, or by an `update()` from
  wherever the underlying state changed.

`setControlValue` is the one seam for everything that used to live in an
`onChange`: it trims, applies the two fallbacks that a cleared field has, checks
the two dropdown values against their own lists, and then does the side effects —
`reprojectAll`, `resetLocator`, `refreshTracks`, and `update()` for the Amap key
row that states its own visibility.

### The base and its view are picked, not typed

**The base file** is a `type: 'file'` control with
`filter: (file) => file.extension === 'base'`, which renders a combobox with a
chevron and a ✕ rather than a text box. Measured on a 395-file vault: the picker
offered exactly the one `.base` in it, selecting wrote `basePath` as the full
path with extension, and the ✕ wrote `''` — a string, not null, which is already
what "not configured" means to `openInMap`.

**The view** is an ordinary `dropdown` whose options are that base's map views.
Which is the awkward one, because a base is a **file**: reading it is
asynchronous and `getSettingDefinitions()` is not. So the read is started from
there, `views` stays null until it lands, and the render carrying the answer is
the `update()` afterwards. Five things hold it together:

- **Null is "no answer"; the empty list is "no map views".** Collapsing the two
  is the bug this shipped with for exactly one build, and it is worth reading the
  screenshot for: a phone, a base holding a view called 地图, and a pane saying
  该 base 里没有「地图」这个视图. A file that was not there answered `[]`, `[]`
  said the base holds no map view, and a stored name against a base holding none
  is a name the base does not have. Everything downstream was working correctly
  on a wrong input.
- **A read at plugin load waits for `onLayoutReady`.** That is where the null
  came from: `addSettingTab` builds the definitions once, during load, and the
  vault's file list is not necessarily populated yet — on a desktop it is, on a
  phone it is not. The wait costs a microtask on a vault that has been open for a
  while, and it is the difference between reading the base and reading nothing.
- **A read with no answer is not cached.** `viewsPath` is dropped again, so the
  next `update()` or `hide()` asks afresh rather than living with the miss until
  the plugin reloads.
- **`viewsPath` is set before the read, not after.** It marks a read as in
  flight, so a second render does not start another, and a read whose base was
  swapped while it was in the air recognises itself as stale and stands down.
- **The re-render is skipped when the options come back identical**, compared as
  the options rather than the names — a name can stay while its label changes.
- **A name the base does not have is offered anyway, and labelled.** A dropdown
  whose value is not among its options renders as the first one, so dropping a
  stale name would show "the first map view" while the setting says otherwise.
  Only against a base that was actually read, per the first point. The label
  quotes the name (`该 base 里没有「地图」这个视图`) as `notice.viewNotFound`
  already does: a view is usually named after what it shows, so unquoted it reads
  as a statement about the base rather than about the name.
- **The list is re-read in `hide()`**, because of the lifecycle fact above —
  nothing fires when the pane is shown, so the moment to notice a view renamed in
  Bases is the moment the pane goes away, with nobody watching it re-render.

Only map views are offered: `pickMapView` matches a configured name against
_every_ view, so a table named there is found and then opened as the map it is
not. `mapViewNames` in `map-block.ts` is the pure half of that, and is tested.

Both rows go through `setControlValue`, so the one write seam still holds.
Measured on the real base with the settings window **open** — `update()` on a
closed one recomputes the definitions and paints nothing, which is enough to make
a reproduction look like it passed. Recording rather than writing: picking a view
sent `viewName` as its name and the blank option sent `''`; an empty `basePath`
left the row `disabled`; writing `basePath` re-asked exactly once; a stubbed
rename flagged the stored name and a base with no map views at all flagged it
too; and `getFileByPath` stubbed to null — the phone, reproduced — left the name
plain and unflagged, cached nothing, and came back with the full list on the very
next `update()`.

## Translations

`src/i18n.ts` holds one flat table per language. English is the source of truth
and its keys are the key type, so a missing entry is a compile error. A new
language is one object plus one line in `LOCALES`; `tests/i18n.test.ts` checks
placeholders match across languages.

## Releasing

**Write the changelog section first.** `release-notes.mjs` cuts the release body
out of `CHANGELOG.md` and exits non-zero when the tag has no `## [x.y.z]`
section of its own, so a tag pushed ahead of its changelog entry fails the
release job — after the checks have passed, which makes it look like something
broke rather than like something is missing. Add the section and the two
`[Unreleased]`/`[x.y.z]` compare links at the bottom, then:

```bash
npm version patch|minor|major   # version-bump.mjs syncs manifest.json + versions.json
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`, which re-runs every check,
refuses to continue if the tag and `manifest.json` disagree, and publishes a
release with `main.js`, `manifest.json` and `styles.css` attached.

Recovering from that failure is cheap, and was: the job dies at the release-notes
step, _before_ the release is created, so there is nothing published to clean up.
Commit the changelog, `git tag -f`, `git push -f origin <tag>`. Check
`gh release list` first — once a release exists, moving its tag underneath it is
a different and worse situation.
