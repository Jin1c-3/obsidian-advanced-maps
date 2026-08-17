## ADDED Requirements

### Requirement: A note popup describes the feature that raised it

When pointing at a feature this plugin drew raises the note popup, that popup
SHALL also describe **that feature**, appended after the properties the host put
there without replacing, reordering or removing any of them. A pointed track
SHALL contribute the measurements of the file it was read from — the same
figures an inline embed of that file reports, and never its note's tracks summed
— and SHALL contribute only the figures that file supplies. A pointed named
waypoint SHALL contribute its name while route markers are enabled and SHALL
contribute nothing while they are not. Where the pointed feature has nothing to
add, the card SHALL be left exactly as the host built it.

Measurements contributed to a popup SHALL be taken from the track's unshifted
WGS-84 data rather than from the geometry drawn in the map's tile datum.

Removing the enhancement SHALL return the host's popups to exactly what it
builds unaided.

#### Scenario: Pointer is on one track of a note carrying several

- **WHEN** the pointer raises a popup by pointing at one track of a note that links more than one track file
- **THEN** the popup names that track and reports that track's own distance, climb and duration, with the note's other tracks counted in none of them

#### Scenario: Pointed track supplies no elevation or no timestamps

- **WHEN** the pointed track's file carries no elevations, or no timestamps, or neither
- **THEN** only the figures the file supports are contributed, rather than zeroes standing in for figures that were never recorded

#### Scenario: Pointer is on an area rather than a route

- **WHEN** the pointer raises a popup by pointing at an area drawn from a file that holds no route
- **THEN** no measurements are contributed, since an area is not a route and its boundary is not a distance travelled

#### Scenario: Map is drawn in a shifted tile datum

- **WHEN** a track is pointed at on a map whose tiles are drawn in a shifted datum
- **THEN** the distance reported in the popup is the one measured on the file's own WGS-84 data, matching an inline embed of that same file

#### Scenario: Pointer is on a named waypoint

- **WHEN** the pointer raises a popup by pointing at a waypoint carrying a name, with route markers enabled
- **THEN** the popup states that waypoint's name

#### Scenario: Route markers are turned off

- **WHEN** route markers are disabled and a named waypoint is pointed at
- **THEN** no waypoint name is contributed and the rest of the popup is unchanged

#### Scenario: Host built the card without a property list

- **WHEN** the pointed feature's note has only one displayable property, so the host's card carries a title and no property list
- **THEN** the contributed description still appears, presented the same way a property of that card is

#### Scenario: The host raises no popup at all

- **WHEN** the pointed feature belongs to a note whose displayed properties are all empty, which the host answers by raising no popup
- **THEN** no popup is forced open and nothing is contributed

#### Scenario: Pointer crosses from an owned feature to a native marker

- **WHEN** the pointer leaves a feature this plugin drew and reaches a native marker pin
- **THEN** that pin's popup describes its note alone, carrying nothing over from the feature pointed at before it

#### Scenario: Enhancement is removed while the host stays open

- **WHEN** the enhancement is detached from a view that remains open
- **THEN** later popups on that view are exactly what the host builds unaided

### Requirement: Drawn track geometry names the file it came from

Every feature drawn for a track SHALL carry the vault path of the file it was
read from — its line, and the start and end points synthesized for that line, as
well as points the file itself supplied. A note that links several track files
SHALL therefore be distinguishable at the level of the individual track at the
point of interaction, not only at the level of the note that owns them.

#### Scenario: One note links two track files

- **WHEN** a note links two track files and both are drawn
- **THEN** each drawn line and each of its endpoints names the file it was read from, rather than only the note that owns both

#### Scenario: A drawn track file is renamed

- **WHEN** a track file is renamed and the map refreshes
- **THEN** the geometry drawn for it names its new path
