## Purpose

A reader can ask a map how far one place is from another, get an answer in the
datum the ground is in rather than the one the tiles are drawn in, and have
nothing left behind when they stop asking.

## Requirements

### Requirement: A distance can be measured on a map

A map view SHALL offer a measuring control. While measuring is on, clicking the
map SHALL append a point to the measurement, the points SHALL be joined in the
order they were placed, and every point after the first SHALL be labelled on the
map with the distance from the first point along that line. A readout SHALL state
the total of the points placed, and SHALL say what to do instead while fewer than
two have been.

The readout SHALL appear beside the control that turned measuring on, and SHALL
NOT be placed in a region of the map the host application's own interface may
occupy. It SHALL leave that control, and the space around it, exactly as it found
them once measuring stops.

That control SHALL start a measurement when there is none, and SHALL otherwise
fold the readout away and back without ending the measurement, so a reader can
have the map back without losing what they have measured. It SHALL look pressed
for as long as a measurement is out, whatever the readout is doing, and its
accessible name SHALL say which of the three things pressing it does next.
Ending a measurement SHALL be the readout's own dismissal, or the key that
already ends it.

Where a measurement is running with no readout — folded away, or with nowhere to
draw one — the measurement SHALL continue, SHALL remain readable from the labels
on the map, and SHALL still accept points; a readout brought back SHALL state
what is measured then rather than what was measured when it was folded away.

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

#### Scenario: The host's own interface covers part of the map

- **WHEN** the map is drawn on a platform whose application chrome occupies an
  edge of it, such as a phone's navigation bar
- **THEN** the readout is still wholly visible, because it is placed against this
  plugin's own control rather than against a corner of the map

#### Scenario: The control is pressed while a measurement is out

- **WHEN** the reader presses the measuring control during a measurement
- **THEN** the readout is folded away, the points, the line and the labels are
  untouched, and pressing again brings the readout back stating the running total

#### Scenario: Points are placed with the readout folded away

- **WHEN** further places are clicked while the readout is not showing
- **THEN** they are added and labelled on the map as they always are, and the
  readout states the new total when it is brought back

#### Scenario: The measurement is ended

- **WHEN** the reader dismisses the readout itself, or presses the key that ends
  measuring
- **THEN** measuring stops and everything it added is removed

#### Scenario: The measuring control is not on the map

- **WHEN** a measurement is running while the control it belongs to is not on the
  map
- **THEN** the measurement continues and stays readable from its labels, and
  putting it away still removes everything it added

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

- **WHEN** measuring is turned off, by a key or by the readout
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

Where a point is drawn away from the coordinate it stands for — a pin moved by
pin spreading, or a pin whose shape is drawn above the coordinate it marks —
what is drawn SHALL decide whether it is a candidate, since that is what the
reader aimed at, while the coordinate it stands for SHALL be what is offered,
what is measured, and what the offer is ranked and drawn by. A measurement SHALL
therefore never take the drawn position of a spread pin for the position of the
note it stands for.

The reader SHALL be able to bypass the offer and take the ground under the
pointer instead, for the times the ground is the point and not the thing
standing on it.

#### Scenario: A pin the map has moved to keep it apart from its neighbours

- **WHEN** the pointer comes within range of a pin that pin spreading has drawn
  away from its note's own coordinate, and the reader clicks
- **THEN** the point is placed at the note's own coordinate rather than at the
  position the pin is drawn in, and the offer was marked at that same coordinate

#### Scenario: The reader wants the ground, not the thing on it

- **WHEN** the reader takes a point with the bypass held while a point is on offer
- **THEN** the coordinate under the pointer is placed, and nothing is snapped to

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

### Requirement: Measuring can be switched off

Switched off under the shared policy in the feature-switches capability, which states what a switch takes away, what it keeps, and how it defaults. What follows is only what is specific to this feature.

With it off, a map view SHALL offer no measuring control and no measurement SHALL
be possible on it, while everything else the map draws SHALL be unchanged.

Switching it off while a measurement is on screen SHALL put that measurement away
first, leaving the map exactly as the reader stopping by hand would have left it
— the one thing this switch must do that taking a control away does not.

#### Scenario: Measuring is switched off

- **WHEN** the reader switches measuring off
- **THEN** the measuring control is gone from every open map, and the maps are
  otherwise unchanged

#### Scenario: A measurement is running when it is switched off

- **WHEN** a measurement is on screen at the moment measuring is switched off
- **THEN** the points, the line, the labels and the readout are removed, and
  everything the measurement took from the map — its clicks, its popups, its
  double-click zoom — is given back

#### Scenario: Measuring is switched back on

- **WHEN** the reader switches measuring on again
- **THEN** the control returns to every open map, in its ordinary place among
  this plugin's buttons, with no measurement in progress
