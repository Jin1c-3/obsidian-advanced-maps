## Context

See proposal.md — Why. Four facts shape the approach:

- **The naming is already one pure function.** `statsProperties(stats, prefix)`
  returns nine `{key, value}` entries in a fixed order, with `null` for a figure
  the file did not record (`src/stats.ts:301`). It is the only thing that decides
  a property name, and it is already covered by tests.
- **The command's safety argument rests on the prefix.** It refuses when the
  prefix would produce the coordinate or place property, and its comment for
  deleting a `null` figure says plainly that every key it touches is under the
  configured prefix (`src/main.ts:1101`, `:1117`). Custom names dissolve that
  sentence: the guarantee has to be restated as "the set of names it resolves
  to", and the guard has to widen with it.
- **Indexed control keys already exist.** `customMaps.0.name` reaches a field
  inside a stored list through `entryPath()`/`writeEntry()`, keeping list rows on
  the declarative read/write seam (`src/settings.ts:218`, `:751`). A record of
  nine names is the same shape with a fixed key set instead of an index.
- **Pages nest.** `SettingDefinitionPage.items` accepts another page, so **Track
  properties** can sit inside **Tracks** without a second top-level entry.

## Goals / Non-Goals

**Goals:**

- A reader can call the distance column `距离`, and a reader who never opens the
  page sees no change at all.
- Whatever the names are, the command's reach is exactly the properties it writes.
- The nine names are one value with one write path, not nine settings keys.

**Non-Goals:**

- Migrating properties written under an earlier name. The plugin does not
  remember what it used to be called, and a command that deletes a property it
  cannot prove it wrote is a worse failure than a stale column. The guide says
  to clean up the old name.
- Configurable units, rounding, or which figures are written. The unit is part of
  the default name because a bare number is otherwise unlabelled; a reader who
  renames `track-distance-km` to `距离` is choosing to carry that knowledge
  themselves, and the value is unchanged either way.
- Localizing the default names. `track-distance-km` is a property name in a
  vault, not a label on screen: a default that changed with the interface
  language would rename every reader's columns when they switch languages.
- Per-note or per-base names. The names are one vault-wide setting, like the
  prefix they extend.

## Decisions

### A custom name replaces the whole name; empty means the default

`距离`, not `track-距离`. The prefix exists to keep a generated family of names
apart from a reader's own properties; a name the reader typed needs no such
fence, and putting one in front of it produces exactly the thing they were
avoiding.

Empty is not a name — it is "no answer", and the answer falls back to
`prefix-suffix`. That is what makes this change invisible to a vault that
ignores it, and it is the same rule the placeholder-backed text rows already
follow.

Alternative considered: a per-figure suffix under the prefix. It is a smaller
change and cannot collide with anything outside the prefix, but it cannot
produce `距离`, which is the request.

### The names are one record, on the existing indexed-key seam

`statsNames: Record<StatsFigure, string>` in the settings, reached from the pane
as `statsNames.distance` … `statsNames.start` through the same `entryPath()`
mechanism the map lists use. One stored value, one write path, one place to
default when a stored `data.json` predates a figure.

Nine flat settings keys (`statsNameDistance`, …) were rejected: nine keys to
add to the interface, the defaults, and every list that enumerates settings, to
express one thing.

### `statsProperties` resolves; the command guards

The pure function takes the names beside the prefix and returns the same nine
entries with resolved keys. It trims, and treats whitespace as empty.

Everything else stays where it is: the command asks the function for the names,
then refuses if any resolved name is the coordinate or place property, or if two
figures resolved to the same name. Duplicates are refused rather than
de-duplicated, because a note whose ascent silently overwrites its distance is
worse than a command that does nothing and says why.

### The page sits under Tracks

**Tracks → Track properties**, holding the prefix and the nine names, so the
prefix is next to what overrides it and the Tracks page keeps its nine drawing
knobs. The entry states the prefix in effect, the same way the pane's other
entries state their value.

## Risks / Trade-offs

- **A renamed figure leaves a stale property behind** → stated in the guide and
  in the notice-free design: the command reaches only current names. The
  alternative — remembering previous names in `data.json` and deleting them —
  makes the plugin the owner of a history it cannot verify against notes edited
  by hand.
- **A custom name can collide with a property the reader keeps by hand**, which
  the prefix used to make unlikely → the refusal covers the two properties the
  plugin knows about; beyond those, a name the reader typed is a name the reader
  chose. The guide says the command overwrites whatever those nine names point at.
- **A name that is not a valid property name** (empty after trimming, or made of
  separators) → empty falls back to the default; anything else is passed through
  as typed, because Obsidian, not this plugin, decides what a property name may
  contain, and second-guessing it would reject names that work.

## Migration Plan

No data migration. `statsNames` defaults to nine empty strings, which resolves to
today's names exactly; a vault that never opens the page keeps every property it
has. Rollback is reverting the commit: a note keeps whatever was written into it,
and the command returns to prefixed names.
