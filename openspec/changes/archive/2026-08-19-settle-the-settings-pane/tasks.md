## 1. The words

- [x] 1.1 Rewrite every settings description and page introduction in English: one thing per sentence, and no sentence explaining another
- [x] 1.2 Rewrite the same in Simplified Chinese, from the Chinese rather than from the new English
- [x] 1.3 Shorten the row names that were sentences, and drop the nine "Write the …" labels the one-row layout no longer needs
- [x] 1.4 Correct every guide passage naming a renamed row, in both locales

## 2. The shapes

- [x] 2.1 Give each track figure one row: its name box and its switch, under a heading of their own below the prefix
- [x] 2.2 Disable the box while the switch is off rather than removing it
- [x] 2.3 Turn the skip list into a list of folder rows with the vault's suggester, add and delete
- [x] 2.4 Keep the stored value one comma-separated string, and keep a blank row that has not been typed into yet
- [x] 2.5 Give the list a searchable label row, since a list heading is not a row search can find
- [x] 2.6 Drop `autoFillExclude` from the placeholder-backed keys, and say in the empty state what an empty list means

## 3. Proof

- [x] 3.1 Cover the skip list in `tests/settings.test.ts`: the default, an emptied list, a blank row, and the two readings of the same string
- [x] 3.2 Exercise both pages in a live vault — the rendered rows, a switch disabling its box in place, and the folder suggester answering
- [x] 3.3 `npm run check`
