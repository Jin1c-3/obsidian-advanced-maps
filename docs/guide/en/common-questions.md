---
title: 'Common questions'
description: 'What to check when a map is empty, a note shows two maps, a marker looks wrong, a pin sits off the road, or a command has gone.'
---

# Common questions

<!-- nav:start -->

**English** · [简体中文](../zh-cn/common-questions.md) · [Guide index](README.md)

<!-- nav:end -->

Start with what you see. Pick the heading closest to it, then follow the link to
the page that explains the feature. If nothing here matches, the last section says
what to include in a report.

## Nothing is on the map

### Obsidian says to enable the built-in Maps plugin

Advanced Maps adds to the **Maps** view Obsidian ships, so that view has to exist.
Check all three: Obsidian 1.13.1 or newer, **Bases** turned on, and the **Maps**
plugin installed and enabled. Obsidian shows the notice once, after it finishes
loading, when the view is not registered. See
[Getting started](getting-started.md).

### The Base is a map view, but it draws nothing

Start with the Base. Every marker, track, and photo comes from one of its results.

| Check                                | Where                                                           |
| ------------------------------------ | --------------------------------------------------------------- |
| Does the filter return results?      | The result count beside the view name                           |
| Do the notes carry a coordinate?     | The map view's **Marker coordinates** option names the property |
| Is the property really a coordinate? | `39.9042, 116.4074` — a pair, in that order                     |

If the filter matches no files, the map stays empty and reports nothing. That is
expected. [Getting started](getting-started.md) has a complete Base to copy and
compare against.

### One note draws two maps

An embed and a link mean different things, and the `!` is the whole difference:

| In the note                           | Track on base map views | Inline map in the note |
| ------------------------------------- | ----------------------- | ---------------------- |
| `![[route.gpx]]`                      | yes                     | yes                    |
| `[[route.gpx]]`                       | yes                     | no                     |
| `track: "[[route.gpx]]"` (a property) | yes                     | no                     |

So a note that already appears on a Base map and also renders its own map is
embedding the track. Drop the `!` and the track still draws on every map the note
appears on, without a second map in the note itself.

The route summary and elevation profile belong to the inline map too, so a plain
link removes them from the note. Either keep the embed, or write the figures into
the note's own properties with **Write track statistics to properties**. See
[Tracks and areas](tracks-and-areas.md).

## Something is drawn, but wrong

### A marker is a solid circle with no icon, or an unexpected flat colour

Both usually point to an invalid value, and neither produces an error:

- **A solid circle with no icon** means Lucide does not have that icon name. The
  name has to match Lucide's own spelling exactly.
- A marker in the **theme's text colour** — near-black in a light theme, near-white
  in a dark one — is a colour CSS could not parse.

A missing property is different from a wrong one. With no property at all you get
the default dot and the default blue. See
[Marker icons and colors](marker-icons-and-colors.md).

### Pins sit a few streets away from the road

The basemap and the saved coordinate are using different coordinate systems.
Chinese map providers publish GCJ-02 or BD-09. Your notes hold WGS-84, which is
what a GPS, a phone photo, and a GPX file record.

Set the map's **Tile coordinate system** — or the plugin-wide default — rather than
editing the numbers in your notes. The conversion happens at the map's edge, and
everything read, copied, or written stays WGS-84. See
[Coordinates and map services](coordinates-and-services.md).

### A photo is in the Base but has no marker

Only a readable location creates a marker; nothing is invented. A photo with no
location stays a Base result with nothing on the map. A geotagged photo whose
thumbnail cannot be used still gets a dot.

If a whole album is missing, check that **Show photos** is on, that the files are
JPG, JPEG, PNG, WebP, HEIC, HEIF, or AVIF, and that the folder is inside the vault
and indexed by Obsidian. See [Photo maps](photo-maps.md).

### Clearing the photo index changed nothing

