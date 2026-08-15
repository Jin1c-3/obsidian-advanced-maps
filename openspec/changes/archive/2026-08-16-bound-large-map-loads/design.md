## Context

See proposal.md — Why for the two defects and how they were reproduced.

Two facts about the current code shape the approach:

- The plugin already bounds one fan-out this way. `PHOTO_DECODE_CONCURRENCY = 4`
  in `src/layers.ts` sits on a rolling `active` / `queued` / `pending` state
  machine that admits work as slots free. The read fan-out is the same problem
  one stage earlier, so it should look like its neighbour rather than introduce a
  second idiom.
- `boundsOf()` in `src/geometry.ts` already treats an empty seed as no seed
  (`seed && !seed.isEmpty()`). The plugin's own framing is therefore already
  correct for empty native bounds; only the native view's own `load` handler is
  not. That narrows the second fix to changing what the native code observes,
  with no change to how Advanced Maps frames anything.

## Goals / Non-Goals

**Goals:**

- Peak concurrent attachment reads follow a fixed limit, on both the map layer
  and the inline embed.
- The native `setCenter` crash is unreachable from any base result, without
  reimplementing native framing.
- Both fixes are observable in tests without a live Bases map.

**Non-Goals:**

- Making large result sets _fast_. Wall-clock may improve as a side effect of not
  thrashing, but this change is about bounding peak resource use, not throughput.
- Persisting parsed photo metadata across restarts. That is the separate cold-start
  problem and belongs in its own change.
- Fixing the native defect upstream. Worth reporting separately; it does not help
  installed users now, and the wrapper stays harmless if upstream fixes it.
- Any new user-facing setting.

## Decisions

### D1 — Rolling pool, not batching

Admit a new read whenever a slot frees, rather than slicing the pending set into
fixed batches and awaiting each.

_Why:_ a batch barrier makes every batch cost its slowest member. Photo head
reads vary by an order of magnitude across volumes (measured 1.3 ms/file on a
local disk vs 5.2 ms/file over `/mnt/c`), so batching would idle most slots most
of the time. Rolling admission also matches `PHOTO_DECODE_CONCURRENCY`'s existing
shape, so there is one concurrency idiom in the codebase rather than two.

_Alternative considered:_ `Promise.all` over chunks. Simpler to write, but it
gives up throughput for no bound-quality gain — the peak is identical.

### D2 — One shared helper, homed in `track-cache.ts`

Both `TrackLayer.sync()` and `TrackEmbed`'s companion read call the same small
exported helper that maps over an iterable under a limit and consults a
caller-supplied "still wanted?" predicate before starting each item.

_Why `track-cache.ts`:_ it already owns read scheduling — de-duplication,
newest-request-wins, generation counters — and both call sites already import
from it. A standalone `src/pool.ts` would add a module to the source map for one
function, against the project's habit of keeping modules role-shaped.

_Alternative considered:_ a semaphore inside `TrackCache.load()` itself. Rejected
because `load()` is also the de-duplication seam: making it queue would mean a
caller that hits a warm cache entry could still wait behind cold reads, and the
existing "cached value returns synchronously and supersedes in-flight requests"
behavior would have to be re-derived.

### D3 — The limit is 16, and it lives in `constants.ts`

_Why 16:_ reads are `fetch` on `app://` plus a bounded EXIF parse on the main
thread — cheaper per item than a JPEG decode, so a higher limit than the decode
bound of 4 is justified, but they still contend for the same main thread. At the
measured 9.4 ms serial per photo over `/mnt/c`, 16 slots put a 12,000-photo
refresh at roughly 7 s of read time, against the ~60 s observed when the
unbounded version thrashed.

_Why `constants.ts`:_ two modules consume it. `PHOTO_DECODE_CONCURRENCY` stays
where it is, next to the state machine that is its only consumer.

### D4 — Cancellation is checked per item, not per refresh

The pool asks its predicate before starting each read. `TrackLayer` answers with
its revision and detach check; `TrackEmbed` answers with its own revision.

_Why:_ the existing revision checks run after the whole `Promise.all` resolves.
With reads bounded, a superseded refresh would otherwise keep a slot busy for the
whole remaining queue before noticing it is stale. Per-item is the only
granularity that makes "stops starting further reads" true rather than nominal.

### D5 — Neutralize the native crash by wrapping `markerManager.getBounds`

On the enhanced view's own `markerManager` instance, wrap `getBounds()` to return
`null` when the native answer is present but `isEmpty()`. Install only when the
member is a function and its result is either null or exposes `isEmpty`; restore
the saved own property (or delete an inherited wrapper) on detach.

_Why this seam:_ the native handler is
`if (bounds) this.map.setCenter(bounds.getCenter())`. Its author already wrote
the correct guard; it just reads presence where it means content. Reporting empty
bounds as absent makes the existing guard do what it says, and there is no case
where `getCenter()` on empty bounds is the intended behavior.

_Why it does not disturb Advanced Maps' own framing:_ `bounds()` passes the same
accessor's result to `boundsOf()` as a seed, which already discards an empty one.
Empty and null are already equivalent on that path.

_Alternatives considered:_

- Wrap `map.setCenter` to ignore non-finite input. Rejected: far broader blast
  radius, and it would mask unrelated defects rather than fix this one.
- Pre-seed the native marker bounds so it is never empty. Rejected: invents a
  location, and would move the native camera to a fabricated place.
- Suppress the console error. Rejected: the transform's center is genuinely
  corrupted; the native camera path is skipped either way.

## Risks / Trade-offs

- **The limit is wrong for some volume** → It is one named constant with a stated
  rationale, changeable without touching the spec. The spec fixes that a limit
  exists, not its value.
- **Another plugin wraps `getBounds` too** → Follow the ownership discipline this
  codebase already applies to registration wrappers: validate the shape, save
  what was there, restore exactly it, and stand down rather than stack.
- **Upstream fixes the native guard later** → The wrapper becomes a no-op that
  converts empty to null, which the native code then also handles. Harmless; it
  can be removed on a later host-version bump.
- **Bounded reads make a small map marginally slower to first draw** → At 16
  slots a result set below the limit is unaffected, and the current measurements
  show no regression at 1,024 results.
- **The native defect is only reproducible at scale** → Tests must drive the
  wrapper directly against a stub marker manager rather than hope to reproduce
  the race, and must assert restore-on-detach.

## Migration Plan

None. No persisted data, no settings, no manifest change. Rollback is reverting
the change; nothing outlives it.

## Open Questions

- Whether 16 should be lowered on volumes where a ranged read falls back to
  `vault.readBinary`. Deferrable: it changes a constant, not the specs, the
  approach, or the task breakdown.
