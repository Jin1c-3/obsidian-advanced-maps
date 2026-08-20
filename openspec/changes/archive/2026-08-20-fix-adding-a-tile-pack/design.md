## Context

See proposal.md — Why. The relevant state is that two settings lists each store
a shape that cannot represent the row a reader has just added: the pack list
stored the output of the reader that decides which packs a map can draw, and the
skip list stores one comma-joined string in which `['']` and `[]` are the same
value.

## Goals / Non-Goals

Goals: an add button that adds, in every state each list can be in; a row that
says why it is not usable rather than being quietly absent; the settings shape
unchanged, so no migration and no version of this plugin reading a file it does
not understand.

Non-Goals: validating that anything is at a pack's path — still not knowable
without enumerating a directory outside the vault. Changing what `tilePacks`
answers: every reader outside the pane wants exactly what it already returns.

## Decisions

**Two readers over one stored list, not pane-only state.** `packRows` normalizes
each field and drops nothing; `tilePacks` is that list narrowed to the named,
unique rows. The pane draws and writes rows, everything that draws a map reads
packs. The alternative — keeping the half-typed row in the settings tab and
merging it in at write time — puts a row on screen that is in no file, so it is
gone when the pane closes, when a re-render happens, and when the reader looks
again after a restart. The precedent is already in this file set:
`exclusionRows` and `excludedFragments` are the same split over the skip list.

**A blank row is stored.** `data.json` gains `{"name":"","path":"",…}` while a
reader is filling one in, and keeps it if they walk away. That is the honest
record of what is on screen, and it costs nothing: every reader that resolves a
background filters it out already, and a reader on an older version of this
plugin — which filtered it out on the way in — is unaffected.

**One blank row in the skip list is a lone space.** That list is one string, and
the join cannot say "one empty row": `[''].join(', ')` is `''`, which reads back
as no rows. A single space reads back as exactly one blank row and is not a path
fragment, so nothing is excluded by it. The alternative, changing the setting to
an array, is a stored-shape migration for a list whose only defect is this one
value.

**Both rows of a clashing name are told, not just the loser.** `tilePacks` keeps
the first of two rows sharing a name, so only the second is dropped — but the
reader is looking at whichever row they are typing in, and neither box
re-renders the pane while it is being typed in. So the message names the clash
rather than the loser: "Two packs cannot share a name."

**A row reports itself from what has been typed, not from what it was drawn
from.** The row is rendered once and edited many times without a re-render — that
is deliberate, since re-rendering takes the caret out of the box. So the check
runs over the drawn list with the box's current value substituted in.

## Risks / Trade-offs

- A blank row that a reader abandons stays in `data.json` → it is inert
  everywhere and one ✕ removes it, which is what the same row already does in
  the custom-map list.
- The error is asked of the row's own snapshot, so renaming row A to clash with
  row B flags A and leaves B's message stale until the next render → the
  message is on the row being typed in, which is the one being read.
- Storing a lone space depends on `excludedFragments` dropping blanks → it
  already did, and a test now says so.

## Migration Plan

None. No key changes, no stored value changes meaning, and a `data.json` written
by this version is read correctly by the previous one.
