## 1. One coordinate per click

- [x] 1.1 Extract the clicked pixel's WGS-84 pair out of `addExternalMapItems()` in `src/track-layer.ts` into a helper that unprojects, converts the datum and normalizes the longitude once, returning null when the map cannot answer
- [x] 1.2 Have the external-map items read that helper, so the existing behaviour is unchanged and there is one place the conversion count can be checked

## 2. The menu item

- [x] 2.1 Add the item to the same `Menu.forEvent(ev)` the external entries use, with no section of its own so it sits with **New note here**, and only when the helper produced a coordinate
- [x] 2.2 Hand the captured pair to the plugin rather than recomputing it in the click handler, and say in the source why the pixel is gone by then

## 3. The picker and the guard

- [x] 3.1 Add `src/note-picker.ts`: a `FuzzySuggestModal<TFile>` over `vault.getMarkdownFiles()`, matching on the note's path so a folder narrows the search
- [x] 3.2 Render each row as the note's name, its folder, and the value its coordinate property already holds, read from the metadata cache per rendered row rather than per note
- [x] 3.3 Add the confirmation used when a note already holds a coordinate: it names the note, the old value and the new one, and its dismissal writes nothing
- [x] 3.4 Own the flow from `src/main.ts`, beside the other commands that write a coordinate; drop `private` from `writeCoords` with a comment naming its second caller

## 4. Localization

- [x] 4.1 Add the menu item, the picker's placeholder and empty state, the confirmation's title, body and buttons, and the notices to `en`
- [x] 4.2 Add the same keys to `zh`

## 5. Tests

- [x] 5.1 Add `FuzzySuggestModal` and `Setting.addButton` to `tests/obsidian-stub.ts`
- [x] 5.2 Cover the picker: the items it offers, the text it matches on, a row with a coordinate and a row without
- [x] 5.3 Cover the guard: choosing an unplaced note writes without asking, choosing a placed one asks first, and a dismissed confirmation writes nothing
- [x] 5.4 Cover the report: the note and the value reach the notice, and a failed write is reported rather than swallowed

## 6. Documentation

- [x] 6.1 Document the item in `docs/guide/around-and-navigation.md` and its Chinese twin, beside the map's other right-click actions
- [x] 6.2 Add a CHANGELOG entry under `[Unreleased]`
- [x] 6.3 Narrow the ROADMAP entry to the drop trigger that remains, carrying over what design.md D5 measured

## 7. Verification

- [x] 7.1 Run `npm run check`
- [ ] 7.2 Live-verify in the test vault: the item appears on the map's right-click menu; picking a note with no coordinate writes it and reports it; the written value equals what **Copy coordinates** puts on the clipboard for the same click, on both WGS-84 and Chinese-datum tiles
- [ ] 7.3 Live-verify the guard: a note that already has a coordinate shows the confirmation with both values, confirming replaces it, dismissing leaves the file byte-identical
- [ ] 7.4 Live-verify the surroundings: a stamped note inside the base's query gains its pin without a reload, one outside it still reports; the menu's other items and `dev:errors` are unaffected
- [ ] 7.5 Capture a screenshot of the menu item and the picker for the pull request
