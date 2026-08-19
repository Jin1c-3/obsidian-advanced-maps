## Purpose

A reader can ask a map how far one place is from another, get an answer in the
datum the ground is in rather than the one the tiles are drawn in, and have
nothing left behind when they stop asking.

## ADDED Requirements

### Requirement: A distance can be measured on a map

A map view SHALL offer a measuring control. While measuring is on, clicking the
map SHALL append a point to the measurement, the points SHALL be joined in the
order they were placed, and every point after the first SHALL be labelled on the
map with the distance from the first point along that line. A readout SHALL state
the total of the points placed, and SHALL say what to do instead while fewer than
two have been.

Where a pointer is available, the segment from the last placed point to the
pointer SHALL be drawn distinctly from the measurement and labelled with the
total including it, and that segment SHALL NOT be counted into the readout. Where
no pointer is available, the measurement SHALL still be readable from the points
placed.

The last point placed SHALL be removable, one at a time, without restarting the
measurement.

#### Scenario: Two points are placed

- **WHEN** the reader turns measuring on and clicks two places on the map
- **THEN** a line joins them, the second carries the distance from the first, and
  the readout states that same distance

#### Scenario: A third point is added

- **WHEN** a further place is clicked
- **THEN** it is labelled with the distance from the first point through every
  point placed before it, and the readout states that running total

#### Scenario: Only one point has been placed

- **WHEN** exactly one place has been clicked
- **THEN** no distance is claimed anywhere, and the readout says what to do next

#### Scenario: The pointer moves before the next click

- **WHEN** at least one point has been placed and the pointer moves over the map
- **THEN** a distinct segment follows the pointer, labelled with the total it
  would produce, while the readout continues to state only what has been placed

#### Scenario: The last point was a mistake

- **WHEN** the reader takes back the last point
- **THEN** it and its label are gone, the remaining measurement is unchanged, and
  taking back more points than were placed does nothing

### Requirement: A measurement is ground distance between the places clicked

A measurement SHALL be the great-circle distance between the WGS-84 coordinates
the clicked pixels stand for, never between their representations in the datum a
particular background is drawn in. Changing the background under a live
measurement SHALL redraw the same places where the new tiles put them and SHALL
NOT change the distance stated.

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

### Requirement: Measuring owns the map's clicks while it is on

While measuring is on, a click on the map SHALL place a point and SHALL NOT also
perform the action that click would otherwise have: it SHALL NOT open a note or a
photo, whether the feature clicked belongs to this plugin or is a native marker,
and SHALL NOT raise a popup over the ground being measured. Two points placed in
quick succession SHALL be two points rather than a zoom.

Any native map interaction suspended for the sake of measuring SHALL be restored
when measuring stops, and one that the reader had already turned off SHALL NOT be
turned on by this.

#### Scenario: A point is placed on top of a marker

- **WHEN** the reader clicks a place where a note's pin is drawn
- **THEN** a point is placed there and that note is not opened

#### Scenario: Two points are placed quickly

- **WHEN** two clicks land close together in time
- **THEN** both become points and the camera does not zoom

#### Scenario: Measuring stops

- **WHEN** the reader puts the measurement away
- **THEN** clicking pins, hovering for popups and the double-click zoom behave
  exactly as they did before measuring started

### Requirement: A measurement is transient and owned end to end

A measurement SHALL write nothing to any note, to plugin settings, or to the base
file, and SHALL NOT survive being put away. Putting it away SHALL remove every
source, layer, element, control and listener taken out for it, and this SHALL
happen for the same reasons the rest of the enhancement is removed: the reader
stopping, the native view destroying its map, and the plugin detaching from the
view or unloading.

A style or background replacement SHALL restore a live measurement's drawn
content rather than leaving the labels standing over a map that no longer has the
line under them.

#### Scenario: The measurement is put away

- **WHEN** measuring is turned off, by the control, by a key, or by the readout
- **THEN** the points, the line, the labels and the readout are gone, and nothing
  in the vault records that the measurement happened

#### Scenario: Measuring is on when the view goes away

- **WHEN** the map view is closed, or Advanced Maps unloads, while a measurement
  is on screen
- **THEN** everything it added is removed, and a map that outlives the plugin
  keeps no listener that would answer a later click

#### Scenario: The style is replaced mid-measurement

- **WHEN** a background change removes every source and layer while a measurement
  is on screen
- **THEN** the measurement is drawn again over the new style with the same points
