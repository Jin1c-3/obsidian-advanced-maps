## ADDED Requirements

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
