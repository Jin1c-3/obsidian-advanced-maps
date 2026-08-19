## 1. The arithmetic

- [x] 1.1 Add `src/measure.ts` holding cumulative distances over WGS-84 points, and the total the readout shows
- [x] 1.2 Build the features and the labels in one pass off one projected, unwrapped path, so a measurement crossing the 180th meridian cannot put a label a world away from its segment
- [x] 1.3 Take the projection as an argument rather than a datum, so the module has no opinion about the background
- [x] 1.4 Draw the pointer's leg as its own feature, and count it into the live label but never into the readout

## 2. The tool on one map

- [x] 2.1 Add `src/measure-tool.ts`: one tape per MapLibre map, created with it and disposed with it
- [x] 2.2 Give it its own source and three layers in `layers.ts`, added with no `before` so the tape draws over everything, and removed layers-then-source
- [x] 2.3 Resolve the tape's colours through the theme when it is taken out, rather than at import
- [x] 2.4 Position DOM labels inside the canvas container, moved on every camera frame, and flipped below a vertex near the top edge
- [x] 2.5 Add the readout as a MapLibre control in the free bottom-left corner, with undo and done beside the figure
- [x] 2.6 Coalesce pointer-driven redraws to one per animation frame
- [x] 2.7 Bind Escape and Backspace to the map's own canvas container, and leave every other key alone
- [x] 2.8 Add `MapEventBindings.dom()`, so a DOM listener on a map's canvas is torn down by the same call as its MapLibre listeners

## 3. What it takes from the map, and gives back

- [x] 3.1 Add the ruler control beside zoom-to-fit and follow, generalizing the follow button's pressed state into a shared toggle control
- [x] 3.2 Withhold this plugin's own `open()` and `hover()` while the tape is out
- [x] 3.3 Withhold the native popup through the existing `showPopup` wrapper, and the native pin's file opening through the existing `onOpenFile` wrapper
- [x] 3.4 Disable the double-click zoom while measuring, and restore it only if it was enabled; declare `doubleClickZoom` with provenance in `src/types/obsidian-internals.d.ts`
- [x] 3.5 Redraw the tape wherever the tiles move under what was drawn — the three places `locate.replaceDot()` is already called — and after a style swap, beside the tracks in `sync()`
- [x] 3.6 Dispose the tape from both `destroyMap` and `detach`, before the controls are removed

## 4. Proof

- [x] 4.1 Cover the arithmetic and the drawing model in `tests/measure.test.ts`, including the antimeridian and both mainland datums, and add `src/measure.ts` to the coverage gate
- [x] 4.2 Cover the tool in `tests/measure-tool.test.ts` against a fake map: what it claims, what it hands back, that every `on` is paired, and that a datum change redraws the same places
- [x] 4.3 Update the control count in `tests/track-layer.test.ts`, which asserts what this plugin adds to a map
- [x] 4.4 Verify on a live Bases map through the Obsidian CLI: the ruler button, the crosshair over a pin, three real clicks, the labels landing on their own pixels, a double click placing two points without zooming, and a clean teardown with no errors captured

## 5. Documentation

- [x] 5.1 Add **Measure a distance** to the navigation page in both locales, with the figure, and say what it does not measure
- [x] 5.2 State the datum promise: the tape measures the real places behind shifted tiles, so switching the background does not change the answer
- [x] 5.3 Update both README guide tables and both page descriptions
- [x] 5.4 Record in ROADMAP.md why this is not the shape editor that stays out
