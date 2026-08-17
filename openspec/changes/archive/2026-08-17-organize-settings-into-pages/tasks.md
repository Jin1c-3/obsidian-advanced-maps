## 1. Prove the shape before moving the pane

- [x] 1.1 Convert one group — Tracks — to `type: 'page'` behind an otherwise unchanged pane, build into the test vault, and confirm the entry opens a page holding that group's rows
- [x] 1.2 Live-verify that settings search finds a row inside the converted page by its name and by its description, and lands the reader on it (design.md, "Verify search before committing to the shape")
- [x] 1.3 Live-verify that changing a dropdown or toggle on an open page — one whose write already calls `update()` — does not throw the reader back to the root
- [x] 1.4 If either check fails, stop and narrow the change rather than shipping a pane whose rows can only be found by memory; record what was measured either way

## 2. The eight pages

- [x] 2.1 Turn the `group()` helper into the page builder: an entry named by the existing `settings.<key>.heading`, whose items are the existing `introItem` followed by the group's rows
- [x] 2.2 Convert Coordinate system, Open in map, Place search, Location, Pins and Tracks, keeping each group's rows, order, `visible` predicates and render callbacks exactly as they are
- [x] 2.3 Convert Open in external map: the intro leads, and both `type: 'list'` groups move onto the page with their drag, delete, add and empty-state affordances intact
- [x] 2.4 Convert Photos through the same builder, renaming `setting.photos` to `settings.photos.heading` and `setting.photos.desc` to `settings.photos.intro` in both locales with the text unchanged
- [x] 2.5 Confirm the root array is exactly the eight page entries and nothing else

## 3. What the entries state

- [x] 3.1 Add `displayValue` for the coordinate system, the configured base file, the number of enabled external maps, the search provider, and the on/off state of location, pins and photos, per the design's table
- [x] 3.2 Leave Tracks and every text-backed row without a `displayValue`, and state in the source why: a value shown on an entry is a value whose write can re-render the pane without taking a caret with it
- [x] 3.3 Confirm each stated value follows a change made on its page, and that nothing new calls `update()` on a keystroke

## 4. Localization

- [x] 4.1 Add the two on/off strings and the enabled-count string the entries need, to `en` and `zh`, with matching placeholders
- [x] 4.2 Carry the photos heading/intro rename through both locales, leaving every other settings string untouched

## 5. Documentation

- [x] 5.1 Add a short "where the settings live" passage to `docs/guide/reference-and-privacy.md` and its Chinese twin, naming the eight pages so a label in the guide can be found in the pane
- [x] 5.2 Check every guide passage that names a setting still directs the reader correctly, and correct the ones that do not
- [x] 5.3 Add a CHANGELOG entry under `[Unreleased]`

## 6. Verification

- [x] 6.1 Run `npm run check`
- [x] 6.2 Live-verify each of the eight pages: the rows are all present, the intro reads on the page, and the values that were configured before the upgrade are still configured after it
- [x] 6.3 Live-verify the rows that carry their own behavior — the base picker's file filter, the Amap key row swapping with the key-store dropdown, the custom map list's add/delete/reorder and its URL error message, the photo index button
- [x] 6.4 Live-verify a visual setting still refreshes an open map and an inline embed from inside its page
- [x] 6.5 Live-verify the pane on mobile-width layout, since the host renders page navigation itself
- [ ] 6.6 Capture a screenshot of the root and one page for the pull request
