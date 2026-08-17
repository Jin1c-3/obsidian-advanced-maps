## 1. The naming function

- [x] 1.1 Give `src/stats.ts` a `StatsFigure` union and one ordered table of figure → default suffix, so the nine figures are named in exactly one place
- [x] 1.2 Extend `statsProperties(stats, prefix, names)` to resolve each figure to its configured name, trimmed, falling back to `prefix-suffix` when the name is empty or whitespace, and state in a comment why a custom name carries no prefix (design.md, "A custom name replaces the whole name")
- [x] 1.3 Keep the figures, units, rounding and order untouched, and keep the two-argument behavior identical for a caller that passes no names

## 2. The setting

- [x] 2.1 Add `statsNames: Record<StatsFigure, string>` to `AdvancedMapsSettings` and `DEFAULT_SETTINGS` as nine empty strings, with a comment naming what an empty string means
- [x] 2.2 Reach each name from the pane as `statsNames.<figure>` through the existing indexed-key seam, defaulting a figure a stored `data.json` does not carry, and writing back a trimmed copy of the whole record
- [x] 2.3 Add a **Track properties** page under **Tracks** holding the prefix and the nine name rows, its entry stating the prefix in effect
- [x] 2.4 Show each row's resolved default as its placeholder, and state in a comment that the placeholders follow the prefix on the next render rather than mid-keystroke, because a re-render would take the caret out of the prefix box
- [x] 2.5 Confirm `statsNames` is deliberately absent from `TRACK_REFRESH_KEYS` — it changes nothing already drawn

## 3. The command's guard

- [x] 3.1 Pass the configured names through to `statsProperties` in `writeTrackStats`
- [x] 3.2 Widen the clash guard: refuse and name the property when a resolved name is the coordinate or place property, or when two figures resolve to the same name, before anything is written
- [x] 3.3 Restate the deletion comment in terms of the resolved set of names rather than the prefix, since that is now what bounds the command's reach

## 4. Localization

- [x] 4.1 Add the page heading and intro, the nine field names, and the duplicate-name notice to `en`
- [x] 4.2 Add the same keys to `zh`, leaving the default property names untranslated

## 5. Tests

- [x] 5.1 Cover resolution: one named figure replaces its whole name while the other eight keep their prefixed defaults
- [x] 5.2 Cover the unset case: no names configured produces byte-identical keys to the prefix-only behavior
- [x] 5.3 Cover trimming and whitespace-only names falling back to the default
- [x] 5.4 Cover a custom name that ignores the prefix entirely, including one containing non-ASCII characters
- [x] 5.5 Cover duplicate detection at whatever seam the command's guard uses, including a duplicate created by a custom name matching another figure's default

## 6. Documentation

- [x] 6.1 Extend the property table in `docs/guide/tracks-and-areas.md` and its Chinese twin with the name a reader can give each figure, and add the rename caveat: properties written under an old name stay until removed by hand
- [x] 6.2 Name the new **Track properties** page in the guide's settings map, so a label in the guide can be found in the pane
- [x] 6.3 Add a CHANGELOG entry under `[Unreleased]`

## 7. Verification

- [x] 7.1 Run `npm run check`
- [x] 7.2 Live-verify in the test vault: a note measured with no names configured writes today's nine properties; naming distance writes that name instead, with no prefix; the other eight are unchanged
- [x] 7.3 Live-verify the refusals: two figures given the same name, and a name equal to the coordinate property, each leave the note untouched and say what clashed
- [ ] 7.4 Live-verify that a base sorts and totals a renamed column, and that a renamed figure leaves the old property in place
- [x] 7.5 Live-verify the page: the prefix and nine rows render, a cleared box restores the default name, and the entry states the prefix
