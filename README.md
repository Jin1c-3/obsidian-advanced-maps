# Advanced Maps

[![CI](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml/badge.svg)](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Adds to Obsidian's built-in **Maps** view instead of replacing it: GPX/GeoJSON
tracks, zoom-to-fit, Chinese coordinate systems, inline `![[track.gpx]]` maps,
and an "open in map" pop-up.

Everything the built-in view already does — markers, icons, colours, tiles,
popups, the right-click menu — stays the built-in view doing it. No Leaflet, no
vendored map library, no runtime dependencies at all.

## Requirements

- Obsidian 1.13.1 or newer, with **Bases** enabled (core plugin).
- The first-party **Maps** plugin, which supplies the view this one extends.
  Without it Advanced Maps says so and does nothing.

## Install

**From a release.** Download `main.js`, `manifest.json` and `styles.css` from
[Releases](https://github.com/Jin1c-3/obsidian-advanced-maps/releases) into
`<vault>/.obsidian/plugins/advanced-maps/`, then enable it under Settings →
Community plugins.

**With BRAT.** Add `Jin1c-3/obsidian-advanced-maps` in
[BRAT](https://github.com/TfTHacker/obsidian42-brat).

## How the patch works

Bases keeps its view types in a plain, writable object:

```
app.internalPlugins.getPluginById('bases').instance.registrations.map
  → { name, icon, factory, options }
```

`factory` is replaced with one that builds the native view and then attaches a
`TrackLayer` to the instance; `options` is replaced with one that splices an
extra group into the list. The native class is never subclassed or edited.

`TrackLayer` wraps methods **on the instance** — `initializeMap`, `destroyMap`,
`onunload`, `loadConfig`, `switchToTileSet` — plus `markerManager.updateMarkers`
and `markerManager.createGeoJSONFeatures`. Instance wrappers die with the view,
and `delete` restores the untouched prototype.

`updateMarkers` is the seam worth knowing about. The native view calls it once
the map exists, again on every data change, and again on `styledata` after a new
style has wiped every source — which is exactly the set of moments the tracks
need redrawing too.

## How tracks find their way onto the map

Tracks are **not** pulled from the query result. For every note in the base, the
plugin reads that note's embeds from the metadata cache and resolves any
`.gpx` / `.geojson` link:

```
moments/20260412191024.md  ──embeds──▶  assets/2026年4月12日 下午831.gpx
```

Two consequences worth knowing:

- The base's own filters keep working untouched. No need to widen a filter to
  let attachment files into the result set.
- A track is drawn in **its note's colour** — resolved through the same
  `markerManager.getCustomColor` the pins use — because it belongs to that note.
  Hovering the track shows that note's popup; clicking it opens the note.

A `.gpx`/`.geojson` file that appears in the query result directly is also
drawn, so `file.ext == "gpx"` style bases work too.

Every track becomes one GeoJSON source with two layers: a `line` layer and a
`circle` layer for waypoints, both coloured per-feature via `['get','amColor']`.

## Coordinate systems (GCJ-02 / BD-09)

Chinese tile providers do not serve WGS-84. 高德 and 腾讯 serve **GCJ-02**, 百度
serves **BD-09** — deliberate, non-linear offsets that land 300–600 m (GCJ) or
about 1 km (BD) from the true position. Point a Maps tile set at
`webrd01.is.autonavi.com` and every pin floats several streets away.

Raster tiles cannot be nudged back, so the data moves instead. Every coordinate
is converted on its way onto the map and converted back on the way out;
MapLibre never learns the difference. **Nothing on disk is touched** — notes and
`.gpx` files stay WGS-84, and switching back restores the original positions to
the metre.

The system is a property of the **tile source**, not of the view, so the default
mode is `auto`: it reads the answer off the tile URL. That is what makes the
mixed case work — one note can hold an OpenStreetMap embed and a 高德 base view
at once, each correct, and the ⧉ background switcher flips the system live.

| Mode           | When                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| Auto (default) | Match the tile URL against known 高德/腾讯/百度/Google-CN hosts         |
| WGS-84         | OpenStreetMap, ArcGIS, 天地图 (CGCS2000; the difference is centimetres) |
| GCJ-02         | Force it — a proxied or self-hosted 高德 mirror the URL cannot reveal   |
| BD-09          | Same, for 百度                                                          |

Set the default in plugin settings; override per view under **Coordinate
system**. Conversion happens at four places, all of which have to agree:

- **Markers** — `markerManager.createGeoJSONFeatures` is the single point where
  pin coordinates are minted, so wrapping it covers every pin.
- **Tracks** — memoised per file per system; a 11 k-point export is transformed
  once, not on every redraw.
- **The configured `center`** — converted inside the `loadConfig` wrapper, where
  the config object is born. Patching `initializeMap` or `updateCenter` alone
  makes the two fight over the centre. The untouched WGS-84 value is kept on the
  config as `__amCenterWgs` so a later tile switch can re-derive it.
- **Auto-fit bounds** — native `getBounds()` still answers in WGS-84, so
  `bounds()` reads the moved features instead.

Accuracy: GCJ round-trips to under a nanometre, BD to under 0.2 m; outside China
both are the identity. `tests/coords.test.ts` holds those figures to account.

## View options

The built-in options are untouched. This plugin appends two groups —
**Tracks** behind Markers, and **Coordinate system** behind Background, next to
the tile URLs that decide it:

| Option                 | Meaning                          |
| ---------------------- | -------------------------------- |
| Line width             | Track stroke width               |
| Line opacity           | Track stroke opacity             |
| Max zoom when fitting  | Upper bound for auto-fit         |
| Tile coordinate system | Blank follows the plugin setting |

Auto-fit covers markers _and_ tracks, and stands down when the view pins a
`center` or a `defaultZoom`, or once you pan or zoom. The ⛶ button re-frames on
demand and ignores all of that.

## Open in map

Adds an entry to a note's ⋮ menu (and the command palette) that pops up a base's
map view centred on that note. The item only appears on markdown notes that
actually have the coordinate property, so it stays out of the way everywhere
else.

Settings: menu label, base path, view name, coordinate property, pop-up zoom.
The base path starts blank and has to be pointed at a `.base` file; leaving the
view name blank takes that base's first map view. Changing the label updates the
⋮ menu immediately; the command palette entry picks up the new name after a
plugin reload.

It renders the base as a ` ```base ` block rather than constructing a view
directly — that is what carries the base's filters, formulas and properties
across. Build the view spec by hand and you lose the icons, the colours and the
scope. The spec overrides `center`, `defaultZoom` and `mapHeight` only, and
sets both `center` and `defaultZoom` because an explicit centre without an
explicit zoom just gets auto-fit back to the whole data set.

## Inline `![[track.gpx]]`

There is no exported MapLibre to build a map with, so the embed borrows the
built-in view: the native factory is called with a stub controller
(`{app}` plus a `config` that answers nothing), which yields a fully configured
map — tiles, dark mode, zoom controls, background switcher — that happens to
have no rows behind it. The track is then drawn on top.

Each map holds a WebGL context and browsers cap how many can be alive at once,
so an embed only builds once it scrolls into view.

The extensions are claimed only if nothing else has them, so a plugin that
already renders `.gpx` keeps working alongside this one.

## Six non-obvious things this had to work around

All of them cost real debugging time; don't undo them.

1. **`isStyleLoaded()` is the wrong gate.** It stays false until every _tile_
   has arrived, so waiting on it before `addSource` costs seconds on a busy map
   — long enough that a background switch looks like it dropped the tracks.
   `styleUsable()` reads `map.style._loaded` instead, which is the flag
   `addSource` itself checks.

2. **Tracks are re-added on `style.load`, not on the native `styledata` hook.**
   The built-in view arms a _one-shot_ `styledata` listener to restore its
   markers. Riding that would work exactly once per style change and is not
   ours to depend on.

3. **Track layers are inserted below `marker-pins`.** Otherwise a pin sitting on
   its own track is unclickable.

4. **Already-open views are adopted on load.** A map view that was built before
   the patch never passed through the patched factory, so enabling the plugin —
   or Maps reloading — would leave it plain until the tab was reopened.
   `adoptOpenViews()` walks the component tree and picks those up.

5. **The patch is re-applied on `layout-change`.** Maps re-registers its view
   whenever it reloads, which drops the wrapper on the floor. The check is a
   property lookup, so running it that often is free.

6. **`switchToTileSet` never goes back through `loadConfig`.** It rewrites
   `mapConfig.mapTiles` in place, so under `auto` the coordinate system can
   change without the configured centre hearing about it. It is wrapped too,
   and re-derives the centre from the WGS-84 value kept beside it.

## Not supported

KML and TCX. Adding them means another branch in `parseTrack` plus their
extensions in `TRACK_EXTS`; the shapes they produce are the same.

## Development

```bash
git clone https://github.com/Jin1c-3/obsidian-advanced-maps
cd obsidian-advanced-maps
npm install
cp .env.example .env      # point OBSIDIAN_PLUGIN_DIR at a vault
npm run dev               # watch, rebuild into that vault, hot-reload
```

`npm run dev` writes `main.js`, `manifest.json` and `styles.css` straight into
the vault folder and drops a `.hotreload` marker beside them, which is what
[pjeby/hot-reload](https://github.com/pjeby/hot-reload) watches for — install
that plugin once and every save reloads Advanced Maps without touching Obsidian.
Without it, ⌘/Ctrl+P → "Reload app without saving" does the same thing by hand.

| Script                                      | What it does                                                          |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                               | esbuild watch → the vault in `OBSIDIAN_PLUGIN_DIR`, plus `.hotreload` |
| `npm run build`                             | Typecheck, then a minified bundle at the repo root                    |
| `npm run deploy`                            | One-off production build into the vault                               |
| `npm test` / `test:watch` / `test:coverage` | Vitest                                                                |
| `npm run typecheck`                         | `tsc --noEmit`                                                        |
| `npm run lint` / `lint:fix`                 | ESLint                                                                |
| `npm run format` / `format:check`           | Prettier                                                              |
| `npm run check`                             | All of the above, the way CI runs them                                |

### Layout

```
src/
  main.ts            plugin class, registry patch, commands, "open in map"
  track-layer.ts     everything added to one native map view
  embed.ts           inline ![[track.gpx]]
  modal.ts           the "open in map" pop-up
  settings.ts        settings tab and defaults
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

Everything that can run outside Obsidian is tested and kept above 90 % coverage
in CI. The view wrappers are not: they need a live Bases map, so they are held
honest by the type shim and by comments explaining why each wrapper exists.

### Releasing

```bash
npm version minor      # bumps package.json, manifest.json and versions.json
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`, which re-runs every check,
refuses to continue if the tag and `manifest.json` disagree, and publishes a
release with `main.js`, `manifest.json` and `styles.css` attached.

## Translations

`src/i18n.ts` holds one flat table per language; English is the source of truth
and its keys are the type, so a missing entry is a compile error. A new language
is one object plus one line in `LOCALES`, and the test suite checks the tables
stay in step.

## Licence

[MIT](LICENSE).
