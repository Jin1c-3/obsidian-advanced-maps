## 1. The drawer

- [x] 1.1 Give `MeasureControl` a drawer element beside its button, created on add and forgotten on remove
- [x] 1.2 Position it out of flow: the control corner is a column that stretches every group to the width of the widest, so a drawer in flow widens the native buttons above it
- [x] 1.3 Unclip the group, which clips to its rounded corners, and give the button the radius the group was providing
- [x] 1.4 Turn `MeasurePanel` into `MeasureReadout`, drawn into that drawer rather than added as a control of its own
- [x] 1.5 Have `MeasureTool` ask for the drawer per use rather than hold it, and measure on without one
- [x] 1.6 Shorten the "what to do next" hint, which now sits in a drawer rather than across a corner
- [x] 1.7 Make the button fold the drawer away and back rather than end a measurement, and give it a third accessible name for the third thing it does
- [x] 1.8 Seed a reopened readout from the points there are, and keep placing points while it is folded away

## 2. The switches

- [x] 2.1 Add `follow` and `measure` settings, both defaulting to on
- [x] 2.2 Add the **Map buttons** page, and move **New maps start following** onto it under the switch it depends on
- [x] 2.3 Reconcile a map's buttons from one function, called at map creation and again on a settings write
- [x] 2.4 Restore the canonical button order after a change, since `addControl` appends
- [x] 2.5 Put a live tape away before its button goes, and stop a following map when its button goes
- [x] 2.6 Never start a new map following where following is switched off

## 3. Proof

- [x] 3.1 Cover the drawer in `tests/measure-tool.test.ts`: opened on start, emptied and closed on stop, host element left standing, and a tape that runs with no drawer at all
- [x] 3.2 Cover the switches in `tests/track-layer.test.ts`: which buttons are added, a button switched on and off again on an open map, a following map stopped by its switch, and a new map that cannot start following
- [x] 3.3 Exercise it in a live vault, and again under mobile emulation
- [x] 3.4 Re-capture `docs/images/measure-distance.png`, which showed the readout in the corner it no longer uses
- [x] 3.5 `npm run check`
