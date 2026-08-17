## MODIFIED Requirements

### Requirement: Tile datum is selected per map

Each map SHALL select WGS-84, GCJ-02, or BD-09 from an explicit override or, in automatic mode, from recognized tile-provider URLs.

A basemap read from the local file system carries no provider in its path, so
automatic mode SHALL answer WGS-84 for one. A pack unpacked from a Chinese
provider therefore needs its datum stated explicitly, in the same per-map or
per-plugin override every other background uses.

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

#### Scenario: A basemap is read from the local file system

- **WHEN** a map draws a tile pack from a local path in automatic mode
- **THEN** the map uses WGS-84, whatever background the view was configured with
  before the substitution

#### Scenario: Explicit override conflicts with the URL hint

- **WHEN** a view or plugin explicitly selects a datum instead of automatic mode
- **THEN** the explicit datum wins over every tile-provider hint
