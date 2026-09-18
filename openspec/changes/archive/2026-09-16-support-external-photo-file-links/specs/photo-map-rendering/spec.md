## ADDED Requirements

### Requirement: Explicit external photo links participate in note maps

A syntactically valid inline Markdown link or image embed in a matched note
whose destination is an absolute `file:` URL naming a supported photo SHALL
contribute that photo when the current device can read it. The external photo
SHALL remain an attachment of the matched note rather than becoming a Base
result of its own. Canonically equivalent destinations SHALL participate once.

Advanced Maps SHALL discover only the individual files explicitly linked from
the note body. It SHALL NOT traverse a `file:` directory destination, treat an
unsupported external file as a photo, or interpret text inside code as a photo
link.

#### Scenario: Matched note links a readable external photo

- **WHEN** a Base result note contains `[photo](<file:///path/to/photo.jpg>)` and
  that destination is readable on the current device with usable GPS metadata
- **THEN** the map shows one photo point owned by that note without requiring
  the photo to be indexed by Obsidian

#### Scenario: External photo is embedded in the note

- **WHEN** the same readable external photo is written as an inline Markdown
  image embed instead of a normal link
- **THEN** it participates in the map under the same photo rules

#### Scenario: A note carries destinations for multiple devices

- **WHEN** a note links device-specific external photo destinations and only a
  subset can be read on the current device
- **THEN** the readable supported photos participate and the unavailable
  destinations do not prevent vault tracks, vault photos, or other readable
  external photos from drawing

#### Scenario: The same external destination is repeated

- **WHEN** canonically equivalent `file:` destinations occur more than once as
  links or embeds in one note
- **THEN** that external photo participates once

#### Scenario: A file URL appears only as code

- **WHEN** link-shaped text containing a supported `file:` destination appears
  inside an inline code span or fenced code block
- **THEN** it contributes no photo

#### Scenario: A note links an external directory

- **WHEN** a note links a `file:` directory containing supported photos
- **THEN** Advanced Maps does not traverse the directory and adds none of its
  children to the map

### Requirement: External photo reads remain bounded and trustworthy

Advanced Maps SHALL obtain external photo metadata and embedded thumbnails
through the same bounded-prefix policy used for vault photos. It SHALL reuse
derived metadata only when the current device can validate that it still
describes the linked external file. Where a platform cannot provide a stable
file revision, the plugin SHALL re-derive the bounded metadata rather than
trust a persistent entry blindly.

An external file change is outside the vault event lifecycle. It SHALL be
observed when a later map synchronization validates or re-reads that source;
the plugin SHALL NOT create a watcher or a second filesystem index to promise
an immediate refresh.

#### Scenario: External resource honors a range request

- **WHEN** the current device can serve a linked external photo by byte range
- **THEN** Advanced Maps reads and parses no more than the configured photo-head
  bound to obtain its map metadata

#### Scenario: Stored metadata still matches the external file

- **WHEN** a later session validates the same linked external file with the
  file state from which its stored metadata was derived
- **THEN** the stored point may be restored without re-parsing the photo head

#### Scenario: External photo changed outside Obsidian

- **WHEN** a later map synchronization finds that a linked external photo no
  longer matches its cached file state
- **THEN** the old metadata is not used and the photo is re-read before a point
  is placed

#### Scenario: External file state cannot be validated

- **WHEN** the current platform can read the photo bytes but cannot provide a
  trustworthy revision for persistent-cache validation
- **THEN** Advanced Maps derives the result from a bounded current read instead
  of placing a point from an unverifiable stored entry

### Requirement: External photos retain photo interactions

A mapped external photo SHALL use a current-device resource URL for its
thumbnail, hovered preview, and full-size modal. A normal click SHALL preserve
the map while opening that modal; a base-map modal SHALL retain the route back
to the owning note. If the full image later becomes unavailable, the owning
note's popup and the already mapped fallback point SHALL remain usable rather
than becoming an empty interaction.

#### Scenario: Reader opens an external photo from a base map

- **WHEN** the reader normally clicks a mapped external photo
- **THEN** its full-size modal opens over the map and offers the owning note

#### Scenario: Reader opens an external photo from an inline map

- **WHEN** the reader normally clicks a mapped external photo on an inline map
- **THEN** its full-size modal opens without a redundant action for the host
  note already being read

#### Scenario: External preview becomes unavailable

- **WHEN** a mapped external photo can no longer supply a displayable preview
- **THEN** its base-map popup still describes the owning note and its inline
  hover still identifies the photo by name
