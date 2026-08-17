## MODIFIED Requirements

### Requirement: Supported track formats preserve equivalent data

The plugin SHALL read GPX, GeoJSON, KML, and TCX geometry and SHALL preserve available elevation, timestamps, waypoint names, waypoint descriptions, and line names needed by downstream map features. Reading SHALL tolerate the formatting a valid file is permitted to vary, including whitespace around the separators inside a KML coordinate tuple. Where a format distinguishes an area from a line, that distinction SHALL survive reading: a KML polygon's outer boundary and its holes SHALL be preserved as one area rather than as unrelated lines, while a ring that no polygon declares as a boundary SHALL keep being read as a line.

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

#### Scenario: A KML polygon declares an outer boundary and an inner one

- **WHEN** a placemark holds a polygon with both an outer boundary and one or more inner boundaries
- **THEN** they are read as a single area whose outer ring bounds it and whose inner rings are its holes, rather than as one line per ring

#### Scenario: A KML ring stands outside any polygon

- **WHEN** a ring appears with no enclosing polygon to declare it a boundary
- **THEN** it is read as a line, as before, and no interior is claimed for it

#### Scenario: A saved place carries a description beside its name

- **WHEN** a KML placemark holds a `<description>`, or a GPX waypoint a `<desc>`
- **THEN** that text is preserved on the feature alongside its name, so a reader of the parsed file can carry it into a note, and a place with no description carries none rather than an empty one
