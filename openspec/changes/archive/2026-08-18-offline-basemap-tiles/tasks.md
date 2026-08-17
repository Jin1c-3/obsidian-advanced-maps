## 1. The pure core

- [x] 1.1 Add `src/basemap.ts` with `tilesProblem(template)`: null, or `'placeholders'` when the template is missing any of `{z}`, `{x}`, `{y}` — design.md D7
- [x] 1.2 Add `offlineTileUrl(template, prefix, vaultBase)`: a vault-relative template joined onto the vault base, path separators normalized, one leading slash dropped, each segment percent-encoded, and the placeholder braces left literal so MapLibre can fill them — design.md D1
- [x] 1.3 Add `offlineZoomBounds(minZoom, maxZoom)`: the source's deepest level and the camera's shallowest, the second being the pack's shallowest level minus one because a 256 px raster source asks for a tile one level deeper than the map's zoom — design.md D3
- [x] 1.4 Add `applyOfflineTiles(config, pack)`: write the URL into both `mapTiles` and `mapTilesDark`, raise `minZoom`, and pull `defaultZoom` up with it; a null pack leaves the config exactly as it was — design.md D2
- [x] 1.5 Add `boundOfflineSource(map, url, maxZoom)`: find every raster source in the style whose `tiles` hold that URL, assign `maxzoom`, and answer how many were bounded — shape-checked at each step and never calling `setTiles` — design.md D4

## 2. Settings

- [x] 2.1 Add `offlineTiles`, `offlineTilesMinZoom` and `offlineTilesMaxZoom` to `AdvancedMapsSettings` and `DEFAULT_SETTINGS`, empty and 0/16
- [x] 2.2 Add the `tiles` page to the settings pane after the coordinate system, with the template box reporting `tilesProblem` as it is typed and the two zoom sliders
- [x] 2.3 State on the page entry which pack is configured, or that none is
- [x] 2.4 Refresh open maps when any of the three changes, through a new plugin method rather than the track refresh — the background is not a track — design.md D9

## 3. The map views

- [x] 3.1 Add `plugin.offlineBasemap()`: the settings and `Platform.resourcePathPrefix` resolved into `{url, sourceMaxZoom, cameraMinZoom}`, or null when no pack is configured or the template is unusable
- [x] 3.2 Substitute in `TrackLayer`'s existing `loadConfig` wrapper, honouring the view's own opt-out, and leave `switchToTileSet` alone — design.md D2, D6, and the switcher trade-off
- [x] 3.3 Bound the source when a map is created and on every `style.load`, in both `TrackLayer` and `TrackEmbed` — design.md D5
- [x] 3.4 Answer the offline URL from the headless view's `config.get` in `createHeadlessView`, so an inline map draws the pack with no view options of its own — design.md D6
- [x] 3.5 Rebuild the config, re-apply the minimum zoom and restyle on refresh, for both layers and embeds, so clearing the pack puts the native background back — design.md D9

## 4. View options

- [x] 4.1 Add the offline-basemap group to `appendTrackOptions`, between Background and the coordinate system, as a dropdown of "use it" (empty) and "off"
- [x] 4.2 Keep the group located by option key, the way the existing two are, so the built-in wording may change freely

## 5. Localization

- [x] 5.1 Add the settings page, its rows, the validation message and the view-option labels to `en`
- [x] 5.2 Add the same keys to `zh`

## 6. Tests

- [x] 6.1 Cover `tilesProblem`: a complete template, each missing placeholder, and an empty string
- [x] 6.2 Cover `offlineTileUrl`: an absolute POSIX path, a Windows path with backslashes and a drive letter, a vault-relative path, a folder name holding a space and one holding non-ASCII, and that the placeholders survive encoding
- [x] 6.3 Cover `offlineZoomBounds`: ordinary bounds, a shallowest level of 0, bounds given the wrong way round, and non-numeric input
- [x] 6.4 Cover `applyOfflineTiles`: both tile fields written, a minimum zoom raised but never lowered, a default zoom pulled up with it, and a null pack changing nothing
- [x] 6.5 Cover `boundOfflineSource`: the matching source bounded, a foreign raster source left alone, a style that cannot be read standing down, and `setTiles` never called
- [x] 6.6 Cover the view opt-out reading `'off'` and everything else meaning on
- [x] 6.7 Add `src/basemap.ts` to the coverage-gated list in `vitest.config.ts`

## 7. Documentation

- [x] 7.1 Add `docs/guide/offline-basemap.md`: what a tile pack is, where to put it, what to type, the two zoom levels, the per-view opt-out, and what to check when nothing draws
- [x] 7.2 Add the Chinese translation of that page and link both from the two guide indexes and the two README tables
- [x] 7.3 Say in both that the pack is only ever read, that nothing is downloaded, that a pack from a Chinese provider needs its datum stated, and that mobile is untested
- [x] 7.4 Add the source-map line and the capability link to `CLAUDE.md`, the entry to `CHANGELOG.md`, and retire the roadmap entry

## 8. Verification

- [x] 8.1 `npm run check`
- [x] 8.2 Live: a pack configured in settings draws in an open base map view, with the notes' pins and a track still on top of it
- [x] 8.3 Live: zooming past the deepest level issues no failed tile request, and zooming out stops at the shallowest level the pack holds
- [x] 8.4 Live: the per-view opt-out returns that view to its own background, and clearing the setting returns every view to theirs
- [x] 8.5 Live: an inline `![[track.gpx]]` map draws the pack
- [x] 8.6 Live: nothing under the pack's path changed, and every scratch file created for the test is gone from the vault, its mirror and the trash
