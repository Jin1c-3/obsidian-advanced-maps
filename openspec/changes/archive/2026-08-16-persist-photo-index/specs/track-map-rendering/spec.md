## MODIFIED Requirements

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
