# Proposal

## Why

The guide is read by people who wanted a map in their vault, but it is written
for the person who built the plugin. Pages hedge, bury the answer three
subclauses deep, drop internals the reader cannot act on (64 KiB head reads,
emulator build numbers, "the host's local-resource route"), and talk to the
reader in the maintainer's own voice ("a boundary is not a distance travelled").
A first-time reader cannot tell what to do first, and every page asks them to
already know the vocabulary. The same voice runs through both READMEs, which is
the first thing a reader sees.

## What Changes

- Rewrite every guide page in `docs/guide/en/` and `docs/guide/zh-cn/` in plain
  language: short sentences, direct address, one idea per sentence, the answer
  before the caveat, and no rhetorical asides.
- Remove implementation detail from user-facing prose: buffer sizes, cache
  mechanics, thresholds that only exist inside the code, host-route and
  emulator/version references, and "this plugin's" self-description. A number
  stays only when the reader can act on it or it explains something they see.
- Explain every term a reader may not know at its first use on a page — Base,
  frontmatter, formula, EXIF, tile pack, coordinate datum (WGS-84/GCJ-02/BD-09),
  Lucide — in one clause, not a glossary detour.
- Restate verified platform claims as outcomes ("on Android the photo appears on
  the map") instead of verification narration ("verified on the Android 16
  emulator with Obsidian 1.13.7").
- Lead each page with what the reader gets, and order each section as the steps a
  reader takes. Section reshuffles inside a page are allowed; page file names,
  the headings other pages link to, figure references, and settings/command
  labels stay as they are.
- Apply the same rules to `README.md` and `README.zh-CN.md`: same facts, plainer
  sentences, no internals in the pitch.
- Record the writing rules where future work meets them: a `published-documentation`
  requirement set, and per-artifact rules in `openspec/config.yaml`.

No plugin behavior, setting, command, or property changes. No page is added,
removed, or renamed, so the guide index, sidebar, and link checks are unaffected.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `published-documentation`: add requirements for how guide and entry
  documentation prose is written — plain language, no implementation detail,
  terms explained on first use, pages leading with the reader's outcome, and
  verified platform claims phrased as outcomes.

## Impact

- Affected specs: `published-documentation`.
- Affected code: none.
- Affected docs: `docs/guide/en/*` (11 pages), `docs/guide/zh-cn/*` (11 pages),
  `README.md`, `README.zh-CN.md`, and `openspec/config.yaml`.
- Both locales change in the same pass, so no locale is left carrying the old
  voice.
