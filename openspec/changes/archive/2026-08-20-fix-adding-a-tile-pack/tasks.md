## 1. Two readers over the stored pack list

- [x] 1.1 Add `packRows` beside `tilePacks` in `src/basemap.ts`: every row, each
      field normalized, nothing dropped — and narrow `tilePacks` to it.
- [x] 1.2 Add `packProblem`, answering the first thing that keeps one row out of
      `tilePacks`: no name, a name another row carries, or the template check
      that was already made.
- [x] 1.3 Cover both in `tests/basemap.test.ts`, including the row the add
      button makes and both halves of a clashing pair.

## 2. The pane draws and stores rows

- [x] 2.1 Read, write and normalize the pack list through `packRows` in
      `src/settings.ts`; leave the default dropdown reading `tilePacks`, which is
      the question it asks.
- [x] 2.2 Report a row's problem where it is entered, from what has been typed
      rather than from the snapshot the row was drawn from.
- [x] 2.3 Add the two messages to both locales in `src/i18n.ts`.
- [x] 2.4 Clear the stored default when the pack it names is removed, unless
      another row still answers to that name.

## 3. The two values a half-finished edit was losing

- [x] 3.1 `typedLevel`: an emptied zoom box keeps the level it had, since
      `Number('')` is 0.
- [x] 3.2 `storedExclusions`: one blank row is representable, so a row can be
      added to a skip list the reader has emptied.
- [x] 3.3 Cover both round trips in `tests/settings.test.ts`.

## 4. Verification

- [x] 4.1 `npm run check` — format, lint, types, tests, build, smoke.
- [x] 4.2 Live in a vault: the add button adds, a second pack can be configured,
      and both are offered as the default.
- [x] 4.3 Live: each unusable row says which of the three things is wrong, and a
      clash is reported on the row being typed in.
- [x] 4.4 Live: an emptied zoom box keeps its level and takes the next number.
- [x] 4.5 Live: deleting the pack the default names leaves no default.
- [x] 4.6 Live: a row can be added to a skip list emptied of every row, and
      typing into it stores the fragment.
- [x] 4.7 Verify on a phone-shaped surface, and record which surface answered
      what. Every check above ran twice: on the desktop through the pane's own
      value seam, and on an Android emulator running the released mobile
      application — where the add button was pressed as a finger presses it, at
      the coordinates the button occupies on screen, and the four boxes it
      produced were read back off the rendered row.

## 5. Documentation

- [x] 5.1 Say in both locales of the guide that the pane states an unusable row,
      and what the reader will see.
- [x] 5.2 Changelog section for the release that carries this.
