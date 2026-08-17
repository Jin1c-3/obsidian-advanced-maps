## Context

See proposal.md — Why. What shapes the design is that the whole feature is a
**string substitution plus two numbers**, made at the one moment the native view
builds the object that decides a map's background. There is no new renderer, no
new source, no new layer, and nothing downloaded.

Three facts from the host set every boundary:

- `StyleManager.getMapStyle` turns any tile-template string into a raster source
  without validating it or routing it through `requestUrl`
  (`obsidian-maps/src/map/style.ts:73`). So the plugin never has to build a
  style, register a protocol, or own a source.
- `MapView.loadConfig` builds one plain `MapConfig` per map and every later
  decision — the style, the constructor's `minZoom`, the background switcher —
  reads it (`obsidian-maps/src/map-view.ts:422`). `TrackLayer` already wraps that
  method to project the configured centre, so the substitution has a seam
  already open.
- `Platform.resourcePathPrefix` is published API — `app://<random>/` on desktop,
  `file:///` on mobile — and `FileSystemAdapter.getBasePath()` is too. This
  feature therefore adds **no** new undocumented internal, which is unusual here
  and worth stating.

## Goals / Non-Goals

**Goals:**

- One statement from the reader — a path template — and the rest derived.
- Everything a test can reach without Obsidian: the URL, the bounds, the config
  substitution and the source patch are all pure functions over plain objects.
- A pack that is only ever read, and a background setting in the base file that
  is never written to.

**Non-Goals:**

- **Downloading tiles.** Out of scope on purpose; see proposal.md.
- **`.pmtiles` / `.mbtiles`.** A single-file archive needs `addProtocol`, which
  is a module-level export of a MapLibre this plugin does not bundle. The shape
  that works is a directory tree, unpacked once.
- **A second pack for dark mode.** The native config has `mapTiles` and
  `mapTilesDark`; this change writes the same pack into both. One pack drawn in
  both themes is what a reader who unpacked one pack expects, and a second path
  box for the rare second pack is not worth the settings surface.
- **Discovering the pack's zoom range.** Enumerating a directory outside the
  vault needs `require('fs')`, which is desktop-only and a dependency this plugin
  does not have. The range is two numbers the reader already knows.

## Decisions

### D1 — The reader states a filesystem path, not a URL

`app://<token>/` is regenerated every launch and persisted nowhere. A URL is
therefore not a durable thing to store, and the native Background box — which
would otherwise take one directly — is the wrong place for this. The reader
states `/home/me/tiles/{z}/{x}/{y}.png`; the prefix is resolved when a map is
built.

The same substitution accepts a vault-relative template, resolved through
`FileSystemAdapter.getBasePath()`. A pack inside the vault is a bad idea — six
figures of PNG files that Obsidian will index — and the docs say so, but a reader
who does it should not get a silently blank map.

Alternative considered: resolve once at load and cache. Rejected: it survives a
window reload and not a restart, which is exactly the failure that is hard to
diagnose.

### D2 — Substitute in the `loadConfig` wrapper, never in the base file

`TrackLayer` already wraps `loadConfig` for the centre projection. Extending that
wrapper puts the substitution at the one point every consumer of a map's config
reads it — `getMapStyle`, the `new Map({minZoom})` constructor call, and
`applyConfigToMap` — and leaves `config.get('mapTiles')` answering exactly what
the reader wrote in the base. Turning the pack off therefore needs no undo: the
next `loadConfig` simply does not substitute.

Alternative considered: write the resolved URL into the view's own `mapTiles`
option through `config.set`. Rejected twice over — it would put a URL with a
per-launch token into a `.base` file the reader shares and syncs, and it would
destroy the background they had configured.

### D3 — The deep end bounds the source; the shallow end bounds the camera

Measured, on a synthetic z2–z4 pack:

| lever                | at map zoom 6 (tile z7)   | at map zoom 0 (tile z1)                    |
| -------------------- | ------------------------- | ------------------------------------------ |
| nothing              | 16 failed fetches         | 5 failed fetches                           |
| `source.maxzoom = 4` | 0 failed, drawn magnified | —                                          |
| `source.minzoom = 2` | —                         | 0 failed, **0 tiles held, map blank**      |
| `map.setMinZoom(1)`  | —                         | camera stops at zoom 1, 16 tiles, 0 failed |

So the two ends get different levers. Past the deepest level MapLibre's
overzoom is exactly what is wanted: a blurry map is a map. Below the shallowest,
the source's own `minzoom` empties it, and the honest answer is to stop the
camera instead.

`map.setMinZoom` is not called directly. `loadConfig` already produces a
`minZoom` the native view applies both in the `Map` constructor and in
`applyConfigToMap`; raising that number in the same wrapper as the tiles lets
the host do the work, and keeps one code path for the map that is being built and
the map that already exists.

