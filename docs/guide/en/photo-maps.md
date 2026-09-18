---
title: 'Photo maps'
description: 'Map a whole photo folder or the photos linked from notes, control thumbnails and thinning, and manage the photo index.'
---

# Photo maps

<!-- nav:start -->

**English** · [简体中文](../zh-cn/photo-maps.md) · [Guide index](README.md)

<!-- nav:end -->

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

> [!IMPORTANT]
> This is a desktop filesystem setup. Create an equivalent link on each desktop
> that should see the album; mobile devices cannot reuse a desktop link. Keep
> cloud files available offline and avoid link loops. The source directory is
> still outside the vault, so check whether your backup and sync tools follow
> the link instead of assuming the photos are covered. Advanced Maps reads the
> photos but never modifies them.

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

### Link individual photos outside the vault

An inline Markdown `file:` destination can name a supported photo that Obsidian
does not index. A normal link puts it on the map without displaying it in the
note; add `!` to ask Obsidian to display it there too. Both forms count for the
map, though the host may not render a raw external embed on every platform:

```markdown
[desktop photo](<file:///G:\My Drive\Camera\P 20260911 091346.jpg>)
![phone photo](file:///storage/emulated/0/DCIM/Camera/P_20260911_091346.jpg)
```

These are absolute, device-specific paths. A synchronized note can contain one
destination per device: Advanced Maps uses the supported files the current
device can read and skips the others without dropping the note's tracks or
vault photos. Repeating the same destination as a link and an embed still maps
it once.

On Android, a path outside the vault is readable only when Obsidian has **All
files access**. A vault in **Device storage** asks for that permission during
setup; **App storage** does not. Enable it for Obsidian under Android's special
app access settings before using a `/storage/emulated/0/...` destination. A
`file:` image embed may still look broken in the note because Android's web view
does not display that raw URL; Advanced Maps uses the host's local-resource
route for the map. Use an ordinary link when only the map needs the photo.

Only inline Markdown links and image embeds in the note body count. Raw HTML,
reference-style links, frontmatter values, network URLs, external tracks, and
text inside code do not. **Set coordinates from a photo** also continues to use
vault attachments only.

> [!IMPORTANT]
> The absolute paths are stored in the note and travel wherever that note is
> synced, so consider whether their folder names disclose anything private. A
> `file:` URL naming a directory is not an album: Advanced Maps never traverses
> it. Use the [directory-link setup above](#put-a-onedrive-or-other-external-album-inside-the-vault)
> when a desktop needs a whole external folder in a Base.

External files have no Obsidian vault events. A file changed by another program
is validated again on the next map data refresh or when the map is reopened; it
is not watched for an immediate redraw. Where the device supplies trustworthy
file revision metadata, the photo index can restore unchanged derived metadata.
Otherwise Advanced Maps performs a current bounded head read rather than trust
an unverifiable stored result.

Verified on the maintained Android 16 emulator with Obsidian 1.13.7: a readable
`file:///storage/emulated/0/...` photo was served through the host-derived
`http://localhost/_capacitor_file_/storage/emulated/0/...` route and drawn beside
its vault GPX, while an unavailable `file:///G:\...` desktop link in the same
note was skipped.

![One note's own walk on satellite imagery, its photos drawn as thumbnails wherever their EXIF says they were taken](../../images/photo-map.jpg)

## Coordinates and display

Photo coordinates remain WGS-84 in the vault. At the map boundary they follow
the same tile-datum conversion as note markers and tracks. **Photo coordinate
system** can force WGS-84 or GCJ-02 when an unlabelled camera wrote something
non-standard.

Zoomed out, colliding thumbnails thin to a stable subset instead of piling into
an unreadable stack; every mapped photo still has a dot. Zoom in and eligible
thumbnails return. **Show photos** and **Show photo thumbnails** can
disable the two layers independently.

![The same photos at three zoom levels: thumbnails everywhere close in, thinning to a stable few over a field of dots as the map zooms out](../../images/photo-thinning.gif)

## Open a photo or its note

Hovering a photo shows the owning note when it has one, with the photo itself
previewed inside that popup so a dot on a crowded map can be identified without
opening it. Clicking opens the photo at full size without replacing the map, with
an **Open note** row below. Ctrl/Cmd-click opens the image file in a new tab.

On a phone a tap goes straight to that full-size view, so the preview popup is
one step you do not get. Nothing is lost on the way to the note: **Open note**
is inside the photo you just opened.

![A geotagged photo opened from its marker, with the image, filename, and an Open note action in a modal over the map](../../images/photo-popup.jpg)

**Set coordinates from a photo** reads the same GPS tag into the current note's
`coords` property.

## Photo index and file reads

The first pass reads at most the first 64 KiB of each photo. Derived coordinate,
time, orientation, and thumbnail-availability metadata is cached, so later
sessions can place a large album without reopening every unchanged file.

**Clear the photo index** discards this reconstructible cache. Maps keep working
and metadata is read again as needed; photo bytes are never modified.
