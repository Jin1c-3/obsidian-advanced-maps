## Context

See proposal.md — Why. What shapes the design is that both halves are file work
this plugin can do on its own, and neither wants a new source of truth:

- The reader is already parsed. `parseTrack()` returns Point features with names;
  the only thing missing on the way in is `<description>` and the writing.
- The places are already resolved. `markerManager.markers` is the native map's
  own answer to "which rows became places", built in `updateMarkers()` from
  `mapConfig.coordinatesProp` through the native `coordinateFromValue`, including
  whatever formula or list shape that property holds.
- Both directions have exactly one datum rule to obey, and it is the same rule
  `writeTrackStats` already obeys: the values notes hold are WGS-84 and the map's
  projection is not involved in either read.

## Goals / Non-Goals

**Goals:**

- One note per place on the way in, one file per export on the way out, with the
  reader confirming the destination in both directions.
- No new persisted state: no setting, no index, no property this plugin owns.
- Pure, testable cores — feature list to places, places to file text, name to
  file name — with the vault I/O kept in a thin shell around them.

**Non-Goals:**

- Round-tripping a _route_. A GPX track exported and re-imported is out of scope;
  imports read points and exports write points, and a route in the vault is
  already a file that can be copied.
- Syncing. An import is a snapshot: re-importing the same file later creates new
  notes rather than updating the ones it made before. See D8.
- Writing outside the vault, and any OS "save as" dialog. See D6.
- Extended data. A KML `<ExtendedData>` table and a GPX `<sym>`/`<type>` are read
  by nothing here and are not carried in either direction.

## Decisions

### D1 — Export reads `markerManager.markers`, not `view.data.data`

The set exported must be the set on screen. Re-deriving it from `view.data.data`
means re-implementing `coordinateFromValue` and the `coordinatesProp` lookup,
including the formula and list cases, and any drift between the two produces a
file that silently disagrees with the map it was exported from. Measured on the
test base: 303 markers out of 16,503 matched rows, so the difference between the
two sources is two orders of magnitude, not an edge case.

Alternative considered: read `view.data.data` and this plugin's own
`coordsProperty` setting. Rejected — that setting names the property _this
plugin's_ commands write, which need not be the property _this view_ maps.

### D2 — `markers` is declared with provenance and shape-checked

`private markers: MapMarker[]` in `obsidian-maps/src/map/markers.ts:20` is a
compile-time word; at runtime it is an ordinary own property, and reading it is
the same class of access as the wraps already installed on that object. It gets a
declaration in `src/types/obsidian-internals.d.ts` beside `MapMarker`, which
already documents it in prose, and every read is `Array.isArray`-checked. If it
is missing or not an array, the menu entry is not offered at all — the
stand-down the plugin's rules require, and the same answer as a map with no
places.

`BasesEntry.getValue` is declared alongside it: it is public API in the Maps
source's own typings (`entry.getValue(prop)` in `updateMarkers`), but this
plugin's local `BasesEntry` currently declares only `file`.

### D3 — Exported coordinates come from the marker, never from the drawn feature

`marker.coordinates` is `[lat, lng]`, the note's own value; the tile-datum shift
this plugin applies happens to the _features_ it hands MapLibre, not to the
markers. Reading the drawn geometry instead would make an export depend on which
basemap happened to be configured — the same trap `writeTrackStats` avoids by
measuring `rec.features` rather than `rec.projected`. A comment says so at the
read, because the two are one property apart and nothing about the result looks
wrong: a 500 m shift is invisible in a file of numbers.

### D4 — Export is offered from the map's context menu, not as a command

The map's right-click menu is handed the view it belongs to. A command would have
to find "the active base map view", and there is no supported way to: this
plugin's `layers` set can hold several, `getActiveBasesViewOfType` wants a
constructor rather than a type string, and the view is a grandchild of the Bases
file view rather than the leaf's own view. The menu also puts the action where
the reader is looking at the places it exports.

The entry gets its own `setSection`, so it groups apart from the native
point-actions (**New note here**, **Copy coordinates**) — it is about the whole
map rather than about the clicked pixel, and the clicked coordinate is not read
for it.

### D5 — A place's name comes from the file name, or from any property the base displays

A vault whose notes are named `20250405162700` exports 303 places called
`20250405162700`. `view.data.properties` is the list the base already displays
and `config.getDisplayName()` already labels, so the export offers them as name
sources with **file name** as the default.

`String(value)` is what turns a Bases `Value` into text: measured across the test
base it answers usefully for every type present — string, list (joined), number,
date (`2025-04-05T16:27:00`) — while `renderTo` into a detached element returns
empty for some of them. A value is read only when `isTruthy()` says it holds
something, since an empty one stringifies to `""` and a null one to the literal
`"null"`. An empty value falls back to the file name, so no place is exported
nameless.

