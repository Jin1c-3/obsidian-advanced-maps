## 1. Index store

- [x] 1.1 Define the persisted record: a serializable projection of `PhotoExif` without thumbnail bytes, plus `hasThumbnail`, the file identity (path, size, mtime), and a last-used stamp
- [x] 1.2 Add the index module: load, shape-check, versioned discard-on-doubt, in-memory map, debounced coalesced write, flush-on-unload, and LRU eviction at a bound in `src/constants.ts`
- [x] 1.3 Test the store in isolation: round-trip, unknown version starts empty, malformed JSON starts empty, a write failure does not throw, eviction respects the bound and keeps recently used entries

## 2. Cache integration

- [x] 2.1 Start the index read on plugin load and hold the promise; have `TrackCache` await it once before treating a photo as a miss
- [x] 2.2 In `loadPhoto`, consult the index first and use an entry only when path, size, and mtime all match; on a miss, read as today and record the result — including the no-GPS result
- [x] 2.3 Apply the datum policy at read time from the stored verbatim `datum`, and remove `photoDatum` from persisted-entry identity so a datum change reinterprets instead of invalidating
- [x] 2.4 Test: a warm lookup places a point without a file read; a changed mtime or size forces a re-read; a no-GPS entry is not re-read; a datum change reinterprets stored entries and reaches open maps without a file modification

## 3. Thumbnails

- [x] 3.1 Place points from index entries with no thumbnail bytes in hand, keeping every photo's fallback dot behavior unchanged
- [x] 3.2 Read a thumbnail from the file only when a photo is admitted for decoding, and skip that read entirely when the entry records no thumbnail
- [x] 3.3 Test: a photo placed from the index still gets its thumbnail when it becomes eligible, and an entry marked as having none triggers no read

## 4. Vault lifecycle

- [x] 4.1 Drop index entries on the existing delete and rename events, alongside the current in-memory invalidation
- [x] 4.2 Prune entries for paths the vault no longer has when the index loads
- [x] 4.3 Test that a deleted or renamed photo places no point from its old entry

## 5. User surface

- [x] 5.1 Add a settings action to clear the index, routed through the existing declarative settings seam
- [x] 5.2 State in the settings description and the README what the index stores and that deleting it is always safe
- [x] 5.3 Add the English and Chinese strings for both

## 6. Verification

- [x] 6.1 Confirm the delete-the-file test holds: with the index removed, every map shows the same points in the same places
- [x] 6.2 Run `npm run check`
- [x] 6.3 Live-verify in the test vault: measure a cold first pass and a subsequent warm start on the same large photo-heavy base, and confirm the warm start draws its points without re-reading the photo files
