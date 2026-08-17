## Why

`trackStats()` already measures distance, ascent, descent, elevation range,
elapsed time, moving time and pace (`src/stats.ts:75`), and the figures are
correct for every supported format. They reach exactly one surface: the bar
under an inline `![[track.gpx]]` (`src/embed.ts:646`). Nothing else in the vault
can see them.

That makes them unreachable by the host. A base sorts, filters, groups and
totals **properties**; a number rendered into an embed's DOM is none of those.
So a vault that holds two hundred GPX files cannot answer "which rides were over
50 km", "sum this month's ascent", or "show a distance column beside the date" —
questions Bases answers in one filter for any note property, and cannot answer at
all for the one number the plugin already computed.

The gap is one seam wide. `resolveTracks()` already answers which track files a
note owns (`src/main.ts:372`), `TrackCache.load()` already returns their parsed
WGS-84 features (`src/track-cache.ts:146`), and
`fileManager.processFrontMatter` is already how three commands write to a note
(`src/main.ts:852`, `:882`, `:1078`). Nothing new has to be read, parsed or
projected; the numbers have to be written down.

It is also the cheap half of the roadmap's _Statistics on a base map_, which is
blocked on reaching inside a popup this plugin does not own. A number living in
a property needs no popup — it is a column, and the native card shows note
properties already.

## What Changes

- Add one command, **Write track statistics to properties**. It measures the
  track files the active note owns and writes the figures into that note's
  frontmatter. It is available only when the note owns at least one track file.
- Write numbers, not sentences. `13.62`, not `"13.6 km"` — a formatted string
  sorts lexically, which puts 9 km after 10 km. The unit is stated in the
  property name instead, once, where the column header shows it.
- Namespace every property under a configurable prefix (**Track property
  prefix**, default `track`), so the command owns `track-distance-km` and its
  eight siblings and can never write over a property the reader keeps by hand.
- Write only what the file actually recorded. A GPX from a watch fills all nine;
  a GeoJSON route with no elevation or timestamps fills one. A property with no
  data behind it this run is removed rather than left stale.
- Refuse rather than overwrite when the configured prefix would collide with the
  coordinate or place property, the same way reverse geocoding already refuses
  to write a place name over the coordinate it just read.
- Never run by itself. No file event, no scan, no automatic fill — the numbers
  reach a note when the reader asks for them and at no other time.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `track-map-rendering`: adds a requirement that a note's track statistics can be
  written into its own properties on request — from the same unshifted WGS-84
  features the inline bar measures, summed across the note's tracks, scoped to a
  configurable prefix, never automatically, and never over a property outside
  that prefix.

## Impact

- `src/stats.ts` — a pure `statsProperties()` mapping a `TrackStats` to named,
  rounded, unit-suffixed property values, plus the local-time stamp formatter it
  needs. No change to how anything is measured.
- `src/main.ts` — the command, the track-file filter over `resolveTracks()`, the
  collision guard, and the `processFrontMatter` write.
- `src/settings.ts` — one text setting, `statsPrefix`, in the Tracks group;
  clearing it restores the default like the other placeholder-backed fields. Not
  a visual setting, so it is deliberately not on `TRACK_REFRESH_KEYS`.
- `src/i18n.ts` — one command name, four notices, one setting name and
  description, in both locales.
- `tests/stats.test.ts` — property names, units, rounding, omission and the
  prefix's own edge cases.
- `docs/guide/tracks-and-areas.md` (+ zh), `README.md` (+ zh), `CHANGELOG.md`.
- No dependency, persisted-data, manifest or native-seam change. `src/embed.ts`
  is untouched: the inline bar keeps rendering the same `TrackStats` it always
  did, and this change adds a second reader of that value rather than a second
  way to compute it.
