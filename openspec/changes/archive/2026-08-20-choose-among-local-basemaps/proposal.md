## Why

A tile pack on disk is a background like any other, but this plugin treats it as
a setting rather than as a choice. One pack can exist, it never appears where a
reader picks a background, and it fights the control that does.

Measured on Android against three native tile sets, with a pack configured: the
map drew the pack; picking **ArcGIS satellite** from the map's own layer menu
drew ArcGIS and dropped the pack; the next configuration reload put the pack back
while the menu still showed ArcGIS as checked. So the control appears to work,
silently reverts, and then lies about what is drawn. The cause is this plugin's:
the substitution runs in a wrapper around the native `loadConfig`, and the native
`switchToTileSet` writes the live config without going through it. The defect
predates the mobile fix and is not platform-specific.

The one-pack limit is felt by exactly the reader this feature is for. A pack is
regional, so someone who has one usually has two — the city they live in and the
trail they walk — and today keeping both means retyping a path.

## What Changes

- Several named local packs, each with its own path and its own two zoom bounds,
  replacing the single path-and-bounds setting.
- Each configured pack offered to the reader in the map's own background menu,
  beside the native tile sets, so a local background is picked the way every
  other background is.
- A reader's pick from that menu wins over the substitution and lasts as long as
  the map does, which is how a native pick already behaves.
- A map view's own **Offline basemap** row becomes a picker naming which
  background that view starts on — the default background, any native tile set,
  or any pack — rather than an on/off pair.
- The pack a reader already configured is carried into the list, and a base file
  already saying `off` keeps meaning what it says.

Not in scope: reading a single-file archive. Whether a `.pmtiles` can be read
without unpacking it is a separate question with its own spike.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `offline-basemap`: a pack becomes one of several named backgrounds rather than
  the pack; the requirement that a view can decline becomes a requirement that a
  view names the background it starts on; the zoom bounds follow whichever pack
  is drawn; and a new requirement covers the reader choosing a background from
  the map itself, including what happens when the native control this plugin
  offers its entries through is not the shape it expects.

## Impact

- `src/settings.ts`: one path and two numbers become a list of named packs, and
  the existing values are carried into it.
- `src/view-options.ts`: the per-view row becomes a picker over the backgrounds
  that exist right now.
- `src/track-layer.ts`: where the substitution is applied, and the two native
  seams it has to sit on — the background control's own list, and
  `switchToTileSet`, whose ids this plugin now has to answer for.
- `src/basemap.ts`: resolution and zoom bounds move from "the pack" to "a pack".
- `src/types/obsidian-internals.d.ts`: the native tile-set and control shapes
  this reads, declared with their provenance.
- `tests/`: the resolution and bounds arithmetic is pure and already covered; the
  new cases are which pack, and what a pick does.
- `docs/guide/en` and `docs/guide/zh-cn`: `offline-basemap.md` in both locales.