The tile zoom a 256 px raster source asks for is **one deeper than the map's
zoom** — map zoom 6 requested tile z7, measured. So the camera bound is the
pack's shallowest level minus one, while the source bound is the pack's deepest
level unchanged.

### D4 — `source.maxzoom = N` is assigned, not `setTiles`-ed

The earlier note on this said to follow the assignment with
`source.setTiles(source.tiles)`. Measured: unnecessary. Assigning alone took map
zoom 7 from 20 failed fetches to zero, and raising the number back to 22 without
`setTiles` restored the failures — so MapLibre reads the field when it computes
covering tiles rather than caching it at load. `setTiles` additionally aborts
every in-flight request and drops the tiles already on screen, which on a style
that has just loaded is pure loss.

The source is found by scanning the style's sources for a raster source whose
`tiles` array holds the URL this plugin resolved, rather than by the
`custom-tiles-0` id the native builder happens to mint. The id is a naming
convention in someone else's file; the URL is this plugin's own value.

### D5 — The bound is applied on every style load, not once

A theme change, a background switch and a datum change all replace the style, and
a replaced style has a fresh source with the default bounds back. `TrackLayer`
and `TrackEmbed` both already own a `style.load` handler for putting their own
layers back; the bound goes in beside them, plus one application at map creation
for the style the constructor loaded.

### D6 — Per-view opt-out, not per-view configuration

The pack is one folder on one machine, so it belongs in plugin settings. Whether
a given map uses it is a property of that map, so it belongs in the view options
— in the Background group, beside the setting it overrides. Two entries: use it
(the default, stored empty) and off.

Alternative considered: put the whole path in a view option, like `mapTiles`.
Rejected — a vault-wide pack retyped into every view, and no way to state a
default.

Inline maps have no view options at all, so they follow the plugin setting.
That is stated as a decision rather than an accident: an inline map is drawn from
a headless view whose `config.get` this plugin supplies, and the offline answer is
supplied there.

### D7 — Validation is structural only

The one thing that can be checked without touching the disk is whether the
template carries `{z}`, `{x}` and `{y}`; without them MapLibre would treat the
string as a style URL and fetch it through `requestUrl`, which cannot open
`app://` at all. That check is made where the template is typed, the same way a
custom external-map URL is checked.

Existence is deliberately **not** checked. There is no way to ask whether a
directory outside the vault exists without `require('fs')`, and probing for one
tile proves nothing: a regional pack legitimately has no tile at most `x`/`y` for
a given `z`. A pack whose path is wrong draws nothing, which is visible
immediately, and the guide says what to check.

### D8 — Automatic datum answers WGS-84 for a pack

`systemFromTiles` matches provider hostnames. A local path matches none, so
automatic mode answers WGS-84 — right for the OSM-derived packs that make up
almost all of them, and wrong for a pack unpacked from a Chinese provider. The
existing per-view and per-plugin coordinate-system override is the answer to the
second, and the substitution is deliberately **not** made datum-aware: the tiles
being drawn are the local ones, so inheriting the datum of the background they
replaced would shift every pin against tiles that never moved.

### D9 — Changing the setting reaches open maps by rebuilding the config

`applyConfigToMap` compares a snapshot of the _native_ option values, so a change
to a plugin setting is invisible to it and no restyle would follow. The refresh
path therefore calls `loadConfig` again itself — which runs the wrapper, and so
substitutes or stops substituting — assigns the result, applies the new minimum
zoom, and calls `updateMapStyle`. Putting the tiles back when the pack is turned
off falls out of the same call, because the wrapper simply does not fire.

## Risks / Trade-offs

- **Mobile is untested.** `Platform.resourcePathPrefix` answers `file:///` there,
  and whether MapLibre inside Capacitor may fetch it is unknown. The code path is
  the same and stands down to "no tiles drawn" rather than to an error; the guide
  says desktop-measured.
- **A wrong deepest level costs sharpness, not correctness.** Set it below the
  pack and the deepest tiles are never asked for; the map is blurry where it
  could have been sharp. Set it above and the failed requests come back. The
  setting says which folder to look at.
- **The native background switcher wins while it lasts.** A vault whose Maps
  plugin holds several tile sets gets a switcher on the map, and
  `switchToTileSet` writes straight into the live `mapConfig` and restyles before
  this plugin's wrapper on it is reached. The substitution deliberately stays out
  of that path: re-substituting there would mean a second style load to undo a
  choice the reader had just clicked. So the switcher shows its tile set, and the
  pack returns at the next `loadConfig` — an explicit click outranks a setting for
  as long as the click lasts. The alternative, making the switcher visibly do
  nothing, is worse.
