## Why

The offline basemap is paid for by readers who do not use it. Every map's
`initializeMap` hands the host's background control an array this plugin owns in
place of `maps.settings.tileSets`, whether or not a single pack is configured —
that is deliberate, because the control keeps the array it was handed and a pack
added later has to land in it, but it costs the control its live reference to the
host's own list, so a background added in the Maps settings tab now reaches an
open map only on the next configuration reload rather than on the next click.
Every map's view options carry a background dropdown besides, which with no pack
offers two entries that both mean "the background the native view resolves".
Nothing turns any of that off.

Looking for the same shape elsewhere found it in six more places. This plugin
adds five items to menus it does not own — the note's ⋮, the editor's right-click
menu, and three on the map's own — and claims four file extensions across the
whole vault. Each appears without being asked for, and none of them can be
declined: a reader who wants a Base map and nothing else still right-clicks a
note and finds `Insert map of nearby notes`, which on a vault with no base
configured can only answer with a notice.

## What Changes

Seven switches, each for a feature that appears without being asked for. What a
switch takes away it takes away everywhere: the menu item, its command, and the
work behind it.

- **Offline basemap** — off, no array is swapped into the host's settings object,
  no background dropdown is added to a map's options, and no pack is resolved,
  offered or drawn. The packs stay configured and are shown on their page, inert.
  This is the one switch that defaults **off**: on for a reader whose upgrade
  brings a pack with it, so nobody loses the pack they have, and off for everyone
  else, which is what "a reader who does not use this is not affected by it"
  means.
- **Open in map** — the note's ⋮ item and the `open-in-map` command.
- **Insert map of nearby notes** — the editor's right-click item and the
  `insert-linked-map` command.
- **New note here** — the map's right-click item that writes a clicked
  coordinate into a note.
- **Places in and out** — a track file's ⋮ `Import places`, and the map's
  right-click `Export places`, which are the two halves of one exchange.
- **Inline route maps** — off, the four track extensions are left unclaimed, so
  `![[route.gpx]]` is the embed Obsidian makes of it with no plugin installed.
- **External map links** — one switch over the six built-in destinations and the
  custom ones, in place of six toggles and a list to empty.

The six after the first default **on**: each is what the plugin does today, and
an upgrading reader keeps the plugin they have.

What deliberately gets no switch, having been looked at:

- **Commands** — a command runs because it was invoked. Nothing appears
  uninvited, so there is nothing to decline. The commands belonging to a switched
  feature go with it; the rest stay.
- **The coordinate system** — its dropdown appears on every map, but its "off" is
  the value it already defaults to, and a plugin whose datum handling can be
  switched off is a plugin that quietly draws pins in the wrong place.
- **Tracks, photos, pins, map buttons, device location** — each already has its
  switch; this change adds none and changes none of them.
- **The native view wrapping itself** — the plugin's reason to exist. Disabling
  the plugin is what turns it off.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `offline-basemap`: a requirement that the whole feature can be switched off,
  stating what a switched-off basemap leaves the host holding, that the packs are
  kept, and that flipping it reaches maps already open.
- `note-map-navigation`: `Open in map` and `Insert map of nearby notes` are each
  a feature a reader can switch off, item and command together.
- `location-and-geocoding`: the map menu's `New note here` is a feature a reader
  can switch off; the coordinate it writes and its confirmations are unchanged.
- `place-interchange`: import and export are one feature, switched off together.
- `inline-track-maps`: an extension is claimed only while inline maps are on, and
  switching off puts back the embed the host would make on its own.
- `external-map-links`: one switch decides whether any external destination is
  offered, above the per-provider arrangement that already exists.
- `maintainer-workflow`: what a feature switch is, stated once — that a feature
  appearing where the reader did not ask for it carries one, that flipping it
  reaches what is already open, that it keeps its feature's configuration rather
  than clearing it, and that its default leaves an upgrading reader what they
  had.

## Impact

- `src/main.ts` — the menu and command registrations read their switch;
  `tilePacks()` answers with none while the basemap is off; the embed registry is
  claimed and released as the inline switch moves.
- `src/track-layer.ts` — `offerPacks` installs nothing while the basemap is off;
  the `switchToTileSet` wrapper stays, because its other half reprojects the
  camera for the host's own backgrounds.
- `src/view-options.ts` — the background group is offered only while the feature
  is on.
- `src/settings.ts` — seven keys, their rows, and what each flip refreshes.
- `src/i18n.ts` — a name and a description per switch, per locale.
- `docs/guide/{en,zh-cn}` — one line per feature page, and a table in the
  reference page naming every switch and what it takes away.
- Stored settings: seven new keys. Six default on and read the same as an absent
  key; the basemap key is written once on load from whether a pack is configured,
  beside the migration that already runs there.