### D6 — An export writes a vault file, and never overwrites

`vault.create` into the vault rather than an OS save dialog: Electron's dialog
does not exist on mobile, and a vault file is already something the reader can
sync, share or link. The destination path is shown before the write and checked
against `getAbstractFileByPath` as it is typed, so an existing file blocks the
confirm rather than being silently renamed or replaced. The default path is the
active file's base name plus the format's extension, which for an open base is
the base's own name.

A `.gpx` or `.kml` written into the vault is a file this plugin also _reads_, so
an exported file linked from a note draws as a set of circles. That is
consistent rather than surprising, and it is the mechanism the import half then
operates on.

### D7 — Import is offered on the file, and the count is known only after reading it

The entry is offered on any file whose extension this plugin parses, because
`file-menu` is synchronous and knowing whether a file holds points requires
reading it. The read happens when the entry is chosen; a file with no points
reports that and writes nothing. TCX is excluded by shape rather than by rule —
it has no point form — but is not special-cased: it simply yields no points.

### D8 — The destination folder is the unit of undo, and no note links the source

Frontmatter has no undo and an import can create hundreds of notes, so
everything it writes goes inside one folder the reader named, and the dialog says
so. Deleting that folder is the undo.

No note gets a link back to the imported file. A wikilink would be the natural
provenance, and it is exactly wrong here: this plugin resolves track attachments
through `cache.links` and `cache.frontmatterLinks`, so 137 notes linking one KML
would make that KML a drawn track owned by 137 notes at once. A plain-text
provenance property was considered and dropped as a second thing to keep in sync
for no reader-visible gain.

### D9 — A description becomes text, not markup

KML descriptions from map apps routinely hold HTML. A note body is markdown, and
Obsidian renders inline HTML in it, so inserting a third party's markup verbatim
means an imported file decides how a note looks — and is a needless surface for
whatever a downloaded `.kml` happens to carry. The description is reduced to its
text: `<br>` and block ends become newlines, tags are dropped, entities are
decoded once by the same `DOMParser` the KML reader already uses. What survives
is the sentence a reader wrote about the place.

### D10 — Note naming: sanitize, then de-duplicate against the folder and the batch

`\ / : * ? " < > |` and control characters cannot appear in a vault file name;
they are replaced with a space rather than dropped, so `Café: Sud` does not
become `CaféSud`. A leading dot and trailing dots/spaces are trimmed, the result
is bounded in length, and an empty result falls back to `<source file> <n>`.
Collisions are resolved with a numeric suffix, checked against both the vault and
the names already claimed earlier in the same import — a file with two `Home`
placemarks is the common case, not a rare one.

### D11 — File shapes are the smallest valid ones

- **GPX 1.1**: one `<wpt lat lon>` per place, with `<name>` and `<desc>`.
- **KML 2.2**: one `<Placemark>` per place, with `<name>`, `<description>` and
  `<Point><coordinates>lon,lat</coordinates>`.
- **CSV**: a header row, then `name,latitude,longitude,path`. RFC 4180 quoting —
  double the quotes, quote any field holding a comma, a quote or a newline — and
  CRLF line endings, which is what spreadsheet software expects.

Coordinates are written with the same six-decimal form `formatLatLng` already
uses for notes, which is ~0.1 m and well past what a phone's fix supports.

The GPX and KML writers are tested by reading their output back through
`parseGpx`/`parseKml`: the plugin's own reader is the closest available
independent parser, and a round-trip catches an escaping bug that an
assertion-on-substrings would not.

### D12 — Pure core, thin shell

`src/places.ts` is pure: features → places, places → file text, name → file name.
`src/places-modal.ts` holds the two dialogs. The vault writes stay in `main.ts`
(notes) and in the export commit (one file), so the tests cover the arithmetic
and the escaping without a vault, as `tests/` already does for every other
module.

## Risks / Trade-offs

- **A large import creates a large number of notes.** → The count is shown before
  anything is written, everything lands in one folder, and the writes are
  sequential rather than a burst of parallel `create` calls.
- **An import is a snapshot, not a sync.** → Stated in the guide. Re-importing
  the same file makes a second set of notes; the folder is how the first set is
  removed.
- **`markers` is an undocumented internal.** → Declared with provenance,
  `Array.isArray`-checked at every read, and absent-means-no-entry. The worst
  case is the export not being offered, never a wrong file.
- **A property chosen as the name source can be empty for some notes.** → Those
  places fall back to the file name rather than exporting blank names.
- **An exported `.gpx`/`.kml` sitting in the vault is also a readable track.** →
  Consistent with how every other track file behaves; noted in the guide so the
  reader can choose a folder outside their base's query if they do not want it
  drawn.

## Open Questions

None.
