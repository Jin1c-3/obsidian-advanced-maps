## 1. The rule

- [x] 1.1 Add the snap candidate shape and `nearestSnap()` to `src/measure.ts`: nearest by pixel distance, within a radius, ties to the order candidates were offered
- [x] 1.2 Carry a snapped draft through `measureDrawing()` as its own feature, so the ring comes off the same projected path as the line and the labels
- [x] 1.3 Add `SNAP_PX` and the ring's layer id to `src/constants.ts`

## 2. The tape

- [x] 2.1 Gather candidates in `MeasureTool`: the tape's own points bar the last placed, and every Point rendered within the box on the native pin layer, the track point and endpoint layers, and the photo dot layer
- [x] 2.2 Take the candidate's own geometry as the point and its projected position as the rank, and cross it back to WGS-84 exactly once
- [x] 2.3 Filter absent layer ids before querying, and answer "no snap" rather than throwing on a style mid-swap
- [x] 2.4 Suppress snapping while Alt is held, on the click and on the move alike
- [x] 2.5 Track the pointer before the first point is placed, without redrawing while nothing is placed and nothing is snapped
- [x] 2.6 Draw the ring as a fourth layer on the tape's source in `layers.ts`, added over the vertices and removed with them
- [x] 2.7 Declare the box form of `queryRenderedFeatures` in `src/types/obsidian-internals.d.ts` with its provenance

## 3. Proof

- [x] 3.1 Cover `nearestSnap()` and the snapped drawing in `tests/measure.test.ts`, including the empty and out-of-range cases
- [x] 3.2 Cover the tool in `tests/measure-tool.test.ts`: a click near a rendered pin takes the pin's coordinate, on a mainland datum too; Alt takes the pixel; the ring appears and goes; the last placed point is not a candidate; a query that throws leaves the click on the pixel
- [x] 3.3 Verify on a live Bases map through the Obsidian CLI: a pin, a waypoint, a photo dot and the first vertex of the tape itself, with and without Alt

## 4. Documentation

- [x] 4.1 Say what the tape snaps to, and how to hold it off, on the navigation page in both locales
