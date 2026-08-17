## MODIFIED Requirements

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
