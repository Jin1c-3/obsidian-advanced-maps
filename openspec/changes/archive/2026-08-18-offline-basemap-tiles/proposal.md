## Why

Everything else this plugin draws already works with no network: the notes, the
routes, the photos and their thumbnails are all files in the vault. The basemap
under them is not. Close the laptop lid on a plane, open a map, and the tracks
are still there over a blank grey rectangle.

ROADMAP.md used to file this under _Deliberately not_, on the grounds that
MapLibre's `addProtocol` is a module-level export and `transformRequest` a
constructor option, and this plugin owns neither. That is true and it is about a
different feature. A basemap already on disk needs neither. Measured against a
live Bases map view (Maps 0.2.2, Obsidian 1.13.7, desktop Linux):

- The native background setting validates nothing. `StyleManager.getMapStyle`
  (`obsidian-maps/src/map/style.ts:73`) asks only whether a URL contains `{z}`,
  `{x}` or `{y}`; if it does, that string becomes the `tiles` array of a
  `{type: 'raster', tileSize: 256}` source and reaches MapLibre without ever
  passing through `requestUrl`.
- MapLibre fetches those tiles from `app://…/{z}/{x}/{y}.png` on the main thread.
  A synthetic z2–z4 pack outside the vault, in a folder whose name has a space
  in it, drew: 16/16 tiles, zero map errors, `isSourceLoaded` true, and the
  coloured tiles visible in a screenshot of the app.
- This plugin's own content survives the style swap. After the swap the style
  held `custom-tiles-0`, `custom-layer-0`, all seven `advanced-maps-*` layers and
  `marker-pins`.

Two things did stand in the way, and both turned out to be this plugin's to
solve. Both were measured rather than argued, and the second measurement
corrected the recipe this change was expected to use:

- **The `app://` token is per-launch.** The main process builds it as
  `"app://" + <random hex> + "/"`, hands it to the renderer, and persists it
  nowhere; it survives a window reload but not a restart. A URL typed into the
  native Background box by hand therefore rots overnight. That is what makes this
  a feature rather than a paragraph of documentation: the reader states a
  **filesystem path**, and the current `Platform.resourcePathPrefix` — public,
  documented API — is written in at load time.
- **The native raster source states no zoom bounds**, so `maxzoom` defaults to
  22 and every level past the pack's deepest asks for tiles that are not there:
  16 `AJAXError: Failed to fetch (0)` on one zoom-in, and 20 more on the next.
  Assigning `source.maxzoom` takes the count to zero and leaves MapLibre drawing
  overzoomed parent tiles, so the map goes blurry rather than blank. **The
  assignment alone is enough** — the `setTiles()` reload the earlier note
  prescribed is not needed, and skipping it avoids discarding every tile already
  on screen.

The shallow end needed a different lever. Setting the source's `minzoom` stops
the requests and empties the source: at map zoom 0 with `minzoom: 2` MapLibre
held zero tiles and the map went blank. Raising the map's own **minimum zoom**
instead stops the camera: `setMinZoom(1)` turned a jump to zoom 0 into a stop at
zoom 1 with all 16 tiles loaded and no failed request. A map that will not zoom
out past what you have is better than one that goes blank when you do.

## What Changes

- **Point a map at a tile pack already on disk.** A path template holding `{z}`,
  `{x}` and `{y}` — absolute, or relative to the vault — becomes the background
  of every map view, drawn from the file system with no request leaving the
  machine. The `app://` prefix is resolved at load time, so the setting keeps
  working across restarts.
- **Bound the map to what the pack holds.** The pack's deepest level bounds the
  raster source, so zooming past it draws overzoomed tiles instead of a stream
  of failed requests. Its shallowest level raises the map's minimum zoom, so
  zooming out stops at the edge of the pack instead of emptying the map.
- **Leave the choice per view.** A map view can decline the offline basemap and
  keep the background it already has, from the same Background section of the
  view options where that background is configured.
- **Reach inline maps too.** An inline `![[track.gpx]]` map has no base behind it
  and no view options of its own; it follows the plugin setting, which is what
  makes a note full of routes readable offline.
- **Download nothing.** Bulk-fetching a provider's tiles is their terms to grant
  and not this plugin's to assume on a reader's behalf. This feature points at a
  pack the reader already holds.

## Capabilities

### New Capabilities

- `offline-basemap`: drawing a map view's background from a tile pack on disk,
  and bounding the map to the levels that pack holds.

### Modified Capabilities

- `native-map-integration`: the view options gain one more group, and the
  background the native view resolves is substituted where the shared config
  object is built rather than by writing into the reader's own settings.
- `coordinate-datum`: a local path matches no tile-provider hint, so automatic
  mode answers WGS-84 for every pack. States that, and that a pack unpacked from
  a Chinese provider needs the datum said explicitly.

## Impact

- `src/basemap.ts` — new, pure: the path template to an `app://` URL, the zoom
  bounds a pack implies, the substitution into a map config, and the source
  patch (a map object in, nothing else).
- `src/settings.ts` — three settings and one more page.
- `src/view-options.ts` — one more group in the native view options.
- `src/track-layer.ts` — substitute in the `loadConfig` wrapper, bound the source
  when a style loads.
- `src/embed.ts`, `src/main.ts` — the same for inline maps, and the refresh that
  reaches maps already open.
- `src/types/obsidian-internals.d.ts` — name the numeric fields of `MapConfig`
  this change writes. No new undocumented internal: `Platform.resourcePathPrefix`
  and `FileSystemAdapter.getBasePath()` are both published API.
- `src/i18n.ts` — both locales. `tests/basemap.test.ts` — new.
- `docs/guide/` — a new page in English and Chinese. `CHANGELOG.md`, `ROADMAP.md`.
- No new dependency, no manifest change, and nothing written outside the vault:
  the pack is only ever read.
