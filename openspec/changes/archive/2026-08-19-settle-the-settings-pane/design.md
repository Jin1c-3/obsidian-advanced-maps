## Context

The pane is declarative: `getSettingDefinitions()` returns rows, every write goes
through `setControlValue`, and Obsidian 1.13 supplies the row types. Three of
those types were being used at one remove from what they are for.

## Decisions

### One row per figure, and the box is disabled rather than hidden

`SettingDefinitionControl` forbids `render` beside `control`, so a row with two
controls has to be a `render` row — which the custom external-map entry already
is, with three. The figure row is the same shape: a text box and a toggle, both
writing through `setControlValue`.

Disabled beats hidden. A hidden box says nothing; a greyed one still shows the
name that figure would be written under if it were switched back on, which is the
question a reader has while deciding. It also means the row count no longer
changes when a switch is flipped.

`update()` is still called on a `statsWrite` write, for the page entry's "7 of 9
figures". A switch has no caret for a re-render to take, which is why that was
always safe here and is not safe on a text row.

### The skip list stores the same string

`type: 'folder'` is a text input with the vault's folder suggester behind it —
the core Templates plugin's folder row. It stores one folder, so a list of them
is a `list` of rows, keyed `autoFillExclude.<n>` the way the external-map rows
are keyed `externalMaps.<n>.on`.

What is stored stays one comma-separated string. `isExcluded` is unchanged, its
tests are unchanged, and no reader's `data.json` needs migrating — the change is
entirely in how the same string is edited. The one place the two views differ is
a blank: `exclusionRows` keeps a row the reader has just added and not yet typed
into, `excludedFragments` drops it, because a blank fragment is one every path
contains.

### An emptied list is an answer

`autoFillExclude` was placeholder-backed: clearing the box restored `templates`.
The reason was sound for a box — an emptied box could not be told from one nobody
had filled in, and storing the empty one would have stamped every template with
the device's position. A list is different: rows are deleted one at a time, and
deleting the last one is deliberate. Restoring `templates` under a reader who had
just removed it would be the pane refusing an answer it offered. The empty state
says plainly what an empty list means.

### A label row above the list

A list's `heading` is not a row settings search can find, and the rows themselves
are nameless — a label repeated beside three identical folder boxes says nothing
the box does not. So the name and description live in a row of their own above
the list, which is a `render` row that renders nothing: the name and description
the framework has already drawn are the whole row.

### What the prose keeps

Not everything long was padding. The offline-tiles maximum-zoom description
earns its second sentence, because setting it wrong fails in two different
directions. The Amap key-storage description keeps its asymmetry, because the
one-way move is the thing a reader cannot guess. What went was the third
sentence explaining why the second one is true.
