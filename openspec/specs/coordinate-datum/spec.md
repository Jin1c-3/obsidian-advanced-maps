## Purpose

Defines the coordinate-system boundary that keeps WGS-84 vault data aligned with WGS-84, GCJ-02, and BD-09 map backgrounds in both directions.

## Requirements

### Requirement: Tile datum is selected per map

Each map SHALL select WGS-84, GCJ-02, or BD-09 from an explicit override or, in automatic mode, from recognized tile-provider URLs.

#### Scenario: Automatic mode uses a recognized Chinese provider

- **WHEN** a map uses recognized Gaode or Tencent tiles
- **THEN** the map uses GCJ-02 tile space

#### Scenario: Automatic mode uses Google China tiles

- **WHEN** a map uses a recognized `google.cn` tile source
- **THEN** the map uses GCJ-02 tile space

#### Scenario: Automatic mode uses Baidu tiles

- **WHEN** a map uses a recognized Baidu tile source
- **THEN** the map uses BD-09 tile space

#### Scenario: Provider cannot be inferred

- **WHEN** a tile URL is not recognized and no override is configured
- **THEN** the map uses WGS-84

#### Scenario: Explicit override conflicts with the URL hint

- **WHEN** a view or plugin explicitly selects a datum instead of automatic mode
- **THEN** the explicit datum wins over every tile-provider hint

### Requirement: Vault coordinates remain WGS-84

Coordinates stored in notes and supported track files SHALL remain WGS-84; selecting a Chinese tile datum SHALL transform only data crossing the map boundary.

#### Scenario: User changes backgrounds round-trip

- **WHEN** a map switches from WGS-84 tiles to a Chinese tile system and back
- **THEN** markers, tracks, and configured center realign with each background while the vault files remain unchanged

#### Scenario: A file's places are imported as notes

- **WHEN** points read from a supported file are written into notes
- **THEN** the coordinates written are the file's own values, unshifted, because a track file is WGS-84 and no map was involved in reading it

### Requirement: All drawn positions enter tile space once

Markers, tracks, configured centers, note popups, device-location controls, focus targets, and restored camera state SHALL be transformed from WGS-84 into the current map's tile datum exactly once.

#### Scenario: Popup opens on a Chinese tile map

- **WHEN** a note popup is requested using the note's WGS-84 property
- **THEN** the popup is anchored on the transformed marker rather than on the unshifted street location

#### Scenario: Device location arrives

- **WHEN** the platform location control supplies a WGS-84 fix on a GCJ-02 or BD-09 map
- **THEN** the control displays the fix in the current tile space while preserving the WGS-84 source value

### Requirement: User-visible output leaves tile space once

Coordinates read from the map for copy, note creation, default-center storage, external actions, file export, or display SHALL be transformed back to WGS-84 exactly once unless a destination provider explicitly requires another datum. A coordinate that never entered tile space — a value read from a note's own property rather than from the map's projection — SHALL be written out unchanged rather than transformed a second time.

#### Scenario: Context menu writes a coordinate

- **WHEN** a user invokes a native coordinate-writing action on a Chinese tile map
- **THEN** the stored or copied coordinate is the corresponding WGS-84 value and will not be shifted a second time on reload

#### Scenario: A base's places are exported over Chinese tiles

- **WHEN** the places a base matched are exported to a file while that map draws GCJ-02 or BD-09 tiles
- **THEN** the written coordinates are the notes' own WGS-84 values, identical to what the same base exports over WGS-84 tiles, rather than the shifted positions the markers were drawn at

### Requirement: Camera position realigns across datum changes

Switching between backgrounds with different datums SHALL preserve the real-world location currently under the camera.

#### Scenario: Background switch changes datum

- **WHEN** the user switches tile sets while centered on a location
- **THEN** the new camera center is the transformed representation of the same WGS-84 location

### Requirement: Conversion is bounded and reversible

Outside the region where Chinese offsets apply, conversions SHALL be the identity; within it, WGS-84/GCJ-02 round trips SHALL meet the repository's near-nanometre test tolerance and BD-09 round trips SHALL remain below 0.2 metres.

#### Scenario: Coordinate round-trip is tested

- **WHEN** representative inside-China and outside-China coordinates are converted out and back
- **THEN** each result satisfies its documented identity or error tolerance
