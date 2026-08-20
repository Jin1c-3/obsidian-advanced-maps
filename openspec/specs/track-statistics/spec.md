## Purpose

Defines the figures derived from a route — distance, ascent, descent, elapsed and moving time, speed, elevation extremes, and the elevation profile — what they are measured from, and the command that writes them into the owning note. The capabilities that display these figures (an inline map's statistics bar and profile, a map popup) state how they are shown; what the numbers mean is stated here once, so every surface reports the same route the same way.

## Requirements

### Requirement: Statistics use unshifted route data

Distance, ascent, elapsed time, moving time, speed, and elevation profiles SHALL be calculated from raw WGS-84 route features, not coordinates transformed for the current tile datum. Distance covered during an interval whose timestamp does not advance SHALL be carried into the next interval that does, rather than discarded. Geometry that is not a route SHALL contribute nothing to these figures, and an embed left with no route SHALL still draw what its file contains.

#### Scenario: Same route uses different map backgrounds

- **WHEN** one route is displayed on WGS-84 and Chinese-datum tiles
- **THEN** both embeds report the same statistics

#### Scenario: Elevation contains consumer noise

- **WHEN** elevation changes fail to exceed the configured ascent hysteresis or movement stays below the moving-speed threshold
- **THEN** the corresponding noise is not counted as committed ascent or moving time

#### Scenario: A timestamp runs backwards

- **WHEN** a merged export contains a point whose timestamp is not later than the previous one
- **THEN** that interval contributes no moving time, and the ground it covered still counts toward the next interval's implied speed

#### Scenario: An embedded file contains only areas

- **WHEN** a note embeds a file whose geometry is entirely areas
- **THEN** the inline map draws those areas and frames them, and shows no statistics bar and no elevation profile rather than reporting a zero-length route

### Requirement: Track statistics can be written to the owning note's properties

A note that owns at least one track file SHALL offer an explicit command that
writes that note's track statistics into its own frontmatter, and the figures
SHALL be measured from the same unshifted WGS-84 features the inline statistics
bar measures, so the values do not depend on which basemap is open. Where a note
owns several track files, their features SHALL be measured together under the
rules that already apply across the segments of a single file.

Each figure SHALL be written as a number under a name the reader can configure:
a name given for that figure is the whole property name, and a figure left
unconfigured SHALL be named from the configurable prefix and its own unit-bearing
suffix, which is what every figure is named by default.

The reader SHALL be able to choose which figures the command writes, one figure
at a time, and every figure SHALL be chosen by default. The command SHALL read
and write no property outside the set of names the figures it is currently
writing resolve to: a figure the reader has not chosen SHALL be neither written
nor removed, and SHALL take no part in the checks that refuse a write. Where no
figure is chosen at all, the command SHALL say so rather than report a write of
nothing.

A figure the file did not record SHALL leave no property behind, and the command
SHALL never run except when invoked.

#### Scenario: A note's track is measured into properties

- **WHEN** the reader invokes the command on a note that links a track file
- **THEN** the note's frontmatter carries that track's distance, climb, times, pace, and start as numbers under the configured prefix

#### Scenario: The map background changes

- **WHEN** the same note is measured with Chinese-datum tiles configured and again with WGS-84 tiles
- **THEN** the written figures are identical

#### Scenario: A file records no elevation or time

- **WHEN** a track file holds coordinates only
- **THEN** the distance property is written, and no ascent, elevation, duration, moving-time, pace, or start property is left in the note

#### Scenario: A note owns more than one track file

- **WHEN** the note links two track files
- **THEN** one set of properties describes both, summed as one file's segments would be

#### Scenario: The note has nothing measurable

- **WHEN** the note's only referenced geometry is an area, or its track files are empty
- **THEN** the command reports that there is nothing to measure and changes no property

#### Scenario: A figure is given its own name

- **WHEN** the reader names one figure and leaves the rest unset
- **THEN** that figure is written under exactly the name given, with no prefix in front of it, and every other figure keeps its prefixed default name

#### Scenario: No figure is named

- **WHEN** no figure has a name configured
- **THEN** every property is named exactly as it is by the prefix alone, so an existing note is rewritten in place rather than gaining a second set of properties

#### Scenario: The prefix would collide with another configured property

- **WHEN** the configured prefix produces the name of the coordinate or place property
- **THEN** the command writes nothing and names the property that clashes

#### Scenario: A configured name would collide

- **WHEN** a figure's own configured name is the coordinate or place property
- **THEN** the command writes nothing and names the property that clashes, exactly as it does for the prefix

#### Scenario: Two figures are given the same name

- **WHEN** two figures resolve to one property name
- **THEN** the command writes nothing and names the property they share, rather than letting one figure overwrite the other

#### Scenario: A figure is renamed after a note was measured

- **WHEN** a figure's name is changed and the command is run again on a note measured under the old name
- **THEN** the new property is written and the property under the old name is left untouched, because the command reaches only the names configured now

#### Scenario: A track file changes after the note was measured

- **WHEN** a measured track file is edited
- **THEN** the note's properties are left as they were until the command is invoked again

#### Scenario: Only some figures are wanted

- **WHEN** the reader leaves distance and start time chosen and turns the other figures off, then invokes the command
- **THEN** only those two properties are written, and the note gains none of the others

#### Scenario: A figure is turned off after a note was measured

- **WHEN** a figure that a note already carries is turned off and the command is run again
- **THEN** that property is left exactly as it was, because the command no longer reaches the name it is under

#### Scenario: A figure that is off would have collided

- **WHEN** a figure whose configured name is the coordinate property is turned off
- **THEN** the command writes the figures that are on, because a figure that is not written cannot collide with anything

#### Scenario: Every figure is turned off

- **WHEN** the command is invoked with no figure chosen
- **THEN** it reports that nothing is chosen and no property is written or removed

#### Scenario: Settings predate the choice

- **WHEN** a vault's stored settings were written before figures could be chosen
- **THEN** every figure is written, exactly as that vault was written before
