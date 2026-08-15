## Purpose

Defines how geotagged photos become map points and thumbnails while preserving coordinate correctness, bounded resource use, and meaningful interactions.

## Requirements

### Requirement: Supported photos participate in note maps

Referenced JPG, JPEG, PNG, WebP, HEIC, HEIF, and AVIF files with readable GPS metadata SHALL participate in the same note-to-map resolution pipeline as track attachments.

#### Scenario: Note references a geotagged photo

- **WHEN** a base result note references a supported photo containing GPS metadata
- **THEN** the map shows a photo point owned by that note

#### Scenario: Photo uses any supported reference form

- **WHEN** a note embeds, body-links, or frontmatter-links supported geotagged photos
- **THEN** every distinct resolved photo participates once, subject to the Show photos setting

#### Scenario: Photo file is a direct base result

- **WHEN** a supported geotagged photo itself appears in the base result
- **THEN** it is mapped even when no note references it

#### Scenario: Photo has no usable coordinate

- **WHEN** a supported photo lacks readable GPS metadata
- **THEN** no fabricated map point is added and other attachments continue rendering

### Requirement: Photo metadata reads are bounded and resilient

The plugin SHALL attempt to obtain EXIF coordinate, orientation, timestamp, and embedded thumbnail from a bounded file prefix and SHALL fall back safely when ranged access is unavailable.

#### Scenario: Metadata exists near the file head

- **WHEN** a large photo contains the required EXIF data within the configured head-read limit
- **THEN** the plugin obtains the map data without retaining or parsing the full photo

#### Scenario: Platform does not honor the partial read

- **WHEN** partial resource access fails or returns more bytes than requested
- **THEN** the plugin falls back as needed but parses no more than the bounded prefix

### Requirement: Photo coordinates honor the configured datum

Photo coordinates SHALL be normalized to WGS-84 using the selected photo datum policy: automatic metadata-aware interpretation, forced WGS-84, or forced GCJ-02.

#### Scenario: Automatic mode has no explicit photo datum

- **WHEN** EXIF provides GPS coordinates but no recognized GCJ-02 datum marker
- **THEN** the coordinates are treated as WGS-84

#### Scenario: User changes the photo datum

- **WHEN** a user changes the photo-coordinate setting for a cached photo
- **THEN** the photo is reinterpreted and the corrected point reaches every open map without requiring a file modification

### Requirement: Every mapped photo remains visible

A mapped photo SHALL have a plain point fallback whether or not a thumbnail exists, is enabled, is admitted for decoding, or has finished decoding.

#### Scenario: Thumbnail is unavailable or pending

- **WHEN** a photo point has no registered thumbnail image
- **THEN** the map still displays its fallback dot and the point remains interactive

### Requirement: Thumbnail density and memory are bounded

Thumbnail symbols SHALL use screen-space collision to thin crowded views, restore eligible images as zoom creates room, correct EXIF orientation before cropping, and bound decoded off-screen images and concurrent decoding. While thumbnails are disabled, no thumbnail SHALL be decoded or retained, and enabling them again SHALL decode the currently eligible thumbnails without requiring a reload.

#### Scenario: Many photos occupy one screen region

- **WHEN** more thumbnails overlap than the current view can display legibly
- **THEN** a stable subset of thumbnails is shown while all photo dots remain represented

#### Scenario: User pans through a large album

- **WHEN** photos repeatedly enter and leave the viewport
- **THEN** visible non-overlapping thumbnails remain eligible, stale unselected images are evicted within the configured cache bound, and unwanted completed decodes are discarded

#### Scenario: Embedded thumbnail is stored sideways

- **WHEN** EXIF orientation rotates or mirrors a thumbnail
- **THEN** orientation is applied before the square cover crop so the displayed icon is upright and correctly framed

#### Scenario: Thumbnails are switched off with an album on screen

- **WHEN** the thumbnail setting is disabled while photos are displayed
- **THEN** the thumbnail images already decoded are released, no further photo is decoded while the setting stays off, and every photo remains represented by its dot

#### Scenario: Thumbnails are switched back on

- **WHEN** the thumbnail setting is enabled again on the same map
- **THEN** the eligible thumbnails for the current view are decoded and displayed without reopening the map

