## MODIFIED Requirements

### Requirement: Only the newest refresh commits

Inline map builds and refreshes SHALL use a monotonic revision so stale asynchronous reads, settings changes during lazy construction, and work finishing after teardown cannot overwrite newer state. A style reload SHALL redraw the embed's owned content exactly once and SHALL NOT run concurrently with a read that has not committed yet.

#### Scenario: Settings change during lazy build

- **WHEN** the embed refreshes before its map initialization finishes
- **THEN** the initialized map reflects the newest file and settings state rather than the earlier build request

#### Scenario: Map style finishes loading during the first draw

- **WHEN** an inline map's initial style load completes around the embed's first draw
- **THEN** the track is drawn once rather than twice

#### Scenario: Background changes while a refresh is reading

- **WHEN** the map style is replaced while a refresh is still reading its files
- **THEN** the refreshed data is what ends up drawn on the new style, and the pre-refresh data is not drawn over it

### Requirement: Statistics use unshifted route data

Distance, ascent, elapsed time, moving time, speed, and elevation profiles SHALL be calculated from raw WGS-84 route features, not coordinates transformed for the current tile datum. Distance covered during an interval whose timestamp does not advance SHALL be carried into the next interval that does, rather than discarded.

#### Scenario: Same route uses different map backgrounds

- **WHEN** one route is displayed on WGS-84 and Chinese-datum tiles
- **THEN** both embeds report the same statistics

#### Scenario: Elevation contains consumer noise

- **WHEN** elevation changes fail to exceed the configured ascent hysteresis or movement stays below the moving-speed threshold
- **THEN** the corresponding noise is not counted as committed ascent or moving time

#### Scenario: A timestamp runs backwards

- **WHEN** a merged export contains a point whose timestamp is not later than the previous one
- **THEN** that interval contributes no moving time, and the ground it covered still counts toward the next interval's implied speed

### Requirement: Host-note photos complement rather than modify the route

An inline track map SHALL resolve supported photos from the note containing the embed, draw them using the photo-map behavior, and exclude them from route data and statistics. When the host note's own references change which photos it resolves to, the inline map SHALL redraw with the new set; an edit that does not change that set SHALL NOT cause a redraw.

#### Scenario: Host note has one track and several photos

- **WHEN** the track embed is rendered in that note
- **THEN** the route, its unchanged statistics, and the host note's geotagged photos appear together; the photo modal omits a redundant open-current-note action

#### Scenario: A photo is added to the host note

- **WHEN** a geotagged photo reference is added to a note that already displays an inline track map
- **THEN** that photo appears on the inline map without reopening the note

#### Scenario: The host note is edited elsewhere

- **WHEN** the host note is edited without changing which photos it references
- **THEN** the inline map is not rebuilt

## ADDED Requirements

### Requirement: The elevation profile is scaled to what it plots

The elevation profile's vertical scale and its accessible description SHALL be derived from the samples the profile actually draws, not from elevation extremes contributed by features the profile does not plot.

#### Scenario: A waypoint sits far below the route

- **WHEN** a file contains a route and a waypoint whose elevation is far outside the route's own elevation range
- **THEN** the profile is scaled to the route it draws and its accessible label states that same range
