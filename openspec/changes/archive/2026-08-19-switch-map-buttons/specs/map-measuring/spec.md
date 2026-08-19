## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Measuring can be switched off

The reader SHALL be able to switch measuring off. With it off, a map view SHALL
offer no measuring control and no measurement SHALL be possible on it, while
everything else the map draws SHALL be unchanged. The setting SHALL default to
on, so a reader who never opens it keeps the map they had.

Switching it SHALL reach maps that are already open rather than only maps opened
afterwards. Switching it off while a measurement is on screen SHALL put that
measurement away first, leaving the map exactly as the reader stopping by hand
would have left it.

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
