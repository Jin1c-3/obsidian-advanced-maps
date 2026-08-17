## MODIFIED Requirements

### Requirement: Track statistics can be written to the owning note's properties

A note that owns at least one track file SHALL offer an explicit command that
writes that note's track statistics into its own frontmatter, and the figures
SHALL be measured from the same unshifted WGS-84 features the inline statistics
bar measures, so the values do not depend on which basemap is open. Where a note
owns several track files, their features SHALL be measured together under the
rules that already apply across the segments of a single file. Each figure SHALL
be written as a number under a name the reader can configure: a name given for
that figure is the whole property name, and a figure left unconfigured SHALL be
named from the configurable prefix and its own unit-bearing suffix, which is what
every figure is named by default. The command SHALL read and write no property
outside the set of names its figures currently resolve to. A figure the file did
not record SHALL leave no property behind, and the command SHALL never run except
when invoked.

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
