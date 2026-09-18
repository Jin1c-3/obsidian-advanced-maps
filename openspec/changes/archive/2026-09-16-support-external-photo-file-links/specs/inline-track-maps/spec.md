## ADDED Requirements

### Requirement: Host-note external photo links refresh inline maps

An inline track map SHALL resolve readable supported external photos from the
explicit inline `file:` links and embeds of its host note through the external
photo behavior. The resolved external source set SHALL participate in the same
order-sensitive host-photo identity used to decide whether an inline map needs
to redraw.

#### Scenario: Host note links an external photo

- **WHEN** a note containing an inline route map explicitly links a readable
  geotagged external photo
- **THEN** the route and external photo appear together while the route's
  statistics remain unchanged

#### Scenario: External photo link is added to the host note

- **WHEN** a supported readable `file:` photo link is added to a note whose
  inline route map is already rendered
- **THEN** that inline map redraws with the external photo without reopening the
  note

#### Scenario: One device-specific destination replaces another

- **WHEN** an edit changes which external photo destination the host note
  resolves on the current device
- **THEN** the inline map drops the old source and draws the newly resolved one

#### Scenario: Host edit preserves the resolved photo sources

- **WHEN** the host note is edited without changing its resolved vault or
  external photo source sequence
- **THEN** the inline map is not rebuilt
