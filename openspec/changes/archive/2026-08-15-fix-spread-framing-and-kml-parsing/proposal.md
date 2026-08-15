## Why

Three confirmed defects make already-specified behavior untrue in ways a reader can see: pins claim to fan apart from the advertised zoom and smoothly, but the native `icon-offset` they ride on is a layout property baked per tile at an integer zoom, so the fan opens a zoom later than stated, steps at each crossing, and leaves the hover card up to 16 px away from the icon it belongs to; an inline map's camera is pulled back to its own bounds by any settings change or by a write to any cached track file, including files that map never referenced; and a KML file whose coordinate tuples are written `lon, lat` with a space after the comma is rejected whole.

## What Changes

- State the pin-spread ramp as what the renderer can actually honor — one offset per integer zoom level — and place the first visible step at the advertised start zoom, so `SPREAD.fromZoom` is the zoom the fan opens at rather than one below it.
- Derive the hover card's position from the same per-zoom step the icons were drawn with, so the card stays on its pin at every zoom instead of only at the ends of the ramp.
- Give an inline map the framing guards the base-map layer already has: re-frame only when the data it draws actually changed, and never after the reader has moved that map themselves.
- Accept whitespace around the commas inside a KML coordinate tuple, so a valid-but-loosely-written file draws instead of failing as "no drawable geometry found".
- Add regressions for the stepped ramp and card placement, for embed framing across an unrelated track write and after a user pan, and for KML tuple spacing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pin-spreading`: the zoom-dependence requirement changes from a smooth ramp to a per-zoom-level step ramp whose first step is at the configured start zoom, and interaction anchoring is tied to the rendered step rather than to the continuous camera zoom.
- `inline-track-maps`: a new requirement that inline framing is one-shot per drawn dataset and yields to reader camera movement.
- `track-map-rendering`: the format requirement gains tolerance for whitespace inside KML coordinate tuples.

## Impact

Affected implementation areas are `src/spread.ts`, `src/track-layer.ts`, `src/embed.ts`, and `src/parse.ts`, with additions to the corresponding Vitest suites and a fixture for the KML spacing case. `src/constants.ts` keeps `SPREAD.fromZoom: 15`, which now means what the English and Chinese setting text already says, so no user-facing string changes and no settings migration. No dependency, persisted-setting, or public command changes. Pins visibly fan a quarter of their radius at zoom 15, where today they do not move until zoom 16; live verification uses the configured test vault.
