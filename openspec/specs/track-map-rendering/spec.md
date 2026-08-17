## Purpose

Defines how supported track files are discovered, interpreted, owned by notes, rendered on native base maps, refreshed, and framed.

## Requirements

### Requirement: Track references are resolved from notes

A note in a base result SHALL contribute supported track files referenced by body embeds, body links, or frontmatter links, without requiring attachment files to pass the base filter.

#### Scenario: Three reference forms are present

- **WHEN** a result note embeds one track, links another in the body, and links a third in frontmatter
- **THEN** all three tracks are drawn in that note's map context

#### Scenario: One file is referenced more than once

- **WHEN** multiple reference forms in one note resolve to the same file
- **THEN** the file is drawn once for that note

#### Scenario: Plain link is used instead of an embed

- **WHEN** a note body links a supported track without the embed marker
- **THEN** the track appears on the base map without creating an inline map in the note

#### Scenario: Track file is a direct result

- **WHEN** a supported track file itself appears in the base result
- **THEN** it is drawn even when no note references it

### Requirement: Supported track formats preserve equivalent data

The plugin SHALL read GPX, GeoJSON, KML, and TCX geometry and SHALL preserve available elevation, timestamps, waypoint names, waypoint descriptions, and line names needed by downstream map features. Reading SHALL tolerate the formatting a valid file is permitted to vary, including whitespace around the separators inside a KML coordinate tuple. Where a format distinguishes an area from a line, that distinction SHALL survive reading: a KML polygon's outer boundary and its holes SHALL be preserved as one area rather than as unrelated lines, while a ring that no polygon declares as a boundary SHALL keep being read as a line.

#### Scenario: Equivalent route is supplied in each format

- **WHEN** equivalent geometry and metadata are encoded as GPX, GeoJSON, KML, and TCX
- **THEN** each format produces equivalent route geometry and statistics within the tested tolerances

#### Scenario: Track content is invalid

- **WHEN** a supported file cannot be parsed safely
- **THEN** the failure is reported without producing fabricated coordinates such as `0,0`

#### Scenario: Namespaced or partial XML data is present

- **WHEN** KML uses alternate namespace prefixes or TCX includes samples without a position
- **THEN** recognized geometry is read by semantic element name and position-less samples are skipped without inventing coordinates

#### Scenario: KML coordinate tuples carry whitespace around their separators

- **WHEN** a KML file writes its tuples as `lon, lat` or `lon , lat , ele` rather than unspaced
- **THEN** the same positions are read as from the unspaced form, and the file draws rather than being rejected as having no drawable geometry

#### Scenario: A KML polygon declares an outer boundary and an inner one

- **WHEN** a placemark holds a polygon with both an outer boundary and one or more inner boundaries
- **THEN** they are read as a single area whose outer ring bounds it and whose inner rings are its holes, rather than as one line per ring

#### Scenario: A KML ring stands outside any polygon

- **WHEN** a ring appears with no enclosing polygon to declare it a boundary
- **THEN** it is read as a line, as before, and no interior is claimed for it

#### Scenario: A saved place carries a description beside its name

- **WHEN** a KML placemark holds a `<description>`, or a GPX waypoint a `<desc>`
- **THEN** that text is preserved on the feature alongside its name, so a reader of the parsed file can carry it into a note, and a place with no description carries none rather than an empty one

### Requirement: Tracks inherit note ownership

A track resolved through a note SHALL use that note's marker color and note
interaction target. Pointing at any feature this plugin draws on a native map
SHALL raise at most one note popup per pointer event, SHALL leave the popup
untouched while the pointer stays on the feature it is already showing, and
SHALL anchor it where the pointer entered that feature.

#### Scenario: User points at a base-map track

- **WHEN** the pointer hovers a track belonging to a note
- **THEN** the native note popup is shown for that note

#### Scenario: Pointer moves along one track

- **WHEN** the pointer keeps moving over the same track feature after its popup is shown
- **THEN** no further popup is raised and the popup stays anchored where the pointer entered that track

#### Scenario: Overlapping owned features deliver one pointer event

- **WHEN** a single pointer position lies on more than one feature this plugin draws, such as a photo sitting on its own track
- **THEN** that pointer event raises one popup rather than one per overlapping feature, and it describes the same feature a click at that position would act on

#### Scenario: Pointer crosses to a different feature

- **WHEN** the pointer leaves the feature its popup describes and reaches a different owned feature, including another photo of the same note
- **THEN** the popup is raised again for the newly pointed feature

#### Scenario: Pointer leaves and returns to the same feature

- **WHEN** the pointer leaves every owned feature, dismissing the popup, and then returns to the feature it was last showing
- **THEN** the popup is raised again rather than suppressed as unchanged

#### Scenario: Drawn features are rebuilt while pointed at

- **WHEN** the drawn tracks are redrawn or the enhancement is detached while a popup is showing
- **THEN** the next hover raises a popup for whatever is then under the pointer rather than being suppressed by what was pointed at before

#### Scenario: User clicks a base-map track

- **WHEN** the user clicks the track without a modifier
- **THEN** the owning note opens using the map's current navigation rules

### Requirement: Route features remain distinguishable

Each rendered route SHALL expose its line, ordinary waypoints, direction indicators, and start/end roles without causing one role to be rendered as another. Geometry that is not a route SHALL NOT be given route roles: an area SHALL receive no direction indicators and no start or end markers.

