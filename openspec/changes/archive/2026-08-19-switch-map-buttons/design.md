## Context

The three buttons this plugin adds — zoom-to-fit, follow, and the ruler — are
MapLibre controls in the native view's top-right corner, added at map creation
and removed at detach. The tape's readout was a fourth control, in the
bottom-left.

## Decisions

### The readout goes beside its button, not into another corner

The bug is not that bottom-left is the wrong corner; it is that a corner is the
wrong idea. Which corners a host leaves free is the host's business and changes
between platforms — Obsidian's mobile navigation bar takes the bottom, its
mobile header takes part of the top — and a plugin that picks one is guessing
about someone else's chrome.

The one place that is certainly free is the space this plugin's own button
already occupies, so the readout opens from it. It is also where the reader is
looking: they pressed that button to start measuring, and ✕ to stop is under
the same finger.

### The drawer is out of flow, because the corner is a stretching column

Measured on a live map: `.maplibregl-ctrl-top-right` is `display: flex` with
`flex-direction: column` and the default `align-items: normal`, which stretches
every group to the width of the widest. A drawer left in flow widened the
group, which widened the column, which stretched the native zoom, background,
zoom-to-fit and follow groups into 146-pixel bars.

`position: absolute; right: 100%` keeps the button's group 33 pixels wide and
hangs the drawer off its left edge. The drawer carries `canvas-control-group
mod-raised` itself, so it paints the same raised pill the buttons do, and
`display: none` until open — an empty box would still paint that pill.

A control group also clips: `overflow: hidden` with a 4-pixel radius, which
rounds its buttons' hover and pressed fill. A drawer hanging outside that box is
clipped away entirely — and `getBoundingClientRect` still answers with the box
it would have had, so the layout measurements said the drawer was there while
the frame showed no drawer at all. The group is unclipped, and the radius it was
providing is given to the button itself so nothing about the button changes.

### The button opens and closes the drawer; only ✕ and Escape end a measurement

A button that both started and stopped measuring left the drawer with no way to
close, and a drawer that cannot close is a panel. So the ruler is three states
rather than two: it starts a measurement when there is none, and otherwise folds
the readout away and back with the measurement still running.

The cost is that ending a measurement is one step further away when the readout
is folded — the reader opens it again and presses ✕, or presses Escape. Both the
pressed look and the labels still on the map say a measurement is out, and the
button's accessible name says which of the three things pressing it does next:
measure, hide the readout, show the readout.

Closing the drawer is not pausing. Clicks still place points, labels still
appear beside them, and a readout brought back states what is measured then
rather than what was measured when it went away — so it is seeded from the
points on reopening rather than constructed at zero.

### The tool asks for the drawer rather than holding it

`MeasureTool` takes `() => HTMLElement | null` instead of an element. The button
can be taken off the map — its setting switched off — while the tool is being
disposed, and a resolved-once element would then be a node belonging to nothing.
A tape with no drawer still measures: every distance is also on the map, beside
the point it belongs to.

### Zoom-to-fit has no switch

Following and measuring are things a reader either does or does not do.
Zoom-to-fit is the only affordance that undoes a camera — there is no menu item,
no command, and no keyboard route back to the whole collection — so switching it
off would be switching off the way back.

### One reconciliation function, called from two places

`applyControls()` adds what the settings ask for and removes what they do not,
and is what map creation calls as well as what a settings write calls. The
alternative — creating at map creation and patching on change — is two code
paths for one question, and the second one is the one nobody exercises.

Order is restored afterwards by re-appending this plugin's own groups in their
canonical order, because `addControl` appends: a button switched on after the
map opened would otherwise sit below buttons that were added before it.

### Following stops when its button goes

Following is per-map state, initialized from `followActiveNote`. Taking the
button away leaves a map that pans on every note switch with nothing to stop it,
so the switch stops it. Turning the switch back on gives the button back in its
off state rather than restoring what the map was doing: the reader's last press
of that button was on a map that no longer has it, and guessing at their intent
across the gap is worse than starting from off.

The constructor gate is the same rule for a map that opens while the switch is
off: `follow && followActiveNote`, never `followActiveNote` alone.
