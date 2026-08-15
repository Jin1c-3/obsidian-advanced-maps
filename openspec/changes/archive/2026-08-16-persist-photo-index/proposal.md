## Why

Parsed photo metadata lives only in memory and is discarded when the plugin
unloads, so every vault open re-reads every photo the map asks for. That is free
at the scale the cache was designed against and expensive at the scale a
photo-shaped base query reaches: a measured 12,487-result map spent roughly 60
seconds re-deriving 12,117 records that had not changed since the previous
session, and would spend it again on the next open.

Most of that work is provably wasted twice over. Of the 12,117 photos read, only
6,511 carried GPS — the remaining 5,606 were re-read on every start solely to
re-learn that they have no coordinate. And every read pulls a 64 KB head to
extract a thumbnail that the map may never display, because thumbnail decoding is
separately bounded to a few hundred images at a time.

## What Changes

- Persist the derived EXIF result per photo — coordinate, altitude, timestamp,
  the verbatim `GPSMapDatum` string, orientation, and whether a thumbnail exists —
  so a warm start draws photo points without re-reading photo files.
- Persist negative results too: a photo with no readable GPS is recorded as
  having none, so it is not re-read on every start.
- Do **not** persist thumbnail bytes. Thumbnails are re-read on demand for the
  bounded set of photos actually being decoded, keeping the stored index small
  and independent of how many photos are on screen.
- Store the raw EXIF-derived values rather than the WGS-84 result, so changing
  the photo-datum setting reinterprets the index in place instead of invalidating
  it.
- Invalidate an entry when the file it describes changes identity or content, and
  drop entries for files the vault no longer has.
- Keep the index strictly derivable: deleting it SHALL change speed only, never
  what the map shows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `photo-map-rendering`: adds requirements for a persistent, droppable index of
  derived photo metadata — what it stores, when an entry is still trustworthy,
  and that a missing or unusable index degrades to today's behavior rather than
  to a wrong map.
- `track-map-rendering`: extends the existing freshness requirement so that
  "cached by immutable file state" holds across sessions, not only within one.

## Impact

- `src/track-cache.ts` — the cache becomes warm-startable; `loadPhoto` consults
  and populates the index.
- `src/exif.ts` — the persisted record is a serializable projection of
  `PhotoExif`; the thumbnail field stays in-memory only.
- New module for index storage, load, debounced write, and eviction.
- `src/main.ts` — index load on plugin load, flush on unload, and reaction to the
  existing vault delete/rename events.
- `src/settings.ts` — a way to clear the index, and disclosure of what it stores.
- Plugin data directory gains one index file. No vault file is written, no
  setting changes meaning, and no persisted-coordinate format is introduced.
