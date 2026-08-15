## 1. Baseline

- [x] 1.1 Re-run the probe from design.md — Verification against the unchanged
      plugin and record the counts, so the after-numbers have a same-session
      before to compare against

## 2. Collapse one pointer event to one hover

- [x] 2.1 Give `hover()` a same-DOM-event guard on `ev.originalEvent`, matching
      how `open()` already ignores a second delivery of one click
- [x] 2.2 Bind the layer-scoped `mousemove` handlers in the same precedence the
      `click` loop uses, so the surviving delivery is the feature a click there
      would act on, and say in the comment why the order is load-bearing

## 3. Stop rebuilding a popup that is already showing

- [x] 3.1 Record which drawn feature the popup describes — index, role, and
      photo path — when `hover()` raises it
- [x] 3.2 Return early when the pointed feature matches the recorded one, so
      the native `showPopup` is not called again
- [x] 3.3 Keep anchoring at the pointer position that raised the popup, and
      note in the comment that it no longer tracks the cursor along a track

## 4. Clear the record wherever it can go stale

- [x] 4.1 Clear it on `mouseleave`, beside the existing `hidePopup()`, so
      leaving and returning to one feature shows the popup again
- [x] 4.2 Clear it where `this.items` is reassigned on a data update, since the
      recorded index points into the array being replaced
- [x] 4.3 Clear it in the map-destroyed path and in `detach()`, beside the
      existing `handledClick` resets

## 5. Focus comment

- [x] 5.1 Extend the `restoreFocus()` comment to record why the hover path
      deliberately keeps native focus behavior and that the focus move now
      happens once per pointed feature rather than once per pointer sample

## 6. Proof and checks

- [x] 6.1 Re-run the probe on the built plugin and confirm one hover per pointer
      sample, popup rebuilds down to the number of real feature changes, and the
      per-sample cost down to the hit-testing residual
- [x] 6.2 Check the spec scenarios by hand on a live map: pointer along one
      track, photo overlapping its own track, crossing between two photos of one
      note, leaving and returning, and a redraw while a popup is showing
- [x] 6.3 Run `npm run check` and inspect the TypeScript diff
- [x] 6.4 Add the CHANGELOG entry under `[Unreleased]`
