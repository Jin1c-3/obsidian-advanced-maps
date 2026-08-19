## MODIFIED Requirements

### Requirement: Settings remain declarative and current

Plugin settings SHALL be exposed through searchable setting definitions, route writes through one typed value-update seam, refresh affected live views explicitly, preserve meaningful defaults when placeholder-backed fields are cleared, and distinguish an unresolved asynchronous view list from a confirmed empty list. A setting description that names the current value of another setting SHALL state the current value while the pane stays open, without re-rendering the field being edited.

The pane SHALL present its rows as topical pages reached from a root of navigable entries rather than as one continuous list, each page carrying its own introduction; an entry MAY state the current value of the setting that sums its page up. Every row SHALL remain reachable through settings search wherever it lives, including a row whose editor is a list of nameless entries, and the arrangement SHALL change no setting's key, default, stored value, validation, or refresh behavior.

A row's name and description SHALL say what the setting does and what happens when it is off. Reasoning, worked examples, and the history of a decision belong in the user guide, and SHALL NOT be restated in the pane.

A setting whose value is a list of vault paths SHALL be edited as a list, one path per row, each offering the vault's own folder suggestions; and a list the reader has emptied SHALL be stored as empty rather than restored to its default, while stating in place what an empty list means.

Where one setting decides whether another is written at all, both SHALL sit on one row, and the row SHALL keep the dependent control visible but inert rather than removing it, so the row still states what the value would be.

#### Scenario: Dynamic base-view options are not ready

- **WHEN** the settings UI requests map views before the vault or selected base can be read
- **THEN** it does not falsely report that the base contains no map views, does not cache the miss, and refreshes when a current answer becomes available

#### Scenario: Visual setting changes

- **WHEN** a user changes a setting that affects tracks, photos, coordinates, or embed layout
- **THEN** affected open and lazy views receive the required refresh without waiting for unrelated vault data changes

#### Scenario: A named property is renamed in the open pane

- **WHEN** the coordinate property is edited in the settings pane
- **THEN** every description that names it reads the new name immediately, and the text field being typed in keeps its focus and caret

#### Scenario: A reader opens the pane for one topic

- **WHEN** the settings pane is opened
- **THEN** it shows one navigable entry per topic, and opening an entry shows that topic's introduction and its rows without the other topics' rows in the way

#### Scenario: A row is searched for by name

- **WHEN** a reader searches the settings for a row's name or description
- **THEN** the row is found and reachable even though it lives on a page rather than on the pane's root

#### Scenario: An entry is summed up by one value

- **WHEN** a page's purpose is answered by a single setting, such as the coordinate system or the configured base
- **THEN** the entry states that current value beside its name, and the value shown follows a change made on the page

#### Scenario: The arrangement changes

- **WHEN** rows are moved from one part of the pane to another
- **THEN** each row's stored key, default, placeholder fallback, validation, and view-refresh behavior are unchanged, and an upgrading reader keeps every configured value

#### Scenario: A path list is edited

- **WHEN** the reader adds a row to a setting holding a list of vault paths
- **THEN** the row offers the vault's folders as it is typed into, and the stored value is the list the rows show

#### Scenario: The reader empties a path list

- **WHEN** every row of such a list is deleted
- **THEN** the stored list is empty rather than restored to its default, and the pane states in place what that means

#### Scenario: A dependent value is switched off

- **WHEN** the setting that decides whether a value is used at all is switched off
- **THEN** that value's own control stays on the same row, inert rather than removed, still stating what it holds
