## Context

See proposal.md — Why. What matters here is where each feature is reached from,
because that is where its switch has to be read:

- **The offline basemap** is reached from four places. `TrackLayer.offerPacks()`
  swaps `maps.settings.tileSets` for an array of ours across one
  `initializeMap`; `appendTrackOptions` adds a background group to every map's
  options; the `loadConfig` wrapper substitutes a pack's URL into the config the
  host built; and `switchToTileSet` answers for ids the host would decline.
  Everything except the swap and the option group reads packs through
  `plugin.tilePacks()`.
- **Five menu items** are added from `workspace.on('file-menu')` ×2,
  `on('editor-menu')`, and three `Menu.forEvent(ev)` calls inside the map's own
  context-menu wrapper. Each runs per menu opened, so each has a natural place to
  answer "not now".
- **Four commands** belong to switched features (`open-in-map`,
  `insert-linked-map`, and the two the exchange of places uses); each already has
  a `checkCallback` deciding whether it applies.
- **Inline maps** are the exception: `embedRegistry.registerExtensions` is
  consulted by the host when it builds an embed, and the host does not ask this
  plugin anything at that moment. The claim itself is the only gate there is.

`maintainer-workflow` already requires that a dependent value's control stays on
its row, inert rather than removed, when the setting deciding whether it is used
at all is switched off. Seven feature switches make that a page-level question,
which is why this change states what a feature switch is, once, in that spec.

## Goals / Non-Goals

**Goals:**

- One shape for all seven, so the eighth is obvious to write and to review.
- A switched-off feature costs a reader nothing that is visible from the host:
  no menu item, no option, no claimed extension, no array of ours in another
  plugin's settings object.
- Every flip reaches what is already open, or says what has to be reopened.

**Non-Goals:**

- Changing what any feature does while it is on. Every scenario that passes today
  passes unchanged with its switch on.
- A switch for anything only a command reaches, for the coordinate system, or for
  the native-view wrapping itself — see proposal.md.
- Restructuring the settings pane. Each switch goes on the page its feature is
  already configured on; only the exchange of places, which has no page, gets
  one, the way `pins` is one toggle on a page of its own.

## Decisions

**One boolean per feature, read where the feature is reached from, not where it
is registered.** The listeners stay registered for the plugin's lifetime and
answer "not now" — a menu handler returns before adding its item, a command's
`checkCallback` answers false, which is what already takes an unavailable command
out of the palette. Registering and unregistering listeners per flip would be
more moving parts than reading a boolean, and would put the plugin's own
teardown on a path that runs at arbitrary times.

**The basemap's gate lands at `plugin.tilePacks()`.** Every consumer that asks
"which packs are there" — the default background, the picker's choices, the
substitution, and `syncOffer`, which is what keeps the host's control current —
already reads through that one method, so one gate switches off nearly the whole
feature and leaves nothing to forget. Two call sites do not ask about packs and
need their own gate: `offerPacks()`, which must install nothing at all, and
`appendTrackOptions`, which must not add the background group. The settings pane
is unaffected: it reads the stored rows directly, which is why the packs stay on
screen while the feature is off.

_Alternative:_ a `basemapEnabled()` consulted at each of the six call sites. Six
places to forget, against one that already exists.

**A background of ours is never handed to the host.** The `loadConfig` wrapper
passes a background the plugin does not own straight to the native call, on the
reasoning that it must be one of the host's. With the feature off, a base file
still holding `offlineTiles: pack:City` would make that string a native tile-set
id, which the host would look up and not find. The gate is therefore written as
"the id is passed on only when it is not one of ours", which also covers a stale
`pack:` id naming a pack that has since been removed — today that reaches the
host and survives only by its not-found path.

**`switchToTileSet` stays wrapped while the basemap is off.** Only one branch of
that wrapper belongs to this feature; the rest reprojects the camera, replaces
the location dot and redraws the tape when the reader picks one of the host's own
backgrounds, and a map with no pack still needs all of it.

**The switch decides the swap, and the swap cannot be handed over later.** The
host's control keeps the array it was constructed with, so a map opened while the
basemap was off has a control holding the host's own list — which is the whole
point — and switching on cannot reach it. The map's own options are rebuilt on
every call, so the packs are pickable there at once; the control catches up when
that map is opened again. The spec states this, and the pane says it where the
switch is.

