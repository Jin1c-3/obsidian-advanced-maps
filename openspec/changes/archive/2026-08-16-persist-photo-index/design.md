## Context

See proposal.md — Why for the measurements.

Three properties of the existing code decide most of this design:

- `PhotoExif` already keeps `datum` as the verbatim `GPSMapDatum` string rather
  than as an applied transform, and `photoTrack()` applies the datum policy
  afterwards. A persisted record can therefore be a projection of `PhotoExif`
  and stay independent of the `photoDatum` setting.
- `TrackRecord.photo.thumbnail` holds raw bytes, and thumbnail decoding is
  already bounded separately by `PHOTO_ICON_MAX`. The expensive half of a photo
  record is the half the map rarely needs.
- `TrackCache` is already keyed by immutable file state with newest-request-wins
  and generation counters. A persistent layer belongs behind that seam, not
  beside it.

This change composes with `bound-large-map-loads`: that change bounds how much
uncached reading happens at once, this one reduces how much uncached reading
there is. Neither depends on the other landing first.

## Goals / Non-Goals

**Goals:**

- A warm start places photo points without reading photo files.
- A photo with no GPS is learned once, not once per session.
- Wrong pins remain impossible: an entry is used only while it still describes
  its file.
- The index can be deleted at any moment with no effect but speed.

**Non-Goals:**

- Caching thumbnail bytes. See D4.
- Indexing photos the vault has never surfaced to a map. The index is a record of
  work done, not a background scanner.
- Caching track files. They are few and cheap; extending the same store to them
  later is possible but not part of this.
- Sharing the index between devices as a feature. If it happens to sync, per-entry
  validation makes it harmless, but nothing here depends on it.

## Decisions

### D1 — One JSON file in the plugin's own data directory

Not `data.json`, and not IndexedDB.

_Not `data.json`:_ settings are declarative and go through a typed update seam;
routing a megabyte-scale derived index through it would put non-settings inside
the settings contract and rewrite the index on every unrelated setting change.

_Not IndexedDB:_ it is never synced and scales better, but it adds an async
storage layer with its own versioning and migration story, and has no precedent
in this codebase. At the shape this turned out to have — 164 bytes per entry, so
1.99 MB for the 12,107-photo library it was measured on — a single JSON parse is
a few milliseconds.

_Trade-off accepted:_ a separate plugin file may be carried by plugin-data sync.
Because every entry is validated against its file before use (D2), a synced or
otherwise foreign index can waste bytes but cannot produce a wrong point.

### D2 — Entry identity is path plus size plus mtime

An entry is trusted only when the current `TFile` reports the same path, size,
and mtime the entry recorded.

_Why not a content hash:_ computing one means reading the file, which is the cost
this change exists to avoid.

_Why size as well as mtime:_ the in-memory cache uses mtime alone, which is
sufficient within a session. Across sessions an index can meet a file restored
from backup or written by sync with a preserved mtime; size is free to store and
closes the cheapest of those holes.

### D3 — Store the raw EXIF projection, not the WGS-84 result

Persist coordinate, altitude, timestamp, verbatim `datum` string, orientation,
and a `hasThumbnail` flag — the same shape `PhotoExif` already produces, minus
the bytes.

_Why:_ today `photoDatum` is part of cache identity, so changing that setting
invalidates every photo record. Storing the pre-policy values makes a datum
change a reinterpretation of the index rather than a reason to re-read 12,000
files, and keeps the setting out of the persisted key entirely.

### D4 — Never persist thumbnail bytes

_Why:_ measured at 19.4 MB per 1,500 photos, so roughly 160 MB at 12,000 — two
orders of magnitude larger than the rest of the index, to serve a few hundred
images at a time. `PHOTO_ICON_MAX` already bounds how many thumbnails exist
decoded; a warm start therefore head-reads only the photos actually being
decoded, and that count follows the viewport rather than the result set.

`hasThumbnail` is stored so the layer can skip a read for photos known to have
none, rather than rediscovering that per session.

### D5 — Writes are debounced and coalesced; failure is silent to the map

Entries accumulate in memory and are flushed on a debounce and on unload. A write
failure is logged, not surfaced — the running session is already correct without
it.

