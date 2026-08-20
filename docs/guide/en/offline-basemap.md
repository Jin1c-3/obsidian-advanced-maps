---
title: 'Offline basemap'
description: 'Draw the basemap from tile packs already on disk — several of them, picked from the map or named per view, with zoom bounds and no network at all.'
---

# Offline basemap

<!-- nav:start -->

**English** · [简体中文](../zh-cn/offline-basemap.md) · [Guide index](README.md)

<!-- nav:end -->

Point a map at a folder of tiles already on your disk, and the ground under your
notes stops needing a network. Everything else already worked offline — the
notes, the routes, the photos and their thumbnails are files in your vault — so
this is the last piece.

You can keep more than one. A pack is regional, so someone who has one usually
has two: the city they live in and the trail they walk. Each gets a name, and the
name is how you pick between them.

Advanced Maps **does not download tiles**. Fetching a provider's tiles in bulk is
theirs to permit, not this plugin's to do on your behalf. What this does is point
at a pack you already have, and read it.

## What a tile pack is

A folder of image files in `z/x/y` order, the way every slippy map addresses
them:

```text
tiles/
  6/
    52/
      25.png
      26.png
  7/
    104/
      50.png
```

Anything that unpacks into that shape works. A single-file `.mbtiles` or
`.pmtiles` archive does not, yet. `.pmtiles` is being worked on; what is holding
it up is a bug in Obsidian on Android, not the format. Until that lands, unpack
the archive into a directory tree once and the result is a tile pack.

> [!WARNING]
> Keep each pack **out of the vault's index** — a regional pack is easily a
> hundred thousand files, and an indexed one slows down search, links and every
> Base you have. The two layouts below both avoid that cost; choose based on
> whether your plugin settings sync between devices.

| Your settings        | Put the pack                  | And type                 |
| -------------------- | ----------------------------- | ------------------------ |
| Stay on one device   | anywhere on that device       | an absolute path         |
| Sync between devices | a dot-folder inside the vault | `.tiles/{z}/{x}/{y}.png` |

A path is a single string, so settings that sync hand every device the same one —
and an absolute path can only be right on the machine it was typed on. A
dot-folder is what gets round that: Obsidian skips a folder whose name begins
with a dot, the way it skips `.obsidian`, so the tiles are never indexed, never
searched, never a Base result and never in the file explorer, while one relative
path is resolved by each device against its own vault.

