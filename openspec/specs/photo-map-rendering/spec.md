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

Thumbnail symbols SHALL use screen-space collision to thin crowded views, restore eligible images as zoom creates room, correct EXIF orientation before cropping, and bound decoded off-screen images and concurrent decoding.

#### Scenario: Many photos occupy one screen region

- **WHEN** more thumbnails overlap than the current view can display legibly
- **THEN** a stable subset of thumbnails is shown while all photo dots remain represented

#### Scenario: User pans through a large album

- **WHEN** photos repeatedly enter and leave the viewport
- **THEN** visible non-overlapping thumbnails remain eligible, stale unselected images are evicted within the configured cache bound, and unwanted completed decodes are discarded

#### Scenario: Embedded thumbnail is stored sideways

- **WHEN** EXIF orientation rotates or mirrors a thumbnail
- **THEN** orientation is applied before the square cover crop so the displayed icon is upright and correctly framed

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