### Requirement: Photo interactions preserve both photo and note context

On a base map, hovering a photo SHALL show its owning note, a normal click SHALL open a photo modal without replacing the map, and a modifier click SHALL retain Obsidian's new-tab behavior for the image.

#### Scenario: User clicks a thumbnail and its fallback dot fires too

- **WHEN** one pointer event is delivered for both photo layers
- **THEN** exactly one photo modal opens

#### Scenario: Photo modal belongs to a base map

- **WHEN** a base-map photo modal opens
- **THEN** it offers a route to the owning note using the map's current note-opening behavior

### Requirement: Photos do not alter route measurements

Photo points SHALL remain outside route statistics, elevation profiles, and profile hit corridors.

#### Scenario: Track embed includes photos from its host note

- **WHEN** an inline route map also draws geotagged photos
- **THEN** distance, ascent, elapsed time, moving time, and elevation samples are calculated from the route alone

### Requirement: Derived photo metadata survives a session

The plugin SHALL persist the metadata it derives from a photo — coordinate,
altitude, timestamp, the datum marker the file stated, orientation, and whether
an embedded thumbnail exists — so that a later session can place that photo
without reading the file again. A photo found to have no usable coordinate SHALL
be recorded as such and SHALL NOT be re-read on a later session while its stored
entry remains trustworthy.

Thumbnail image bytes SHALL NOT be persisted. A thumbnail SHALL be obtained from
the file when the photo is actually admitted for decoding.

#### Scenario: Vault reopens with an unchanged album

- **WHEN** a map shows photos that were already read in a previous session and none of their files changed
- **THEN** their points are placed from stored metadata without reading the photo files

#### Scenario: Album is mostly photos without GPS

- **WHEN** most photos in a base result were previously found to carry no GPS
- **THEN** those photos are not re-read, and the map continues to add no point for them

#### Scenario: A stored photo scrolls into view

- **WHEN** a photo placed from stored metadata becomes eligible for a thumbnail
- **THEN** its thumbnail is read from the file at that point, subject to the existing decode and memory bounds

### Requirement: A stored entry is trusted only while it still describes its file

A stored entry SHALL be used only while the file it describes has the same
identity and content state the entry was derived from. An entry whose file
changed, was replaced, or is no longer in the vault SHALL NOT be used to place a
point, and SHALL be removed or re-derived.

#### Scenario: Photo is edited between sessions

- **WHEN** a photo's contents change while the plugin is not running
- **THEN** the stored entry is not used and the photo is re-read before it is placed

#### Scenario: Photo is renamed or deleted

- **WHEN** a photo the index describes is renamed or removed from the vault
- **THEN** no point is placed from the old entry, and the entry does not persist indefinitely

#### Scenario: Photo datum setting changes

- **WHEN** the user changes the photo-coordinate setting
- **THEN** stored entries are reinterpreted into the newly selected datum without re-reading the photo files, and the corrected points reach every open map

### Requirement: The index is derivable and never authoritative

The index SHALL be reconstructible from the photos alone. Deleting, truncating,
corrupting, or failing to write it SHALL change only how much work a session
repeats, never which points a map shows or where they are. The plugin SHALL
continue to function with no index at all, and SHALL offer the user a way to
discard it.

#### Scenario: Index file is missing or unreadable

- **WHEN** the stored index is absent, malformed, or written by an incompatible version
- **THEN** the plugin starts with an empty index, derives metadata from the photos as it does today, and reports nothing worse than the slower first pass

#### Scenario: Index cannot be written

- **WHEN** writing the index fails
- **THEN** the current session's maps are unaffected and the failure does not surface as a map error

#### Scenario: User discards the index

- **WHEN** the user clears the index
- **THEN** open maps continue to show the same points, and later reads repopulate the index

### Requirement: Index growth is bounded

The stored index SHALL be bounded in size and SHALL prefer retaining entries that
recent sessions used. Reaching the bound SHALL cost repeated derivation for
evicted photos and SHALL NOT drop or misplace any point.

#### Scenario: Vault has more photos than the index bound

- **WHEN** more distinct photos are read than the index is allowed to retain
- **THEN** the index stays within its bound, every photo in the current result is still placed correctly, and evicted photos are simply re-derived when next needed
