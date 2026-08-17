## ADDED Requirements

### Requirement: A point on the map can be written into a note that already exists

The map's own context menu SHALL offer to write the clicked coordinate into a
note the reader chooses from the vault, and that coordinate SHALL be the same
WGS-84 value the menu's other coordinate consumers use — converted out of the
tile datum and back into longitude range exactly once for the click. The chooser
SHALL show, for each candidate, the value its coordinate property already holds.
A note that already holds a coordinate SHALL NOT have it replaced until the
reader is shown the note, the existing value and the replacement and confirms.
The write SHALL set only the configured coordinate property, and SHALL report
the note and the value that reached it.

#### Scenario: A note with no coordinate is placed

- **WHEN** the reader picks a note that has no coordinate property value
- **THEN** the clicked coordinate is written to that note's coordinate property and reported, with nothing else asked

#### Scenario: A note that is already placed is chosen

- **WHEN** the reader picks a note that already holds a coordinate
- **THEN** the note, its current value and the new one are shown first, and nothing is written unless the reader confirms

#### Scenario: The reader declines the replacement

- **WHEN** the confirmation is dismissed
- **THEN** the note is left exactly as it was

#### Scenario: The map is on tiles of a different datum

- **WHEN** the coordinate is taken from a map drawn on Chinese-datum tiles
- **THEN** the value written matches what the same click reports as coordinates, rather than being shifted twice or not at all

#### Scenario: The camera has been carried past the 180th meridian

- **WHEN** the click happens after the map has been panned past ±180°
- **THEN** the written longitude is within range

#### Scenario: The chosen note is outside the map's own query

- **WHEN** a stamped note is not among the results the map is drawing
- **THEN** the write is still reported, rather than appearing to have done nothing because no pin arrived
