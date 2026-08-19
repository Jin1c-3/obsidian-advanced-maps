## Context

See proposal.md — Why. The shape of this one is almost entirely set by what
`customize-track-property-names` already built: a record keyed by figure, stored
whole, read through one helper that tolerates a stored file predating it, and
edited on the declarative settings seam one key at a time.

## Goals / Non-Goals

**Goals:**

- Choosing the figures is one switch each, beside the name each one is written
  under.
- The command's reach is exactly the figures that are on — for writing, for
  removing, and for the clash checks that refuse to write at all.
- A vault that never opens the page is unchanged, including one whose stored
  settings were written before this record existed.

**Non-Goals:**

- **Per-note selection.** A figure is a column across a vault; a note that wants
  its own set of columns wants its own properties, which it can already have.
- **Hiding figures from the inline statistics bar.** Nothing there costs a note
  anything, and the bar's own toggle already turns all of it off.
- **Removing the property of a figure switched off.** Switching a figure off is
  a statement about what to write next time, not permission to delete data
  already in a note. Renaming a figure has always behaved this way.

## Decisions

### D1 — The filter is applied where the properties are made, not where they are written

`statsProperties()` takes the switches and returns only the figures that are on.
Everything downstream — the coordinate and place clash check, the duplicate-name
check, the write loop, the count in the notice — then operates on the set that is
actually going into the note, with no second place that has to remember to skip
the same figures. A figure that is off cannot clash, cannot be counted, and
cannot be deleted, because it is not in the list at all.

### D2 — Absent means on

`statsWrite` is read through the same shape as `statsNames`: a record built for
every figure from whatever is stored, defaulting each one that is missing or not
a boolean. Missing defaults to `true`, so a `data.json` written by 1.18 upgrades
into "everything on", which is what that vault has been doing all along.

### D3 — The name box goes with the switch

A figure that is not written has no name to give, so its box is hidden rather
than left there stating a name nothing will ever use. This is `visible` on the
name row and a re-render when a switch flips — a toggle, not a text box, so the
re-render costs nobody a caret.

### D4 — Every figure off is reported, not silently obeyed

The command already refuses out loud in two cases (a clash with the coordinate
or place property, two figures under one name). "Nothing is switched on" is the
third: writing zero properties and reporting "wrote 0 properties" would read as a
failure to measure, and the reader is three clicks from the switch that explains
it.

### D5 — The page entry states how many are on, once any is off

The **Track properties** row on the Tracks page states the distance property's
name — the answer to "what are my columns called" for a reader who has renamed
nothing. Once figures are switched off that is the wrong summary, and a count is
the right one. Distance itself may be one of the ones that is off.
