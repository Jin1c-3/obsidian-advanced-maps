# Reference and privacy

**English** · [简体中文](reference-and-privacy.zh-CN.md) · [Guide index](README.md)

## Supported files and links

| Input            | Supported forms                                   | What it contributes                                                 |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Photos           | JPG, JPEG, PNG, WebP, HEIC, HEIF, AVIF            | GPS point, thumbnail when available, time/orientation metadata      |
| Tracks           | GPX, GeoJSON, KML, TCX                            | Routes, waypoints, markers, arrows, and available inline statistics |
| Areas            | GeoJSON and KML polygons                          | Filled regions with outlined boundaries and preserved holes         |
| Note attachments | Normal body links, embeds, frontmatter file links | Linked tracks and photos, de-duplicated per resolved file           |

A direct supported photo or track file may also be a Base result. Only a real
track embed creates an inline map; normal links and frontmatter links draw on a
Base or Around map without creating another map in the note.

## Where the settings live

**Settings → Community plugins → Advanced Maps** opens on nine entries, one per
topic. Open one to reach its rows; the entry states what it is set to, so the
pane answers the common questions without being opened.

| Entry                | Holds                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinate system    | The default datum for inline maps and for views that set none                                                                                            |
| Offline basemap      | A folder of tiles on disk to draw as the background, and the zoom levels it holds                                                                        |
| Open in map          | Base file, view name, target, coordinate and place properties, zoom, follow, Around view name, menu label                                                |
| Open in external map | The built-in map apps and your own                                                                                                                       |
| Place search         | Search source and, for Amap, where its key is kept                                                                                                       |
| Location             | Device location and the automatic coordinate fill                                                                                                        |
| Pins                 | How the notes' own markers behave                                                                                                                        |
| Tracks               | Colour, width, opacity, fit zoom, inline height, statistics, profile, markers — and **Track properties**, which names what the statistics command writes |
| Photos               | Photo pins, thumbnails, photo datum, and the photo index                                                                                                 |

Anything named in this guide can also be found by typing it into the settings
search, which reaches rows inside these pages the same way it reaches any other.

## Which setting owns what

| Question                                                | Defined by                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Which notes or direct files participate?                | Base filters                                                                                                     |
| What does a note marker look like?                      | Base formulas and the map view's **Marker icon**/**Marker colour** options                                       |
| Where is a note's coordinate?                           | The map view's **Coordinates** property                                                                          |
| Which Base powers navigation and Around?                | Advanced Maps **Base file path** and **View name** settings                                                      |
| How a specific map draws tracks or converts its basemap | `trackWeight`, `trackOpacity`, `fitMaxZoom`, and `coordSystem` view keys when present; plugin settings otherwise |
| Whether a map draws the offline basemap                 | The `offlineTiles` view key; the pack itself is a plugin setting                                                 |

## Operational boundaries

- Advanced Maps requires the first-party Maps view. If it is unavailable, the
  plugin reports or skips the enhancement and leaves the host usable.
- A photo without readable GPS remains a Base result but has no map marker. A
  geotagged photo without a usable thumbnail still has a dot.
- A directory link to an external album is desktop filesystem setup. Create an
  equivalent link on every desktop, keep cloud files locally readable, avoid
  loops, and verify how backup and sync providers handle the link. Mobile cannot
  reuse a desktop link.
- An Around view still obeys its Base's filters. It stores the view name in the
  embed, so rename the view and existing embeds must be updated.
- Opening a configured Base in a normal tab lets view-option changes persist in
  the Base file. A pop-up window preserves the layout but has nowhere to write
  those changes back.

## What leaves your vault

Notes, tracks, and photo contents do not leave on their own. The plugin has no
telemetry, update ping, or server.

| When                     | What leaves                                      | Destination                   |
| ------------------------ | ------------------------------------------------ | ----------------------------- |
| A map is visible         | Tile requests: your IP and viewed area           | The selected basemap provider |
| A map draws a tile pack  | Nothing; the tiles are read from disk            | —                             |
| You search for a place   | Search text, language, and configured key        | The selected geocoder         |
| You reverse-geocode      | The one coordinate you requested                 | The selected geocoder         |
| You open an external map | The clicked coordinate                           | The map app you chose         |
| You use device location  | Nothing from the plugin; the OS supplies the fix | —                             |

A search key can live in Obsidian secret storage, which keeps it out of synced
plugin settings, or in plugin settings for cross-device convenience. Either way
the provider receives it with the request.

## Attribution

Screenshots use third-party basemaps and search services only to demonstrate
the plugin; provider attribution remains visible. No screenshot shows a face or
an identifiable person: the hero image is the author's own vault with days that
hold photographs of people filtered out of the Base. The remaining images use
synthetic demo notes or the author's own photographs—animals only. The
thumbnail-thinning animation copies those photographs onto real landmark
coordinates so it can demonstrate a large album without publishing where
anybody has been.

Advanced Maps bundles no map data. Basemap copyright, licensing, and survey
requirements belong to the selected provider and user. If you hold rights to
reproduced material and want it removed, please
[open an issue](https://github.com/Jin1c-3/obsidian-advanced-maps/issues).
