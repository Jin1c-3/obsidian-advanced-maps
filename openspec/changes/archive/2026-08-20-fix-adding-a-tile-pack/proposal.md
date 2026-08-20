## Why

`Add tile pack` does nothing. On the desktop and on a phone alike, the button
writes a row that is discarded on its way into settings, so the reader is
returned to the same empty list — and 1.18.3's whole point, several named packs
picked from the map, is unreachable for anyone who did not have a pack
configured before the upgrade.

The cause is one reader used for two questions. `tilePacks()` answers "which
packs can a map be pointed at", so it drops a row with no name; the settings
pane stored its answer, and a row a keystroke old has no name yet. The list this
already existed for — the automatic-fill skip list, whose `exclusionRows` and
`excludedFragments` are exactly this split — was not the model the pack list
followed.

## What Changes

- The rows the settings pane draws and stores are the rows the reader has, blanks
  included; the packs a map can be pointed at stay the named, unique ones.
- A row that cannot be one of those packs says why where it is entered — no name,
  or a name another row already has — beside the template check that was already
  said there.
- Deleting the pack the default names clears the default, the way renaming one
  already carried it.
- A zoom level box emptied to type a new number into keeps the level it had.
  `Number('')` is 0, and 0 as a deepest level is the whole world in one tile.
- The skip list can be added to after the reader has emptied it: one blank row is
  now representable, where it was stored as no rows at all.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `offline-basemap`: the requirement that several packs are configurable states
  what a row still being filled in is, and reports an unusable row's name the way
  it already reports an unusable template; a stored default follows the pack it
  names out of the list.
- `maintainer-workflow`: the settings requirement states that a row a reader adds
  to a list stays until they fill it in or remove it, which is the invariant both
  dead buttons broke.

## Impact

- `src/basemap.ts` — `packRows` and `packProblem` beside `tilePacks`.
- `src/settings.ts` — the pack list reads, writes and reports rows; `typedLevel`
  and `storedExclusions` as the two round trips that were losing a value.
- `src/i18n.ts` — two messages per locale.
- No stored-settings migration: a blank row is new in `data.json` and every
  reader outside the pane already filters it out.
