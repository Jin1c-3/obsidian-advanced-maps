# Changelog

Notable changes per release. Versions follow [semver](https://semver.org/);
the tag, `manifest.json` and `versions.json` always agree — CI refuses a release
where they do not.

## [Unreleased]

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

[Unreleased]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.1.0...HEAD
[1.1.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/releases/tag/1.0.0
