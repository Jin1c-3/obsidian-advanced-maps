## 1. What a file says about a place

- [x] 1.1 Carry `description` through `buildProperties()` in `src/parse.ts`, from KML `<description>` and GPX `<desc>`, leaving a place without one carrying no key at all
- [x] 1.2 Read a KML placemark's description from the placemark itself, the way `placemarkName()` already walks up rather than taking the first descendant — a `<Style>` or `<ExtendedData>` child must not be mistaken for it
- [x] 1.3 Add `src/places.ts` with `placesFrom(features, fallback)`: every Point feature becomes `{name, description, lat, lng}`, non-Point geometry is skipped, and a nameless place is named from the source file and its position in it — design.md D7
- [x] 1.4 Reduce a description to text in `places.ts`: `<br>` and block ends to newlines, tags dropped, entities decoded once, whitespace collapsed to at most one blank line — design.md D9

## 2. Places into notes

- [x] 2.1 Add `noteName(raw, taken)` to `src/places.ts`: replace the characters a vault file name cannot hold with a space, trim leading dots and trailing dots and spaces, bound the length, fall back when nothing is left, and de-duplicate against both the vault and the names already claimed in this import — design.md D10
- [x] 2.2 Add the import dialog to `src/places-modal.ts`: the count found, the destination folder (defaulting beside the source file), a preview of the first few names, and the sentence that says the folder is the undo
- [x] 2.3 Offer **Import places as notes** on `file-menu` for any file whose extension this plugin parses, reading the file only when the entry is chosen — design.md D7
- [x] 2.4 Create the destination folder when it does not exist, then write one note per place: the configured coordinate property through the same `formatLatLng` form every other command writes, and the description as the body
- [x] 2.5 Write notes sequentially, never overwrite, count what failed, and report created and failed counts in one notice
- [x] 2.6 Write no link back to the source file, and state in a comment why a wikilink there would be wrong — design.md D8

## 3. The three writers

- [x] 3.1 Add `writeGpx`, `writeKml` and `writeCsv` to `src/places.ts`, each taking the same place list — design.md D11
- [x] 3.2 Escape what each format reserves: XML entities for GPX and KML, RFC 4180 quoting and CRLF for CSV
- [x] 3.3 Write coordinates in the same six-decimal form `formatLatLng` uses, and remember that KML is `lon,lat` while GPX attributes are `lat` and `lon`

## 4. Places out of a base map

- [x] 4.1 Declare `markers` on `MarkerManager` and `getValue` on `BasesEntry` in `src/types/obsidian-internals.d.ts`, with the provenance measured in proposal.md — design.md D2
- [x] 4.2 Collect places from `view.markerManager.markers`, `Array.isArray`-checked, taking `marker.coordinates` as `[lat, lng]` and never the drawn geometry, with a comment naming the rule — design.md D3
- [x] 4.3 Add the export entry to the map's context menu in `src/track-layer.ts`, in its own section, and offer it only when the view answers with at least one marker — design.md D4
- [x] 4.4 Add the export dialog to `src/places-modal.ts`: the count, the format, the name source (file name plus each property the base displays), and the destination path
- [x] 4.5 Turn a Bases value into a name with `String(value)` guarded by `isTruthy()`, falling back to the note's file name when it is empty — design.md D5
- [x] 4.6 Check the destination path against the vault as it is typed, block the confirm while it is taken, and report the written path — design.md D6

## 5. Localization

- [x] 5.1 Add the menu titles, dialog labels and notices to `en`
- [x] 5.2 Add the same keys to `zh`

## 6. Tests

- [x] 6.1 Cover descriptions surviving the readers: a KML placemark with one, a GPX waypoint with one, and a placemark whose `<Style>` child must not be read as its description
- [x] 6.2 Cover `placesFrom`: points only, a nameless place, and a file of mixed geometry contributing only its points
- [x] 6.3 Cover description-to-text: markup reduced, line breaks kept, entities decoded once, and a place with no description producing no body
- [x] 6.4 Cover `noteName`: reserved characters, a name that sanitizes to nothing, a collision inside one import, and a collision with a name already taken
- [x] 6.5 Cover the three writers, including a name holding `&`, `<`, `"`, a comma and a newline, and CSV quoting
- [x] 6.6 Round-trip the GPX and KML writers back through `parseGpx`/`parseKml` and assert the same names and coordinates come back — design.md D11
- [x] 6.7 Cover that an exported coordinate is the marker's own value by collecting places on a view configured for GCJ-02 and asserting the pair is the unshifted one, next to the shifted pair the same point draws at

## 7. Documentation

- [x] 7.1 Add a user-guide page for the pair, covering both directions, the folder-as-undo rule, the snapshot-not-sync rule, and that an exported track file in the vault is also a readable one
- [x] 7.2 Translate it into `docs/guide/*.zh-CN.md` and link both from the guide index
- [x] 7.3 Add the `## [Unreleased]` entry to `CHANGELOG.md`
- [x] 7.4 Retire the two `## Next` entries from `ROADMAP.md` and promote whatever now sits at the top of _Worth doing_

## 8. Verification

- [x] 8.1 `npm run check`
- [x] 8.2 Live in the jot vault: import a KML of placemarks into a scratch folder, confirm the notes' coordinates, names and bodies, then delete the folder
- [x] 8.3 Live in the jot vault: export the 303-place base as each of the three formats, read the GPX back through the plugin, and confirm the coordinates match the notes' own values on a GCJ-02 basemap
- [x] 8.4 Remove every scratch file from the vault, the `/mnt/c` mirror and `.trash`
