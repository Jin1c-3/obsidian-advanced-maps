## ADDED Requirements

### Requirement: Geometry crossing the 180th meridian is drawn where it lies

A drawn line or ring SHALL follow the ground it covers rather than the numeric
range of its longitudes: consecutive positions SHALL be joined along the shorter
way round the globe, and automatic framing SHALL cover that ground. Direction
indicators and start and end markers SHALL sit on the drawn path. The
coordinates a reader is shown, copies, or has written to a note SHALL remain in
ordinary WGS-84 range, and route statistics SHALL be unchanged by how the
geometry is drawn.

#### Scenario: A route crosses the meridian

- **WHEN** a track's positions run east past 180° and continue as negative longitudes
- **THEN** it is drawn as one short path across the meridian rather than as a line back around the world

#### Scenario: A crossing route is framed automatically

- **WHEN** automatic framing runs for geometry that spans the meridian
- **THEN** the camera covers the ground that geometry occupies rather than the whole globe

#### Scenario: A crossing route has direction and endpoint markers

- **WHEN** route markers are enabled for a track that crosses the meridian
- **THEN** its arrows follow travel direction along the drawn path and its start and end markers sit at the drawn ends

#### Scenario: Statistics for a crossing route

- **WHEN** distance is measured for a track that crosses the meridian
- **THEN** it reports the ground actually covered, unchanged by the drawing

#### Scenario: A coordinate is read back from a crossing map

- **WHEN** the user copies a coordinate or writes one to a note from a map showing crossing geometry
- **THEN** the longitude is in the ordinary −180 to 180 range

#### Scenario: Geometry that does not cross

- **WHEN** a file's geometry stays within one side of the meridian
- **THEN** it is drawn and framed exactly as before
