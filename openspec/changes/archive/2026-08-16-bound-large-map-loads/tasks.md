## 1. Bounded read pool

- [x] 1.1 Add the concurrency limit to `src/constants.ts` with a comment stating the unit, the rationale from design.md D3, and why it differs from `PHOTO_DECODE_CONCURRENCY`
- [x] 1.2 Add the rolling-admission helper to `src/track-cache.ts`: map an iterable under the limit, consult a caller-supplied predicate before starting each item, and resolve when every admitted read settles
- [x] 1.3 Cover the helper in `tests/`: peak concurrency never exceeds the limit, every item is still processed, results keep input order, a rejecting item does not strand the pool, and a predicate that turns false stops further starts

## 2. Map layer

- [x] 2.1 Replace the unbounded `Promise.all` in `TrackLayer.sync()` with the pool, passing a predicate that answers false once the revision moved or the layer detached
- [x] 2.2 Confirm the post-read revision and detach checks still gate the commit, so a superseded refresh that started reads cannot draw
- [x] 2.3 Test that a sync superseded partway through starts no further reads and commits nothing, and that a completed bounded sync draws the same features an unbounded one did

## 3. Inline embed

- [x] 3.1 Replace the companion-read `Promise.all` in `src/embed.ts` with the same pool and the embed's own revision predicate
- [x] 3.2 Test that tearing down an embed mid-refresh starts no further reads and draws nothing

## 4. Native empty-bounds wrapper

- [x] 4.1 Declare the `markerManager.getBounds` shape in `src/types/obsidian-internals.d.ts` with provenance: it may return an empty-but-non-null `LngLatBounds`, and the native `load` handler guards on presence rather than content
- [x] 4.2 Install an instance-scoped wrapper at the enhancement site that returns `null` for an empty native bounds, guarded by a shape check on both the member and its result
- [x] 4.3 Restore the wrapper on detach following the project's existing rule — restore a saved own property, delete an inherited one — and pair it with the rest of the view teardown
- [x] 4.4 Test against a stub marker manager: empty bounds report as absent, non-empty pass through unchanged, a missing or non-function member skips installation without raising, and detach restores the original

## 5. Verification

- [x] 5.1 Confirm `boundsOf()` needs no change, since it already discards an empty seed, and that Advanced Maps framing is unchanged for both empty and non-empty native bounds
- [x] 5.2 Run `npm run check`
- [x] 5.3 Live-verify in the test vault: a large photo-heavy base map draws its points with no `Cannot read properties of undefined (reading 'lng')` in `dev:errors`, and a small map still draws and frames as before
