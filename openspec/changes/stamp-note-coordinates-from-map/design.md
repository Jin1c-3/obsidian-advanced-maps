## Context

See proposal.md — Why. Three facts about the current code decide the shape:

- **The clicked coordinate already exists, correctly.** `addExternalMapItems()`
  unprojects the clicked pixel, converts the tile datum back to WGS-84, and
  normalizes a longitude the camera may have carried past ±180 — each exactly
  once (`src/track-layer.ts:394`). A second consumer must read that pair rather
  than repeat the arithmetic.
- **Writing a coordinate into a note is solved.** `writeCoords()` goes through
  `fileManager.processFrontMatter` and is what the link paste, place search,
  photo EXIF and device-location commands all end at.
- **There is no note picker.** Every existing command acts on the *active* note,
  so "which note" has never had to be asked. This change is the first time it
  does, and that is where its risk lives.

## Goals / Non-Goals

**Goals:**

- A note that already exists can be given the coordinate you are looking at,
  without leaving the map.
- The datum and meridian corrections stay at exactly one each per click.
- Replacing a coordinate is never silent.

**Non-Goals:**

- **Dragging a note from the file explorer onto the map.** The roadmap names it
  as this entry's second trigger, and it is left out on purpose — see D5, which
  records what was measured for whoever picks it up.
- **Dragging an existing pin to move it.** Those markers belong to the native
  manager; moving one means owning it, which is the line this plugin does not
  cross.
- **Creating a note.** The native menu's **New note here** already does that, and
  this is deliberately the other half.
- **Writing anything but the coordinate.** Not a place name, not a link back to
  the map, not a timestamp. One property, the configured one.
- **Multi-select.** One click is one place; stamping several notes with one
  coordinate is a different intent and a worse accident.

## Decisions

### D1 — The item lives on the map's own right-click menu

Added in the same `showMapContextMenu` wrapper that already appends the external
map entries, from the same `Menu.forEvent(ev)`.

_Why there:_ the coordinate only exists because of that click. A command in the
palette would have no point to write, and a setting would have nothing to
configure. The menu is also where the reader already looks for "do something
with this spot" — two of the three items there are exactly that.

_Why not a section of its own:_ it belongs next to **New note here**, whose other
half it is. The external-map items keep their own section because they are a
group; this is one item and joins the default one.

### D2 — One coordinate per click, computed once and shared

The unproject → `toWgs84` → `normalizeLng` chain moves into a small helper that
both menu contributions call.

_Why:_ the roadmap entry says it plainly — zero conversions and two look
identical on screen, and both land the pin about 500 m out in China. Today the
arithmetic exists once and is correct; the failure mode this guards is a second
copy drifting from it later. A helper makes the count structural rather than
remembered.

_Why not compute it in the menu item's click handler:_ the handler runs after
`unproject` has been restored to native tile space, and the pixel is gone with
the event. The value is captured while the menu is being built, which is what
`addExternalMapItems` already does for its URLs.

### D3 — A fuzzy picker over the vault's notes, each row showing what it has

`FuzzySuggestModal<TFile>` over `vault.getMarkdownFiles()`. A row shows the
note's name, its folder, and — when it has one — the value already in its
coordinate property.

_Why show the existing value:_ it turns the riskiest choice into an informed one
before it is made, and it costs a metadata-cache lookup per *rendered* row, not
per note in the vault.

_Why every note rather than only those without a coordinate:_ correcting a pin
that is in the wrong place is a real use of this, and filtering those notes out
would remove it. The confirmation in D4 is what makes including them safe.

_Why not a folder or tag filter setting:_ fuzzy search over names is what
Obsidian's own switcher does, and a vault-specific narrowing belongs in the
query the reader types, not in a setting that has to be maintained.

### D4 — Replacing an existing coordinate asks first

Choosing a note that already has a value in the coordinate property opens a small
confirmation naming the note, the old value and the new one. Choosing a note
without one writes immediately.

_Why:_ every other coordinate command writes to the note the reader is looking
at, so an overwrite is visible and expected — `writePlace` says as much. This one
writes to a note chosen out of a fuzzy list of thousands, where a near-miss on a
name is one keystroke away and there is nothing on screen to notice it by
afterwards. Frontmatter has no undo.

_Why not a notice with an undo action instead:_ an undo that lives as long as a
notice is not a recovery path for someone who was already looking somewhere else
— which, having just clicked a map, they are.

_Why nothing to confirm in the ordinary case:_ the note this feature exists for
has no coordinate. Asking there would be friction protecting nothing.

### D5 — Dropping a note onto the map is not in this change

Measured in a live vault rather than assumed, so the next attempt starts from
facts:

- `app.dragManager` exists and exposes `draggable`, `dragFile`, `handleDrag`,
  `handleDrop`, `onDragOver`, `showOverlay` and an `isDragOverHandled` flag. It
  is entirely undocumented and would need a declaration with provenance.
- `dragManager.dragFile(event, file)` returns `{source, type: 'file', icon,
  title, file}` and writes into the event's `dataTransfer`: `text/plain` and
  `text/uri-list` both carry `obsidian://open?vault=<name>&file=<path>` — the
  app's own public URI, with the extension dropped. So a drop handler has a
  documented payload to read and does not have to depend on the internal at all.
- What could not be measured is the part that decides the feature: whether a real
  drag from the file explorer reaches the map container at all, or is taken by
  the workspace's own drag-over pipeline first. That needs a human dragging a
  file; a synthetic `DragEvent` dispatched at the container proves only that the
  listener is wired.

Shipping an interaction whose central question is unanswered would contradict the
rule the last two changes in this repository were written under. The write path
this change builds is the same one that trigger will use, so it costs nothing to
add later.

## Risks / Trade-offs

- **The picker lists every markdown note in the vault.** On a large vault that is
  a long list before the first keystroke. Accepted: it is the same list
  Obsidian's quick switcher builds, and building it lazily would trade a real
  cost for a hypothetical one.
- **The confirmation can be click-through-ed.** Someone who confirms without
  reading loses the old coordinate. Accepted — it is one dialog naming both
  values, and the alternative is refusing to overwrite at all, which removes the
  "fix a wrong pin" use.
- **A stamped note may not be in the map's own query,** so the pin does not
  appear where the reader just clicked. That is Bases filtering, not a defect,
  but it will read as one. The notice therefore names the note and the value, so
  something confirms the write even when nothing on the map changes.

## Open Questions

None. The one that mattered — whether the item's own coordinate agrees with what
**Copy coordinates** puts on the clipboard, on a Chinese-datum map and across the
meridian — is a live check in tasks.md.