_Alternative considered:_ write-through per entry. Rejected: a first pass over a
large album would issue thousands of writes to save work that a single flush
saves.

### D6 — A bounded entry count with least-recently-used eviction

Track a last-used stamp per entry; evict oldest first when over the bound.

_Why bounded at all:_ the index would otherwise grow with every photo any base
query has ever touched, including from vaults reorganized long ago. Eviction is
safe by construction — an evicted photo is re-derived, which is exactly today's
behavior.

_The bound is 50,000_, settled after measurement rather than up front: the
12,107-photo library wrote 1.99 MB, so 50,000 all-positive entries reach about
10 MB and 26 ms of `JSON.parse`. That is four times the largest library this was
tested against, and the parse it costs is two orders of magnitude below the file
reading it avoids.

_The stamp is day-granular in effect._ It always moves in memory, but only a
stamp already a day old marks the file dirty. Without that, a warm start that
read 12,000 unchanged entries would dirty every one of them and rewrite a 2 MB
file once per session to record nothing but the clock; eviction only has to know
which entries no recent session wanted.

### D7 — `TrackCache` waits for the index once, not per lookup

Plugin load starts the index read and keeps the promise. `TrackCache.load()`
awaits that single promise before deciding a photo is a miss.

_Why:_ treating a not-yet-loaded index as a miss would make the very first map —
the one this change exists to speed up — read every file anyway. Awaiting one
already-in-flight promise costs nothing after the first caller.

### D8 — A schema version, and any doubt means empty

The file carries a version. An unknown version, a parse failure, or a
shape-check failure discards the file and starts empty.

_Why:_ the spec makes an empty index behaviorally identical to a full one. That
makes "throw it away" always a safe answer and removes the need for migrations.

### D9 — The index is a cache, and the spec says so

This is the one design decision worth naming explicitly, because it is where a
performance cache normally turns into plugin-owned state that drifts from the
vault. The rule adopted here: **anything that would not survive deleting the
index file does not belong in it.** Coordinates derived from a photo pass that
test — the photo still holds them. A user annotation, a manual coordinate
correction, or a "photos I have hidden" list would not, and must not be added to
this store later.

The `## Requirement: The index is derivable and never authoritative` requirement
exists to keep that enforceable rather than remembered.

## Risks / Trade-offs

- **A stale entry places a pin in the wrong spot** → Per-entry identity check
  before use (D2), made normative in the spec rather than left to implementation.
- **The index file is synced between devices and arrives stale** → Same
  mitigation; worst case is wasted bytes and a re-read.
- **Warm start is still slow because thumbnails dominate** → Measured otherwise:
  thumbnail work follows `PHOTO_ICON_MAX` and the viewport, not the result count.
- **A very large vault thrashes against the entry bound** → Eviction costs a
  re-read, which is today's behavior; the bound is one named constant.
- **The cache becomes a place to stash real state later** → D9 and its spec
  requirement; any future addition must pass the delete-the-file test.
- **A first pass is still slow** → It is, and it should be. This change removes
  the repeat, not the first derivation; `bound-large-map-loads` makes that first
  pass safe rather than fast.

## Migration Plan

No migration. There is no prior on-disk format to convert, and a first run simply
finds no index. Rollback is deleting the index file, which the spec already
requires to be safe.

## Measured Result

Live, on the same 12,107-result photo base, with `bound-large-map-loads` already
in place — so the "roughly 60 seconds" in the proposal describes the state
before that change, and these numbers are what this one moves on top of it:

|                  | cold   | warm      |
| ---------------- | ------ | --------- |
| photo files read | 12,107 | **20**    |
| map fully drawn  | ~8.5 s | **1.2 s** |
| points placed    | 6,504  | 6,504     |

The 20 warm reads are the deferred thumbnails for the photos the viewport
actually selected, and 20 icons were registered against them — so a warm start
draws its thumbnails too, at a cost that follows the screen rather than the
result. Switching the photo-datum setting afterwards moved every point into the
new datum with the read count still at 20, and clearing the index from settings
left all 6,504 points on screen.

## Open Questions

- Whether track files should later share the same store. Deferrable: they are a
  small fraction of the cost, and the store's shape does not have to change to
  admit them.
