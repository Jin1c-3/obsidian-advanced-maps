# Advanced Maps

[![CI](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml/badge.svg)](https://github.com/Jin1c-3/obsidian-advanced-maps/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**English** · [简体中文](README.zh-CN.md)

Turn Obsidian's native **Maps** view into a photo atlas, a route viewer, and a
map of the notes connected to the one you are reading.

Advanced Maps reads GPS from whole photo folders, draws GPX/GeoJSON/KML/TCX
routes, and creates an **Around** view from ordinary Obsidian links. It extends
the first-party Maps view instead of replacing it: MapLibre, backgrounds,
markers, popups, and every built-in map option remain native. No Leaflet, no
bundled renderer, no runtime dependencies.

![A native Obsidian Maps view whose Base directly contains seven geotagged photos; animal thumbnails appear at their EXIF locations around a zoo](docs/photo-album.png)

## The three big workflows

| Use Advanced Maps as… | Put this in the Base                                                                | What appears                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A map photo album** | A photo folder, including a symlink to OneDrive or another folder outside the vault | Every photo with readable GPS, at its EXIF location, with its thumbnail                                 |
| **A route viewer**    | Notes that link `.gpx`, `.geojson`, `.kml`, or `.tcx` files — or those files alone  | Routes, direction arrows, endpoints, photos, distance, ascent, time, pace, and elevation                |
| **An Around map**     | Your normal place-note collection                                                   | Only the current note, its outgoing links, its backlinks, and the routes/photos attached to those notes |

These compose. One map can show place notes, a multi-day GPX route, and every
geotagged photo taken along it.

![A Bases map view showing a GPX route, direction arrows, photo thumbnails, and coloured note markers together](docs/map-view.png)

## Requirements and install

Advanced Maps requires Obsidian 1.13.1 or newer with **Bases** enabled and the
first-party **Maps** plugin installed. Without that view it reports what is
unavailable and stays out of the way, rather than half-loading.

- **Release:** copy `main.js`, `manifest.json`, and `styles.css` from
  [Releases](https://github.com/Jin1c-3/obsidian-advanced-maps/releases) into
  `<vault>/.obsidian/plugins/advanced-maps/`, then enable the plugin.
- **BRAT:** add `Jin1c-3/obsidian-advanced-maps`.

## Choose the Base recipe you want

A Base filter is the boundary of a map. Advanced Maps then expands each matched
note into its linked tracks and photos. A photo file can also be a Base result
itself, which is what makes a whole-folder photo atlas possible.

The snippets below are complete `.base` files. Save one in the root of your
vault, open it, and choose its map view. You can then keep editing the filters
and view options in the Bases interface.

### Map every photo in a folder, together with place notes

Copy this as `atlas.base` and replace the two folder paths:

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

The first branch supplies notes whose `coords` property should become normal
markers. The second supplies photo files directly. JPG, JPEG, PNG, WebP, HEIC,
HEIF, and AVIF are supported.

The last three view keys are the options this plugin appends to the Bases
interface, under **Tracks** and **Coordinate system**. Leave them out and the
plugin settings decide:

| Key            | Option in the view     | Meaning                                     |
| -------------- | ---------------------- | ------------------------------------------- |
| `trackWeight`  | Line width             | Track stroke width                          |
| `trackOpacity` | Line opacity           | Track stroke opacity                        |
| `fitMaxZoom`   | Max zoom when fitting  | How far auto-framing may zoom in            |
| `coordSystem`  | Tile coordinate system | Blank follows the plugin default, see below |

“Every photo” means every photo with readable GPS metadata. A file with no GPS
has no honest place to put on a map, so it remains in the Base results but does
not get a fabricated marker. A photo with GPS still gets a plain dot when it has
no usable embedded thumbnail.

#### Put a OneDrive or other external album inside the vault

The photo bytes do not have to be copied into the vault. Create a directory link
inside the vault, let Obsidian index it, then use that linked vault path in the
Base filter.

macOS or Linux:

```bash
mkdir -p "/path/to/MyVault/assets/onedrive"
ln -s "/path/to/OneDrive/Pictures" "/path/to/MyVault/assets/onedrive/Pictures"
```

Windows PowerShell (a directory junction avoids the administrator requirement
that symbolic links can have on some systems):

```powershell
$vault = "C:\Users\you\Documents\MyVault"
New-Item -ItemType Directory -Force -Path "$vault\assets\onedrive"
New-Item -ItemType Junction `
  -Path "$vault\assets\onedrive\Pictures" `
  -Target "$env:USERPROFILE\OneDrive\Pictures"
```

Then reload the vault and use:

```yaml
- file.inFolder("assets/onedrive/Pictures")
```

This is a desktop filesystem setup. Create an equivalent link on each desktop
that should see the album; mobile devices cannot reuse a desktop link. Keep
cloud files locally readable, avoid link loops, and treat the source as external:
verify your backup and sync provider's link behavior instead of assuming the
vault covers it. Advanced Maps reads photos but never modifies them.

The first pass reads at most the first 64 KiB of each photo. Derived coordinate,
time, orientation, and thumbnail-availability metadata is cached, so later
sessions can place a large album without reopening every unchanged file.

### Map only the photos linked from matched notes

Keep photo folders out of the Base filter and match notes only:

```yaml
filters:
  and:
    - file.inFolder("places")
views:
  - type: map
    name: Places
    coordinates: coords
    trackWeight: 4
    trackOpacity: 85
    fitMaxZoom: 16
```

Then link the photos from a matched note:

```markdown
---
coords: 30.2600,120.1500
---

[[IMG_1234.jpg]]
[[IMG_1235.heic]]
```

Normal body links, embeds such as `![[IMG_1234.jpg]]`, and file links in
frontmatter all count. Each resolved photo participates once. The Base does not
need to include the attachment folder, and an actual embed is only needed when
you also want the image visible in the note.

### Show a route on one map without creating another inline map

Use a normal link — no `!`:

```markdown
---
coords: 30.215709,120.130799
---

[[track.gpx]]
```

When the Base includes this note, its map draws the route. In the note,
`track.gpx` stays a normal link, so there is still only one map on screen. A
frontmatter link works the same way:

```yaml
track: '[[track.gpx]]'
```

Use an embed only when you deliberately want a second, inline route map:

```markdown
![[track.gpx]]
```

| Syntax                   | Base or Around map | Inline route map in the note |
| ------------------------ | ------------------ | ---------------------------- |
| `[[track.gpx]]`          | Draws the route    | No                           |
| `track: "[[track.gpx]]"` | Draws the route    | No                           |
| `![[track.gpx]]`         | Draws the route    | Yes                          |

### Show only the notes and routes around the current note

In Advanced Maps settings, choose your reusable Base under **Base file path**.
Run **Insert a map of the notes around this one**. The command adds an `Around`
map view to that Base when needed and inserts:

```markdown
![[places.base#Around]]
```

The view keeps only:

- the note containing the embed;
- notes it links to;
- notes that link back to it.

Tracks and photos linked from those matched notes are then drawn normally. That
makes a trip index as simple as this:

```markdown
# West Lake weekend

[[Broken Bridge]]
[[Leifeng Pagoda]]
[[Lingyin Temple]]
[[weekend.gpx]]

![[places.base#Around]]
```

Because `weekend.gpx` has no `!`, the note shows one Around map, and the GPX line
appears on that map instead of creating another map below the link.

![A trip note whose ordinary wikilinks are rendered as markers in an embedded Around map](docs/around-map.png)

The Around view is the intersection of relationship context and the Base's own
global filters. If a linked note is excluded by the Base, Around does not bring
it back. The embed also stores the view name, so rename the view and existing
embeds must be updated.

## What photo maps do

Photo coordinates remain WGS-84 in the vault. At the map boundary they follow
the same tile-datum conversion as note markers and tracks. **Photo coordinate
system** can force WGS-84 or GCJ-02 when an unlabelled camera wrote something
non-standard.

Zoomed out, colliding thumbnails thin to a stable subset instead of piling into
an unreadable stack; every mapped photo still has a dot. Zoom in and eligible
thumbnails return. **Show photos on the map** and **Show photo thumbnails** can
disable the two layers independently.

Hovering a photo shows the owning note when it has one. Clicking opens the
photo at full size without replacing the map, with an **Open note** row below.
Ctrl/Cmd-click opens the image file in a new tab.

![A geotagged photo opened from its marker, with the image, filename, and an Open note action in a modal over the map](docs/photo-popup.jpg)

**Set coordinates from a photo** reads the same GPS tag into the current note's
`coords` property. **Clear the photo index** discards the reconstructible cache;
maps keep working and metadata is read again as needed.

## What route maps do

Linked GPX, GeoJSON, KML, and TCX files inherit their owning note's marker
colour. Routes get distinct start and end markers, direction arrows, and named
waypoints. **Show track markers** turns these extras off.

![A GPX route with a green start, red ring end, and arrows showing direction](docs/track-markers.png)

An inline `![[track.gpx]]` is a live map with distance, ascent and descent,
elevation range, elapsed and moving time, pace, and an elevation profile.
Missing source data is omitted instead of shown as zero. Hovering the profile
moves a cursor along the route and vice versa.

![A live GPX embed followed by distance, ascent, times, pace, and a hoverable elevation profile](docs/inline-embed.png)

Ascent ignores changes below 5 m to suppress GPS drift. Moving time counts
speeds above 0.9 km/h so slow walking and stairs still count.

An inline track map also draws geotagged photos linked from its host note. Route
statistics continue to describe the route alone.

![An inline GPX map with the host note's photo thumbnails placed along the route](docs/photo-embed.png)

## Reuse one Base everywhere

Set **Base file path** and **View name** once in Advanced Maps settings. The
same Base then powers Open in map, Follow active note, and Around embeds.

| Question                                       | Defined by                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Which notes or direct photo files participate? | Base filters                                                               |
| What does a note marker look like?             | Base formulas and the map view's **Marker icon**/**Marker colour** options |
| Where is a note's coordinate?                  | The map view's **Coordinates** property                                    |

### Open in map

Notes carrying the coordinate property (`coords` by default) get an **Open in
map** item in their menu. It opens the configured Base, moves the camera to that
note, and opens its popup. **Open in** chooses a normal tab, which opens the Base
file itself and keeps any view option you change there, or a pop-up window, which
leaves your layout alone but has nowhere to write a change back to.

![A configured Base map opened on one note while the other places remain visible](docs/open-in-map.png)

### Follow the active note

Press the ⊹ control beside zoom-to-fit and that map follows notes as you switch
between them. It keeps the current zoom and never rewrites the Base query.

![A note beside its Base map, with the map following the note and its popup open](docs/follow-active-note.png)

## Pins at the same coordinate

At close zoom, notes sharing an exact coordinate fan out into a ring so every
marker can be hovered and opened. Zoom out and they close back to the truthful
shared point. Nothing is written to the notes, and copied coordinates remain
unchanged. **Fan out pins that share a spot** disables it.

## Coordinate systems

Vault coordinates and route files stay WGS-84. **Auto** recognizes common
mainland tile hosts and converts only at the map boundary for GCJ-02 or BD-09
basemaps. A default can be set globally or forced per map view when a proxy URL
hides the provider.

![The same WGS-84 track moving from a hillside back onto the causeway when basemap conversion is enabled](docs/coordinate-systems.gif)

## Open a spot in another map app

Right-click a map and choose **Open in external map**. Amap, Baidu, Tencent,
Google, Apple Maps, and OpenStreetMap receive the datum each expects. Providers
can be reordered or disabled, and custom URL templates can use `{lat}` and
`{lng}`:

```text
https://ul.waze.com/ul?ll={lat},{lng}&navigate=yes      WGS-84
https://www.bing.com/maps?cp={lat}~{lng}&lvl=16         WGS-84
om://map?v=1&ll={lat},{lng}                             WGS-84
```

App schemes such as `waze://` or `iosamap://` work on a device that has the app.
The datum is stated rather than guessed, because a mirror of a mainland provider
looks like any other host and getting it wrong does not fail — it just puts the
pin a few streets away.

![The map context menu with external-map destinations](docs/external-map.png)

## Fill coordinates without typing them

- **Set coordinates from a map link** understands common mainland and
  international share links, `geo:` URIs, DMS, and plain `lat,lng`. It previews
  the result and always writes WGS-84.
- **Search for a place and set coordinates** uses an open worldwide provider or
  Amap with your own key.
- **Fill place name from coordinates** reverse-geocodes the current coordinate
  into the configured place property.
- **Fill coordinates from current location** asks the operating system, on the
  desktop as well as on mobile, so no API key is involved. With **Enable
  location**, a present-but-empty `coords:` property can be filled automatically
  without overwriting an existing value; **Skip paths containing** (default
  `templates`) keeps the blank in a template blank.

![The map-link parser showing the WGS-84 coordinate it will write](docs/link-modal.png)

![Place search results with addresses](docs/place-search.png)

## What leaves your vault

Notes, tracks, and photo contents do not leave on their own. The plugin has no
telemetry, update ping, or server.

| When                     | What leaves                                      | Destination                   |
| ------------------------ | ------------------------------------------------ | ----------------------------- |
| A map is visible         | Tile requests: your IP and viewed area           | The selected basemap provider |
| You search for a place   | Search text, language, and configured key        | The selected geocoder         |
| You reverse-geocode      | The one coordinate you requested                 | The selected geocoder         |
| You open an external map | The clicked coordinate                           | The map app you chose         |
| You use device location  | Nothing from the plugin; the OS supplies the fix | —                             |

A search key can live in Obsidian secret storage, which keeps it out of synced
plugin settings, or in plugin settings for cross-device convenience. Either way
the provider receives it with the request.

## Attribution

Screenshots use third-party basemaps and search services only to demonstrate
the plugin; provider attribution remains visible. Demo notes are synthetic.
Zoo photographs and the route through them are the author's own and contain no
private subject matter.

Advanced Maps bundles no map data. Basemap copyright, licensing, and survey
requirements belong to the selected provider and user. If you hold rights to
reproduced material and want it removed, please
[open an issue](https://github.com/Jin1c-3/obsidian-advanced-maps/issues).

## Development

```bash
git clone https://github.com/Jin1c-3/obsidian-advanced-maps
cd obsidian-advanced-maps
npm install
cp .env.example .env      # point OBSIDIAN_PLUGIN_DIR at a test vault
npm run dev               # watch, build, deploy, and hot-reload
npm run check             # formatting, lint, types, tests, build, smoke test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow,
[the OpenSpec capabilities](openspec/specs) for stable technical contracts, and
[ROADMAP.md](ROADMAP.md) for what may come next and what deliberately will not.

A new language is one table in `src/i18n.ts` plus its `LOCALES` entry. English is
the source of truth and its keys are the type, so a missing entry is a compile
error rather than a blank label.

## Licence

[MIT](LICENSE).
