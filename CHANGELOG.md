# Changelog

Notable changes per release. Versions follow [semver](https://semver.org/);
the tag, `manifest.json` and `versions.json` always agree — CI refuses a release
where they do not.

## [Unreleased]

## [1.7.0]

### Added

- The map's _Open in external map_ menu is now yours to arrange. The six
  built-in apps can be reordered and switched off individually — switch all six
  off and nothing is added to the menu — and you can add your own entries: a
  name, a URL with `{lat}` and `{lng}` in it, and the coordinate system that URL
  expects. App schemes such as `waze://` or `iosamap://` work alongside web
  addresses. The coordinate system is stated rather than guessed, because that
  is the one thing a URL template cannot carry and the one that puts a pin in
  the wrong street when it is wrong.

## [1.6.0]

### Added

- The Amap search key can be kept in Obsidian's secret storage instead of the
  plugin's settings file, and which one is a setting rather than a decision made
  for you. Secret storage keeps the key out of `data.json` — so out of sync,
  backups and commits — at the cost of staying on the one device, so each device
  you search from needs it entered once. Plugin settings is the old behaviour:
  one entry covers every device, in plain text.

### Changed

- New installs default to secret storage. A key already saved stays where it is
  until you move it: switching stores would otherwise put it somewhere your
  other devices cannot read and break search there without saying so. Switching
  to secret storage carries the key across rather than clearing it; switching
  back does not copy it out, because writing a key to disk in plain text should
  not be a side effect of changing a dropdown.

## [1.5.1]

### Fixed

- Inline maps are torn down when the plugin unloads. Each one holds a WebGL
  context and browsers keep only about sixteen alive at once, so updating or
  reloading the plugin with embeds on screen leaked one apiece until the note
  was closed.
- A track option left blank in a hand-edited base read as zero rather than as
  absent, and clamped to the option's minimum instead of falling back to its
  default.

### Changed

- Redraws skip re-uploading the tracks when nothing about them has changed.
  Bases replaces its result set on _any_ vault edit while a map view is open,
  not just edits to notes the base matches, so a base carrying several large
  tracks was re-serializing every point on every save. Framing and paint still
  run every time, so nothing about how a map behaves changes.
- Which track files a note embeds is remembered against that note's metadata
  instead of being resolved again on every redraw — several hundred link
  resolutions per redraw on a large base — and is dropped whenever a file is
  created, renamed or deleted.
- A track's converted geometry is remembered per coordinate system rather than
  one system at a time, so a GCJ-02 base view and a BD-09 embed of the same file
  no longer re-convert each other's work on every redraw.
- Parsed tracks are dropped from the cache when their file is deleted or
  renamed, rather than held for the rest of the session.
- The track option ranges and defaults are stated once rather than in four
  places, where the copies had already drifted apart.

### Added

- A Simplified Chinese README.

## [1.5.0]

### Added

- **Track statistics.** Distance, ascent and descent, elevation range, elapsed
  and moving time and average pace, under an inline map, with an elevation
  profile below them. Ascent ignores drift under 5 m, because raw GPS elevation
  is noisy enough to turn a flat ride into hundreds of metres of imaginary
  climb; moving time counts anything above 0.9 km/h, low enough that walking up
  steps still counts. Whatever a file does not record is left out rather than
  shown as zero. Both the line and the profile can be switched off.
- **KML and TCX** join GPX and GeoJSON as track formats.
- **Open a spot in another map app.** _Open in external map_ on the map's own
  right-click menu, sending each provider the datum it actually expects.

### Changed

- The repo lints with the same two things the community scorecard scans with,
  so its findings turn up before a release rather than on a web page after one.
- Release assets carry GitHub build provenance.

## [1.4.0]

### Added

- **A map of the notes around a note.** One command writes one line into the
  note — an embed of a view in your own base, filtered to the notes this one
  links to, the notes that link to it, and itself. The view is added to the base
  once and referenced afterwards, so a later change to the base reaches every
  map already inserted. After that the plugin is out of the loop: adding a place
  is dragging a note into the body.

## [1.3.0]

### Added

- **Coordinates from a map link.** _Set coordinates from a map link_ reads a
  share link from 高德, 百度, 腾讯, Google or Apple Maps — or a `geo:` URI,
  degrees-minutes-seconds, or two bare numbers — and writes the note's
  coordinate property. Each provider is read by its own rules, because they
  disagree about both the axis order and the datum: 高德 writes longitude first
  in GCJ-02, 百度 writes latitude first in BD-09 unless `coord_type` says
  otherwise, and Google and Apple are GCJ-02 inside China and WGS-84 outside it.
  What lands in the note is always WGS-84, and it is shown before anything is
  written. Shortened links are named rather than silently resolved through a
  third party.
- **Place search.** _Search for a place and set coordinates_ looks a name up
  through OpenStreetMap's Nominatim (no key) or 高德 (a free web-service key,
  and far better on Chinese POIs) and writes the coordinate of whichever result
  is picked. This is the only part of the plugin that sends anything anywhere,
  and only while the search box is open.