**The basemap defaults to off, and to on for a reader who already has a pack.**
It is the one feature whose on state costs a non-user something they cannot
avoid, so on-for-everyone is what this change exists to stop; off-for-everyone
would silently take away a configured background. The default is therefore
computed once when settings are read, beside the legacy single-pack migration
that already runs there, and written with the next settings write. The other six
default on: absent key reads as on, so an upgrading reader's `data.json` needs no
migration at all.

**Inline maps claim and release the extensions as the switch moves.**
`registerExtensions`/`unregisterExtensions` are the pair `onload`/`onunload`
already use; the switch reuses them, recomputing which extensions are unclaimed
at the moment it claims, so an extension another plugin has taken meanwhile is
left with its owner. Switching off runs the same teardown loop `onunload` runs,
so no WebGL context is left held by a feature that is off. Switching on cannot
retroactively turn an already-rendered embed into a map: the host consulted the
registry when it built that embed. A markdown preview can be asked to render
again; whether that reaches an embed in the editing view is a question for the
running app, and whichever way it answers, the row says what needs reopening.

**A switched-off feature's own configuration goes inert, and shared
configuration does not.** `menuLabel` means nothing while open-in-map is off, and
the Around view name means nothing while the nearby map is off, so both are
disabled and stay on screen stating what they hold. The base path, the view name,
the coordinate property and the place property are read by other features and
stay live. Two pages become inert wholesale: the packs and the default pack while
the basemap is off, and the providers, their order and the custom destinations
while external links are off.

**Where each switch goes.** Beside the configuration it governs: the offline
basemap page, the open-in-map page (twice — the second above the Around view
name), the map-buttons page for the map menu's `New note here`, the external maps
page, and the tracks page for inline maps. The exchange of places has no page and
gets one holding its switch. The map-buttons page's heading and intro widen from
"the buttons this plugin adds to a map view" to what this plugin adds to a map
view, buttons and menu items alike.

**Each flip refreshes exactly what it changed**, through the dispatch the pane
already runs on a settings write: the basemap re-runs the basemap refresh every
map already has, inline maps run the registry churn and the embed teardown, and
the four menu-only switches refresh nothing, because a menu is built when it is
opened. Every one of the seven re-renders the settings pane, because each decides
whether the rows under it are inert.

## Risks / Trade-offs

- **Seven switches is seven more ways to be wrong**, and a settings pane that
  reads as a list of things to turn off → one shape for all of them, stated once
  in `maintainer-workflow` and reviewed against it; six default on, so a reader
  who never opens the pages sees no change; and the switch sits on the page its
  feature is already configured on rather than in a list of switches.
- **Turning the basemap on does not reach the background control of a map that is
  already open** → stated in the spec, said in the pane, and the packs are
  pickable at once from the map's own options. Reopening the map is the whole
  remedy.
- **A reader upgrading with no pack finds the offline basemap off** and may read
  that as the feature having been removed → the page states it, the release note
  states it, and the guide's offline page starts with the switch.
- **Switching inline maps off changes what a note shows** — an embed becomes the
  host's own rather than a map → the feature defaults on, the row says exactly
  what the embed becomes, and nothing is written to the note either way.
- **`disabled` may not be supported by every declarative control type** the inert
  rows use → verified per control while implementing; where a control cannot be
  made inert it is left live rather than hidden, because hiding configuration
  reads as having lost it.
- **A stale `pack:` id in a base file behaves differently** once it stops being
  passed to the host: the host's not-found fallback is replaced by this plugin's
  own default-background answer → the same background is drawn either way, and
  the picker already names a background nothing answers to.
- **Rolling back to a version before this change** leaves the seven keys unread,
  so a feature switched off is on again → worth one line in the release note;
  nothing is lost, since no switch clears configuration.

## Migration Plan

Six keys need no migration: absent reads as on, which is what the plugin does
today. The seventh is computed once where settings are read — on when the
reader's settings, after the single-pack migration that already runs there, hold
at least one pack; off otherwise — and is written with the next settings write,
the way the legacy basemap keys are already dropped. A reader who has no pack and
adds one later turns the switch on first, because the pack rows are inert until
they do.