That is expected. **Clear the photo index** discards only what was saved for later
sessions. It does not refresh an open map or change a photo. If another program
changed a photo without Obsidian noticing, clear the index and reload the vault.
See [Photo maps](photo-maps.md#photo-index-and-file-reads).

## A command or a menu item is missing

### The item was there before

Start with the feature switches. A feature that adds itself to an existing menu,
map, or file type can be disabled as a unit, taking its menu item, its command, and
the work behind it with it, while keeping its configuration. The table in
[Reference and privacy](reference-and-privacy.md#turning-a-feature-off) lists all
seven switches and what each one removes.

**Use offline basemaps** is the only one that starts off. An upgrade turns it on
automatically when it finds a pack that was already configured.

### Open in map says to set a base file

**Open in map** needs to know which Base to open. Set **Base file** — and, if the
Base holds more than one view, **View name** — under **Settings → Advanced Maps →
Open in map**. The other notices from that command name what they could not find: a
path that no longer resolves, a view name the Base does not have, or a Base with no
map views at all. See
[Open the current note in that map](around-and-navigation.md#open-the-current-note-in-that-map).

### Write track statistics is missing, or wrote nothing

The command appears only while the active Markdown note resolves at least one
supported track. If it is missing from the palette, check the note's link first. If
it runs without writing, the notice names the cause. The common ones are:

- _no figure is switched on_ — nothing is selected under **Settings → Advanced
  Maps → Tracks → Track properties**, so there is nothing to write.
- _has no track data to measure_ — the linked file contains no measurable route
  data.

A read error or a property-name collision is also reported before anything is
changed. On a later successful run, a figure that is on but can no longer be
calculated has its old property removed. Figures that are off and unrelated
properties are left alone. See [Tracks and areas](tracks-and-areas.md).

## Basemaps, search and location

### An offline pack draws nothing

Check these in order:

1. **Use offline basemaps** is off. It defaults to off unless a pack was already
   configured.
2. The path is a URL, or does not include `{z}`, `{x}`, and `{y}` (or `{-y}`).
   Enter the filesystem template, including the tiles' real file extension; the
   plugin builds the URL itself.
3. The tiles are not on this device. A phone handed a desktop's absolute path draws
   your pins over the background colour and says nothing: the path resolves, the
   tiles are simply not there.
4. **Lowest zoom level** and **Highest zoom level** do not match the smallest and
   largest `z` folders in the pack.

See [Offline basemap](offline-basemap.md), which also covers the two layouts that
keep a hundred thousand tiles out of the vault's index.

### Place search asks for a key, or fails

Amap requires a web-service key. Add one under **Settings → Advanced Maps → Place
search**, or switch to OpenStreetMap (Nominatim), which needs no key. A failure
notice includes the reason reported to the plugin.

Nominatim allows one request a second, and the plugin shares that interval between
the search box and the reverse-geocode command, so a search may pause briefly
rather than fail. See
[Search and reverse geocode](coordinates-and-services.md#search-and-reverse-geocode).

### Device location never comes back

Your operating system answers this one. There is no key and no service of the
plugin's own. If the plugin gives up before getting a fix — because permission was
denied, no location service exists, or the first request failed — the notice names
the reason and the automatic fill pauses for the rest of the session. A failure
after a successful fix does not stop later attempts. Running **Fill coordinates
from current location** by hand resets the pause. Permissions belong to Obsidian
and to your operating system, not to this plugin's settings. See
[Coordinates and map services](coordinates-and-services.md).

## On a phone

The mobile app supports the same map features. Two practical details differ:

- **A gesture the guide names.** Where a step says right-click, long-press.
- **A directory link to an external album.** That is desktop filesystem setup. A
  phone cannot reuse a desktop's link, and a tile pack path from a desktop resolves
  to tiles the phone does not have.

Each page states its own platform limits where the feature is described. The mobile
overview is in [Getting started](getting-started.md#on-mobile).

## Nothing here matches

[Open an issue](https://github.com/Jin1c-3/obsidian-advanced-maps/issues) and
include:

- the Obsidian version and the Advanced Maps version;
- what you expected on the map and what is on it instead;
- the Base's filter and the map view's coordinate property;
- a screenshot of the map, and the note or file that is not drawing, with any
  private content redacted;
- anything the console said, if a notice appeared.

Seeing the map beside the note or file that produced it often makes the cause
clear.
