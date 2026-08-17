## Why

A saved-places file is the one shape of geodata this plugin reads and cannot do
anything useful with. `parseKml` already finds every `<Placemark><Point>`
(`src/parse.ts:283`) and `parseGpx` every `<wpt>` (`src/parse.ts:87`), so a
hundred saved restaurants exported from Google My Maps or a phone's map app draw
as a hundred circles owned by whichever note linked the file — and that is the
end of them. They are not rows, they carry no properties, and nothing a Bases
filter, formula or map view can reach knows they exist. The information is in the
vault and out of reach at the same time.

The way back out is missing for the same reason. A base that matched the places
worth visiting next week can be looked at and not carried: esm7/obsidian-map-view#269
wants waypoints for GaiaGPS and a Suunto watch, #313 wants a KML for Google My
Maps, and today the answer to both is to retype the coordinates.

Neither half needs a native seam this plugin does not already hold. Measured
against Maps 0.2.2 on Obsidian 1.13.7, on a live 16,503-row base:

- `markerManager.markers` is an ordinary array of 303 `{entry, coordinates, icon,
color, imageKey}` — exactly the notes the base matched **and** placed, already
  filtered to those whose coordinate property resolved
  (`obsidian-maps/src/map/markers.ts:71`). `coordinates` is `[lat, lng]`, the
  note's own value, untouched by the tile-datum shift this plugin applies to the
  _features_ it draws.
- `entry.file` and `entry.getValue(prop)` are reachable per marker, and
  `String(value)` answers with usable text for every Bases value type in that
  base — a date as `2025-04-05T16:27:00`, a list joined, a number, a string —
  so an exported place can be named by any property the base displays rather than
  only by its file name.

## What Changes

- **Import a file's places as notes.** A supported file's Point features become
  one note each: the placemark's name as the file name, its coordinate in the
  configured coordinate property, and its description as the note's body. The
  destination folder is chosen per import and is the unit of undo — nothing is
  written outside it and nothing existing is ever overwritten.
- **Read the description a placemark carries.** `parse.ts` preserves a name
  today and discards the text beside it. KML `<description>` and GPX `<desc>`
  become `properties.description`, so the sentence that says _why_ a place was
  saved survives the trip into the vault. Markup in a KML description is reduced
  to its text rather than inserted into a note as HTML.
- **Export the places a base matched.** From the map's own right-click menu:
  every marker on the view becomes a GPX waypoint, a KML placemark or a CSV row,
  written into the vault as one file. The place's name comes from the note's file
  name or from any property the base displays, chosen per export.
- **Write what the notes hold, not what the map drew.** Exported coordinates are
  `markerManager.markers[].coordinates` — the note's own WGS-84 values — never
  the projected geometry, so a base exported over Chinese tiles gives the same
  file as the same base exported over OpenStreetMap.
- Add no setting. Both halves are per-invocation choices made in a modal, and
  both act on a file or a view the reader is already looking at.

## Capabilities

### New Capabilities

- `place-interchange`: reading a file's saved places into notes, and writing the
  places a base matched back out as GPX, KML or CSV.

### Modified Capabilities

- `track-map-rendering`: extends "Supported track formats preserve equivalent
  data" so a placemark's description is preserved alongside its name, since it
  is now data a downstream feature reads rather than something only the drawing
  path would have ignored.
- `coordinate-datum`: extends "User-visible output leaves tile space once" so a
  file written out of a map is named as one of its destinations, and so an
  imported file's coordinates are read as WGS-84 exactly as a linked track's are.

## Impact

- `src/places.ts` — new, pure: Point features to a place list, name sanitizing
  and collision-free note names, and the three writers (GPX, KML, CSV) with
  their escaping.
- `src/places-modal.ts` — new: the import dialog (count, destination folder,
  preview) and the export dialog (count, format, name source, destination path).
- `src/parse.ts` — carry `description` on the features that have one.
- `src/main.ts` — a file-menu entry on supported files, and the write loop that
  creates the notes.
- `src/track-layer.ts` — one more map context-menu entry, reading the view's own
  markers.
- `src/types/obsidian-internals.d.ts` — declare `markers` and `BasesEntry.getValue`
  with the provenance measured above.
- `src/i18n.ts` — both locales. `styles.css` — the two dialogs.
- `tests/` — place extraction, note naming and collisions, the three writers'
  escaping, and that an exported coordinate is the unshifted one.
- `docs/guide/` — a new page for the pair, in English and Chinese, reachable
  from the guide's index. `CHANGELOG.md`, `ROADMAP.md`.
- No setting, persisted-data, dependency or manifest change. Nothing is written
  outside the vault, and nothing leaves it: both halves are file reads and file
  writes inside the vault the reader chose.