If your settings stay put, there is nothing to solve — give each device an
absolute path of its own. See [On a phone](#on-a-phone) for what that looks like
there.

## Add a pack

**Settings → Community plugins → Advanced Maps → Offline basemap.**

**Use offline basemaps** is the first row, and it starts **off** unless you had a
pack configured before this version. Switch it on first: with it off the packs
below it are shown but cannot be typed into, because a pack nothing draws from is
a pack the page has no business collecting. Switching it off later keeps every
pack exactly as you left it.

Under it, **Add tile pack** gives you a row with four boxes:

| Box                | What to put there                                                         |
| ------------------ | ------------------------------------------------------------------------- |
| Name               | What you want to call it — `City`, `Trail`. This is what you pick it by   |
| Tile path          | `/home/you/tiles/{z}/{x}/{y}.png` — the shape your files are addressed by |
| Lowest zoom level  | The lowest-numbered folder that pack's `z` directories go down to         |
| Highest zoom level | The highest-numbered one                                                  |

The path may be absolute, or relative to your vault. `{z}`, `{x}` and `{y}` are
filled in per tile; `{-y}` works too, for packs laid out in TMS row order.

> [!WARNING]
> Type a filesystem path, not a URL. The plugin turns it into one when it builds
> a map, because the prefix that URL needs is regenerated every time Obsidian
> starts — a URL written down by hand works until the next restart and then
> stops.

**Default background** below the list is what every map opens on unless it says
otherwise. Leave it at _None_ and your packs stay configured and stay pickable
without changing any map until you ask for one.

Give each pack a name of its own. Two packs sharing a name are one pack as far as
everything that refers to one is concerned, and the second is left out.

A row says so when nothing can be pointed at it, under the boxes: a name another
row already carries, a row with a path and no name, or a path missing one of its
three placeholders. Such a row stays where it is, waiting to be corrected, and is
offered nowhere until it is.

### The two zoom levels

They are the folder names at either end of that pack, and each stops a different
kind of failure:

- **Highest zoom level** bounds the tiles themselves. Zoom in past it and the map
  keeps drawing, magnifying the deepest tiles you have, instead of asking for
  files that are not there. Set it too low and you lose sharpness you had; too
  high and the map quietly issues a failed read for every tile past the end.
- **Lowest zoom level** bounds the camera. Zoom out towards it and the map stops
  there rather than going blank, because there is nothing above your lowest level
  to magnify.

If a pack covers `z0`–`z14`, put 0 and 14 in. Each pack carries its own pair, and
the map is bounded by whichever pack it is currently drawing.

## Pick one from the map

Your packs appear in the map's own **layers** button — the stack of squares in
the top-right corner, the same menu the Maps plugin lists its own backgrounds in.
Each pack is there under the name you gave it, beside them.

Choosing one draws it, with that pack's own zoom bounds. Choosing one of the
Maps plugin's backgrounds puts the map on that instead, and it stays there: the
choice is yours until you make another one, and nothing later puts the pack back
underneath you.

The layers button appears once there is more than one background to choose from.
If you have no backgrounds configured in the Maps plugin, one pack is enough to
make it appear, and the menu gains a **Default background** entry — the way back
to what the map would draw with no pack at all.

A choice made here lasts as long as the map is on screen, exactly as a background
picked from that menu already did. Close the tab and reopen it and the map is
back on the background its view names. Nothing is written to a file.

## Per map

The **Basemap** section of a map view's options has one row, **This map opens
on**, listing every background there is: the plugin default, each background the
Maps plugin offers, and each of your packs. So one base file can hold a view on a
city pack and another on the network.

| Choice                            | What that view opens on                     |
| --------------------------------- | ------------------------------------------- |
| Follow the plugin default         | Whatever **Default background** names       |
| None — this view's own background | What the map would draw with no pack at all |
| A background, or a pack, by name  | That one                                    |

Your view's own **Map tiles** setting is never overwritten. A pack is substituted
as the map is built, so choosing _None_ on a view brings back exactly what that
view had configured, with nothing to undo.

If a view names a pack you have since renamed or removed — or a base file written
in another vault names a background this one does not have — the map falls back
to what it would draw with no pack, and the row says so: `Trail — no longer
configured`. Nothing quietly becomes something else.

Inline `![[route.gpx]]` maps have no view options of their own, so they follow
the plugin default.

## Coordinate systems

A local path names no provider, so **Auto** reads a pack as WGS-84 — right for
the OpenStreetMap-derived packs almost every pack is. If yours was unpacked from
a Chinese provider it is GCJ-02, and automatic mode cannot tell: say so in
Settings → **Coordinate system**, or in the view's own **Tile coordinate system**
option. See [Coordinates and services](coordinates-and-services.md).

## On a phone

The same settings draw the same packs in the Obsidian mobile app, the same two
layouts apply, and the layers button offers them the same way. There is no
separate mobile row to fill in.

**Settings that stay on the device.** Give the phone absolute paths of its own —
`/sdcard/Download/tiles/{z}/{x}/{y}.png` and the like, whatever your file manager
shows you. This is the one to reach for on Android: the packs sit where the phone
already keeps large downloads, and nothing about them comes near the vault.

**Settings that sync.** Use `.tiles`, on every device including this one. A phone
handed a desktop's absolute path draws nothing but your own pins over the
background colour — the path resolves, the tiles are simply not there, and no
error says so.

Getting a pack onto the phone is the part this plugin has no hand in: a cable, or
the sync that already carries your vault.

Measured on Android. The address is asked of the running app rather than
assembled from a platform name, so iOS is expected to follow, but it was not
tested and this page does not claim it.

## When nothing draws

The map goes to the background colour and your pins and routes still show. Check,
in order:

1. **The path.** It has to be the path to the tiles, `{z}/{x}/{y}` and the file
   extension included — not the folder above them. `ls` the path with real
   numbers substituted; if that file is not there, neither is the tile.
2. **The extension.** `.png`, `.jpg` and `.webp` are all fine, but it has to be
   the one your files actually use.
3. **The zoom levels.** A lowest level higher than where the map is sitting pins
   the camera; a highest level set to 0 leaves one tile for the whole world.
4. **Which pack.** The map may be on a different one — open the layers button and
   see what is checked, or read the view's **This map opens on** row.

## With it switched off

Off is the state a vault with no pack is in, and it is a real off: nothing of
this feature reaches a map. The Maps plugin's own background button lists exactly
what Maps itself has, because the list it is holding is Maps' own — putting your
packs in that menu means handing the button a list this plugin maintains, and a
background you add in the Maps settings tab then reaches an open map on its next
configuration reload rather than the next time you open the menu. That is the
trade this switch exists to let you decline.

A map's own options lose their **This map opens on** row too. A Base file that
already names a pack keeps the name written in it, unread, and means it again the
moment you switch back on.

Switching it on reaches a map that is already open through that row. The
background button on that map catches up when you open the map again — a button
is handed its list once, when the map is built.

## What this touches

Nothing. A pack is opened for reading and never written to, moved or deleted, and
no part of this fetches tiles from a provider. Your packs are offered in the Maps
plugin's own menu without being written into its settings. When a map is drawing
a pack it makes no tile request to the network at all — see
[Reference and privacy](reference-and-privacy.md) for what does leave.
