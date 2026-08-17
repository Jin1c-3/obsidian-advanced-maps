## ADDED Requirements

### Requirement: Area geometry is drawn where it is framed

Area geometry SHALL be rendered wherever it is already counted for automatic
framing, so no supported file can move the camera to a place it draws nothing.
An area SHALL be filled in its owning note's colour, SHALL have its boundaries
stroked using the same width, opacity, and colour a route line uses, and SHALL
take its fill opacity from the configured track opacity rather than from a
separate control. An area SHALL be the lowest-priority pointer target among the
features this plugin draws: where an area overlaps any other drawn feature, the
pointer SHALL act on the other feature.

#### Scenario: A file's only geometry is an area

- **WHEN** a note references a supported file whose geometry is a polygon
- **THEN** the camera frames that area and the area is drawn there, rather than the map framing an area it leaves blank

#### Scenario: An area has holes

- **WHEN** a polygon declares inner rings
- **THEN** the enclosed holes are left unfilled and their boundaries are drawn

#### Scenario: A drawn feature sits over an area

- **WHEN** the pointer is over a track, waypoint, photo, or native marker that lies inside an area
- **THEN** pointing and clicking act on that feature, and the area is acted on only where nothing else is drawn

#### Scenario: The map context menu is opened over an area

- **WHEN** the user opens the map's context menu at a position covered by an area
- **THEN** the menu opens with its coordinate and external-map items, unaffected by the area under the pointer

#### Scenario: An area is drawn on a Chinese-datum background

- **WHEN** an area is displayed on GCJ-02 or BD-09 tiles
- **THEN** its rings are shifted once into the tile datum, like every other drawn geometry, and the area covers the same ground it does on WGS-84 tiles

#### Scenario: Track opacity changes on an open map

- **WHEN** the user changes the track opacity setting while an area is on screen
- **THEN** the area's fill and boundary both follow that setting immediately, without a separate area control

## MODIFIED Requirements

### Requirement: Supported track formats preserve equivalent data

The plugin SHALL read GPX, GeoJSON, KML, and TCX geometry and SHALL preserve available elevation, timestamps, waypoint names, and line names needed by downstream map features. Reading SHALL tolerate the formatting a valid file is permitted to vary, including whitespace around the separators inside a KML coordinate tuple. Where a format distinguishes an area from a line, that distinction SHALL survive reading: a KML polygon's outer boundary and its holes SHALL be preserved as one area rather than as unrelated lines, while a ring that no polygon declares as a boundary SHALL keep being read as a line.

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

### Requirement: Route features remain distinguishable

Each rendered route SHALL expose its line, ordinary waypoints, direction indicators, and start/end roles without causing one role to be rendered as another. Geometry that is not a route SHALL NOT be given route roles: an area SHALL receive no direction indicators and no start or end markers.

#### Scenario: A route has waypoints and overlapping endpoints

- **WHEN** route markers are enabled for a loop with ordinary waypoints
- **THEN** ordinary waypoints remain waypoint dots, direction indicators follow travel direction, and both start and end markers remain eligible to render

#### Scenario: Route-marker setting changes

- **WHEN** the user toggles route markers on an already open map
- **THEN** direction and endpoint visibility changes immediately without waiting for a track file edit

#### Scenario: One file holds both a route and an area

- **WHEN** route markers are enabled for a file containing a line and a polygon
- **THEN** the line keeps its direction arrows and start/end markers and the area receives neither, on a boundary that would otherwise look like a closed line
