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

The plugin SHALL read GPX, GeoJSON, KML, and TCX geometry and SHALL preserve available elevation, timestamps, waypoint names, and line names needed by downstream map features. Reading SHALL tolerate the formatting a valid file is permitted to vary, including whitespace around the separators inside a KML coordinate tuple.

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

### Requirement: Tracks inherit note ownership

A track resolved through a note SHALL use that note's marker color and note interaction target.

#### Scenario: User points at a base-map track

- **WHEN** the pointer hovers a track belonging to a note
- **THEN** the native note popup is shown for that note

#### Scenario: User clicks a base-map track

- **WHEN** the user clicks the track without a modifier
- **THEN** the owning note opens using the map's current navigation rules

### Requirement: Route features remain distinguishable

Each rendered route SHALL expose its line, ordinary waypoints, direction indicators, and start/end roles without causing one role to be rendered as another.

#### Scenario: A route has waypoints and overlapping endpoints

- **WHEN** route markers are enabled for a loop with ordinary waypoints
- **THEN** ordinary waypoints remain waypoint dots, direction indicators follow travel direction, and both start and end markers remain eligible to render

#### Scenario: Route-marker setting changes

- **WHEN** the user toggles route markers on an already open map
- **THEN** direction and endpoint visibility changes immediately without waiting for a track file edit

### Requirement: Refreshes use current file state

Track parsing SHALL be cached by immutable file state, concurrent equivalent reads SHALL be deduplicated, and only the newest asynchronous refresh SHALL commit to a view.

#### Scenario: A file changes during an in-flight read

- **WHEN** an older read finishes after a newer file version or settings revision has been requested
- **THEN** the older result does not replace the newer map data

#### Scenario: A referenced file is created or renamed

- **WHEN** link resolution changes without the referring note's metadata object changing
- **THEN** the next refresh resolves the current target rather than retaining a stale memoized answer

### Requirement: Automatic framing respects user and view intent

Automatic framing SHALL include native markers and Advanced Maps track geometry, except when a configured center, configured zoom, active focus target, or user camera movement takes precedence.

#### Scenario: Unpinned map receives tracks and pins

- **WHEN** an unconfigured map first receives marker and track data and the user has not moved it
- **THEN** the camera frames the combined bounds subject to the configured maximum fit zoom

#### Scenario: User requests reframe

- **WHEN** the user activates the explicit fit control
- **THEN** the map reframes all current markers and tracks even if automatic framing would otherwise stand down
