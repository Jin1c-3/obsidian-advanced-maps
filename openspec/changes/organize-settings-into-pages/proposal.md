## Why

The settings pane is one flat scroll. Eight headings and roughly thirty-five
rows arrive at once — a coordinate system, a base path, six external-map
providers, an Amap key, a device-location switch, four track knobs, three photo
rows — with no way to look at tracks without scrolling past geocoding. Every
release adds to it: the pane grew a base picker, a custom-map list, a photo
index button and a statistics prefix in the last four versions alone, and the
next change adds nine track property names to the same scroll.

Obsidian 1.13 already answers this. `SettingDefinitionPage` (`type: 'page'`,
`node_modules/obsidian/obsidian.d.ts:6202`) renders a navigable entry that opens
a sub-page built from the same declarative items, and since 1.13.1 the entry can
carry the current value beside its name. That is the same seam this pane already
uses — no imperative rendering, no custom tab bar, no `display()` override,
which 1.13 deprecates.

## What Changes

- Turn each of the pane's eight groups into a navigable page: **Coordinates**,
  **Open in map**, **External maps**, **Place search**, **Device location**,
  **Note pins**, **Tracks**, **Photos**. The root pane becomes those eight
  entries and nothing else.
- Keep each group's intro prose on the page it introduces, where it is read just
  before the rows it explains rather than as one of eight stacked paragraphs.
- Surface the answer on the entry itself. An entry whose page is summed up by
  one value states it (`displayValue`), so "which coordinate system am I on" and
  "which base does navigation use" are answered without opening anything.
- Change no setting, key, default, stored value, refresh rule, or validation.
  This change moves rows; it does not alter what any row does.
- Keep every row findable by settings search wherever it now lives, so a reader
  who types "prefix" still lands on the row rather than having to know which
  page holds it.
- Add a maintainer requirement that user-facing behavior ships with its user
  guide coverage: the guide gains a section, a page, or an edited passage in the
  same change, in both locales, or the change states why the behavior is not
  user-visible.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `maintainer-workflow`: the settings requirement gains the pane's navigation
  contract — grouped rows are reachable through declarative pages rather than
  one flat list, entries may state their current value, and search still reaches
  every row. A new requirement makes user-guide coverage part of shipping
  user-facing behavior, in both locales, rather than a convention stated only in
  prose.

## Impact

- `src/settings.ts` — `getSettingDefinitions()` returns page entries; the
  `group()` helper becomes the page builder; the two external-map lists move
  onto the External maps page; `introItem` moves inside its page. No change to
  `getControlValue`/`setControlValue`, to `TRACK_REFRESH_KEYS`, or to any
  validation on the write seam.
- `src/i18n.ts` — page titles reuse the existing group headings; entry
  descriptions where an eight-line root needs more than a title. Both locales.
- `src/types/obsidian-internals.d.ts` — untouched. `SettingDefinitionPage` is a
  documented, typed part of the Obsidian 1.13 API, not an undocumented internal.
- `docs/guide/reference-and-privacy.md` (+ zh) — where the settings live, now
  that a label alone no longer says where to look; and `CHANGELOG.md`.
- `tests/settings.test.ts` — the pure helpers it already covers are unchanged;
  page structure is verified in a live vault, since the definitions tree needs a
  real `App`.
- No dependency, persisted-data, manifest, or native-seam change. A reader who
  upgrades finds the same settings with the same values, arranged.
