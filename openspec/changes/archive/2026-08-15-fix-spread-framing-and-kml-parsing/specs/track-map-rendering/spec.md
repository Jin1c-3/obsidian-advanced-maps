## MODIFIED Requirements

### Requirement: Supported track formats preserve equivalent data

The plugin SHALL read GPX, GeoJSON, KML, and TCX geometry and SHALL preserve available elevation, timestamps, waypoint names, and line names needed by downstream map features. Reading SHALL tolerate the formatting a valid file is permitted to vary, including whitespace around the separators inside a KML coordinate tuple.

#### Scenario: Equivalent route is supplied in each format

- **WHEN** equivalent geometry and metadata are encoded as GPX, GeoJSON, KML, and TCX
- **THEN** each format produces equivalent route geometry and statistics within the tested tolerances

#### Scenario: Track content is invalid

- **WHEN** a supported file cannot be parsed safely
- **THEN** the failure is reported without producing fabricated coordinates such as `0,0`

#### Scenario: Namespaced or partial XML data is present

- **WHEN** KML uses alternate namespace prefixes or TCX includes samples without a position
- **THEN** recognized geometry is read by semantic element name and position-less samples are skipped without inventing coordinates

#### Scenario: KML coordinate tuples carry whitespace around their separators

- **WHEN** a KML file writes its tuples as `lon, lat` or `lon , lat , ele` rather than unspaced
- **THEN** the same positions are read as from the unspaced form, and the file draws rather than being rejected as having no drawable geometry