- Screenshots in the README, including a before/after of the coordinate
  conversion on a mainland basemap.

### Changed

- The README no longer names individual map providers, and carries an
  attribution note for the basemaps and search results its screenshots were
  taken against.
- "What leaves your vault" replaces the claim that place search was the only
  thing sending anything anywhere. It is the only request the plugin makes on
  its own behalf, but a map on screen has always fetched tiles from whichever
  background it is configured with.

## [1.2.0]

### Fixed

- Coordinates are converted on the way **out** of the map as well as in. Under
  GCJ-02 or BD-09 tiles the plugin moved everything it drew into the tile
  provider's space but nothing on the way back, which left four seams reading
  the shifted value as though it were a real place. The map's own right-click
  menu was the one that reached disk: _New note_ wrote it into the note's
  frontmatter, _Copy coordinates_ put it on the clipboard, and _Set default
  center point_ stored it in the base file for `loadConfig` to shift a second
  time. A marker's popup opened a few streets from its own pin, the locate
  button fed the device fix straight through, and a background switch that
  changed the coordinate system left the camera looking somewhere else.

### Changed

- The nine instance wrappers go through one `wrap()` helper that remembers how
  to restore each method, so detaching is a loop rather than a second list to
  keep in step with the first.
- The track drawing path is shared between base views and inline embeds. It had
  been duplicated and had already drifted — embeds never set `circle-opacity`.

## [1.1.0]

### Added

- Location: a note's coordinate property can be filled from the device's own
  position. A property that is present but empty — the blank a template leaves —
  is filled when the note is opened or its properties change; a command fills the
  active note outright. Unlike the map plugins this one sits beside, neither is
  restricted to mobile: current Chromium asks the operating system rather than a
  Google service, so a desktop with its location service on can answer too. A
  platform that cannot is asked once per session and then left alone.

## [1.0.0]

First public release. Previously a single hand-written `main.js` living inside
one vault; the behaviour is unchanged, everything around it is new.

### Added

- GPX / GeoJSON tracks resolved from each note's embeds and drawn in that note's
  marker colour.
- A zoom-to-fit control, and auto-framing that covers markers and tracks.
- GCJ-02 / BD-09 alignment, decided per view from the tile URL by default, so
  Chinese tile providers line up with the data.
- Inline maps for `![[track.gpx]]` embeds, built only once they scroll into view.
- An "open in map" pop-up on a note's ⋮ menu and in the command palette.
- English and Simplified Chinese interface, following Obsidian's language.

### Changed

- Settings that used to hold one vault's own values now default to blank:
  the "open in map" base path must be chosen, the view name falls back to the
  base's first map view, and the menu label falls back to the localized default.

[Unreleased]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.7.0...HEAD
[1.7.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.6.0...1.7.0
[1.6.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.5.1...1.6.0
[1.5.1]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.5.0...1.5.1
[1.5.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.4.0...1.5.0
[1.4.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.3.0...1.4.0
[1.3.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/releases/tag/1.0.0
