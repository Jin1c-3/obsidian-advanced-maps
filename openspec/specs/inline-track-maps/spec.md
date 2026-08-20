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

Inline map builds and refreshes SHALL use a monotonic revision so stale asynchronous reads, settings changes during lazy construction, and work finishing after teardown cannot overwrite newer state. A style reload SHALL redraw the embed's owned content exactly once and SHALL NOT run concurrently with a read that has not committed yet. A refresh SHALL limit how many companion reads it has outstanding at one time, under the same fixed limit map refreshes use, and a superseded or torn-down refresh SHALL stop starting further reads.

#### Scenario: Settings change during lazy build

- **WHEN** the embed refreshes before its map initialization finishes
- **THEN** the initialized map reflects the newest file and settings state rather than the earlier build request

#### Scenario: Map style finishes loading during the first draw

- **WHEN** an inline map's initial style load completes around the embed's first draw
- **THEN** the track is drawn once rather than twice

#### Scenario: Background changes while a refresh is reading

- **WHEN** the map style is replaced while a refresh is still reading its files
- **THEN** the refreshed data is what ends up drawn on the new style, and the pre-refresh data is not drawn over it

#### Scenario: Host note carries many companion photos

- **WHEN** an embed's host note references more companion photos than the concurrency limit
- **THEN** they are read under that limit, every one of them is still read, and the drawn result is unchanged

#### Scenario: Embed is torn down mid-refresh

- **WHEN** an inline map is removed while its bounded reads are still running
- **THEN** no further read is started and nothing is drawn on the torn-down embed

### Requirement: Refresh failure preserves the last good map

If a live embed's refreshed track cannot be parsed, the map and last good track SHALL remain in place and an in-place error SHALL replace the statistics panel until a later valid refresh succeeds.

#### Scenario: Track is temporarily truncated

- **WHEN** a previously valid open embed receives invalid intermediate file contents
- **THEN** the existing map and route remain visible with an error message, and restoring valid contents replaces the error with current route data and statistics

### Requirement: An inline map reports its route's figures

An inline route map SHALL show the figures of the route it draws — a statistics
bar and, where the file carries elevation, a profile — and SHALL show neither
where the file yields no route to measure. What those figures mean and what they
are measured from is stated by the track-statistics capability; what this
capability states is that an inline map shows them, and how.

#### Scenario: An embedded file contains only areas

- **WHEN** a note embeds a file whose geometry is entirely areas
- **THEN** the inline map draws those areas and frames them, and shows no
  statistics bar and no elevation profile rather than reporting a zero-length
  route

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

An inline track map SHALL resolve supported photos from the note containing the embed and draw them using the photo-map behavior; that they are excluded from route data and statistics is a property of photo points, stated by the photo-map-rendering capability. When the host note's own references change which photos it resolves to, the inline map SHALL redraw with the new set; an edit that does not change that set SHALL NOT cause a redraw.

#### Scenario: Host note has one track and several photos

- **WHEN** the track embed is rendered in that note
- **THEN** the route, its unchanged statistics, and the host note's geotagged photos appear together; the photo modal omits a redundant open-current-note action

#### Scenario: A photo is added to the host note

- **WHEN** a geotagged photo reference is added to a note that already displays an inline track map
- **THEN** that photo appears on the inline map without reopening the note

#### Scenario: The host note is edited elsewhere

- **WHEN** the host note is edited without changing which photos it references
- **THEN** the inline map is not rebuilt

### Requirement: Visual settings refresh live embeds

Track color, weight, opacity, fit zoom, route-marker visibility, statistics, profile, photo visibility, photo datum, thumbnails, and embed height SHALL update already rendered and not-yet-rendered embeds through explicit refresh behavior.

#### Scenario: User changes embed height below the fold

- **WHEN** a lazy embed has not built its map yet and the height setting changes
- **THEN** its container resizes without forcing early WebGL construction

### Requirement: Inline framing is one-shot and yields to the reader

An inline map SHALL frame the data it draws once per distinct dataset, SHALL NOT re-frame when a refresh redraws the same data, and SHALL NOT re-frame after the reader has moved that map. Re-framing SHALL remain available when the embed's own track or photos change and the reader has not moved the map. Where it does frame, it SHALL cover the ground the drawn data occupies, including data that crosses the 180th meridian.

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

#### Scenario: The embedded track crosses the meridian

- **WHEN** an embedded track runs across the 180th meridian
- **THEN** the inline map frames the route itself rather than the whole globe

### Requirement: The elevation profile is scaled to what it plots

The elevation profile's vertical scale and its accessible description SHALL be derived from the samples the profile actually draws, not from elevation extremes contributed by features the profile does not plot.

#### Scenario: A waypoint sits far below the route

- **WHEN** a file contains a route and a waypoint whose elevation is far outside the route's own elevation range
- **THEN** the profile is scaled to the route it draws and its accessible label states that same range

### Requirement: Inline route maps can be switched off

Switched off under the shared policy in the feature-switches capability, which states what a switch takes away, what it keeps, and how it defaults. What follows is only what is specific to this feature.

With them off, this plugin SHALL claim no track extension at all, so an embed of
a track file is the embed the host makes of it with no plugin installed, and
SHALL release the extensions it had claimed rather than holding them inert — an
extension this plugin is not drawing is one another plugin may own.

Switching it off SHALL take down the inline maps that are on screen, releasing
each one's map and event resources the way closing the note does, so that no
graphics context is left held by a feature that is off. Switching it on SHALL
claim the extensions again, taking only those no other embed handler owns by
then, and SHALL state where an already-rendered note has to be reopened for its
embed to become a map.

#### Scenario: Inline maps are switched off

- **WHEN** the reader switches inline route maps off
- **THEN** the inline maps on screen are torn down with their resources released,
  and a note embedding a track file afterwards shows the host's own embed of that
  file

#### Scenario: Another plugin claimed an extension in the meantime

- **WHEN** inline route maps are switched on again and another embed handler now
  owns one of the track extensions
- **THEN** that extension is left with its owner and the others are claimed, the
  same way an extension already owned is left alone at load
