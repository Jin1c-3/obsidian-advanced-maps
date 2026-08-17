## Why

On an inline `![[track.gpx]]` embed this plugin already answers "what is under
the pointer": a waypoint's own name (`src/embed.ts:529`) and a photo's own
thumbnail (`src/embed.ts:567`), both in a tooltip the embed owns. On a **base**
map view none of that shows, and the numbers for the one track being pointed at
have never shown anywhere. Hovering there raises the note's own popup instead
(`hover()`, `src/track-layer.ts:1168`), and that popup belongs to the native
manager — so the card says which note you are on and nothing about which of its
tracks, waypoints or photos.

ROADMAP.md carried this as three entries parked on one unknown: whether anything
can be added to a card `PopupManager` builds. It can. Measured against Maps 0.2.2
on Obsidian 1.13.7 in a live vault:

- `PopupManager.createPopupContent(entry, properties, displayName)`
  (`obsidian-maps/src/map/popup.ts:133`) **builds and returns** the card before
  `showPopup` hands it to `setDOMContent(…).addTo(map)`. Rows can be appended to
  the returned node, ahead of insertion, rather than fished out of the DOM after.
- It is an ordinary prototype method — `private` is a compile-time word — so
  wrapping it is the same per-instance wrap already installed over `showPopup` on
  that very object (`src/track-layer.ts:274`): an own property that shadows it,
  `delete`d on detach, the prototype's returning. Confirmed both ways, with rows
  appended reaching the live, connected DOM.
- Cost is nothing: 4.59 ms per popup bare against 4.58 ms with three rows
  appended, 100 shows each. `addTo`'s re-layout is the whole of it.
- The content node is rebuilt per show, so there is nothing to clean up and no
  element worth caching between shows.

So the "second floating tooltip beside the native card" the three entries were
stuck on is not needed, and one mechanism answers all three.

## What Changes

- Wrap `createPopupContent` per view instance, alongside the existing
  `showPopup` wrapper, and append rows describing **the feature under the
  pointer** to the card the native manager just built. Rows use the native
  `.bases-map-popup-property` shape, and the `.bases-map-popup-properties` list
  is created when a one-property note left the native builder without one.
- Give a line feature its own track identity. `amPath` is already part of
  `TrackFeatureProps` (`src/geometry.ts:213`), carried today only by photo
  Points, and `trackFile.path` is already in scope in the loop that builds
  features (`build()`, `src/track-layer.ts:899`). Stamping it on lines and their
  synthesized endpoints makes "which track" answerable without a second index
  beside `amIndex`, which points at the note.
- **Pointing at one track of a note shows that track's numbers**, not its note's
  tracks summed: distance, ascent and duration where the file supplies them, in
  one compact row labelled with the track's own name.
- **Pointing at a waypoint shows its name**, the base-map counterpart of the
  inline tooltip, under the same **Show route markers** setting that already
  governs the inline one.
- **Pointing at a photo shows its thumbnail**, from `getResourcePath` in a
  bounded `<img>` — the same source the inline tooltip uses, so no second decode
  path is introduced.
- Compute statistics from the record's **unshifted** WGS-84 features, never from
  the tile-space geometry that was drawn, and memoize the result on the
  `TrackRecord` beside its existing `projected` map so a hover never re-walks a
  file it has already measured.
- Add no setting. Each row already has an upstream gate — a track has to be
  drawn, a waypoint name obeys **Show route markers**, a photo has to have
  participated — and the rows only appear over features this plugin itself drew.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `track-map-rendering`: extends "Tracks inherit note ownership" so a note popup
  raised by pointing at an owned feature also describes **that feature** — the
  pointed track's own statistics, measured on unshifted data, and a waypoint's
  own name under the existing marker setting — and so that a drawn line carries
  the identity of the file it came from.
- `photo-map-rendering`: extends "Photo interactions preserve both photo and
  note context" so hovering a photo on a base map shows the photo itself, not
  only the note that owns it.

## Impact

- `src/track-layer.ts` — one more instance wrap; `hover()` records which feature
  it is about to raise a popup for, consumed once by that wrapper; `build()`
  passes each track's path down.
- `src/geometry.ts` — `trackFeatures` takes the source path and stamps `amPath`
  on lines and their endpoints as well as on Points.
- `src/track-cache.ts` — a memoized `stats` on `TrackRecord`, invalidated with
  the record it lives on.
- `src/popup-rows.ts` — new, small: build the native row shape, and compose the
  one-line statistics summary from the existing `formatDistance`,
  `formatElevation` and `formatDuration`.
- `src/types/obsidian-internals.d.ts` — declare `createPopupContent` and
  `collectDisplayProperties` with the provenance measured above.
- `src/i18n.ts` — row labels in both locales. `styles.css` — the bounded
  thumbnail.
- `tests/` — row composition, unshifted statistics, per-track identity, and the
  one-shot pointed-feature handoff.
- `docs/guide/tracks-and-areas.md`, `docs/guide/photo-maps.md` (+ zh for both),
  `CHANGELOG.md`, `ROADMAP.md`.
- No setting, persisted-data, dependency or manifest change. A note whose
  displayed properties are all empty still gets no popup at all — the native
  early return in `showPopup` — and this change does not force one open.
