## 1. Emulator and demo vault

- [x] 1.1 Launch the AVD and sideload a released Obsidian APK at or above the
      manifest's `minAppVersion`, then open the on-device vault
- [x] 1.2 Build a production bundle and push `main.js`, `manifest.json`, and
      `styles.css` into that vault's `.obsidian/plugins/advanced-maps/`, then
      restart the app and enable the plugin with Bases and the first-party Maps
      plugin on
- [x] 1.3 Push a synthetic `_maps-demo` set and a `.base` filtered to it, and
      confirm the map draws note markers, a track, and photo thumbnails — the
      maintainer's real vault is not opened on the emulator at any point

## 2. Measure the touch surface

- [x] 2.1 Long-press the map and record whether the native context menu opens
      and whether **Open in external map**, **Set a note's coordinates here**,
      and **Export places…** appear in it
- [x] 2.2 Record what a touch replaces each hover with: a route's popup, a
      photo's popup, a fanned-out marker in a spread ring, and the elevation
      profile's cursor
- [x] 2.3 Record what the measure tool does under touch — placing points, the
      double-click that places two, and the snap ring the pointer brings up
- [x] 2.4 Record how a `.kml`, `.gpx`, or `.geojson` file's own menu is reached
      in the mobile file explorer, which is a host menu rather than the map's
- [x] 2.5 Set an absolute offline-tiles template, then a vault-relative one, and
      record what each draws; the code resolves them by different routes, so
      both are measured rather than one inferred from the other
- [x] 2.6 Write every outcome down before any guide file is edited, so the prose
      is transcribed from a measurement rather than recalled

## 3. Figures

- [x] 3.1 Capture a Base map view in portrait, keeping the Android status bar
      and the Obsidian mobile toolbar in frame, as `docs/images/mobile-map-view.png`
- [x] 3.2 Capture the map's context menu as touch opens it, as
      `docs/images/mobile-context-menu.png`; if 2.1 found no menu, capture what
      the touch surface offers for the same task instead and name the file for
      what it shows
- [x] 3.3 Scale each capture to roughly a third of the 1600 px desktop figures
      and quantise to 256 colours, matching the other map graphics
- [x] 3.4 Compare each figure against the desktop figure of the same feature and
      confirm the software renderer drew the same icons, colours, and geometry

## 4. English guide

- [x] 4.1 Add an **On mobile** section to `getting-started.md` after Install,
      stating that the plugin runs in the mobile application and carrying the
      map-view figure with alt text
- [x] 4.2 Give the three right-click instructions in
      `coordinates-and-services.md` their touch equivalents, correct the
      `stamp-note.png` alt text that names a right-click menu, and place the
      context-menu figure beside them
- [x] 4.3 Give both right-click instructions in `places-in-and-out.md` their
      touch equivalents, keeping the file-explorer one distinct from the map one
- [x] 4.4 Rewrite the route-hover and elevation-profile-hover passages in
      `tracks-and-areas.md` to state the touch behavior or name the feature
      desktop-only
- [x] 4.5 Rewrite the photo-hover passage in `photo-maps.md` the same way
- [x] 4.6 Rewrite the measure tool's double-click and snap-ring passages and the
      spread-ring hover passage in `around-and-navigation.md` the same way
- [x] 4.7 Replace the paragraph in `offline-basemap.md` that calls mobile
      untested with the measured outcome for an absolute template and for a
      vault-relative one
- [x] 4.8 Confirm the symlink remarks in `photo-maps.md` and
      `reference-and-privacy.md` now read as one platform limit among stated
      behavior, not as the guide's only mention of mobile

## 5. Chinese guide

- [x] 5.1 Carry every passage from group 4 into `docs/guide/zh-cn/`, in the
      guide's own Chinese voice rather than a translation of the English
- [x] 5.2 Reference the same two figure files with alt text written in Chinese,
      as the existing figures do

## 6. Verification

- [x] 6.1 Reread every changed passage against the change's three requirements:
      the platform is covered on the first page with a figure, no instruction
      names a gesture the reader's device lacks, and no passage leaves a
      settleable platform claim hedged
- [x] 6.2 Confirm no passage claims speed, smoothness, or memory behavior, none
      of which an emulator may settle
- [x] 6.3 Run `node .github/scripts/check-docs-links.mjs`
- [x] 6.4 Run `npm run docs:build`
- [x] 6.5 Run `openspec validate guide-the-mobile-reader --strict`
- [x] 6.6 Run `npm run check`
- [x] 6.7 Confirm the diff touches only `docs/` and this change's artifacts —
      nothing under `src/`, `tests/`, or `website/src/`
- [x] 6.8 Remove the demo vault content from the emulator