#### Scenario: A route has waypoints and overlapping endpoints

- **WHEN** route markers are enabled for a loop with ordinary waypoints
- **THEN** ordinary waypoints remain waypoint dots, direction indicators follow travel direction, and both start and end markers remain eligible to render

#### Scenario: Route-marker setting changes

- **WHEN** the user toggles route markers on an already open map
- **THEN** direction and endpoint visibility changes immediately without waiting for a track file edit

#### Scenario: One file holds both a route and an area

- **WHEN** route markers are enabled for a file containing a line and a polygon
- **THEN** the line keeps its direction arrows and start/end markers and the area receives neither, on a boundary that would otherwise look like a closed line

### Requirement: Refreshes use current file state

Track parsing SHALL be cached by immutable file state, concurrent equivalent reads SHALL be deduplicated, and only the newest asynchronous refresh SHALL commit to a view. Where a cache entry outlives the session that produced it, the same file-state identity SHALL decide whether it is still usable, so a warm start is never able to draw from data the file no longer matches.

#### Scenario: A file changes during an in-flight read

- **WHEN** an older read finishes after a newer file version or settings revision has been requested
- **THEN** the older result does not replace the newer map data

#### Scenario: A referenced file is created or renamed

- **WHEN** link resolution changes without the referring note's metadata object changing
- **THEN** the next refresh resolves the current target rather than retaining a stale memoized answer

#### Scenario: A cached entry outlives its session

- **WHEN** a refresh finds an entry produced by an earlier session
- **THEN** it is used only if the file still matches the state that entry was derived from, and is otherwise re-derived before anything is drawn

### Requirement: Automatic framing respects user and view intent

Automatic framing SHALL include native markers and Advanced Maps track geometry, except when a configured center, configured zoom, active focus target, or user camera movement takes precedence.

#### Scenario: Unpinned map receives tracks and pins

- **WHEN** an unconfigured map first receives marker and track data and the user has not moved it
- **THEN** the camera frames the combined bounds subject to the configured maximum fit zoom

#### Scenario: User requests reframe

- **WHEN** the user activates the explicit fit control
- **THEN** the map reframes all current markers and tracks even if automatic framing would otherwise stand down

### Requirement: Attachment reads are bounded per refresh

A refresh SHALL limit how many attachment reads it has outstanding at one time,
so that peak concurrent reads follow a fixed limit rather than the size of the
base result. The limit SHALL NOT change which files are read, SHALL NOT alter
read de-duplication, and SHALL NOT let an older refresh commit over a newer one:
a superseded or detached refresh SHALL stop starting further reads.

#### Scenario: A base result contains far more attachments than the limit

- **WHEN** a map refresh needs to read thousands of attachments that are not yet cached
- **THEN** no more than the fixed limit are read at once, every one of them is still read, and the drawn result is the same as an unbounded refresh would produce

#### Scenario: A newer refresh supersedes one still reading

- **WHEN** data changes while a refresh is partway through its bounded reads
- **THEN** the superseded refresh stops starting new reads and does not commit, and the newer refresh's result is what reaches the map

#### Scenario: Two refreshes want the same uncached file

- **WHEN** concurrent refreshes both need a file that no cache entry covers yet
- **THEN** the file is read once and shared, as it is today, rather than once per refresh

### Requirement: Area geometry is drawn where it is framed

Area geometry SHALL be rendered wherever it is already counted for automatic
framing, so no supported file can move the camera to a place it draws nothing.
An area SHALL be filled in its owning note's colour, SHALL have its boundaries
stroked using the same width, opacity, and colour a route line uses, and SHALL
take its fill opacity from the configured track opacity rather than from a
separate control. An area SHALL be the lowest-priority pointer target on the
map: where an area overlaps any other drawn feature — one this plugin owns or a
native marker — the pointer SHALL act on that other feature, and one click there
SHALL open one note.

#### Scenario: A file's only geometry is an area

- **WHEN** a note references a supported file whose geometry is a polygon
- **THEN** the camera frames that area and the area is drawn there, rather than the map framing an area it leaves blank

#### Scenario: An area has holes

- **WHEN** a polygon declares inner rings
- **THEN** the enclosed holes are left unfilled and their boundaries are drawn

#### Scenario: A drawn feature sits over an area

- **WHEN** the pointer is over a track, waypoint, or photo that lies inside an area
- **THEN** pointing and clicking act on that feature, and the area is acted on only where nothing else is drawn

#### Scenario: A native marker stands inside an area

- **WHEN** the user clicks a native marker whose position falls inside an area
- **THEN** the marker's own note opens, once, and the area's note does not

#### Scenario: The map context menu is opened over an area

- **WHEN** the user opens the map's context menu at a position covered by an area
- **THEN** the menu opens with its coordinate and external-map items, unaffected by the area under the pointer

#### Scenario: An area is drawn on a Chinese-datum background

- **WHEN** an area is displayed on GCJ-02 or BD-09 tiles
- **THEN** its rings are shifted once into the tile datum, like every other drawn geometry, and the area covers the same ground it does on WGS-84 tiles

#### Scenario: Track opacity changes on an open map

- **WHEN** the user changes the track opacity setting while an area is on screen
- **THEN** the area's fill and boundary both follow that setting immediately, without a separate area control

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
