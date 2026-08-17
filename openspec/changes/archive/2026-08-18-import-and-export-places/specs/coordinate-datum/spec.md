## MODIFIED Requirements

### Requirement: Vault coordinates remain WGS-84

Coordinates stored in notes and supported track files SHALL remain WGS-84; selecting a Chinese tile datum SHALL transform only data crossing the map boundary.

#### Scenario: User changes backgrounds round-trip

- **WHEN** a map switches from WGS-84 tiles to a Chinese tile system and back
- **THEN** markers, tracks, and configured center realign with each background while the vault files remain unchanged

#### Scenario: A file's places are imported as notes

- **WHEN** points read from a supported file are written into notes
- **THEN** the coordinates written are the file's own values, unshifted, because a track file is WGS-84 and no map was involved in reading it

### Requirement: User-visible output leaves tile space once

Coordinates read from the map for copy, note creation, default-center storage, external actions, file export, or display SHALL be transformed back to WGS-84 exactly once unless a destination provider explicitly requires another datum. A coordinate that never entered tile space — a value read from a note's own property rather than from the map's projection — SHALL be written out unchanged rather than transformed a second time.

#### Scenario: Context menu writes a coordinate

- **WHEN** a user invokes a native coordinate-writing action on a Chinese tile map
- **THEN** the stored or copied coordinate is the corresponding WGS-84 value and will not be shifted a second time on reload

#### Scenario: A base's places are exported over Chinese tiles

- **WHEN** the places a base matched are exported to a file while that map draws GCJ-02 or BD-09 tiles
- **THEN** the written coordinates are the notes' own WGS-84 values, identical to what the same base exports over WGS-84 tiles, rather than the shifted positions the markers were drawn at
