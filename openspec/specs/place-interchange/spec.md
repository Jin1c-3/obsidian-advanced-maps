# place-interchange Specification

## Purpose

Saved places pass through the vault in both directions: a file of placemarks
becomes notes the rest of Obsidian can filter, sort and map, and the notes a base
matched become a GPX, KML or CSV file another device can read.

## Requirements

### Requirement: A file's saved places can become notes

A supported file's point features SHALL be offered for import as notes, one note
per point. Each note SHALL carry the point's coordinate in the configured
coordinate property, in the same WGS-84 form every other coordinate this plugin
writes takes. A point that names itself SHALL be named that; a point that does
not SHALL fall back to a name derived from the source file, so no place is lost
for lacking a name. A file holding no point at all SHALL report that rather than
creating an empty folder or a note with no place in it.

#### Scenario: A file of placemarks is imported

- **WHEN** a file holding point features is imported into a chosen folder
- **THEN** one note per point is created in that folder, each carrying that
  point's coordinate in the configured coordinate property

#### Scenario: A file holds lines and points together

- **WHEN** a file holds routes or areas as well as points
- **THEN** only the points become notes, and the file's other geometry is left to
  be drawn as it already is

#### Scenario: A file holds no point at all

- **WHEN** a file with only routes, only areas, or nothing readable is imported
- **THEN** nothing is written and the absence is reported

#### Scenario: A place carries no name

- **WHEN** a point feature has no name of its own
- **THEN** the note is still created, under a name derived from the source file
  and the point's position in it

### Requirement: An import is confirmed before it is written

An import SHALL state how many places it found and where they are about to be
written, and SHALL write nothing until that is confirmed. The destination folder
SHALL be chosen per import and created when it does not exist. Everything the
import writes SHALL be inside that folder, so removing the folder undoes the
import.

#### Scenario: The reader reviews an import

- **WHEN** an import is started from a file
- **THEN** the number of places found and the destination folder are shown, and
  no note exists until the import is confirmed

#### Scenario: The destination folder does not exist yet

- **WHEN** a confirmed import names a folder that is not in the vault
- **THEN** the folder is created and the notes are written into it

### Requirement: An import never overwrites a note that already exists

A note whose name is already taken SHALL be written under a distinct name rather
than replacing what is there. Characters a vault file name cannot hold SHALL be
replaced rather than causing the place to be skipped. The import SHALL report
what it created, and what it could not.

#### Scenario: Two places share one name

- **WHEN** an imported file holds two places with the same name, or one whose
  name matches a note already in the destination folder
- **THEN** both places become notes under distinct names and no existing note is
  modified

#### Scenario: A place name cannot be a file name

- **WHEN** a place's name holds characters a vault file name cannot hold
- **THEN** those characters are replaced and the note is created, rather than the
  place being dropped

#### Scenario: A note cannot be written

- **WHEN** creating one note fails
- **THEN** the remaining places are still imported and the failure is reported
  with its count

### Requirement: An imported description arrives as text

A place's description SHALL be carried into the note's body as text. Markup a
description carries SHALL be reduced to the text it renders as, and SHALL NOT be
inserted into the note as markup. A place with no description SHALL produce a
note with a coordinate and no body rather than an empty placeholder.

#### Scenario: A description carries markup

- **WHEN** an imported place's description holds markup, as a map-app export's
  descriptions commonly do
- **THEN** the note's body holds the text that markup renders as, with its line
  breaks preserved, and no markup of its own

#### Scenario: A place has no description

- **WHEN** an imported place carries no description
- **THEN** the note is created with its coordinate and an empty body

### Requirement: The places a base matched can be written out

The places drawn on a base map SHALL be offered for export from that map as a
GPX file of waypoints, a KML file of placemarks, or a CSV file of rows. The set
exported SHALL be exactly the places that map shows — the rows the base matched
whose coordinate resolved — so what leaves matches what is on screen. Each
exported place SHALL carry a name and its coordinate; a name SHALL be taken from
the note's file name or from any property the base displays, chosen per export.

#### Scenario: A base's places are exported

- **WHEN** a map view holding markers is exported in any of the three formats
- **THEN** the written file holds one waypoint, placemark or row per marker on
  that map, each with a name and a coordinate

#### Scenario: A base matches rows that have no coordinate

- **WHEN** a base matches rows of which only some resolved to a place on the map
- **THEN** only the placed rows are exported, matching what the map shows

#### Scenario: The reader names places by a property

- **WHEN** an export is told to name places by one of the base's displayed
  properties
- **THEN** each place is named by that property's value for its note, falling
  back to the note's file name where the property is empty

#### Scenario: A map has no places to export

- **WHEN** a map view holds no markers, or cannot say which markers it holds
- **THEN** no export is offered rather than an empty file being written

### Requirement: An exported file is valid in the format it claims

Each writer SHALL escape what its format reserves, so a place named with a
quotation mark, an ampersand, an angle bracket, a comma or a line break produces
a file that still parses as GPX, KML or CSV. A GPX or KML file this plugin writes
SHALL be readable by this plugin's own reader.

#### Scenario: A place name holds reserved characters

- **WHEN** an exported place's name holds `&`, `<`, `"`, a comma or a line break
- **THEN** the written file escapes them for its format and remains valid

#### Scenario: An exported file is read back

- **WHEN** a GPX or KML file written by an export is read by this plugin
- **THEN** it yields the same places, with the same names and coordinates

### Requirement: An export writes one file into the vault

An export SHALL write into the vault, at a path shown before it is written, and
SHALL NOT overwrite a file that is already there. A folder named in that path
that the vault does not hold SHALL be created. The written path SHALL be reported
when the export completes.

#### Scenario: The destination is already taken

- **WHEN** an export names a path a file already occupies
- **THEN** the export does not proceed until a free path is given, and the
  existing file is left untouched

#### Scenario: The destination folder does not exist

- **WHEN** an export names a path inside a folder the vault does not hold
- **THEN** the folder is created and the file is written into it, rather than the
  export failing on a folder the reader plainly meant

#### Scenario: An export completes

- **WHEN** a file is written
- **THEN** its path is reported, and the file is a vault file the reader can
  open, sync or share like any other
