# Offline basemap

**English** · [简体中文](offline-basemap.zh-CN.md) · [Guide index](README.md)

Point every map at a folder of tiles already on your disk, and the ground under
your notes stops needing a network. Everything else already worked offline — the
notes, the routes, the photos and their thumbnails are files in your vault — so
this is the last piece.

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

Anything that unpacks into that shape works. What does **not** work is a
single-file `.mbtiles` or `.pmtiles` archive — reading one needs a hook into the
map library that this plugin does not bundle. Unpack it into a directory tree
once and the result is a tile pack.

Keep the pack **outside your vault**. A regional pack is easily a hundred
thousand files, and Obsidian indexes everything inside a vault. A path anywhere
on the machine works.

## Point at it

**Settings → Community plugins → Advanced Maps → Offline basemap.**

| Row                          | What to put there                                                         |
| ---------------------------- | ------------------------------------------------------------------------- |
| Tile path                    | `/home/you/tiles/{z}/{x}/{y}.png` — the shape your files are addressed by |
| Shallowest level in the pack | The lowest-numbered folder your `z` directories go down to                |
| Deepest level in the pack    | The highest-numbered one                                                  |

The path may be absolute, or relative to your vault. `{z}`, `{x}` and `{y}` are
filled in per tile; `{-y}` works too, for packs laid out in TMS row order. Leave
the path empty and every map keeps the background it already has.

Type a filesystem path, not a URL. The plugin turns it into one when it builds a
map, because the prefix that URL needs is regenerated every time Obsidian starts
— a URL written down by hand works until the next restart and then stops.

### The two zoom levels

They are the folder names at either end of your pack, and each stops a different
kind of failure:

- **Deepest** bounds the tiles themselves. Zoom in past it and the map keeps
  drawing, magnifying the deepest tiles you have, instead of asking for files
  that are not there. Set it too low and you lose sharpness you had; too high and
  the map quietly issues a failed read for every tile past the end.
- **Shallowest** bounds the camera. Zoom out towards it and the map stops there
  rather than going blank, because there is nothing above your shallowest level
  to magnify.

If your pack covers `z0`–`z14`, put 0 and 14 in.

## Per map

The **Background** section of a map view's options gains **Offline basemap**. It
is on by default, so configuring a pack reaches every map; set it to _No_ on a
view that should keep its own background — a satellite layer, a Chinese basemap,
whatever that view is configured with.

Your view's own **Map tiles** setting is never overwritten. The offline basemap
is substituted as the map is built, so switching it off on a view brings back
exactly what that view had configured, with nothing to undo.

Inline `![[route.gpx]]` maps have no view options of their own, so they follow
the plugin setting.

## Coordinate systems

A local path names no provider, so **Auto** reads a pack as WGS-84 — right for
the OpenStreetMap-derived packs almost every pack is. If yours was unpacked from
a Chinese provider it is GCJ-02, and automatic mode cannot tell: say so in
Settings → **Coordinate system**, or in the view's own **Tile coordinate system**
option. See [Coordinates and services](coordinates-and-services.md).

## When nothing draws

The map goes to the background colour and your pins and routes still show. Check,
in order:

1. **The path.** It has to be the path to the tiles, `{z}/{x}/{y}` and the file
   extension included — not the folder above them. `ls` the path with real
   numbers substituted; if that file is not there, neither is the tile.
2. **The extension.** `.png`, `.jpg` and `.webp` are all fine, but it has to be
   the one your files actually use.
3. **The zoom levels.** A shallowest level higher than where the map is sitting
   pins the camera; a deepest level set to 0 leaves one tile for the whole world.
4. **The view.** Its **Offline basemap** option may be set to _No_.

Measured on desktop. Mobile reaches local files by a different route and is
untested; nothing breaks there if it does not work, the map simply keeps its
network background.

## What this touches

Nothing. The pack is opened for reading and never written to, moved or deleted,
and no part of this fetches tiles from a provider. When a map is drawing a pack
it makes no tile request to the network at all — see
[Reference and privacy](reference-and-privacy.md) for what does leave.
