## Context

See proposal.md — Why for the motivation. Four facts about the current pane
shape this design:

- **The pane is already declarative.** `getSettingDefinitions()` returns an array
  of groups and lists; `getControlValue`/`setControlValue` are the only read and
  write seam, and every validation, placeholder fallback and view refresh hangs
  off the write (`src/settings.ts:525`, `:740`, `:770`). Rearranging what that
  array contains touches none of it.
- **Pages are a typed part of the host API.** `SettingDefinitionPage` is
  `type: 'page'` with `items`, `displayValue`, `status` and `visible`
  (`node_modules/obsidian/obsidian.d.ts:6202`), and `SettingDefinitionItem`
  already admits a page anywhere a group can go. Nothing here needs
  `src/types/obsidian-internals.d.ts`.
- **Two rows already re-render the pane, and two deliberately do not.**
  `basePath`, `geocodeProvider`, `amapKeyStore` and every list write call
  `update()`; `coordsProperty` patches text in place precisely to avoid one,
  because a re-render mid-keystroke takes the caret with it (`src/settings.ts:811`).
  Anything that has to stay current on a page entry inherits that constraint.
- **Photos is the one group built before the helper.** It is spelled out inline
  with `setting.photos`/`setting.photos.desc` keys while the other seven go
  through `group()` and `settings.<key>.heading`/`.intro` (`src/settings.ts:716`).

## Goals / Non-Goals

**Goals:**

- One click from the pane's root to the topic being changed, and nothing else in
  the way once there.
- The root answers the questions a reader opens the pane to check — which
  coordinate system, which base, which search provider — without opening a page.
- Zero change to what any row stores, validates, or refreshes.

**Non-Goals:**

- Inventing new topics or moving rows between groups. Which rows belong together
  is a question this change deliberately does not reopen; it is the existing
  eight groups, promoted.
- Warning indicators. `status: 'warning'` would suit "Amap selected, no key
  configured", but that is a judgment about what needs attention, and it belongs
  with the row that knows, not with a change about navigation.
- Icons on the entries. The host renders page entries in its own idiom; a custom
  icon strip is the imperative pane this change exists to avoid.
- Any change to the settings a map view can override, or to how a view option
  wins over a plugin setting.

## Decisions

### Native pages, not a custom tab bar

`SettingDefinitionPage` renders navigable entries from the same definitions the
pane already returns, so search indexing, control binding, validation and the
write seam all keep working untouched.

The alternative — an icon tab bar across the top, as several older plugins draw —
requires overriding `display()`, which 1.13 deprecates in favour of
`getSettingDefinitions()` and which would take this pane off the declarative seam
that `CLAUDE.md` makes non-negotiable. It would also mean hand-rolling search over
rows the host can no longer see. A tab bar is a nicer picture and a worse contract.

Collapsible groups were considered and rejected for a plainer reason: the host
offers no such affordance, so it is the same imperative rendering with more state.

### One page per existing group, eight in all

Coordinate system, Open in map, Open in external map, Place search, Location,
Pins, Tracks, Photos. Each keeps its heading as the entry's name and its intro
paragraph on the page, where it is read next to the rows it explains rather than
as one of eight stacked paragraphs at the top of a scroll.

Pins is one toggle today and still gets a page: it is where the next pin setting
lands, and an entry that states `On`/`Off` at the root answers the question
without the click anyway.

The two external-map lists (`type: 'list'`, with their drag, delete and add
affordances) move onto the External maps page unchanged. A list inside a page is
an ordinary `SettingDefinitionItem`.

Photos joins the other seven through the same `group()`-derived page builder,
which means renaming its two strings to `settings.photos.heading` and
`settings.photos.intro`. Same text, same locales; it removes a special case that
exists only because that group predates the helper.

### `displayValue` only where a write already re-renders

An entry states its current value when one value sums the page up:

| Page              | States                                 |
| ----------------- | -------------------------------------- |
| Coordinate system | the selected system's label            |
| Open in map       | the configured base file, or "not set" |
| External maps     | how many map apps are switched on      |
| Place search      | the selected provider                  |
| Location          | on / off                               |
| Pins              | on / off                               |
| Tracks            | nothing — no single value sums it up   |
| Photos            | on / off                               |

Every one of those is behind a dropdown, a toggle, a file picker or a list — all
of which already call `update()` or can safely re-render, because none of them
has a caret to lose. No text row gets a `displayValue`, which keeps the rule
simple: a value shown on an entry is a value whose write can re-render the pane.

### Verify search before committing to the shape

The requirement that search still reaches every row is load-bearing: a reader who
knows a row's name must not have to know which page holds it. The host's own
documentation says the definition tree is stored "for rendering and search
indexing", and `searchable` is defined on the item, not the group — both point at
a search that descends. That is an inference, not a measurement, so it is
verified in the live vault before the rest of the pane is moved, against a
single converted page.

If search turns out not to descend, the shape does not survive contact and the
change narrows rather than shipping a pane whose rows can only be found by
memory.

## Measured

Both gating questions were answered against Obsidian 1.13.7's own shipped
implementation (`resources/obsidian.asar`, `app.js`), read after the Tracks
group was converted and the pane confirmed to render it as a navigable entry:

- **Search descends into pages.** The indexer's walk has an explicit
  `"page" === l.type` branch: it matches the page's own name, extends the
  breadcrumb path, and recurses into `l.items`. Results group under the page's
  name and activate through `navigateToSearchResult`, which opens the page. A row
  on a page is therefore reachable by search exactly as a row on the root is.
- **`update()` keeps the reader where they are.** `SettingTab.update()` re-reads
  the definitions and calls `SettingsModal.refreshCurrentPage(tab)`, which
  re-displays the open page when the page stack is non-empty and only falls back
  to `renderTab()` at the root.
- **A page entry's value is read at render.** The entry evaluates
  `displayValue()` each time it is drawn, and leaving a page calls `renderTab()`,
  so a value changed on a page is current when the reader comes back without
  anything having to call `update()`. This is the host's own idiom: its snippets,
  font and excluded-files pages all state a count the same way.

## Risks / Trade-offs

- **Settings search may not index rows inside pages** → answered above; it does.
- **`update()` while a sub-page is open may navigate back to the root** → answered
  above; it re-displays the open page instead.
- **One more click to reach a row a reader used to scroll to** → the root states
  the values worth checking, and search still lands on the row directly. Weighed
  against a scroll that already passes thirty-five rows and is about to grow.
- **Screenshots and guide passages that show the old pane** → the guide's
  settings references are updated in this change, which is the first thing the
  new user-guide requirement asks of it.

## Migration Plan

No data migration: `data.json`, every key, and every default are untouched, and a
reader who upgrades finds the same values arranged differently. Rollback is
reverting the commit; nothing on disk was written in a new shape.
