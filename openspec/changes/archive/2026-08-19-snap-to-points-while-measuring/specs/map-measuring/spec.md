## MODIFIED Requirements

### Requirement: A measurement is ground distance between the places clicked

A measurement SHALL be the great-circle distance between the WGS-84 coordinates
the clicked pixels stand for, never between their representations in the datum a
particular background is drawn in. Changing the background under a live
measurement SHALL redraw the same places where the new tiles put them and SHALL
NOT change the distance stated.

Where a point is taken from something already drawn on the map, the measurement
SHALL use that thing's own WGS-84 coordinate rather than the coordinate the
pointer's pixel stands for, on every background alike.

A measurement crossing the 180th meridian SHALL be the short way round, and the
line and its labels SHALL be drawn on one side of the world rather than the line
being drawn across it.

#### Scenario: Measuring on a mainland background

- **WHEN** two places are measured on a map whose tiles are drawn in a mainland
  datum
- **THEN** the distance is the one between the real places, matching what the
  same two places measure on a WGS-84 background

#### Scenario: The background is switched mid-measurement

- **WHEN** the reader changes a map's background, or its coordinate system, while
  a measurement is on screen
- **THEN** the points are redrawn where the new tiles put them and the stated
  distance is unchanged

#### Scenario: A measurement crosses the 180th meridian

- **WHEN** two points are placed either side of the antimeridian
- **THEN** the distance is the short way between them, and each label sits on the
  segment it belongs to

#### Scenario: Two notes are measured on a mainland background

- **WHEN** the reader takes both ends of a measurement from note pins on a map
  whose tiles are drawn in a mainland datum
- **THEN** the distance is the one between the two notes' own stored
  coordinates, not between the offset positions their pins are drawn at

## ADDED Requirements

### Requirement: A measured point can be taken from a point already on the map

While measuring is on, a pointer within a short screen distance of a point
already drawn on the map SHALL offer that point, and a click SHALL then place
the point at that thing's own coordinate rather than at the coordinate under the
pointer. The offer SHALL be shown on the map, at the coordinate that would be
taken, before the click that takes it — including before the first point of a
measurement has been placed.

The points on offer SHALL be the ones the map draws as points: a note's pin, a
track's waypoints and its start and end pins, a photo's position, and the
measurement's own earlier points. The point last placed SHALL NOT be on offer,
so the offer is never a segment from a point to itself. A route, an area
boundary, or any other line SHALL NOT be on offer, because a drawn line's
vertices are simplified for drawing and are not the coordinates any file
recorded.

Where more than one point is within range, the nearest to the pointer SHALL be
the one offered. Where the map cannot answer what it has drawn, no point SHALL
be offered and the click SHALL place the coordinate under the pointer, exactly
as it did before anything was on offer.

#### Scenario: A point is placed near a note's pin

- **WHEN** the pointer comes within range of a pin and the reader clicks
- **THEN** the point is placed at that note's own coordinate, and every distance
  stated is measured from there

#### Scenario: The offer is shown before it is taken

- **WHEN** the pointer comes within range of a point already on the map
- **THEN** the map marks the coordinate that a click would take, and the mark
  goes when the pointer leaves the range

#### Scenario: A measurement is closed on the place it started

- **WHEN** the reader brings the pointer back within range of the measurement's
  first point
- **THEN** that point is offered, and clicking closes the route exactly on it

#### Scenario: The point just placed is under the pointer

- **WHEN** a point has just been placed and the pointer has not left it
- **THEN** nothing is offered, because a leg from a point to itself is not a
  measurement

#### Scenario: Two things are within range at once

- **WHEN** a waypoint and a pin are both within range of the pointer
- **THEN** the one nearer the pointer's own pixel is the one offered

#### Scenario: The reader means the ground and not the thing on it

- **WHEN** the reader holds the bypass key while pointing and clicking
- **THEN** nothing is offered and the point is placed exactly where the pointer
  is, at the coordinate that pixel stands for

#### Scenario: The map is mid-style-swap

- **WHEN** a background change has taken the drawn layers away while the pointer
  moves over the map
- **THEN** no point is offered, nothing is raised, and a click places the
  coordinate under the pointer
