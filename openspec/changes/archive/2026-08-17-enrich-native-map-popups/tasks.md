## 1. Per-track identity on drawn geometry

- [x] 1.1 Give `trackFeatures()` in `src/geometry.ts` the source file's path and stamp `amPath` on lines and on the start/end Points synthesized for them, leaving the Point path already carried by photos untouched
- [x] 1.2 Pass `trackFile.path` from `build()` in `src/track-layer.ts`, and pass the embed's own source path from the two call sites in `src/embed.ts`
- [x] 1.3 State in a comment that the path is the cache key, so `plugin.tracks.get(path)` is how a drawn feature reaches its record — design.md D3
- [x] 1.4 Confirm the widened `hover()` dedupe key is the intended consequence, not a regression: crossing between two tracks of one note now re-raises the popup, which is what "Pointer crosses to a different feature" specifies

## 2. Statistics, measured once per record

- [x] 2.1 Add a memoized `stats` to `TrackRecord` in `src/track-cache.ts`, beside `projected`, invalidated with the record it lives on
- [x] 2.2 Measure lazily from the record's unshifted WGS-84 features and never from `projected`, with a comment naming the rule (`inline-track-maps`, "Statistics use unshifted route data")
- [x] 2.3 Confirm an area contributes nothing through the existing `hasStats` gate rather than through a special case, since `trackStats` already skips polygons

## 3. The popup seam

- [x] 3.1 Declare `createPopupContent` in `src/types/obsidian-internals.d.ts` with the provenance measured in proposal.md, including that `private` in the Maps source is compile-time only, and record the `collectDisplayProperties` early return on `showPopup` rather than declaring a member nothing calls
- [x] 3.2 Wrap `createPopupContent` on the view's `popupManager` instance through the existing `this.wrap(...)` seam, shape-checking it first and skipping the enhancement when it is absent
- [x] 3.3 Append rows to the returned node, creating the `.bases-map-popup-properties` list when a one-property note left the host without one, and never reordering or removing what the host put there
- [x] 3.4 Record the pointed feature in `hover()` immediately before calling `show`, and consume it once in the wrapper, so a native `marker-pins` hover sees nothing pending — design.md D2

## 4. What the rows say

- [x] 4.1 Add `src/popup-rows.ts`: build one native-shaped row, and compose the statistics summary from `formatDistance`, `formatElevation` and `formatDuration` so a popup and an inline strip never write a number differently
- [x] 4.2 Label the statistics row with the pointed track's own name and contribute only the figures its file supports, with no zeroes standing in for figures never recorded
- [x] 4.3 Contribute a waypoint's `amName` only while **Show route markers** is enabled, matching the inline tooltip's gate
- [x] 4.4 Contribute a photo's preview as a bounded `<img>` from `getResourcePath`, falling back to no image when the file cannot supply one — design.md D7
- [x] 4.5 Bound the preview in `styles.css` so it cannot push the rest of the card out of view

## 5. Localization

- [x] 5.1 Add the row labels to `en`
- [x] 5.2 Add the same keys to `zh`

## 6. Tests

- [x] 6.1 Cover `amPath` on lines and synthesized endpoints, and that a note linking two files yields geometry naming each file rather than the note
- [x] 6.2 Cover the statistics summary: figures present, figures absent, and that a file's numbers match what the inline strip reports for the same file
- [x] 6.3 Cover that measurement reads unshifted features by measuring the same record on a shifted system and asserting the distance is unchanged
- [x] 6.4 Cover the wrapper itself: a card built with nothing pending is exactly the host's, the wrapper is not installed over a host that builds no cards, and detach deletes it rather than shadowing it. Driving `hover()` end-to-end needs a live Bases map, so the decorated-card half is 8.2/8.4
- [x] 6.5 Cover row composition against a host card with a property list and against one without

## 7. Documentation

- [x] 7.1 Document the pointed-track statistics and the waypoint name in `docs/guide/tracks-and-areas.md` and its Chinese twin, saying plainly that these are the pointed file's numbers and that the full set stays on the inline embed
- [x] 7.2 Document the base-map photo preview in `docs/guide/photo-maps.md` and its Chinese twin
- [x] 7.3 Add a CHANGELOG entry under `[Unreleased]`
- [x] 7.4 Narrow the ROADMAP entry to whatever remains once these three ship

## 8. Verification

- [x] 8.1 Run `npm run check`
- [x] 8.2 Live-verify in the test vault: pointing at one track of a note carrying several names that track and reports its own numbers, and the note's other tracks are counted in none of them
- [x] 8.3 Live-verify on a shifted tile datum that the reported distance matches an inline embed of the same file
- [x] 8.4 Live-verify the waypoint name with route markers on and off, and the photo preview including a photo whose file was removed
- [x] 8.5 Live-verify a note with a single displayable property, and a note with none at all — the first gains a row, the second still raises no popup
- [x] 8.6 Live-verify detach: after the enhancement is removed, popups on that view are exactly what the host builds, with the wrapper's own property gone
