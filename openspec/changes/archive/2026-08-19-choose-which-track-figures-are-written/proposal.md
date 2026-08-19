## Why

**Write track statistics to properties** writes all nine figures, every time, to
every note it is run on. A reader who wanted a distance column gets eight more
properties they did not ask for — in the note, in the property autocomplete, in
every base's column list, and in the file's own frontmatter forever after,
because a figure the file did record is never removed.

The names page already lets a reader say what each figure is _called_. It has no
way to say that a figure is not wanted at all, which is the more common thing to
want: a walking log needs distance and start time, and has no use for a moving
average over four decimal-free minutes of climbing.

## What Changes

- Add a switch per figure on Settings → Tracks → **Track properties**. Every one
  of them starts on, so a vault that never opens the page is written exactly as
  it was before this existed.
- A figure switched off is not written — and is not removed either. The command's
  reach shrinks with the switches: names outside the figures currently on are
  neither read, written, nor deleted, which is the same promise the command has
  always made about names outside its own nine.
- The clash checks follow the same set. A figure that is off cannot collide with
  the coordinate property, with the place property, or with another figure,
  because it is not going anywhere near the note.
- A figure that is off hides its name box: there is nothing to name.
- With every figure off, the command says so rather than reporting that it wrote
  nothing.
- The inline statistics bar under a track map is untouched. This is about what
  lands in frontmatter, not about what the plugin measures or shows.

## Impact

- Affected specs: `track-map-rendering` (modified).
- Affected code: `src/stats.ts`, `src/settings.ts`, `src/main.ts`, `src/i18n.ts`.
- Affected docs: `docs/guide/{en,zh-cn}/tracks-and-areas.md`.
- Stored settings gain one record. A file written by an earlier version has no
  such record, and every figure reads as on — which is what it was.
