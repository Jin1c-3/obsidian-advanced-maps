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
  track-layer.ts     everything added to one native map view
  embed.ts           inline ![[track.gpx]]
  modal.ts           the "open in map" pop-up
  settings.ts        settings tab and defaults
  locate.ts          device location, and when to stop asking ← tested
  coords.ts          GCJ-02 / BD-09 conversion            ← pure, tested
  parse.ts           GPX / GeoJSON readers                ← pure, tested
  geometry.ts        bounds, clamping, the style gate     ← pure, tested
  view-options.ts    the two option groups and where they go
  track-cache.ts     parsed tracks, keyed by path, invalidated by mtime
  layers.ts          MapLibre layer specs, zoom-to-fit control
  i18n.ts            en / zh tables
  constants.ts       source and layer ids, track extensions
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
`onunload`, `loadConfig`, `switchToTileSet` — plus `markerManager.updateMarkers`
and `markerManager.createGeoJSONFeatures`. Instance wrappers die with the view,
and `delete` restores the untouched prototype.

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
plugin reads that note's embeds from the metadata cache and resolves any
`.gpx` / `.geojson` link:

```
moments/20260412191024.md  ──embeds──▶  assets/2026年4月12日 下午831.gpx
```

Two consequences:

- The base's own filters keep working untouched. No need to widen a filter to let
  attachment files into the result set.
- A track is drawn in **its note's colour** — resolved through the same
  `markerManager.getCustomColor` the pins use — because it belongs to that note.
  Hovering the track shows that note's popup; clicking it opens the note.

A `.gpx`/`.geojson` file that appears in the query result directly is also drawn,
so `file.ext == "gpx"` style bases work too.

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

Conversion happens at four places, all of which have to agree:

- **Markers** — `markerManager.createGeoJSONFeatures` is the single point where
  pin coordinates are minted, so wrapping it covers every pin.
- **Tracks** — memoised per file per system; an 11 k-point export is transformed
  once, not on every redraw.
- **The configured `center`** — converted inside the `loadConfig` wrapper, where
  the config object is born. Patching `initializeMap` or `updateCenter` alone
  makes the two fight over the centre. The untouched WGS-84 value is kept on the
  config as `__amCenterWgs` so a later tile switch can re-derive it.
- **Auto-fit bounds** — native `getBounds()` still answers in WGS-84, so
  `bounds()` reads the moved features instead.

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

Extensions are claimed only if nothing else has them, so a plugin that already
renders `.gpx` keeps working alongside this one.

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

## Testing

`src/coords.ts`, `src/parse.ts`, `src/geometry.ts`, `src/locate.ts`,
`src/view-options.ts` and `src/i18n.ts` run outside Obsidian and are held above
90 % coverage in CI. Anything touching the coordinate maths, a parser or the
locator needs a test in the same PR.

The view wrappers cannot be tested here — they need a live Bases map. Try them in
a real vault and say in the PR what was tried. They are held honest by the type
shim and by comments explaining why each wrapper exists.

## Translations

`src/i18n.ts` holds one flat table per language. English is the source of truth
and its keys are the key type, so a missing entry is a compile error. A new
language is one object plus one line in `LOCALES`; `tests/i18n.test.ts` checks
placeholders match across languages.

## Not supported

KML and TCX. Adding them means another branch in `parseTrack` plus their
extensions in `TRACK_EXTS`; the shapes they produce are the same.

## Releasing

```bash
npm version patch|minor|major   # version-bump.mjs syncs manifest.json + versions.json
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`, which re-runs every check,
refuses to continue if the tag and `manifest.json` disagree, and publishes a
release with `main.js`, `manifest.json` and `styles.css` attached.
