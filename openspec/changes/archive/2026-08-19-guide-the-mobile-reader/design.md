## Context

See proposal.md — Why. Three facts shape the approach.

The map's context menu is not this plugin's. `TrackLayer` wraps the native
view's `showMapContextMenu(ev: MouseEvent)` and appends items through
`Menu.forEvent(ev)`. Whether a long press opens that menu is the native Maps
view's behavior, not something the guide can decide or this change can fix.

The offline basemap's mobile answer is already visible in the code and only
needs confirming. `offlineBasemap()` resolves a vault-relative template through
`adapter instanceof FileSystemAdapter`, which mobile's adapter is not, so a
relative template has no base and returns null there. An absolute template
skips that branch and depends only on `Platform.resourcePathPrefix`. The
guide's flat "untested" is therefore likely to be wrong in both directions.

The maintainer workflow already fixes what each verification surface may
answer, including that an emulator settles chrome, resource URLs, and
permission prompts but never a timing. This change consumes that requirement
and does not restate it.

## Goals / Non-Goals

**Goals:**

- One reading pass over the guide that leaves no instruction naming a gesture
  the reader's device lacks.
- Two figures, both captured from the released mobile application.
- The offline basemap's mobile behavior stated per template kind.

**Non-Goals:**

- A platform matrix. Platform facts belong at the instruction they affect; the
  first page carries one short section and no table.
- A separate `mobile.md` guide page. Mobile is a property of every feature, not
  a feature, and a new page costs two locales plus a sidebar entry to describe
  something the affected pages should say themselves.
- Any source change. If the measurements expose a plugin defect, this change
  records it and a separate proposal fixes it.

## Decisions

**Where the platform statement goes: `getting-started.md`, after Install.**
The new spec requirement asks for the page a store reader reads first, and
Requirements/Install already sit there. The alternative — the guide index —
carries the hero figure and no prose the statement would attach to.

**Two figures, not one composite.** A phone map view and a touch context menu
answer different questions on different pages, and a composite would force one
alt text over both. The map-view figure goes beside the new mobile section; the
context-menu figure goes in `coordinates-and-services.md`, where four of the
six right-click instructions live.

**Both figures keep the Android status bar and the Obsidian mobile toolbar.**
The new requirement asks a platform figure to show the host's own chrome so a
reader can match it to their screen, and the chrome is also the only thing
distinguishing this from a narrow desktop window. Existing figures are 1600 px
wide crops of a desktop leaf; a portrait phone frame is scaled to roughly a
third of that so it does not dominate the page, and quantised to 256 colours
like the other map graphics.

**Demo data comes from the established synthetic recipe, pushed to the
on-device vault.** The maintainer's real vault is never captured. The existing
`_maps-demo` generator supplies notes with real landmark coordinates, and the
emulator's vault at `/sdcard/Documents/advanced-maps-demo` receives it by `adb
push`; it is removed afterwards.

**The touch-gesture prose follows the measurement, and both outcomes are
written now.** For the map's context menu:

- If a long press opens it, the affected passages read "right-click, or long
  press on a touch device", and the second figure shows it.
- If it does not open, those passages state that the step is desktop-only, the
  second figure is replaced by whatever the touch surface does offer for the
  same task, and the missing gesture is written up as a separate proposal
  rather than patched here.

The same rule covers the five hover passages and the measure tool's
double-click: each is measured, and the passage states the touch behavior or
names the feature desktop-only. `places-in-and-out.md:20` is not a map gesture
— it right-clicks a file in the explorer — so its touch equivalent is the
mobile file menu, and it is checked separately from the map ones.

**The offline basemap paragraph states an outcome per template kind**, absolute
and vault-relative, because the code path already differs between them. A
single sentence covering "mobile" would be wrong whichever way it was written.

## Risks / Trade-offs

- **The emulator's software renderer draws something a phone would not** →
  every figure is compared against the desktop figure of the same feature
  before it ships, and nothing about speed, smoothness, or memory is written
  from these captures.
- **A long press opens Android's own WebView selection menu instead of
  Obsidian's** → that is a finding, not a blocked task: it is what the guide
  then has to tell the reader, and it becomes the separate proposal.
- **Platform notes spread through the guide go stale when Obsidian changes** →
  they are kept to the instruction they qualify and phrased as what the reader
  does, so a stale one reads as a wrong step rather than a wrong platform
  claim.
- **Two locales drift** → the English pass lands first and the Chinese pass
  follows the same passage list, with `check-docs-links.mjs` and the site build
  covering the figure references.
