# Changelog

Notable changes per release. Versions follow [semver](https://semver.org/);
the tag, `manifest.json` and `versions.json` always agree — CI refuses a release
where they do not.

## [Unreleased]

## [1.11.0]

### Added

- **A ⊹ button on every map, beside zoom-to-fit, for _Follow the active
  note_.** Press it and that map pans to whichever note you switch to and
  opens its popup — wherever the map is open. It is per map rather than per
  plugin, so a map beside the note you are writing can follow while the one
  you are reading in another tab sits still. Not remembered once a map is
  closed.

### Changed

- **Following is no longer sidebar-only.** It was gated on the map being
  outside the main area, which held for a map sharing a tab group with the
  note — hidden the moment that note opens — and got the layout people
  actually use exactly backwards: a note in one tab group and a map in the
  next one over is the follow layout, and it is all main area. No rule about
  where a map sits separates the two, so the button decides instead.
- **Follow the active note** is now **New maps follow the active note**: the
  setting is the state a map starts in rather than a switch over all of them.
  If you had it on, maps in the main area will now start out following too;
  the button turns any of them off.
- The README is about a third shorter in both languages, with screenshots for
  the track start/end markers and the "around this note" map, which were
  described in prose only.

### Fixed

- **A following map no longer takes the keyboard.** Its popup opened with
  focus, so every switch between notes pulled the caret out of the editor and
  onto the link inside the popup — which made the feature unusable in the
  split layout it exists for. The popup still opens; the focus goes back.
- **Clicking a pin on a following map no longer replaces the map with the
  note.** It opens in the pane that map is following. A map you are not
  following is unchanged.

## [1.10.1]

### Fixed

- **The direction arrows now point along the track.** They were drawn pointing up
  in their own image, and a line placement rotates an icon's _right_ edge onto
  the line's bearing — so every arrow sat on the track pointing across it. They
  also could not have shown it: a filled triangle at 12 px has its apex 6 px from
  either base corner, which says nothing about which corner is the front, and a
  shape with no legible direction cannot look like it is pointing the wrong way.
  Now an arrowhead with a notched tail, apex to the right, at 18 px — big enough
  to read at the zoom a track's own auto-fit picks, which 12 px was not.
- **The end pin was a hard red square**, which beside Obsidian's own rounded map
  controls reads as an image that failed to load. It is now a ring at the start
  pin's own diameter — a pair, and one that survives a reader who cannot
  separate the two colours.
- **Fill place name from coordinates** now refuses, with a notice, when
  **Place property** and **Coordinate property** are set to the same
  frontmatter key — including a **Coordinate property** renamed to
  `location`, **Place property**'s own default — rather than silently
  overwriting the note's coordinate with the address string it just looked
  up.
- **Show track markers**, turned off, now also hides the waypoint-name
  tooltip on inline maps. It already hid the start/end pins and the
  direction arrows; the tooltip kept working regardless of the setting.
- The direction-arrow icon now gets the same halo the start and end pins
  already have, so it stays legible on a track colour close to
  `var(--text-muted)` instead of blending into the line it sits on.
- The waypoint-name tooltip on an inline map no longer clips against the
  embed's own top edge; it flips below the cursor when there is not room
  above.

## [1.10.0]

### Added

- **Fill place name from coordinates.** Reverse geocodes a note's coordinate
  property through whichever place-search provider and key you already
  configured, and writes the result into a new property (**Place property** in
  settings, default `location`) — overwriting it, since running the command is
  the explicit ask. Not behind **Enable location**: no permission prompt,
  nothing about where you are recorded — but the coordinate you already had
  does leave the vault this way, which [What leaves your
  vault](README.md#what-leaves-your-vault) now says.
- **Start and end markers, direction arrows, and waypoint names.** Every track
  now shows a start pin and a differently-shaped end pin, and arrows along the
  line pointing which way it goes; a waypoint that carries its own name shows
  it on hover, on an inline `![[track.gpx]]` map. One setting, **Show track
  markers**, default on, sits beside track statistics and the elevation
  profile. Base map views get the pins and arrows too — the waypoint-name
  tooltip is inline-only for now, since a base view's hover already opens the
  note's own popup.
- **The elevation profile now links to the map.** Hovering it moves a point
  along the track on the map; hovering the track moves the point along the
  profile. Both leave when the pointer does. Inline embeds only — a base map
  view has no profile to link to.

### Changed

- **A plain `[[track.gpx]]` now puts the track on the map too**, as does a
  `track: "[[track.gpx]]"` property — where before only `![[track.gpx]]` did.
  The `!` is now the whole difference, exactly as it is everywhere else in
  Obsidian: with it you get an inline map in the note _and_ the line on every
  base map, without it only the line. That is the answer to a note that already
  holds a map of its own and does not want a second one under it
  ([#6](https://github.com/Jin1c-3/obsidian-advanced-maps/issues/6)). Nothing
  existing changes meaning — every embed that drew a track still draws it.

## [1.9.0]

### Changed

- **The base file and its view are picked from a list, not typed.** **Base file
  path** offers the `.base` files in your vault, with a ✕ to clear it; **View
  name** offers that base's map views, with _The first map view_ where blank
  used to be. Nothing about what is stored has changed, so an existing setup
  keeps working untouched — a path typed correctly and a view named correctly
  simply appear as the entries they already were.
- A view named in settings that the base does not hold is now offered anyway and
  said to be missing, instead of leaving a dropdown that reads as blank while
  the setting says otherwise. Rename a view in Bases and the row tells you,
  rather than the map failing to open later.

## [1.8.0]

### Added

- **Follow the active note.** A map open in a sidebar pans to whichever note you
  switch to and opens its popup. Maps in the main area never follow — one of
  those is something you are reading. Your zoom is left as you set it, and the
  base's query is never touched: only the camera moves. Off by default.
- **Open in** decides where _Open in map_ opens: a tab, or the pop-up it has
  always used.

### Changed

- **_Open in map_ now opens your base rather than a copy of it**, and defaults to
  a tab — reusing one already showing that base, so pressing it on one note after
  another is a single map that keeps moving. The map is moved to the note and its
  popup opened; nothing is written anywhere. This is what makes a change you make
  on the map stick: the old pop-up rendered a **copy** of the base, so _Set
  default center point_ and anything else you changed there was silently
  discarded, and the copy was frozen at the moment it opened — a formula or
  colour rule you had changed since was not in it.
- The pop-up, for anyone who prefers it, now embeds the base instead of copying
  it, so it is never out of date. Its edits still go nowhere, because an embedded
  base has nowhere to write them back to; the setting says so.

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

[Unreleased]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.11.0...HEAD
[1.11.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.10.1...1.11.0
[1.10.1]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.10.0...1.10.1
[1.10.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.9.0...1.10.0
[1.9.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.8.0...1.9.0
[1.8.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.7.0...1.8.0
[1.7.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.6.0...1.7.0
[1.6.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.5.1...1.6.0
[1.5.1]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.5.0...1.5.1
[1.5.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.4.0...1.5.0
[1.4.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.3.0...1.4.0
[1.3.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/releases/tag/1.0.0
