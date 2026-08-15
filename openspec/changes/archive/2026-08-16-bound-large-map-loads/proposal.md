## Why

A base query that returns photo files directly — the supported way to put a
whole album on a map — makes result sets two orders of magnitude larger than the
note-shaped queries the current code was measured against. A live run against a
12,487-result map view (12,117 resolved attachments, 6,511 photo points) exposed
two defects that a 1,024-result run does not reach:

- `TrackLayer.sync()` starts one read per pending attachment inside a single
  unbounded `Promise.all`. At 12,487 entries that is 12,487 simultaneous ranged
  reads. It survived on a local SSD with warm files; nothing in the code bounds
  it, so a slower volume, a colder cache, or a larger album has no safety margin.
- The native Maps view raises an uncaught `TypeError: Cannot read properties of
undefined (reading 'lng')` from its own `map.on('load')` handler. The handler
  reads `markerManager.getBounds()` and treats a non-null result as non-empty,
  but the manager publishes an empty `LngLatBounds` as soon as it has run once
  with no valid markers. A slow query makes that the state when `load` fires, so
  the native code calls `setCenter(bounds.getCenter())` on empty bounds and
  leaves the map transform's center `undefined`; every later render throws.
  Reproduced twice at 12,487 results and not at all at 1,024.

Neither defect depends on where the photos came from, so both are worth fixing
before any change to photo sourcing.

## What Changes

- Bound the number of attachment reads a single map or embed refresh runs at
  once, so a refresh's peak concurrent I/O is a function of a fixed limit rather
  than of result-set size. Cancellation, newest-revision wins, and read
  de-duplication keep their current behavior.
- Wrap `markerManager.getBounds()` on the enhanced view's own manager instance so
  that empty native bounds are reported as `null`. This makes the native
  `if (bounds)` guard behave as its author intended, suppressing the native
  `setCenter` crash without patching, forking, or reimplementing the native view.
- Apply the same bounded-concurrency treatment to the inline embed's companion
  reads, which use the same unbounded pattern on a smaller input.

No user-visible setting is added. No behavior changes on result sets small
enough that neither defect is reachable today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `track-map-rendering`: adds a requirement that a refresh's concurrent
  attachment reads are bounded independently of result-set size, alongside the
  existing caching, de-duplication, and newest-revision guarantees.
- `native-map-integration`: adds a requirement that the plugin neutralizes a
  native defect it can observably trigger, using an instance-scoped wrapper that
  restores cleanly, rather than leaving an uncaught native exception in a
  configuration the plugin makes reachable.
- `inline-track-maps`: extends the embed's asynchronous-ordering requirement to
  state that its companion reads are bounded the same way.

## Impact

- `src/track-layer.ts` — `sync()`'s pending-read fan-out; the enhancement site
  that installs and restores the `getBounds` wrapper.
- `src/embed.ts` — the companion-photo `Promise.all` fan-out.
- `src/constants.ts` — one new concurrency limit, alongside the existing
  `PHOTO_ICON_MAX` and `PHOTO_HEAD_BYTES` bounds.
- `src/types/obsidian-internals.d.ts` — provenance for `markerManager.getBounds`
  returning an empty-but-non-null bounds, since the wrapper depends on that shape.
- No dependency, setting, or persisted-data change.
