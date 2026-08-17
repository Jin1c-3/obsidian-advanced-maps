## Why

Right-clicking the map offers two things today: the native **Copy coordinates**
and **New note here**, and this plugin's **Open in external map**
(`src/track-layer.ts:382`). Every one of them assumes the note does not exist
yet, or that you want the coordinate on the clipboard to paste somewhere by
hand.

The common case is the other one. You wrote _楼外楼_ months ago with no
coordinate, you are looking straight at where it is, and there is nothing on
that menu that will put the two together. The available route is: copy the
coordinate, find the note, open it, add the property, paste. Five steps, and the
last one is a paste into YAML.

Everything the shortcut needs is already in place. The menu wrapper holds a
WGS-84 coordinate for the clicked pixel, un-shifted out of the tile datum and
normalized back into range exactly once (`src/track-layer.ts:394`).
`writeCoords()` is how four existing commands put a coordinate into a note
(`src/main.ts:851`). What is missing between them is a way to say **which note**
— this plugin has no note picker.

## What Changes

- Add **Set a note's coordinates here** to the map's own right-click menu, beside
  the items that already read that click. It opens a fuzzy note picker; choosing
  a note writes the clicked coordinate into that note's configured coordinate
  property.
- Reuse the coordinate the menu already computed rather than converting again.
  The datum shift and the meridian normalization each happen exactly once for a
  click, and both menu items read the same pair — zero conversions and two look
  identical on screen and land the pin about 500 m out.
- Leave the vault's templates out of the list, reading where they live from the
  core Templates plugin rather than from a setting of this plugin's own. A
  template is not a place, and a coordinate written into one goes into every note
  stamped from it afterwards.
- Show each candidate note's current coordinate in the picker, and confirm before
  replacing one. A note _without_ a coordinate — the case this exists for — is
  stamped with no extra step; a note that already has one names the old value and
  the new one before anything is written.
- Write through the same `processFrontMatter` seam as every other coordinate
  command, so a note gains exactly one property and nothing else in it moves.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `location-and-geocoding`: adds a requirement that a coordinate can be taken
  from a point on the map into a note that already exists — through the plugin's
  own note picker, at the clicked coordinate converted exactly once, and never
  replacing an existing coordinate without saying what it replaces.

## Impact

- `src/note-picker.ts` — new. A `FuzzySuggestModal` over the vault's notes, each
  row carrying its current coordinate, plus the small confirmation that guards a
  replacement.
- `src/track-layer.ts` — one menu item, and the clicked-coordinate computation
  extracted so the external-map items and this one cannot diverge.
- `src/main.ts` — the flow that owns the picker, the confirmation and the write;
  `writeCoords` stops being private now that the map reaches it too.
- `src/i18n.ts` — the menu item, the picker's own text, the confirmation, and
  three notices, in both locales.
- `tests/note-picker.test.ts` — new; `tests/obsidian-stub.ts` gains
  `FuzzySuggestModal` and a button on `Setting`.
- `docs/guide/coordinates-and-services.md` (+ zh), `CHANGELOG.md`, `ROADMAP.md`.
- No setting, persisted-data, dependency or manifest change. Dragging a note from
  the file explorer onto the map — the roadmap entry's second trigger — is
  deliberately not in this change; design.md records what was measured about it.
