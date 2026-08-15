## Purpose

Defines the lifecycle, rendering, statistics, interactions, and failure behavior of inline maps created from embedded track files.

## Requirements

### Requirement: Track embeds use the native map experience lazily

An inline embed of a supported track extension SHALL use the native Maps presentation and controls, claim an extension only when no other embed handler owns it, and defer map construction until the embed enters the viewport.

#### Scenario: Track embed scrolls into view

- **WHEN** a supported unclaimed track embed becomes visible
- **THEN** one native-styled map is constructed with the track drawn and no base result rows behind it

#### Scenario: Reader scrolls the containing note

- **WHEN** the pointer wheel is used over an inline map
- **THEN** the note continues scrolling instead of the map consuming the wheel for zoom

#### Scenario: Embed is removed or plugin unloads

- **WHEN** an inline map is no longer active
- **THEN** its map and event resources are torn down so its WebGL context is not leaked

### Requirement: Only the newest refresh commits

Inline map builds and refreshes SHALL use a monotonic revision so stale asynchronous reads, settings changes during lazy construction, and work finishing after teardown cannot overwrite newer state.

#### Scenario: Settings change during lazy build

- **WHEN** the embed refreshes before its map initialization finishes
- **THEN** the initialized map reflects the newest file and settings state rather than the earlier build request

### Requirement: Refresh failure preserves the last good map

If a live embed's refreshed track cannot be parsed, the map and last good track SHALL remain in place and an in-place error SHALL replace the statistics panel until a later valid refresh succeeds.

#### Scenario: Track is temporarily truncated

- **WHEN** a previously valid open embed receives invalid intermediate file contents
- **THEN** the existing map and route remain visible with an error message, and restoring valid contents replaces the error with current route data and statistics

### Requirement: Statistics use unshifted route data

Distance, ascent, elapsed time, moving time, speed, and elevation profiles SHALL be calculated from raw WGS-84 route features, not coordinates transformed for the current tile datum.

#### Scenario: Same route uses different map backgrounds

- **WHEN** one route is displayed on WGS-84 and Chinese-datum tiles
- **THEN** both embeds report the same statistics

#### Scenario: Elevation contains consumer noise

- **WHEN** elevation changes fail to exceed the configured ascent hysteresis or movement stays below the moving-speed threshold
- **THEN** the corresponding noise is not counted as committed ascent or moving time

### Requirement: Elevation profile and map hover are linked

When an elevation profile exists, hovering either the profile or a sufficiently wide invisible route hit corridor SHALL select the nearest downsampled route sample, update the profile readout, and show a cursor point on the map in the correct tile datum.

#### Scenario: Profile is hovered on Chinese tiles

- **WHEN** the pointer selects a WGS-84 profile sample while the map uses GCJ-02 or BD-09
- **THEN** the cursor point is transformed once and appears on the rendered route

#### Scenario: Visible route is very thin

- **WHEN** track weight is too small for reliable pointer targeting
- **THEN** the independent hit corridor remains wide enough to drive the profile interaction without changing visible line width

### Requirement: Route orientation markers are legible and setting-controlled

When route markers are enabled, inline maps SHALL show distinct start and end symbols, right-oriented direction arrows placed along travel direction, and waypoint names on hover; disabling the setting SHALL hide these features immediately.

#### Scenario: Route starts and ends at one coordinate

- **WHEN** a loop route places start and end on the same pixel
- **THEN** both distinct endpoint symbols remain eligible to display

#### Scenario: User hovers a named waypoint

- **WHEN** an inline map pointer is over an ordinary waypoint with a name
- **THEN** one lightweight tooltip displays that waypoint name without competing with a native note popup

### Requirement: Host-note photos complement rather than modify the route

An inline track map SHALL resolve supported photos from the note containing the embed, draw them using the photo-map behavior, and exclude them from route data and statistics.

#### Scenario: Host note has one track and several photos

- **WHEN** the track embed is rendered in that note
- **THEN** the route, its unchanged statistics, and the host note's geotagged photos appear together; the photo modal omits a redundant open-current-note action

### Requirement: Visual settings refresh live embeds

Track color, weight, opacity, fit zoom, route-marker visibility, statistics, profile, photo visibility, photo datum, thumbnails, and embed height SHALL update already rendered and not-yet-rendered embeds through explicit refresh behavior.

#### Scenario: User changes embed height below the fold

- **WHEN** a lazy embed has not built its map yet and the height setting changes
- **THEN** its container resizes without forcing early WebGL construction

### Requirement: Inline framing is one-shot and yields to the reader

An inline map SHALL frame the data it draws once per distinct dataset, SHALL NOT re-frame when a refresh redraws the same data, and SHALL NOT re-frame after the reader has moved that map. Re-framing SHALL remain available when the embed's own track or photos change and the reader has not moved the map.

#### Scenario: An unrelated track file is written

- **WHEN** a cached track file changes and every open embed refreshes
- **THEN** an embed whose own track and photos are unchanged redraws without moving its camera

#### Scenario: A visual setting changes

- **WHEN** a setting that only affects appearance is changed while inline maps are open
- **THEN** the new appearance is applied to those maps and their cameras stay where they are

#### Scenario: The reader pans and the track then changes

- **WHEN** the reader has panned or zoomed an inline map and the embedded track file is edited afterwards
- **THEN** the new route is drawn and the camera stays where the reader left it

#### Scenario: The embedded track changes on an untouched map

- **WHEN** an inline map the reader has not moved has its own track file edited
- **THEN** the redrawn route is framed again
