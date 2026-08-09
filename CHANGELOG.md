# Changelog

Notable changes per release. Versions follow [semver](https://semver.org/);
the tag, `manifest.json` and `versions.json` always agree — CI refuses a release
where they do not.

## [Unreleased]

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

[Unreleased]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.0.0...HEAD
[1.0.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/releases/tag/1.0.0
