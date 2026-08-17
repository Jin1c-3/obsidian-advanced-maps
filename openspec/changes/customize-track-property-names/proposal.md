## Why

**Write track statistics to properties** names what it writes from one setting:
a prefix. `track` gives `track-distance-km`, `track-ascent-m` and seven
siblings (`src/stats.ts:301`). The prefix is the only part a reader can choose;
the rest of every name — the English word and the unit suffix — is fixed.

That is a column header. A base shows these properties as columns, and a reader
whose vault is in Chinese gets a table headed `track-distance-km` next to
columns they named `日期` and `地点`. Renaming the property afterwards works
until the command is run again, which writes the old name back and leaves the
renamed one beside it, stale.

The prefix cannot fix this, because the reader's objection is usually not to the
prefix. `track-距离` is not what anyone wants either; what they want is `距离`.
Nine names, each optional, each replacing the whole name, is the smallest thing
that answers it — and it costs no new measurement, no new write path, and no new
property the command can touch.

## What Changes

- Each of the nine figures gains an optional property name. Set one and it is
  the whole property name — `距离`, not `track-距离`. Leave it empty and the
  name stays exactly what it is today, `prefix-suffix`, so an upgrading vault is
  unaffected and the prefix keeps working for readers who only wanted that.
- The nine boxes live on a **Track properties** page reached from **Tracks**,
  beside the prefix they override, rather than as nine more rows in a list.
- The command's reach is still exactly what it writes: the resolved set of nine
  names, whatever they now are. Nothing outside that set is read, written, or
  removed.
- Refuse rather than overwrite, as it already does for the coordinate and place
  properties, when the resolved names would collide — with either of those two,
  or with each other. Two figures cannot share a property name, because the
  second would silently overwrite the first.
- **Renaming does not clean up after itself.** Properties written under a
  previous name stay in the notes that hold them; the command only ever touches
  the names configured now. Stated in the guide rather than solved with a
  remembered history of names the plugin used to use.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `track-map-rendering`: the requirement that a note's track statistics can be
  written into its own properties changes from "under a configurable prefix" to
  "under a configurable name per figure, defaulting to the prefixed one", and
  its refusal condition widens from a clash with the coordinate or place
  property to include two figures configured to the same name.

## Impact

- `src/stats.ts` — `statsProperties()` takes the configured names beside the
  prefix and resolves each figure to a custom name or the prefixed default. The
  figures, units, rounding and order are untouched.
- `src/settings.ts` — a `statsNames` record, its nine control keys on the same
  indexed-entry seam the external-map lists already use, and the **Track
  properties** page under Tracks. Not a visual setting, so still absent from
  `TRACK_REFRESH_KEYS`.
- `src/main.ts` — the clash guard gains the duplicate check and reports which
  two figures collide.
- `src/i18n.ts` — the page, nine field names, and one notice, in both locales.
  The figures' English default names are not translated: they are property
  names, not labels.
- `tests/stats.test.ts` — resolution, fallback, trimming, duplicates, and that an
  unset name still produces today's exact property.
- `docs/guide/tracks-and-areas.md` (+ zh) — the property table gains "the name
  you can give it", and the rename caveat; `CHANGELOG.md`.
- Builds on `organize-settings-into-pages`: the Tracks page is where this one
  hangs its own page. No dependency, persisted-data, manifest, or native-seam
  change; a vault that never opens the new page keeps today's names exactly.
