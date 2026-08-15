## MODIFIED Requirements

### Requirement: Settings remain declarative and current

Plugin settings SHALL be exposed through searchable setting definitions, route writes through one typed value-update seam, refresh affected live views explicitly, preserve meaningful defaults when placeholder-backed fields are cleared, and distinguish an unresolved asynchronous view list from a confirmed empty list. A setting description that names the current value of another setting SHALL state the current value while the pane stays open, without re-rendering the field being edited.

#### Scenario: Dynamic base-view options are not ready

- **WHEN** the settings UI requests map views before the vault or selected base can be read
- **THEN** it does not falsely report that the base contains no map views, does not cache the miss, and refreshes when a current answer becomes available

#### Scenario: Visual setting changes

- **WHEN** a user changes a setting that affects tracks, photos, coordinates, or embed layout
- **THEN** affected open and lazy views receive the required refresh without waiting for unrelated vault data changes

#### Scenario: A named property is renamed in the open pane

- **WHEN** the coordinate property is edited in the settings pane
- **THEN** every description that names it reads the new name immediately, and the text field being typed in keeps its focus and caret
