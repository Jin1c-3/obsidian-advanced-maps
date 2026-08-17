# Changelog

Notable changes per release. Versions follow [semver](https://semver.org/);
the tag, `manifest.json` and `versions.json` always agree — CI refuses a release
where they do not.

## [Unreleased]

### Added

- **Areas are drawn.** A GeoJSON or KML file can hold a region rather than a
  route, and one used to reach the map already transformed, already counted for
  framing, and then drawn by nothing at all — the camera flew to the area and
  showed empty map, with no way to tell an unsupported shape from an empty file.
  An area is now filled in its note's colour beneath everything else, its
  boundary stroked at the track's own width and opacity, and its holes left
  unfilled. It gets no direction arrows and no start or end markers, since a
  region has no travel direction, and it adds nothing to distance, ascent or the
  elevation profile.

  Fill opacity follows the existing **Track opacity** setting at a fraction of
  it, so a large area never hides the roads and labels underneath. There is no
  new setting to find.

  An area is the last thing a click or hover reaches. A marker, waypoint or
  photo standing inside one keeps its own click, and the map's context menu opens
  over an area exactly as it does anywhere else.

### Changed

- **A KML polygon now draws as an area rather than an outline.** Its
  `<outerBoundaryIs>` becomes the region and each `<innerBoundaryIs>` becomes a
  hole, where before every ring was read as a separate line and a hole was
  indistinguishable from a boundary. A ring left open by its writer is closed; a
  `<LinearRing>` that no polygon declares as a boundary keeps being read as a
  line.

## [1.13.6]

### Added

- **Reading a photo is now remembered between sessions.** What came out of a
  photo — its coordinate, altitude, the moment, the datum its tags stated,
  orientation, and whether it has a thumbnail — is kept in one file beside the
  plugin's settings, so opening the vault again draws the same pins without
  opening the photos. On a base of 12,107 photos that is 12,107 file reads and
  about 8.5 seconds on every start, down to 20 reads and 1.2 seconds, with the
  same 6,504 points and the same thumbnails on screen. Photos found to carry no
  GPS are remembered as such rather than re-read to re-learn it every time —
  5,603 of that base, or nearly half of it.

  The thumbnail images themselves are not stored; they are read on demand for
  the handful of photos the map is actually displaying, so the file stays small
  whatever size the album is. Because the raw tag values are kept rather than the
  converted result, changing **Photo coordinate system** now moves every point
  without reopening a single photo.

  An entry is used only while its file still reports the same path, size and
  time, so an edited, renamed or deleted photo is never drawn from it. The file
  is a cache and nothing else: **Clear the photo index** in settings throws it
  away, deleting it by hand does the same, and either way every map goes on
  showing exactly what it showed.

### Fixed

- **A map of thousands of photos no longer reads them all at once.** A base
  whose results are photo files made the number of files being read at one time
  follow the size of the result — twelve thousand concurrent reads where the
  code was written for a few hundred. Reads are now bounded, and a refresh that
  has been superseded stops starting new ones instead of draining its queue.

- **A map with nothing on it no longer raises an error from the built-in Maps
  view.** Its marker manager reports empty bounds as a real object rather than
  as nothing, which the built-in view then treats as a real extent; at large
  result counts this surfaced as errors in the console. Advanced Maps now hands
  it the shape it already handles.

## [1.13.5]

### Fixed

- **Pointing at a track or photo no longer rebuilds its popup on every pointer
  sample.** Each pointer position was rebuilding the note popup once per
  overlapping layer, for the feature that was already showing — measured at 508
  rebuilds and 1.9 seconds of work for one sweep along a single track, about 90%
  of everything that pointer movement cost. The popup is now raised once when
  the pointer reaches a feature and left alone until it reaches another: the
  same sweep costs 9 rebuilds and 44 ms, and each pointer sample went from
  5.2 ms to 0.4 ms. As part of this the popup stays where the pointer entered a
  track instead of sliding along under the cursor, which is what a marker's own
  popup has always done.

- **A photo lying on its own track now names the photo on hover, not the
  track.** Clicking there already gave photos precedence; pointing did not, so
  the two could disagree about what was under the cursor.

## [1.13.4]

### Fixed

- **Reloading the plugin no longer leaves every map unenhanced until Obsidian
  restarts.** Advanced Maps marked the map registration it wrapped with a flag
  that could not tell its own wrapper from one a previous, already-unloaded copy
  of the plugin had left behind — so after a reload, especially alongside
  another plugin that wraps the same registration, it concluded its work was
  already done and did nothing at all: no tracks, no pin spreading, no controls,
  and no message saying so. A wrapper now says which instance installed it and
  what it replaced, so a fresh instance takes the registration back, and a
  wrapper it cannot remove stops acting.

- **Photo thumbnails switched off no longer decode or hold memory.** Turning the
  setting off only hid the layer; a large album still decoded and kept tens of
  megabytes of images for something that drew nothing. They are now released
  when the setting goes off and decoded again when it comes back on.

- **Adding a photo to a note updates that note's inline map.** Only the base map
  noticed; the inline map kept the album it was built with until the note was
  reopened. Edits that do not change which photos a note points at still cost
  nothing.

- **A background or theme change redraws an inline map exactly once**, and no
  longer draws over a refresh that is still reading its files.

- **The elevation profile is scaled to the route it draws.** A single waypoint
  with an elevation far off the route — a summit marker, a 0 m default — was
  counted in the chart's range and flattened the whole profile.

- **One backwards timestamp no longer discards the distance before it.** In a
  merged export, the ground covered leading up to an out-of-order point was
  dropped instead of counting toward the next interval, which could report a
  walk as barely moving.

- **A group of exactly fifteen pins at one spot stays on one ring** instead of
  pushing its last pin onto a ring of its own for no reason.

- **A pasted link is attributed to Google only when its host really is a Google
  domain.** `google.evil.example` and `maps.google.com.attacker.tld` were parsed
  with Google's axis order and datum.

- **Renaming a note while it is being stamped with your location no longer
  leaves it permanently ineligible** for automatic filling.

- **A failed note write after choosing a search result is reported.** It
  previously showed the success notice and lost the error.

- **The auto-fill setting's description keeps up with the coordinate property
  name** while the settings pane is open.

## [1.13.3]

### Fixed

- **Pins that share a spot now fan apart at zoom 15, where the setting has
  always said they would.** The offset is baked into the map's tiles once per
  zoom level rather than evaluated as the camera moves, so the fan opened a
  level late and grew in steps the hover card knew nothing about — a card could
  sit as much as 16 px from the pin it belonged to. The ring now opens at the
  zoom it names, widens once per level, and the card is placed at the offset the
  pin was actually drawn with.

- **An inline map no longer jumps back to its own route whenever anything
  refreshes.** Editing any track file in the vault, or changing a setting,
  reframed every open inline map — including maps in notes with nothing to do
  with the file that changed. An inline map is now framed once per route it
  draws, and never after you have moved it yourself.

- **KML files that write `lon, lat` with a space after the comma now draw.**
  Every coordinate in such a file was discarded and the whole track reported as
  having no drawable geometry.

## [1.13.2]

### Fixed

- **Maps that were already open when Advanced Maps loaded now adopt the
  enhancement exactly once.** A native initialization already in flight is
  observed rather than started again; disabling or closing the view while it
  finishes cannot install late controls or layers; and a surviving GCJ-02 or
  BD-09 map is not shifted a second time when the plugin reloads.

- **An inline map that finishes initializing after its embed has gone away is
  now destroyed.** The late native view can no longer leave a detached WebGL
  context, listeners or drawing work behind after a note closes.

- **A photo wins a click where its thumbnail and a track overlap.** The photo
  opens once even when both its thumbnail and fallback dot receive the event,
  while modifier-click still opens the image file directly. Disabling or
  reloading the plugin also removes its decoded thumbnail images from a native
  map that stays alive.

- **HEIC, HEIF and AVIF photos now follow the standard Exif item offset.** The
  offset points directly to the TIFF header, including when padding makes it
  non-zero; the bounded legacy `Exif\0\0` layout remains supported.

## [1.13.1]

### Fixed

- **A map you started following with its own button answered a click on a pin by
  replacing itself with the note.** Following opens notes in the pane the map is
  following, and that pane was only ever recorded when following was already on
  as a note opened — so a map switched on by its crosshair button, which is the
  ordinary way in, had none to open into and fell back to "the active leaf": its
  own, because clicking a map is what makes it active. The button now looks the
  pane up from the note itself, and skips the map's own pane so an embedded base
  cannot replace the note it is drawn inside either.

- **Clearing "Skip paths containing" meant "exclude nothing" rather than the
  `templates` its greyed placeholder shows.** With location filling on, that
  stamped every template note opened afterwards with the device's real position —
  the one thing the field is there to prevent. A cleared box now means what the
  placeholder says, the same way the coordinate property and the default track
  colour already did. A value you type is stored exactly as typed.

- **An inline map went blank, and said nothing, when its track file stopped
  parsing under it.** A sync client or an editor halfway through rewriting a
  `.gpx` was enough: the track, the statistics bar and the elevation profile all
  went, leaving bare tiles with no message and no way to tell that from an empty
  file. The map and the last track it drew now stay put, with the reason
  underneath them — and the moment the file parses again, the map picks it up and
  the message goes.

## [1.13.0]

### Added

- **Pins that share a spot fan apart once the map is zoomed in far enough.**
  Notes written about one address hold one coordinate between them, and pins on
  one coordinate are one pin — the top note opens and the rest cannot be
  reached at all. Measured on a real 292-pin base: 30 coordinates carried more
  than one note and the busiest carried nine. Past zoom 15 they now open onto a
  ring around the spot they share, one pin each, hoverable and clickable
  separately; below it they close back into a single pin, since at that scale
  the ring would say something untrue about where they are. The hover card
  follows the pin it belongs to rather than staying at the middle of the ring.

  Drawn on screen only, with the native marker layer's own `icon-offset`:
  nothing is written, no coordinate is moved, and the right-click menu, "Copy
  coordinates" and auto-framing all still answer what the notes actually hold.
  **Fan out pins that share a spot** (on by default) turns it off.

## [1.12.2]

A correctness and robustness release: no new settings and nothing new on
screen, but several ways a map could quietly show the wrong thing are gone.

### Fixed

- **A pasted map link that names a supported provider but carries no readable
  coordinate no longer answers a wrong one.** An 高德 or 百度 URL whose shape
  this plugin does not know used to fall through to the plain-number reader,
  which relabels whatever digits it finds as WGS-84 — on exactly those two
  providers that is a pin several hundred metres from the place the link
  meant, with nothing on screen to say so. It refuses now.
- **The place-search box can no longer show an older query's results.** A
  slower earlier request could land after a newer one and replace the list
  under the words being typed; clearing the box or taking a cached answer now
  cancels an in-flight one too. Nominatim requests are additionally spaced to
  the one-per-second its usage policy asks for, across the whole session
  rather than per open search box.
- **A track file edited while a map was reading it is no longer cached as
  though the new bytes had been read.** Obsidian updates a file's stat in
  place, so the old contents could be stamped with the new modification time
  and then trusted indefinitely. Two maps opening the same large track now
  also share one read instead of parsing it twice.
- **The track layers recover from a style change that interrupts them.** If a
  theme or background switch replaced the style midway through adding them,
  the half-installed set stayed behind and every later redraw took the
  "already there" path — the track stayed missing until something forced a
  full style reload.
- **Disabling and re-enabling the plugin on an open map view no longer leaves
  the previous instance's click and hover handlers running.** Removing a layer
  does not remove a listener scoped to it, so they woke back up as soon as the
  new instance recreated the same layers.
- **A settings change made while an inline map is still loading is no longer
  lost**, and an older redraw that finishes after a newer one can no longer
  win by finishing last.
- **Track colour, width, opacity, fit zoom and inline map height now reach
  maps that are already open**, the same way the toggles beside them already
  did, instead of waiting for an unrelated redraw.
- **A view name occupied by a table or cards view is refused rather than
  used.** _Map of the notes around this note_ says so instead of writing an
  embed line that shows the wrong view, and the "open in map" view setting no
  longer opens a table named there as the map it is not.

### Changed

- **The photo album's thumbnails are chosen by what actually fits on screen.**
  Only photos with room to render decode, four at a time; the rest stay dots
  and cost nothing. Recently-left icons stay warm for a pan back, panning away
  cancels work that has not started, and a base holding thousands of photos
  can no longer grow one map's image table without limit.

## [1.12.1]

Documentation only — `main.js` is byte-identical to 1.12.0.

### Changed

- The plugin description now names photos and counts four ways to fill a
  coordinate, rather than three. `manifest.json`, `package.json` and the
  repository's own About line all say the same sentence.
- The screenshots of the photo features are a real walk with real photos taken
  along it, instead of synthetic placeholder images, and the README's lead
  image is one of them.

## [1.12.0]

### Added

- **A geotagged photo now draws its own pin.** Link or embed a `.jpg`, `.png`,
  `.webp`, `.heic`, `.heif` or `.avif` carrying an EXIF GPS tag and it draws
  through the exact pipeline a `.gpx` already does — one point, in the note's
  own colour, on every map view whose base includes that note. Only the first
  few kilobytes of the file are ever read, and nothing about it leaves the
  vault.
- **A photo's own embedded thumbnail is its map icon.** Decoded once and
  reused, cover-fit into a rounded square with the same halo idiom the other
  track markers use, and correctly rotated for a portrait photo's EXIF
  orientation. Falls back to a plain dot until the thumbnail has decoded, or
  when the tags carried none. Zoomed out, a crowd of nearby photos thins on
  its own through MapLibre's own symbol collision detection rather than
  piling into an unreadable stack, and comes back on zooming in. **Show photos
  on the map** and **Show photo thumbnails** turn either half off.
- **An inline `![[track.gpx]]` map draws its note's photos too**, so a walk and
  the pictures taken on it are one map. The distance, ascent and elevation
  profile under it still measure the track alone.
- **Hovering a photo shows its note's card; clicking it shows the photo.** A
  note can hold a dozen photos, so opening the note would throw away which one
  was clicked — the card is the same one a track already shows on hover, and
  the pop-up carries an **Open note** row back the other way. A pop-up rather
  than a tab on purpose: clicking a map makes that map's pane the active one,
  so opening the picture in a pane would replace the map you clicked. Hold
  Ctrl/Cmd to get the image file in a new tab anyway.
- **_Set coordinates from a photo_** reads the same tag straight into a note's
  coordinate property, for a note that should carry its own coordinate rather
  than only draw the photo's.
- **Photo coordinate system** setting, default **Auto**: EXIF GPS coordinates
  are WGS-84 by specification, and Auto believes a photo's own `GPSMapDatum`
  tag when it states GCJ-02, falling back to WGS-84 otherwise — measured
  against a real phone's export rather than assumed.

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

[Unreleased]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.13.6...HEAD
[1.13.6]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.13.5...1.13.6
[1.13.5]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.13.4...1.13.5
[1.13.4]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.13.3...1.13.4
[1.13.3]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.13.2...1.13.3
[1.13.2]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.13.1...1.13.2
[1.13.1]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.13.0...1.13.1
[1.13.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.12.2...1.13.0
[1.12.2]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.12.1...1.12.2
[1.12.1]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.12.0...1.12.1
[1.12.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.11.0...1.12.0
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
