## MODIFIED Requirements

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
