## Why

Two problems that share one corner of the map.

**The readout was in a corner Obsidian owns.** The measuring tape put its total
in the bottom-left, chosen because nothing else was there — on the desktop.
On Android, Obsidian's own navigation bar sits over that corner, so the figure
the whole tool exists to produce was half-covered by a row of app buttons.

**Every button is always there.** A map view carries three of this plugin's
buttons whether or not the reader has ever pressed them, on top of the native
view's own four. On a phone that is a column down most of the screen, and a
reader who never measures and never follows has no way to say so.

## What Changes

- The tape's readout moves into a drawer the ruler button opens beside itself:
  out of flow, leftward, in the same raised group style, and gone again when the
  tape is put away. Nothing this plugin draws is in a corner the host may cover.
- The ruler button starts a measurement, and from then on folds that drawer away
  and back rather than ending anything. ✕ and Escape end a measurement. A drawer
  that cannot be closed is a panel.
- Add **Map buttons**, a settings page holding a switch for following and one for
  measuring. A switch off takes that button off every map already open, and a
  new map opens without it.
- **New maps follow the active note** moves onto that page, under the switch that
  decides whether the button it describes exists at all. Its key, default, and
  meaning are unchanged.
- Zoom-to-fit keeps no switch: it is the only way back to the whole collection
  once the camera has wandered.
- Switching measuring off puts a live tape away first, and switching following
  off stops a map that was following — a map left following with no button to
  press would follow forever.

## Impact

- Affected specs: `map-measuring`, `note-map-navigation`.
- Affected code: `src/layers.ts`, `src/measure-tool.ts`, `src/track-layer.ts`,
  `src/settings.ts`, `src/main.ts`, `src/i18n.ts`, `styles.css`.
- Affected docs: `docs/guide/{en,zh-cn}/around-and-navigation.md` and
  `reference-and-privacy.md`, and `docs/images/measure-distance.png`, which shows
  the readout in its old corner.
- Two new settings, both defaulting to on, so a vault that never opens the page
  keeps exactly the map it had.
