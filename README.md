# Advanced Maps

[![CI](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml/badge.svg)](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Adds to Obsidian's built-in **Maps** view instead of replacing it: GPX/GeoJSON
tracks, zoom-to-fit, Chinese coordinate systems, inline `![[track.gpx]]` maps,
an "open in map" pop-up, and three ways to fill in a note's coordinates — paste
a share link, search for the place, or take it from where you are, on the
desktop too.

Everything the built-in view already does — markers, icons, colours, tiles,
popups, the right-click menu — stays the built-in view doing it. No Leaflet, no
vendored map library, no runtime dependencies at all.

![A Bases map view on a mainland basemap: a 13.6 km GPX loop drawn from a note's embed, with each note's pin in its own colour](docs/map-view.png)

## What it fixes

| Problem                                                                                                           | What this plugin does                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A note has a `.gpx` from a walk attached, and the map shows only a pin.                                           | Draws the track, in that note's colour. Hover for its popup, click to open it.                                            |
| Mainland Chinese basemaps don't serve WGS-84, so every pin floats several streets — up to a kilometre — off.      | Converts coordinates on the way to the map and back on the way out. Nothing on disk changes; your notes stay WGS-84.      |
| The map opens on the whole world, or on wherever the config happens to point.                                     | Auto-frames markers _and_ tracks, and gets out of the way once you pan. A ⛶ button re-frames on demand.                   |
| `![[track.gpx]]` in a note renders as a link.                                                                     | Renders it as a real map, inline.                                                                                         |
| You want to see one note on the map without hunting for it in a base.                                             | An "open in map" entry on the note's ⋮ menu pops up your base's map view, centred on that note.                           |
| Somebody sends you a map share link and you have to dig the numbers out — in the right order, in the right datum. | Paste it. The coordinate is read and written as WGS-84, whatever the link was in.                                         |
| You know the name of the place but not where it is.                                                               | Search for it and pick it off the list.                                                                                   |
| Filling in a note's coordinates by hand.                                                                          | Stamps a template's blank `coords:` with where you are — including on desktop, which the plugins before this one skipped. |

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

### Inline maps

The same embed renders as a real map in the note itself — pan it, zoom it, switch
its background. Maps are built only once they scroll into view, because each one
holds a WebGL context and browsers cap how many can be alive at once.

![A note with an embedded .gpx rendering as a live map below the note's text](docs/inline-embed.png)

Extensions are claimed only if nothing else has them, so a plugin that already
renders `.gpx` keeps working alongside this one.

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

![The same WGS-84 track on the same basemap, with the conversion off and then on: it moves from the hillside back onto the causeway it was walked along](docs/coordinate-systems.gif)

Both frames are the same `.gpx` on the same tiles. Off, the walk runs over 宝石山;
on, it lands on 白堤 — about 520 m, and every pin moves with it.

Leave it on **Auto** and the system is picked from the tile URL: the mainland
hosts that serve GCJ-02 or BD-09 are recognised by name, and everything else is
treated as WGS-84. Set a default in plugin settings, or force one per view when a
proxied tile URL can't reveal where it came from.

### Open in map

Point **Base path** at a `.base` file in settings, and notes carrying the
coordinate property (`coords` by default) get an _Open in map_ entry on their ⋮
menu and in the command palette. Leave **View name** blank to use that base's
first map view. The pop-up is your base, with your filters, colours and icons —
just centred on that note.

### Coordinates from a map link

A location almost never arrives as a coordinate — it arrives as a share link
from someone's phone. _Set coordinates from a map link_ takes one and fills the
note's coordinate property with it.

![The paste box, having read a share link and showing the WGS-84 coordinate it will write](docs/link-modal.png)

It reads the share links the common mainland and international map apps produce,
plus `geo:30.26,120.15`, degrees-minutes-seconds (`30°15'39"N 120°08'49"E`) and
plain `30.26,120.15`. Each shape is read by its own rules, because they disagree
about both the axis order and the datum — some put longitude first, some are
GCJ-02, some BD-09, some WGS-84, and some depend on where the point is.

Whatever goes in, **WGS-84 comes out** — the datum is shown before anything is
written, because a coordinate in the wrong system looks perfectly fine in the
note and lands the pin in the next province. The dropdown overrides the guess
when bare numbers came from a source the link cannot reveal.

Shortened links hold no coordinate until they are resolved, and this plugin will
not quietly call a third party with your link to do it. Open one once and paste
where it lands.

### Place search

_Search for a place and set coordinates_ looks a name up and writes what comes
back. Names come out in your own Obsidian language.

![The search box, showing ten places of the same name across four countries, each with its address underneath](docs/place-search.png)

There are two sources to choose between in the settings: an open worldwide one
that needs no signing up but is thin on mainland places, and a mainland one that
needs a free web-service key of your own and knows them far better. A source that
answers in GCJ-02 is converted on the way in, like everything else.

This is **the only request the plugin makes on its own behalf**, and only while
the search box is open: what goes out is what you typed, to the source you
picked. No telemetry, no note contents, no coordinates you already had.

It is not the only traffic a map generates, though — see [What leaves your
vault](#what-leaves-your-vault).

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

## What leaves your vault

Short version: your notes and your tracks never go anywhere. Everything below is
either something a map cannot work without, or something you asked for.

| When                              | What goes out                                               | To                                      |
| --------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Any map is on screen              | Tile requests, so your IP and the area you are looking at   | Whichever background the view is set to |
| You type in the search box        | The words you typed, your language, your key if you set one | The search source you picked            |
| You switch on **Enable location** | Nothing leaves — the fix comes from the operating system    | —                                       |

The plugin has no telemetry, no update ping and no server of its own. Track
files, note contents and coordinates you already had are never transmitted. A
pasted short link is **not** resolved for you, precisely because that would mean
handing it to a third party.

Two things worth knowing if you are deploying this for other people rather than
using it yourself: a search key is stored in plain text in the plugin's settings
file and appears in the request URL, and a note's coordinate history can be
personal information in a way a note's text is not. Both are fine for personal
use and want a second look for anything else.

## Attribution

The screenshots in this README were taken against third-party basemaps and
search services, and are here to show what the plugin does — nothing more. Each
image carries its source. The demo vault behind them is synthetic: the places and
the route are built from openly published coordinates, and no personal data is
shown.

The plugin ships no map data of its own. It draws whatever tiles the view is
configured with, and their copyright, licensing and any survey-approval
requirements are the tile provider's and the user's, not this plugin's.

If you hold rights in anything reproduced here and would rather it were not,
[open an issue](https://github.com/Jin1c-3/obsidian-advanced-maps/issues) and it
will be removed promptly.

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
