## MODIFIED Requirements

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
