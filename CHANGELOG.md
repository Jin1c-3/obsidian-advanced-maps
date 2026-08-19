# Changelog

Notable changes per release. Versions follow [semver](https://semver.org/);
the tag, `manifest.json` and `versions.json` always agree — CI refuses a release
where they do not.

## [1.18.2]

### Fixed

- **The measuring total is no longer hidden behind Obsidian's own buttons.** On
  Android the app's navigation bar sits across the bottom of the map, over the
  corner the readout used, so the one number the tape exists to produce was half
  covered by a row of app buttons. It now opens from the ruler itself — space
  this plugin already owns, on every platform, and where you were already
  looking when you pressed it.

### Changed

- **The ruler folds the readout away and back.** Press it once to start
  measuring, as before. Press it again and the readout folds away with the
  measurement still running: the points, the line and the distances stay on the
  map, and further clicks still place points. Press it once more and it returns,
  showing what you have measured by then rather than what it said when it went
  away. ✕ and **Escape** are what end a measurement now.

- **You can switch the follow and measure buttons off.** Settings → **Map
  buttons**, both on to begin with, so nothing changes until you turn one off.
  A switch reaches every map, including the ones already open, and switching it
  back on brings the button back. A map that was following stops when the button
  that would have stopped it goes. Zoom-to-fit has no switch — it is the only
  way back to the whole collection once the camera has wandered. **New maps
  follow the active note** moves onto the same page, under the switch it
  depends on, keeping its name and its value.

- **The settings pane says less.** Every description and page introduction is
  shorter, in both languages, and rows whose names had grown into sentences are
  named plainly: **Base file path** → **Base file**, **Enable location** →
  **Use device location**, **Skip paths containing** → **Skip these folders**,
  **Shallowest / Deepest level in the pack** → **Lowest / Highest zoom level**,
  **Track property prefix** → **Property prefix**, **Show photos on the map** →
  **Show photos**, **Fan out pins that share a spot** → **Fan out overlapping
  pins**, and each track figure from "Distance property" to "Distance". No
  setting changed what it holds or what it does.

- **Track properties is nine rows instead of eighteen.** Each figure's name box
  and its switch now share one row, and the box greys out while the switch is
  off instead of disappearing — so it still shows what that figure would be
  called if you turned it back on.

- **Skip these folders is a list you pick from.** Each row offers your vault's
  own folders as you type, the way the core Templates plugin's folder row does,
  with add and delete instead of one comma-separated box. Your existing list is
  read unchanged and arrives as the rows it always was. One thing does change:
  emptying the list now means nothing is skipped, where clearing the old box put
  `templates` back. Delete every row only if you mean template notes to be
  stamped along with everything else.

## [1.18.1]

### Changed

- **The measuring tape now takes the point you are pointing at.** Bring the
  pointer within a short distance of something already on the map — a note's
  pin, a track's waypoint or its start and end pins, a photo's position, or a
  point you placed earlier in this same measurement — and a ring appears on it.
  Click, and the point lands on that thing's own coordinate rather than on the
  pixel you managed to hit.

  What that buys is a measurement that is exact rather than approximately aimed.
  A pixel is worth about 4 m at zoom 15 and about 33 m at zoom 12, so a small
  miss at each end used to be a hundred metres the readout stated to the metre
  without admitting to. "How far is this note from that photo" is now the
  distance between the two coordinates themselves, on a mainland background as
  much as anywhere else, and a route can be closed exactly on the place it
  started.

  The ring is shown before the click that takes it, including before the first
  point of a measurement exists, so nothing moves without saying so first. Hold
  **Alt** while pointing and clicking to ignore all of it and measure the bare
  ground. The point you placed last is never offered, since a leg from a point
  to itself measures nothing, and a route or an area boundary is never offered
  either — a drawn line is simplified for drawing, so its vertices are not the
  coordinates any file recorded.

- **You now choose which figures Write track statistics writes.** Settings →
  **Tracks** → **Track properties** has a switch per figure, all of them on to
  begin with, so nothing changes until you turn one off. A walking log can keep
  distance and start time and leave the other seven out of every note it
  touches, instead of taking all nine into the note, the property autocomplete
  and every base's column list.

  A figure that is off is not written — and not removed either. The command
  simply stops reaching that name, exactly as renaming a figure has always left
  the property under its old name where it was. Turning a figure off is a
  decision about the next write, not permission to delete what a note already
  carries.

  A figure that is off also cannot collide: the checks that make the command
  refuse rather than overwrite now consider only the figures being written. With
  every figure off there is nothing to write, and the command says so rather
  than reporting that it wrote nothing. Settings written before this existed
  read as every figure on, which is what those vaults have been doing all along.

## [1.18.0]

### Added

- **A map can now tell you how far one place is from another.** Route statistics
  measured a file that already existed; there was nothing for a distance you want
  to know once, between two places nobody has written down.

  Press the ruler beside zoom-to-fit and follow, and the map becomes a measuring
  surface. Click to drop a point; every point after the first carries the
  distance from where you started, a dashed leg follows the pointer with the
  running total, and the readout in the bottom-left corner shows what you have
  actually placed. Take the last point back with ↺ or **Backspace**, and put the
  tape away with ✕, **Escape**, or the ruler again.

  What it measures is the ground between the places you clicked, not the offset
  copies a mainland background draws them at — a few hundred metres per point, on
  every map whose tiles are in GCJ-02 or BD-09. Switch the background under a
  measurement and the points move to where the new tiles put them while the
  figure stays the same. A measurement across the 180th meridian is the short way
  round, and its labels stay on the segments they belong to.

  While the tape is out, a click belongs to it: clicking a pin adds a point
  rather than opening that note, no popup covers the ground you are measuring
  across, and a double-click places two points instead of zooming. All of that
  comes back the moment you stop. Nothing is written to a note, to your settings
  or to the base file, and the measurement is gone as soon as you put it away.

  Base map views only — an inline `![[route.gpx]]` map already has its own
  distance under it. The figure is great-circle distance between your points,
  which is not the distance along a road: for that, draw the route as a track and
  read its statistics.

- **A Plus Code pasted into "Set coordinates from a map link" now reads.** The
  code Google Maps shows under every place, and the `plus.codes` links people
  share, were the one common way of writing a location this plugin could not
  take: `8FVC9G8F+6W` on its own, in the middle of a sentence, or as a link all
  work now.

  Decoded on your machine with no request to anyone, and read as WGS-84 —
  including inside China, where a Google or Apple _link_ is deliberately treated
  as GCJ-02 instead. That is not an oversight in either direction: a provider's
  URL is one company's output, while an Open Location Code is a specification
  whose maintainer states the datum. If a code you have came off a map that draws
  China shifted, the dialog's coordinate-system dropdown still overrides it, as
  it does for every other input.

  Two kinds of code are legal and still refused, with the reason said out loud
  rather than reported as unreadable text: a short code such as `9G8F+6W`, which
  has dropped the digits saying where in the world it is, and a padded one such
  as `8FVC0000+`, which names a region kilometres across rather than a place.

## [1.17.2]

### Fixed

- **A route written as one multi-part path is now measured.** A file whose track
  is a single multi-line geometry — which is what a merged export usually is —
  drew its line, its direction arrows and its start and end markers, framed the
  map on it correctly, and then reported nothing at all: no distance, no ascent,
  no elapsed time, so no statistics strip, no elevation profile, no figures on
  hover, and **Write track statistics** answering that there was nothing to
  measure. Every path a file holds is now walked, including paths inside a
  geometry collection. The gap between one path and the next is still not
  counted as ground travelled, and an area still contributes nothing — a ring is
  a boundary, not a route.

- **Places import from a multi-point placemark.** A placemark holding several
  points is several places sharing one name; it used to import as none.

- **A GPX or TCX file whose tags carry a namespace prefix now reads.** Both
  spellings are equally valid XML, and the prefixed one is what you get when a
  track is pulled out of a larger document — it was reported as a file that
  could not be read. KML already handled this; the other two readers now do too.

- **Pointing at a waypoint shows that waypoint.** Because a waypoint carries no
  role of its own, a file's route line and all of its waypoints looked like one
  and the same thing to the popup: whichever you pointed at first kept the card,
  and moving from the line onto a waypoint, or between two waypoints, changed
  nothing on screen until the pointer left the route altogether.

- **A map link whose first coordinate parameter is empty is no longer read as
  having no coordinate.** `?location=&latlng=39.9,116.4` names a place perfectly
  clearly; the reader stopped at the blank parameter and reported that the link
  held nothing.

- **The built-in locate button is handed back exactly as it was found.** The
  method this plugin wraps to keep the blue dot aligned with a Chinese basemap
  was removed rather than restored on the way out. Where the built-in view
  defines it in the shape this now covers, the button would have stopped
  working — and stayed broken after Advanced Maps was disabled or uninstalled.

- **An inline map no longer keeps showing the previous version of a track you
  have just edited.** Two refreshes arriving together — a settings change and a
  file change, say — could leave the map redrawing the older of the two, with
  the older statistics under it, until something unrelated refreshed it again.

- **Dragging a track slider no longer redraws every open map on every step.**
  Line width, line opacity, maximum fit zoom and inline height each rebuilt the
  full collection in every open base map and inline map per step of the drag;
  they now wait for the drag to settle, as the offline-basemap fields already
  did.

- **Pointing at a photo on an inline map no longer reloads it.** The preview
  rebuilt itself — resolving the file and fetching the photo again at full size
  — on every pointer sample, dozens of times a second, for a photo that had not
  changed. Building thumbnails also asked the theme for its colours once per
  photo rather than once per pass.

## [1.17.1]

### Added

- **The settings pane now opens with the guide and the repository.** Its first
  row is two links: the user guide, in the language the pane is already in, and
  the repository this plugin is built from. The guide became a website in this
  same release, and the place you are most likely to want it is the place you
  were standing when a setting stopped explaining itself.

  Neither line is a setting, so neither answers the settings search — a row that
  changes nothing has no business among the results for one that does.

### Changed

- **The user guide is now a website**, at
  <https://jin1c-3.github.io/obsidian-advanced-maps/>, in English and Simplified
  Chinese with a language switcher, a sidebar, and a search that runs in the
  browser rather than on a server. It is built from the same Markdown that lives
  in this repository, so the guide has not moved somewhere you cannot read it —
  `docs/guide/` is still the source, and the site is a second rendering of it.

  The guide's files did move within the repository: `docs/guide/en/` and
  `docs/guide/zh-cn/` replace the `page.md` / `page.zh-CN.md` pairs, and the
  figures now live in `docs/images/`. A link to an old path no longer resolves.

- **Install instructions now describe installing from inside Obsidian** —
  Settings → Community plugins, turn off Restricted mode, Browse, search
  _Advanced Maps_, Install, Enable — and link the plugin's page in the community
  store. Copying release files by hand and installing through BRAT are still
  documented, as the way to run a build the store does not have yet.

- **Every figure was recaptured against an English interface**, from a demo
  vault built out of OpenStreetMap landmarks, routed paths, and real elevation,
  so one set of pictures serves both locales.

## [1.17.0]

### Added

- **A folder of map tiles already on your disk can be the background of every
  map.** Everything else this plugin draws already worked with no network — the
  notes, the routes, the photos and their thumbnails are files in your vault —
  and the ground under them did not. Close the lid on a plane and the tracks
  were still there over a blank grey rectangle.

  **Settings → Offline basemap** takes the path your tiles are addressed by:
  `/home/you/tiles/{z}/{x}/{y}.png`, absolute or relative to the vault, `{-y}`
  included for packs laid out in TMS row order. Every map draws it, inline
  `![[route.gpx]]` maps included, and no tile request leaves the machine.

  Two more rows say which levels the pack covers, because each end fails its own
  way. Past the deepest one the map keeps drawing, magnifying the tiles you have
  rather than issuing a failed read for every tile that is not there. Below the
  shallowest, the camera stops at the edge of the pack rather than going blank.

  A path rather than a URL, on purpose: the prefix a URL needs is rebuilt every
  time Obsidian starts, so a hand-typed one works until the next restart. This
  resolves it as each map is built.

  Any map view can decline, from the **Background** section of its own options
  where its background is configured. Nothing overwrites what you configured
  there — the basemap is substituted as the map is built — so switching it off
  brings that background straight back, and clearing the setting returns every
  map at once.

  Nothing is downloaded: bulk-fetching a provider's tiles is theirs to permit,
  not this plugin's to do on your behalf. The pack is only ever read. A
  single-file `.mbtiles` or `.pmtiles` still needs a hook into a map library
  this plugin does not bundle; unpack it into a directory tree and it works.
  Measured on desktop; mobile reaches local files another way and is untested.

## [1.16.0]

### Added

- **A file of saved places can become notes, and the places a Base matched can
  become a file.** A Google My Maps export or a phone's saved-restaurants list
  drew as a hundred circles owned by whichever note linked it, and that was the
  end of them — not rows, no properties, nothing a filter or a formula could
  reach. The way back out did not exist at all.

  Right-click a `.kml`, `.gpx` or `.geojson` and choose **Import places as
  notes…**. The dialog says how many places the file holds and asks where they
  go; each one becomes a note carrying its coordinate in your coordinate
  property, named after the placemark, with the placemark's description as its
  body. Nothing existing is overwritten — a name already taken gets a suffix —
  and everything lands in the one folder you named, so deleting that folder
  undoes the import.

  Right-click a Base map and choose **Export places…** for the other direction:
  every place on that map as GPX waypoints, KML placemarks or CSV rows. Places
  are named by the note's file name or by any property the Base displays, which
  is what makes an export readable when your notes are named `20250405162700`.
  The file is written into your vault at a path you confirm, and a path already
  taken blocks the write rather than replacing what is there.

  Exported coordinates are the notes' own WGS-84 values, never the shifted
  positions the markers were drawn at, so the same Base exported over Amap and
  over OpenStreetMap gives identical files. A KML `<description>` and a GPX
  `<desc>` are now read where they were previously discarded, and markup in one
  arrives in the note as the text it renders as rather than as markup.

## [1.15.0]

### Added

- **The popup on a Base map now says what you are pointing at.** Hovering a
  track there opened the note's own card and told you nothing about which of its
  tracks you were on; a waypoint's name and a photo's thumbnail showed on an
  inline `![[track.gpx]]` embed and nowhere else.

  That card gains one row. Point at a route and it reports **that one file's**
  distance, climb and elapsed time, labelled with the file's own name — so a
  note holding a morning hike and an afternoon ride reports each separately
  instead of summing them. Point at a named waypoint and it says the name, under
  the same **Show track markers** setting that governs the markers. Point at a
  photo and it shows the photo. An area adds nothing, because a boundary is not
  a distance travelled.

  Only figures the file recorded appear, never a zero standing in for a figure
  never written, and the numbers are measured on the file's own WGS-84 data — so
  a map drawn on Chinese tiles reports the same distance as the embed does. The
  full set and the elevation profile stay inline, where there is room for them.
  A note whose displayed properties are all empty still raises no popup at all;
  that is the built-in map's rule for pins and it is left alone.

- **You can name the statistics columns yourself.** **Write track statistics to
  properties** took its names from one prefix, so a vault written in Chinese got
  a column headed `track-distance-km` beside columns called `日期` and `地点` —
  and renaming the property by hand only lasted until the command ran again.

  Settings → **Tracks** → **Track properties** now holds the prefix and one box
  per figure. What you type in a box is the whole property name, prefix left out:
  `距离`, not `track-距离`. Leave a box empty — as all nine are by default — and
  that figure keeps the prefixed name the box shows you, so nothing changes for a
  vault that ignores this. The command still touches only the nine names it
  resolves to, and now refuses when two figures would share one name, the same
  way it already refuses to overwrite the coordinate or place property.

  Renaming a figure does not rename what is already in your notes: the property
  written under the old name stays until you remove it.

### Changed

- **The settings are arranged into pages.** The pane was one scroll of thirty-odd
  rows under eight headings; looking at the track knobs meant scrolling past
  geocoding. It now opens on eight entries — Coordinate system, Open in map, Open
  in external map, Place search, Location, Pins, Tracks, Photos — and each opens a
  page holding that topic's rows and its explanation.

  An entry states what it is set to, so the coordinate system, the configured
  base, the search source, the number of external map apps switched on, and
  whether location, pins and photos are on are all readable without opening
  anything. Every row is still found by the settings search, which reaches inside
  the pages. No setting changed its name, default, stored value, or effect: an
  upgrading vault keeps everything it had configured.

## [1.14.0]

### Added

- **A note you already wrote can be placed from the map.** The right-click menu
  could create a note at the spot you clicked, but not put that spot into a note
  that already existed — which meant copying the coordinate, finding the note,
  and pasting it into the properties by hand. **Set a note's coordinates here**
  now opens a fuzzy note picker and writes the clicked coordinate into whichever
  note you choose.

  Each row in the picker shows the note's folder and, when it already has a
  coordinate, the value it holds, so a near-miss on a name is visible before it
  is chosen rather than after. Templates are left out of the list — read from the
  folder the core **Templates** plugin names, since a coordinate written into a
  template would go into every note stamped from it afterwards. Picking a note
  with no coordinate writes straight away; picking one that already has a
  coordinate shows the old value and the new one and asks, because a property has
  no undo. Only the coordinate property is written, and the coordinate is the
  same one the menu's other entries use — converted out of the basemap's datum
  and back into longitude range exactly once.

- **Track statistics can be written into a note's properties.** The numbers under
  an inline map existed only in that embed, where no Base could sort, filter or
  total them. **Write track statistics to properties** measures the track files
  the current note links and writes distance, ascent, descent, elevation range,
  elapsed and moving time, pace and start time into that note's frontmatter as
  numbers — `track-distance-km: 13.62`, not `"13.6 km"`, because a formatted
  string sorts 10 km before 9 km. The unit is stated in each property name, since
  a bare number in frontmatter is otherwise unlabelled forever.

  Only what a file recorded is written: a GeoJSON route with no elevation and no
  timestamps leaves one property, a GPX from a watch leaves nine, and a figure
  with nothing behind it is removed rather than left stale. Property names come
  from the new **Track property prefix** setting, `track` by default, and the
  command reads, writes and removes nothing outside that prefix — if the prefix
  would collide with the coordinate or place property it refuses rather than
  overwrite. It runs when invoked and at no other time; a track file edited
  afterwards does not rewrite the notes that link it.

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

### Fixed

- **A route that crosses the 180th meridian is drawn where it is.** A file whose
  positions run east past 180° and continue as negative longitudes was drawn as
  a line straight back across every other continent, with its arrows pointing
  the wrong way and its start and end markers pushed to opposite screen edges —
  and the camera fitted the whole globe, because a 166 km track off Fiji was
  measured as 359° wide. Such a route now draws as the one short path it is, and
  automatic framing covers the route rather than the planet. The figures under an
  inline map never had this problem and are unchanged.

- **A coordinate read from a map panned across that meridian is in range.**
  **Copy coordinates**, **New note here**, and the external-map links took the
  longitude the camera had counted past 180°, so a place a note should record as
  `-179.5` was handed over as `180.5`. All three now give the ordinary value.
  This was reachable before by panning; the framing fix above makes the camera go
  there on its own, so it is fixed alongside.

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

[Unreleased]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.18.2...HEAD
[1.18.2]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.18.1...1.18.2
[1.18.1]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.18.0...1.18.1
[1.18.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.17.2...1.18.0
[1.17.2]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.17.1...1.17.2
[1.17.1]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.17.0...1.17.1
[1.17.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.16.0...1.17.0
[1.16.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.15.0...1.16.0
[1.15.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.14.0...1.15.0
[1.14.0]: https://github.com/Jin1c-3/obsidian-advanced-maps/compare/1.13.6...1.14.0
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
