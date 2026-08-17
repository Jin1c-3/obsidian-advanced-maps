## Context

See proposal.md — Why for the gap and where each piece of the answer already
lives. Four facts about the current code shape this change:

- **The measurement is finished and tested.** `trackStats()` takes raw WGS-84
  features and returns nulls, not zeros, for figures a file did not record
  (`src/stats.ts:184`). Nothing about this change touches how a number is
  computed; it is a second consumer of an existing value.
- **Ownership is already answered.** `resolveTracks()` walks a note's embeds,
  body links and frontmatter links, de-duplicates by `TFile` identity and
  memoizes against the metadata cache (`src/main.ts:372`). The command needs the
  same answer the map draws from, minus photos.
- **Writing to a note has an established shape here.** Three commands go through
  `fileManager.processFrontMatter`, and each states in its own comment why it
  overwrites (explicit ask) or does not (the automatic fill, `src/main.ts:1078`).
  This is a fourth of the first kind.
- **The unshifted/projected split is load-bearing.** `TrackCache` keeps raw
  features and a per-datum projection beside them (`src/track-cache.ts:364`).
  Measuring the projected copy would make a note's distance depend on which
  basemap happened to be open — the exact defect the inline bar's spec already
  forbids.

## Goals / Non-Goals

**Goals:**

- The numbers under an inline map become something Bases can sort, filter, group
  and total.
- A note's properties describe its current track files, and nothing else in the
  note is at risk.
- No new reading, parsing, projection or cache path.

**Non-Goals:**

- Keeping the properties up to date by themselves. A track file that changes
  does not rewrite the notes that link it; the command is run again. Watching
  every track file to rewrite notes behind the reader is a different feature with
  a different risk profile, and the roadmap's rule for this one is explicit: it
  writes when asked and never during a scan.
- Per-track numbers in a note that owns several. One note is one row, and a row
  has one distance. Which of a note's tracks is under the cursor is the question
  the roadmap's _Statistics on a base map_ entry exists for, and it is answered
  in a popup, not in frontmatter.
- Statistics for an area — square kilometres, perimeter, centroid. `stats.ts` is
  about routes; area measurement is its own change, with its own datum caveat.
- A bulk run over every note a base matched. One note at a time is the surface
  every other write command in this plugin has, and the one that cannot surprise
  someone with two hundred rewritten files.
- Reading these properties back. Nothing in the plugin consumes them; they exist
  for the host and for the reader.

## Decisions

### D1 — Numbers, with the unit in the property name

Each property holds a plain number, and its name ends in the unit:
`track-distance-km`, `track-ascent-m`, `track-duration-min`, `track-speed-kmh`.

_Why:_ the whole point is reaching Bases' filters and sort. `"13.6 km"` is a
string, and string order puts `10 km` before `9 km`; `>` against it is
meaningless. A number sorts, compares, sums and averages.

_Why the unit in the name rather than in a setting or the docs:_ a number in
frontmatter is otherwise unlabelled forever — `track-speed: 5.1` is km/h to
whoever wrote it and a guess to everyone else, including the same reader in a
year. The column header is the one place the unit is always on screen next to
the value. This also removes any reason for a unit setting: metric is stated,
not assumed.

_Why nine properties and not three:_ they are null-skipped (D4), so the count is
set by what the file recorded, not by the schema. A hand-written GeoJSON route
writes one property. A watch export writes nine, and those nine are exactly the
figures the inline bar already shows — parity was chosen over a shorter list so
that "what the embed shows" and "what a column can show" never diverge.

`track-lowest-m`/`track-highest-m` rather than `-min-`/`-max-`: `min` in the same
namespace as `track-duration-min` would read as minutes in one name and minimum
in another.

### D2 — One prefix setting, not nine property settings

`statsPrefix`, default `track`, joined to a fixed suffix with `-`. Clearing the
box restores the default, like `coordsProperty` and the other placeholder-backed
fields.

_Why a setting at all:_ `coordsProperty` and `placeProperty` are configurable
because a vault has its own property conventions, and a plugin that hard-codes
names either loses to an existing one or fights it. The same argument applies
nine times over.

_Why not nine settings:_ a wall of nine text boxes to rename nine derived values
is a settings pane nobody reads, and it would let a reader point two of them at
one property. One prefix cannot collide with itself.

_Why not localized names:_ `coords` and `location` are not localized either. A
property name is data in the vault, and translating it would make the same note
mean different things on two devices.

### D3 — The note's tracks are summed, by the rule a multi-segment file already uses

Every resolved track file's features are concatenated and handed to
`trackStats()` once, rather than measured per file and merged afterwards.

_Why:_ `trackStats()` already accumulates across features — distance never jumps
the gap between one `LineString` and the next, `hysteresisClimb` runs per line,
and `start`/`end` are the min/max timestamp seen anywhere. A GPX with three
segments is measured by those rules today. Concatenating two files reuses them
exactly, so a note with two files is measured the same way as one file
containing both, and there is no second merge rule to keep correct.

_The known consequences,_ both measured on a live vault rather than reasoned
about: for a note holding a morning hike and an afternoon ride,
`track-duration-min` spans the gap between them, because elapsed time is last
timestamp minus first — distance, ascent and moving time are sums and do not.
And pace is neither: it is total distance over total moving time, so a note that
pairs a timed GPX with an untimed GeoJSON reports the untimed route's kilometres
against the timed one's minutes and reads faster than either ride was.

