## 1. The property mapping

- [x] 1.1 Add `statsProperties(stats, prefix)` to `src/stats.ts`: the nine fixed suffixes in a stated order, each with its unit in the name, `null` for a figure the file did not record, and a comment stating the rounding and the design.md D1 reason the unit lives in the name
- [x] 1.2 Add the local-time stamp formatter `track-start` needs, to the second, with a comment stating why device-local rather than UTC (design.md D6)
- [x] 1.3 Normalize the prefix inside the pure function — trimmed, and a trailing separator not doubled — so a typed `track-` cannot produce `track--distance-km`

## 2. The setting

- [x] 2.1 Add `statsPrefix` to `AdvancedMapsSettings` and `DEFAULT_SETTINGS` with a comment naming what it scopes
- [x] 2.2 Add it to `PLACEHOLDER_DEFAULT_KEYS` so clearing the box restores `track`, and confirm it is deliberately absent from `TRACK_REFRESH_KEYS` — it changes nothing already drawn
- [x] 2.3 Render it as a text row in the Tracks group, after the statistics toggle it belongs with

## 3. The command

- [x] 3.1 Register `write-track-stats` with a `checkCallback` gated on an active markdown note that owns at least one file in `TRACK_EXTS`, so it stays out of the palette everywhere it would do nothing
- [x] 3.2 Resolve through `resolveTracks()` filtered to `TRACK_EXTS`, so a note's geotagged photos are excluded whatever **Show photos** is set to (design.md D8)
- [x] 3.3 Measure the concatenated raw features from `TrackCache.load()` — never `projectedFeatures()` — and state in the source why
- [x] 3.4 Refuse and name the clash when the prefix would produce `coordsProperty` or `placeProperty`, mirroring the existing reverse-geocode guard
- [x] 3.5 Write non-null values and delete the keys of null ones through one `processFrontMatter` pass, touching no key outside the prefix
- [x] 3.6 Leave the note untouched and say so when nothing is measurable, using the same condition the inline bar is gated on
- [x] 3.7 Report a read failure with the file's own error, and a success with how many properties were written and the headline distance

## 4. Localization

- [x] 4.1 Add the command name, the four notices, and the setting's name and description to `en`
- [x] 4.2 Add the same keys to `zh`, keeping property names untranslated

## 5. Tests

- [x] 5.1 Cover the full nine-property mapping for a track with elevation and time: names, units, rounding of each figure
- [x] 5.2 Cover omission: a coordinates-only track yields distance and eight nulls
- [x] 5.3 Cover the prefix: a custom one renames every key, an empty or `-`-suffixed one still produces single-separator names
- [x] 5.4 Cover the nothing-to-measure condition against the same predicate the embed uses, including an area-only file
- [x] 5.5 Cover the start stamp without depending on the machine's timezone — re-read the written text as local time and compare to the input instant

## 6. Documentation

- [x] 6.1 Add a section to `docs/guide/tracks-and-areas.md` and its Chinese twin: the command, the property table with units, the prefix setting, that it is run rather than automatic, and the summed-note consequence from design.md D3
- [x] 6.2 Mention it in both READMEs where the inline statistics are described
- [x] 6.3 Add a CHANGELOG entry under `[Unreleased]`

## 7. Verification

- [x] 7.1 Run `npm run check`
- [ ] 7.2 Live-verify in the test vault: the command writes the nine properties for a watch GPX; Obsidian types `track-start` as a datetime and the numbers as numbers; a base sorts and filters on distance and shows it as a column; a coordinates-only file writes one property; a second run after removing the file's timestamps removes the time properties; an area-only note reports nothing to measure and is left untouched; the command is absent from the palette on a note with no track
- [ ] 7.3 Live-verify the prefix: renaming it writes the new names, and a prefix colliding with the coordinate property refuses without touching the note
- [ ] 7.4 Capture a screenshot of a base sorting on the written properties for the pull request
