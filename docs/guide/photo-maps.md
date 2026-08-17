# Photo maps

**English** · [简体中文](photo-maps.zh-CN.md) · [Guide index](README.md)

Advanced Maps can place a supported photo because the photo is a direct Base
result or because a matched note links it. In both cases, only a readable GPS tag
creates a location; the plugin never invents one.

## Map a whole photo folder

Start with the complete atlas recipe in [Getting started](getting-started.md), or
add a photo-folder branch to an existing Base:

```yaml
- file.inFolder("assets/onedrive/Pictures")
```

JPG, JPEG, PNG, WebP, HEIC, HEIF, and AVIF files participate directly. A photo
with GPS gets a dot even when it has no usable embedded thumbnail.

### Put a OneDrive or other external album inside the vault

The photo bytes do not have to be copied into the vault. Create a directory link
inside the vault, let Obsidian index it, then use that linked vault path in the
Base filter.

macOS or Linux:

```bash
mkdir -p "/path/to/MyVault/assets/onedrive"
ln -s "/path/to/OneDrive/Pictures" "/path/to/MyVault/assets/onedrive/Pictures"
```

Windows PowerShell (a directory junction avoids the administrator requirement
that symbolic links can have on some systems):

```powershell
$vault = "C:\Users\you\Documents\MyVault"
New-Item -ItemType Directory -Force -Path "$vault\assets\onedrive"
New-Item -ItemType Junction `
  -Path "$vault\assets\onedrive\Pictures" `
  -Target "$env:USERPROFILE\OneDrive\Pictures"
```

Reload the vault and use the linked vault path in the Base.

This is a desktop filesystem setup. Create an equivalent link on each desktop
that should see the album; mobile devices cannot reuse a desktop link. Keep
cloud files locally readable, avoid link loops, and treat the source as external:
verify your backup and sync provider's link behavior instead of assuming the
vault covers it. Advanced Maps reads photos but never modifies them.

## Map only photos linked from matched notes

Keep photo folders out of the Base filter and match notes only:

```yaml
filters:
  and:
    - file.inFolder("places")
views:
  - type: map
    name: Places
    coordinates: coords
    trackWeight: 4
    trackOpacity: 85
    fitMaxZoom: 16
```

Then link photos from a matched note:

```markdown
---
coords: 30.2600,120.1500
---

[[IMG_1234.jpg]]
[[IMG_1235.heic]]
```

Normal body links, embeds such as `![[IMG_1234.jpg]]`, and file links in
frontmatter all count. Each resolved photo participates once. The Base does not
need to include the attachment folder, and an actual embed is needed only when
you also want the image visible in the note.

![One note's own walk on satellite imagery, its photos drawn as thumbnails wherever their EXIF says they were taken](../photo-map.jpg)

## Coordinates and display

Photo coordinates remain WGS-84 in the vault. At the map boundary they follow
the same tile-datum conversion as note markers and tracks. **Photo coordinate
system** can force WGS-84 or GCJ-02 when an unlabelled camera wrote something
non-standard.

Zoomed out, colliding thumbnails thin to a stable subset instead of piling into
an unreadable stack; every mapped photo still has a dot. Zoom in and eligible
thumbnails return. **Show photos on the map** and **Show photo thumbnails** can
disable the two layers independently.

![The same photos at three zoom levels: thumbnails everywhere close in, thinning to a stable few over a field of dots as the map zooms out](../photo-thinning.gif)

## Open a photo or its note

Hovering a photo shows the owning note when it has one, with the photo itself
previewed inside that popup so a dot on a crowded map can be identified without
opening it. Clicking opens the photo at full size without replacing the map, with
an **Open note** row below. Ctrl/Cmd-click opens the image file in a new tab.

![A geotagged photo opened from its marker, with the image, filename, and an Open note action in a modal over the map](../photo-popup.jpg)

**Set coordinates from a photo** reads the same GPS tag into the current note's
`coords` property.

## Photo index and file reads

The first pass reads at most the first 64 KiB of each photo. Derived coordinate,
time, orientation, and thumbnail-availability metadata is cached, so later
sessions can place a large album without reopening every unchanged file.

**Clear the photo index** discards this reconstructible cache. Maps keep working
and metadata is read again as needed; photo bytes are never modified.