Both are the same answers one multi-segment file already gives, which is the
point. The alternative — a bespoke merge that sums elapsed times and averages
paces — would make two properties mean something different depending on whether
the segments arrived in one file or two, and there would then be two rules to
keep correct instead of one.

### D4 — Write what exists, remove what does not, and touch nothing outside the prefix

`statsProperties()` returns all nine entries in a fixed order, with `null` for a
figure the file did not record. The command writes every non-null value and
deletes the key of every null one. It never reads or writes a key outside the
prefix.

_Why delete rather than leave:_ the properties are derived. A track re-exported
without timestamps leaves `track-speed-kmh` describing a file that no longer says
anything about speed, and a stale number is worse than an absent one because a
filter still matches it.

_Why overwriting inside the prefix is safe:_ the roadmap's rule — "does not
overwrite a value the reader put there" — is answered by the namespace rather
than by a per-key check, because a per-key check cannot distinguish a value the
reader typed from one this command wrote last time. Scoping the write is the only
version of that promise that can actually be kept, and it is why the prefix is
configurable: a reader who wants a hand-kept `distance` keeps it, because the
command's is `track-distance-km`.

_Precedent:_ this matches how the existing commands already split. Explicit
commands overwrite — `writePlace` says so in as many words ("overwriting whatever
was there, since running the command is the explicit ask"). Only the automatic
path fills blanks and nothing else.

### D5 — Nothing measurable means nothing written

If a note's tracks yield no distance and no other figure — an area-only GeoJSON,
an empty file — the command writes nothing at all, deletes nothing, and says so.

_Why:_ this is the same condition `statsFields()` already gates the inline bar on
(`src/embed.ts:829`), so the two surfaces agree on what "has statistics" means.
And a command that cannot measure anything should be inert rather than
destructive: the alternative — deleting the nine properties — would quietly strip
a note because a linked file was temporarily truncated or replaced.

### D6 — The start stamp is device-local, to the minute

`track-start` is written as `YYYY-MM-DDTHH:mm` in the device's own timezone.

_Why the minute and not the second,_ which is what this decision originally said:
measured against Obsidian 1.13 rather than assumed. `2024-05-01T09:30` is
inferred as a `datetime` property, `2024-05-01` as a `date`, and
`2024-05-01T09:30:15` as plain **text** — a seconds field takes the value out of
the type system entirely, quoting it does too, and a space in place of the `T`
likewise. So the extra field is not more precision here; it is the difference
between a property a base sorts and filters as a time and one it compares as a
string, which is the whole reason this property exists. The seconds are dropped
rather than rounded, so the stamp names the minute the earliest point falls in.

_Why local rather than UTC:_ GPX timestamps are UTC and carry no timezone, so the
trip's own local time is not recoverable from the file. Device-local is the only
available answer and the one that matches "I set off at nine". It is stamped once,
into text, so it does not drift when the vault is opened somewhere else — which
is the behaviour a recorded date should have.

_Why it is written at all,_ when the note usually has a date already: the note's
date is when it was written; this is when the track was recorded, to the minute,
which is what makes a base of two hundred rides sortable by when they happened
rather than by when they were typed up.

### D7 — Refuse on a collision with the coordinate or place property

If any of the nine names equals `coordsProperty` or `placeProperty`, the command
writes nothing and says which property clashes.

_Why:_ it takes a deliberately odd prefix to reach, but the failure is silent and
destructive — a note's coordinate replaced by a distance, with the map's pin
moving as the only symptom. `reverseGeocodeCurrent` already refuses the same
class of collision for the same reason (`src/main.ts:905`), and a guard that
matches an existing one costs a line and needs no explaining.

### D8 — Photos are not track files here

The resolved list is filtered to `TRACK_EXTS`, so a note's geotagged photos are
excluded even when **Show photos** is on.

_Why:_ a photo contributes one `Point`. It has no distance, no ascent and no
duration, so it can only move `points` and — through a photo's EXIF altitude —
the elevation range, which would make a note's "lowest point" a photo rather than
part of the route. The map deliberately draws photos alongside a route; the route's
statistics deliberately do not include them, exactly as the inline bar does not.

## Risks / Trade-offs

- **The properties can go stale.** A track file edited after the command was run
  leaves the note's numbers describing the old version, with nothing on screen
  saying so. Accepted: the alternative is writing to notes on a file event, which
  the roadmap rules out and which would turn a sync of a hundred GPX files into a
  hundred note writes. Re-running the command is the documented answer.
- **Nine properties is a lot of frontmatter** for a note whose watch recorded
  everything. Mitigated by the null-skip (most files fill fewer) and by the
  prefix, which keeps them sorted together and out of the way of the note's own
  properties.
- **A renamed prefix orphans the old properties.** The command owns names, not
  history, so changing `statsPrefix` leaves the previous set behind for the
  reader to delete. Tracking the old prefix in order to clean up after it would
  mean the plugin deleting properties it did not write this run, which is a worse
  trade than a manual tidy-up after a rename nobody does twice.

## Open Questions

None. The one thing worth measuring rather than assuming — which written shapes
Obsidian types as `datetime`, and whether a Bases filter and sort then work on
all nine — was measured on a live vault before this document was final, and it
changed D6: seconds were in the design and are not in the code.
