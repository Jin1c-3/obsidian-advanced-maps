## Why

The manifest ships `isDesktopOnly: false`, so the community store offers this
plugin to phones. The guide never confirms that. All twenty figures are desktop
captures, mobile appears only as four caveats about what will not work, and six
instructions tell the reader to right-click a map that has no right button. A
reader on a phone cannot tell whether the plugin is broken or the guide was
written for someone else.

An Android emulator running the released APK is now part of the maintainer
workflow, so the mobile surface can be captured and its open questions settled
instead of hedged.

## What Changes

- Add a short mobile section to the guide's first page, carrying one figure of
  a Base map view on a phone, so the store reader's first question is answered
  where they land.
- Give every pointer-only instruction its touch equivalent. Six `right-click`
  instructions across two pages, five `Hovering`/`hovered` passages, and one
  `double-click` currently name a gesture a phone does not have. Each states
  what to do on touch, or says plainly that the feature is desktop-only.
- Add one figure of the map's context menu as it opens under touch, beside the
  instructions that depend on it.
- Replace the offline basemap's `Mobile reaches local files by a different
route and is untested` with what the emulator measures. A vault-relative
  template resolves through `FileSystemAdapter`, which mobile does not use, so
  the answer is expected to differ by template kind rather than be a flat no.
- Both locales, in step, as the documentation check requires.

Explicitly out of scope: mobile retakes of the existing feature figures, and
any claim about smoothness, frame rate, or memory. The emulator renders in
software, and the maintainer workflow already forbids recording a timing from
it as verified.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `published-documentation`: the guide must cover the mobile surface it is
  published for — instructions usable without a pointer, at least one figure of
  the plugin on a phone, and no platform claim the maintainer cannot measure.

## Impact

- `docs/guide/en/` and `docs/guide/zh-cn/`: `getting-started.md`,
  `coordinates-and-services.md`, `places-in-and-out.md`, `tracks-and-areas.md`,
  `photo-maps.md`, `around-and-navigation.md`, `offline-basemap.md`.
- `docs/images/`: two new figures, referenced by both locales.
- No source change. If capturing the figures shows the plugin itself behaving
  wrongly under touch, that is a separate change; this one documents what
  ships.
