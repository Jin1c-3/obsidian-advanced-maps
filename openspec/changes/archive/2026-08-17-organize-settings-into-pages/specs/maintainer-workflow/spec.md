## MODIFIED Requirements

### Requirement: Settings remain declarative and current

Plugin settings SHALL be exposed through searchable setting definitions, route writes through one typed value-update seam, refresh affected live views explicitly, preserve meaningful defaults when placeholder-backed fields are cleared, and distinguish an unresolved asynchronous view list from a confirmed empty list. A setting description that names the current value of another setting SHALL state the current value while the pane stays open, without re-rendering the field being edited.

The pane SHALL present its rows as topical pages reached from a root of navigable entries rather than as one continuous list, each page carrying its own introduction; an entry MAY state the current value of the setting that sums its page up. Every row SHALL remain reachable through settings search wherever it lives, and the arrangement SHALL change no setting's key, default, stored value, validation, or refresh behavior.

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

## ADDED Requirements

### Requirement: Shipped user-facing behavior reaches the user guide

A change that adds, removes, or alters behavior a reader can invoke, see, or configure SHALL update the user guide in the same change, in every locale the guide supports, by extending an existing page or adding a new one; a change that adds a page SHALL also make the guide index point at it. Guide passages naming a command, setting, property, or the place a setting is found SHALL match what the change ships. A change with no user-visible behavior SHALL record that no guide update is needed rather than leaving the question unanswered.

#### Scenario: A change ships user-visible behavior

- **WHEN** a change adds a command, setting, property, or visible map behavior
- **THEN** the same change updates the user guide in English and Simplified Chinese, extending an existing page or adding a new one that the guide index links

#### Scenario: A shipped label or location changes

- **WHEN** a change renames a setting or command, or moves where a setting is found
- **THEN** every guide passage that names it is corrected in the same change, so the guide never directs a reader to a label or place that no longer exists

#### Scenario: A change is not user-visible

- **WHEN** a change is confined to refactoring, tests, tooling, or maintainer documentation
- **THEN** it records that the guide needs no update, rather than leaving the guide silently behind
