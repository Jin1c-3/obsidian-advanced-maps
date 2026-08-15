## Why

Pointing at a track or photo on a base map rebuilds the native note popup on
every pointer sample. Measured live (jot vault, 10 tracks over a 380-row base,
403 synthetic `mousemove` samples ~2 px apart along one framed track):

|                                         | as built                      |
| --------------------------------------- | ----------------------------- |
| `hover()` calls                         | 508 (1.26 per pointer sample) |
| native `showPopup` calls                | 508                           |
| time inside `showPopup`                 | 1877.6 ms, 3.70 ms each       |
| distinct features ever under the cursor | 6                             |
| cost per pointer sample                 | 5.14 ms, ~90% of it the popup |

The work is almost entirely wasted: the popup is torn down and rebuilt for the
feature that is already showing. The breakdown also corrects the original
suspicion that Bases property evaluation was the cost — collecting the
displayed properties is 6.1 ms of the 1877.6 ms (0.012 ms per call) and
building the popup's DOM is 52.6 ms. The remaining **1818.9 ms (97%)** is
MapLibre repositioning the shared popup, because the native `showPopup` ends
in `.setLngLat(...).addTo(map)` and `Popup.addTo` on an already-added popup
removes and re-inserts it.

## What Changes

- Collapse the several layer-scoped `mousemove` deliveries of one DOM event to
  a single hover, the way `open()` already collapses clicks.
- Remember which feature the popup is currently showing and skip the rebuild
  while the pointer stays on it. Together these take the measured sweep from
  508 popup rebuilds to 1.
- The popup stops sliding along under the cursor while the pointer stays on one
  track, and stays anchored where the pointer entered that feature. This is
  the native behavior for a marker, whose popup opens on `mouseenter` at the
  marker's own coordinate, and the sliding is exactly the 3.70 ms being paid
  per sample.
- Clear the remembered feature wherever the popup can go away or the feature
  list can be rebuilt, so a legitimate popup is never suppressed.
- Settle the `restoreFocus` question in the code comments: the hover path
  deliberately keeps the native focus behavior, and the fix removes the reason
  it looked wrong — the focus move now happens once per pointed feature rather
  than once per pointer sample.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `track-map-rendering`: the hover requirement gains the observable rules that
  one pointer sample raises at most one popup, that pointing at an unchanged
  feature does not rebuild it, and where the popup is anchored.

## Impact

- `src/track-layer.ts` — `hover()`, `bindInteractions()`, and the places that
  invalidate drawn items (`draw`/`detach`) plus the `restoreFocus` comment.
- No native seam is newly wrapped and no undocumented internal is added; this
  narrows what the existing `hover()` does with events it already receives.
- Tests: `hover()` needs a live Bases map, so the repeatable proof is the
  measurement recipe recorded in the design plus a re-run of the probe.
