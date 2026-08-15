## 1. Registration Ownership

- [x] 1.1 Add `src/registration.ts`: the stamp record (`native` + mutable owner cell), a helper that peels a stamped wrapper down to the native function while retiring the owner it finds, and an ownership test.
- [x] 1.2 Rework `patchMapsView()` to stamp with identity, recognize its own wrapper, re-take a stranger's by wrapping the recovered native factory and options, and keep `this.nativeFactory` pointing at the true native factory.
- [x] 1.3 Make the installed wrapper call through the owner cell, and have `unpatchMapsView()` clear that cell and restore only the exact function this instance installed.
- [x] 1.4 Update `__advancedMaps` in `src/types/obsidian-internals.d.ts` to the record shape with its provenance note.
- [x] 1.5 Add `tests/registration.test.ts` covering: own wrapper recognized, dead wrapper re-taken from its native, a legacy boolean stamp, and a retired wrapper behaving as a pass-through. Add `src/registration.ts` to the coverage include list.

## 2. Inline Map Lifecycle

- [x] 2.1 Give `TrackEmbed` a read-in-flight flag around `loadAll()` in `build()` and `refresh()`, and make the `style.load` handler claim its own revision and stand down while a read is in flight.
- [x] 2.2 Bind the `style.load` handler after the first draw so the initial style load is not drawn twice.
- [x] 2.3 Record the host note's resolved photo paths on load and expose the host path plus a "did that set change" test on `TrackEmbed`.
- [x] 2.4 Refresh matching embeds from `metadataCache.on('changed')` in `main.ts`, only when the resolved set moved.
- [x] 2.5 Scale the elevation profile and its `aria-label` from the plotted samples instead of `stats.minEle`/`maxEle`.

## 3. Photo Thumbnail Memory

- [x] 3.1 Skip decoding and release decoded thumbnails while `photoThumbnails` is off, in both `TrackLayer` and `TrackEmbed`, keeping the candidate list and the fallback dots intact.

## 4. Pure Logic

- [x] 4.1 `stats.ts`: keep `distSinceLastTime` across an interval whose timestamp did not advance.
- [x] 4.2 `spread.ts`: count ring capacity without losing a slot to floating-point error.
- [x] 4.3 `geolink.ts`: match Google hosts by domain shape rather than by any letters-and-dots remainder.
- [x] 4.4 Tests for the three above: a backwards timestamp folding into the next interval, `spreadSlots(15)` on one ring plus a sweep over 2..70, and look-alike vs. regional Google hosts.

## 5. Notes and Settings

- [x] 5.1 Key the automatic-fill in-flight guard on the `TFile` rather than its path.
- [x] 5.2 Report a failed note write after a search result is chosen; add the English and Chinese strings for it.
- [x] 5.3 Render the auto-fill description as a fragment with a live property span, and rewrite it when `coordsProperty` is written.

## 6. Specs and Documentation

- [x] 6.1 Add the CHANGELOG entries under Unreleased.
- [x] 6.2 `openspec validate --strict` on the change.

## 7. Verification

- [x] 7.1 `npm run check`.
- [x] 7.2 Live verification in the test vault: reload the plugin twice and confirm the registration is re-taken and maps stay enhanced; toggle thumbnails off and confirm the images are released; add a photo to a note with an inline map and confirm it appears; rename the coordinate property with the settings pane open.
