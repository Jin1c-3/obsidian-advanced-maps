## 1. Pin Spread Ramp

- [x] 1.1 Redefine `spreadFactor()` as the whole-zoom-level ramp both consumers read: quantize the camera zoom down, map each level from `SPREAD.fromZoom` to `SPREAD.toZoom` onto `(level - fromZoom + 1) / (toZoom - fromZoom + 1)`, clamp to `[0, 1]`, and stay zero below the start zoom.
- [x] 1.2 Emit `icon-offset` as a `step` expression over those same whole levels, each dividing by the layer's `icon-size` at that level rather than at `toZoom` alone, keeping the `amSlot` match and integer slot numbers, and record next to `SPREAD` why the ramp is stepped and why `toZoom` must not exceed the marker source's `maxzoom`.
- [x] 1.3 Confirm `fanned()` needs no change beyond the shared function, and that `applySpread()`'s applied-expression memo still suppresses redundant `setLayoutProperty` calls.
- [x] 1.4 Extend `tests/spread.test.ts` for the ramp: closed below the start zoom, open at the start zoom, one value held across a whole level (15.0 and 15.9 agree), full radius at and beyond the end zoom, and a `step` expression whose stops match `spreadFactor` at every level.
- [x] 1.5 Add a card-placement regression proving the offset `fanned()` applies equals the offset the expression bakes at the same fractional zoom.

## 2. Inline Map Framing

- [x] 2.1 Add a framing signature over the embed's own dataset — track path and mtime, each host photo path and mtime, effective coordinate system, photo datum — and clear `framed` in `refresh()` only when it differs from the signature the current camera was framed for.
- [x] 2.2 Arm `userMoved` from `dragstart`/`zoomstart`/`rotatestart`/`pitchstart` inside the existing one-shot `bindInteractions()`, counting only events carrying an `originalEvent`, and return early from the frame step when it is set.
- [x] 2.3 Verify the guards sit outside the revision/`dead`/`failInPlace` paths so newest-refresh-commits and in-place failure behavior are unchanged.
- [x] 2.4 Extend `tests/embed.test.ts`: an unrelated cached-track write leaves the camera alone, a visual settings change leaves it alone, an edit to the embed's own track reframes an untouched map, and the same edit does not reframe after a user-driven camera event.

## 3. KML Coordinate Tuples

- [x] 3.1 Collapse whitespace around separators before the whitespace split in `parseKmlCoordinates()`, leaving per-tuple validation as is.
- [x] 3.2 Add `tests/parse.test.ts` cases for `lon, lat`, `lon , lat , ele`, and a trailing-comma tuple, asserting the spaced forms match the unspaced form and that unusable tuples are still skipped without fabricated coordinates.

## 4. Specs and Documentation

- [x] 4.1 Confirm the English and Chinese spread setting text is now true as written, and correct `CLAUDE.md` if any sentence there still describes a smooth ramp or a card that tracks the continuous zoom.
- [x] 4.2 Add a CHANGELOG entry for the three user-visible fixes.

## 5. Verification

- [x] 5.1 Run the focused suites during implementation, then `npm run check`, and inspect the TypeScript diff for ramp arithmetic, listener ownership, and async-order regressions.
- [x] 5.2 In `/home/ethan/Documents/Obsidian/jot`, verify on a live map: pins fan at z15 and grow at each whole level to z18, the hover card stays on its pin at fractional zooms, the marker source's `maxzoom` is at least `SPREAD.toZoom`, an inline map holds its camera across an unrelated track write and a settings change, and a spaced-tuple KML file draws.
