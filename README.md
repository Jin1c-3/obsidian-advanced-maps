# Advanced Maps

[![CI](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml/badge.svg)](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**English** · [简体中文](README.zh-CN.md) · [User guide](docs/guide/README.md)

Turn Obsidian's native **Maps** view into a photo atlas, a route viewer, and a
map of the notes connected to the one you are reading.

Advanced Maps reads GPS from whole photo folders, draws GPX/GeoJSON/KML/TCX
routes and areas, and creates an **Around** view from ordinary Obsidian links. It
extends the first-party Maps view instead of replacing it: MapLibre,
backgrounds, markers, popups, and every built-in map option remain native. No
Leaflet, no bundled renderer, no runtime dependencies.

![One Base holding a photo folder and a note folder: 16,273 results — red pins for the notes, photo thumbnails at their EXIF locations, a walked GPX track between them, and a dot for every photo the zoom leaves no room for](docs/photo-album.png)

_One Base, one map: red pins are place notes, thumbnails are photos placed by
their own EXIF, and the line is a `.gpx` a note links to. 16,273 results._

## Three workflows

| Use Advanced Maps as… | Put this in the Base                                                             | What appears                                                                 |
| --------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **A map photo album** | A photo folder, including a link to an external album                            | Every photo with readable GPS, at its EXIF location                          |
| **A route viewer**    | Notes linked to `.gpx`, `.geojson`, `.kml`, or `.tcx` files—or those files alone | Routes, areas, markers, photos, elevation, and statistics a Base can sort on |
| **An Around map**     | Your place-note collection                                                       | The current note, its links and backlinks, plus their tracks and photos      |

These compose. One map can show place notes, a multi-day route, and every
geotagged photo taken along it.

## Requirements and install

Advanced Maps requires Obsidian 1.13.1 or newer with **Bases** enabled and the
first-party **Maps** plugin installed. Without that native view, it reports or
skips the unavailable enhancement and leaves Obsidian usable.

- **Release:** copy `main.js`, `manifest.json`, and `styles.css` from
  [Releases](https://github.com/Jin1c-3/obsidian-advanced-maps/releases) into
  `<vault>/.obsidian/plugins/advanced-maps/`, then enable the plugin.
- **BRAT:** add `Jin1c-3/obsidian-advanced-maps`.

## Quick start

Save this as `atlas.base`, replace the folder paths, open it, and choose its map
view:

```yaml
filters:
  or:
    - file.inFolder("places")
    - file.inFolder("assets/onedrive/Pictures")
views:
  - type: map
    name: Atlas
    coordinates: coords
    trackWeight: 4
    trackOpacity: 85
    fitMaxZoom: 16
```

The first branch maps notes whose `coords` property holds a coordinate. The
second maps supported photos directly from their GPS metadata. See
[Getting started](docs/guide/getting-started.md) for the Base boundary, view
keys, supported photos, and the next recipes.

## User guide

| Topic                                                              | Covers                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [Getting started](docs/guide/getting-started.md)                   | Installation, Base boundaries, first map, view keys                               |
| [Photo maps](docs/guide/photo-maps.md)                             | Photo folders, OneDrive, linked photos, thumbnails, index                         |
| [Tracks and areas](docs/guide/tracks-and-areas.md)                 | Route links, inline maps, GPX/GeoJSON/KML/TCX, polygons, statistics as properties |
| [Around and navigation](docs/guide/around-and-navigation.md)       | Around views, reusable Base, Open in map, follow, shared pins                     |
| [Places in and out](docs/guide/places-in-and-out.md)               | Importing a file of placemarks as notes, exporting a Base as GPX/KML/CSV          |
| [Offline basemap](docs/guide/offline-basemap.md)                   | Tiles already on disk as the background, zoom bounds, per-view opt-out            |
| [Coordinates and services](docs/guide/coordinates-and-services.md) | WGS-84/GCJ-02/BD-09, external maps, search, geocoding, location                   |
| [Reference and privacy](docs/guide/reference-and-privacy.md)       | Supported inputs, option ownership, operational limits, network disclosure        |

Notes, tracks, and photo contents do not leave on their own. The plugin has no
telemetry, update ping, or server; the
[privacy reference](docs/guide/reference-and-privacy.md#what-leaves-your-vault)
lists the requests made when you use maps or external services.

## Project documentation

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, testing, pull requests, and releases.
- [OpenSpec capabilities](openspec/specs): stable technical contracts.
- [CHANGELOG.md](CHANGELOG.md): released behavior.
- [ROADMAP.md](ROADMAP.md): possible future work and deliberate non-goals.

## Licence

[MIT](LICENSE).
