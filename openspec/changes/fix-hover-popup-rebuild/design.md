## Context

See proposal.md — Why for the measurement and where the cost sits.

The shape that matters here: `bindInteractions()` binds a layer-scoped
`mousemove` on each of the six layers this plugin draws, every one of them
calling `hover()`, and `hover()` calls the captured native `showPopup` on every
delivery. `open()` already solves the sibling problem for clicks — it records
`ev.originalEvent` and ignores a second delivery of the same DOM event — but
its layer loop is deliberately ordered `[PHOTO, PHOTO_DOT, LINE, POINT,
ENDPOINT, ARROW]` so a photo gets first refusal, while the `mousemove` loop
walks the plain `layers` order with `LINE` first.

`this.items` is reassigned on every Bases data update (`track-layer.ts:868`),
because Bases recreates its `BasesEntry` objects and warns against holding the
old ones. Any memory of "which item is showing" keyed on an index into that
array goes stale at exactly that point.

## Goals / Non-Goals

**Goals:**

- One popup raise per pointer event, and none at all while the pointed feature
  is unchanged.
- Hover and click agree about which overlapping feature is being pointed at.
- Every path that can invalidate the memory clears it, so the failure mode of
  the fix is a redundant popup rather than a missing one.

**Non-Goals:**

- Changing how the popup looks, what it contains, or when it hides.
- Wrapping any additional native seam, or reaching into MapLibre's shared
  `Popup` instance (see Decision 3).
- Anything about the inline-map hover path in `embed.ts`, which owns its own
  lightweight tooltip and does not go through `showPopup`.

## Decisions

### 1. Two guards, not one — collapse per DOM event, then compare features

Measured projections over the same 403-sample sweep:

| guard                       | popup rebuilds left |
| --------------------------- | ------------------- |
| none (as built)             | 508                 |
| collapse per DOM event only | 403                 |
| compare features only       | 63                  |
| both                        | 1                   |

Comparing features alone leaves 63 because overlapping layers alternate — line,
arrow, line, arrow — so the "what is showing now" key flips back and forth
within a single pointer position. Collapsing per DOM event first makes the
comparison see one feature per sample, which is what takes it to 1.

The alternative of binding `mouseenter` instead of `mousemove`, the way the
native marker layer does, was rejected: six overlapping layers mean
`mouseenter` never fires when the pointer crosses from one feature to another
within the same layer, so a long track would show its neighbour's popup.

### 2. Hover precedence follows click precedence

Collapsing per DOM event makes the binding order load-bearing: whichever layer
is bound first wins the sample. Bound in the current `layers` order, a photo
sitting on its own track would hover as the track and click as the photo.
Bind `mousemove` in the same order `click` already uses so the two agree.

### 3. Do not try to move the popup instead of rebuilding it

The obvious cheaper move — keep the popup and only re-anchor it — does not
help. The native `showPopup` ends in `.setLngLat(...).addTo(map)`, and
MapLibre's `Popup.addTo` on an already-added popup removes and re-inserts it;
that repositioning is 1818.9 ms of the 1877.6 ms measured. Reaching past the
native manager to its private shared `Popup` would add an undocumented internal
to `obsidian-internals.d.ts` in exchange for the part that is already cheap.
Not calling `showPopup` is the whole win.

This is also what settles the anchoring question. The popup currently slides
along under the cursor because every sample re-anchors it at `ev.lngLat`; that
slide _is_ the 3.70 ms per sample. Pinning it where the pointer entered the
feature matches the native marker popup, which opens on `mouseenter` at the
marker's own coordinate and does not track the cursor.

### 4. Key on what the popup is showing, and clear it eagerly

The key needs the note, the role, and the photo path: two photos of one note
are different popups, and a photo dot under its own thumbnail is the same one.
Feature index plus role plus path is what the drawn features already carry.

Because the index is into `this.items`, the key is cleared wherever that array
or the map is replaced — the data update at `track-layer.ts:868`, the
map-destroyed path that already resets `handledClick`, and `detach()`. It is
also cleared on `mouseleave`, which is what already hides the popup: leaving a
feature and coming back must show the popup again. Clearing too eagerly costs
one redundant 3.70 ms rebuild; not clearing enough silently suppresses a popup
the reader asked for, so every doubtful path clears.

### 5. Leave the focus behavior alone, and say why in the comment

`restoreFocus()` is not wrapped around `hover()`, and the comment at
`track-layer.ts:556` calls that deliberate. That stays: hover is pointer-driven,
and the native marker hover does not restore focus either. What made it look
wrong was that MapLibre's focus move ran on every pointer sample; after this
change it runs once per pointed feature, which is the same rate the native
marker path produces. The comment gets the reason, not just the assertion.

## Risks / Trade-offs

- **A popup is suppressed because the memory outlived what it described** →
  every invalidation path clears it (Decision 4), and the redraw path is the
  one the spec calls out explicitly.
- **The popup no longer follows the cursor along a track** → intended and
  specified; it matches the native marker popup, and the previous behavior is
  the defect being fixed.
- **Reordering the `mousemove` bindings changes which note a hover names on
  overlapping features** → it changes it to agree with what clicking there
  already does, which is the behavior the click loop was ordered for.
- **`hover()` cannot be unit-tested — it needs a live Bases map** → the proof
  is the probe recipe below, re-run before and after.

## Verification

The measurement is repeatable from `obsidian eval` against the jot vault: open
a base's map view, wrap the layer's `hover` and its captured `origShowPopup`
with counters exactly once, frame a single track, dispatch `mousemove` on the
map canvas along the rendered line at ~2 px spacing, and read back the counts.
Note that `hover()` calls the _captured_ native `showPopup`, not
`popupManager.showPopup`, so instrumenting the manager alone counts nothing.

Expected after the change, on the same sweep: hover calls fall to one per
pointer sample, popup rebuilds fall from 508 to the number of times the pointed
feature actually changes, and per-sample cost falls from ~5.14 ms to the
MapLibre hit-testing residual of ~0.5 ms.

## Open Questions

None.
