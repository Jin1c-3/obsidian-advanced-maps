# Advanced Maps

[![CI](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml/badge.svg)](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Adds to Obsidian's built-in **Maps** view instead of replacing it: GPX/GeoJSON
tracks, zoom-to-fit, Chinese coordinate systems, inline `![[track.gpx]]` maps,
an "open in map" pop-up, and coordinates filled in from where you are — on the
desktop too.

Everything the built-in view already does — markers, icons, colours, tiles,
popups, the right-click menu — stays the built-in view doing it. No Leaflet, no
vendored map library, no runtime dependencies at all.

## What it fixes

| Problem                                                                                                                      | What this plugin does                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A note has a `.gpx` from a walk attached, and the map shows only a pin.                                                      | Draws the track, in that note's colour. Hover for its popup, click to open it.                                            |
| Chinese tile providers (高德, 腾讯, 百度) don't serve WGS-84, so every pin floats several streets — up to a kilometre — off. | Converts coordinates on the way to the map and back on the way out. Nothing on disk changes; your notes stay WGS-84.      |
| The map opens on the whole world, or on wherever the config happens to point.                                                | Auto-frames markers _and_ tracks, and gets out of the way once you pan. A ⛶ button re-frames on demand.                   |
| `![[track.gpx]]` in a note renders as a link.                                                                                | Renders it as a real map, inline.                                                                                         |
| You want to see one note on the map without hunting for it in a base.                                                        | An "open in map" entry on the note's ⋮ menu pops up your base's map view, centred on that note.                           |
| Filling in a note's coordinates by hand.                                                                                     | Stamps a template's blank `coords:` with where you are — including on desktop, which the plugins before this one skipped. |

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

## Using it

### Tracks

Attach a `.gpx` or `.geojson` to a note — `![[2026-04-12.gpx]]` — and any map
view whose base includes that note draws the track. Nothing to configure, and no
need to widen the base's filters to let attachment files in. A base that queries
`file.ext == "gpx"` directly works too.

### View options

The built-in options are untouched; two groups are appended — **Tracks** behind
Markers, and **Coordinate system** behind Background, next to the tile URLs that
decide it.

| Option                 | Meaning                          |
| ---------------------- | -------------------------------- |
| Line width             | Track stroke width               |
| Line opacity           | Track stroke opacity             |
| Max zoom when fitting  | Upper bound for auto-fit         |
| Tile coordinate system | Blank follows the plugin setting |

### Coordinate systems

Leave it on **Auto** and the right system is picked from the tile URL: GCJ-02 for
高德 and 腾讯, BD-09 for 百度, WGS-84 for OpenStreetMap and friends. Set a default
in plugin settings, or force one per view when a proxied tile URL can't reveal
where it came from.

### Open in map

Point **Base path** at a `.base` file in settings, and notes carrying the
coordinate property (`coords` by default) get an _Open in map_ entry on their ⋮
menu and in the command palette. Leave **View name** blank to use that base's
first map view. The pop-up is your base, with your filters, colours and icons —
just centred on that note.

### Location

Switch on **Enable location** and a note whose coordinate property is _present
but empty_ gets filled in with where you are. Give a template an empty `coords:`
line and every note made from it is stamped. A property that already holds
something is never overwritten, and a note without the property never gains one.
The _Fill coordinates from current location_ command overwrites on demand.

Values are written as `lat,lng` in WGS-84 — `28.624415,115.788091`. Notes whose
path contains any fragment in **Skip paths containing** (default `templates`) are
left alone.

It works on desktop as well as mobile, where the plugins before this one gave up:
current Chromium asks the operating system for a fix, so no API key is involved.
That still depends on the OS location service being on — and on Linux, on a
working GeoClue — so the plugin asks once and stops asking for the session if the
platform refuses. See [CLAUDE.md](CLAUDE.md#why-location-is-not-mobile-only) for
the details and a console snippet to test your own machine.

### Not supported

KML and TCX.

## Development

```bash
git clone https://github.com/Jin1c-3/obsidian-advanced-maps
cd obsidian-advanced-maps
npm install
cp .env.example .env      # point OBSIDIAN_PLUGIN_DIR at a vault
npm run dev               # watch, rebuild into that vault, hot-reload
npm run check             # prettier, eslint, tsc, vitest — the same set CI runs
```

`npm run dev` writes the build straight into the vault folder and drops a
`.hotreload` marker beside it, which is what
[pjeby/hot-reload](https://github.com/pjeby/hot-reload) watches for — install that
plugin once and every save reloads Advanced Maps without touching Obsidian.

You need a vault with **Bases** on and the first-party **Maps** plugin installed;
there is nothing for this plugin to extend otherwise.

- [CLAUDE.md](CLAUDE.md) — architecture, the internals this leans on, the
  coordinate pipeline, and the non-obvious things not to undo.
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, what the tests cover, house rules
  for the patching code, translations.

## Translations

`src/i18n.ts` holds one flat table per language; English is the source of truth
and its keys are the type, so a missing entry is a compile error. A new language
is one object plus one line in `LOCALES`.

## Licence

[MIT](LICENSE).
