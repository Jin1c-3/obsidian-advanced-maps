## MODIFIED Requirements

### Requirement: Overlapping pins receive stable spread slots

Pins close enough to overlap at the configured full-spread zoom SHALL be grouped deterministically and assigned stable positions based on note identity rather than base row order. A ring SHALL hold every pin its circumference has room for at the configured spacing, so a further ring opens only when the pins do not fit or the ring has reached its maximum radius.

#### Scenario: Base order changes

- **WHEN** the same group of overlapping notes is returned in a different order
- **THEN** each note retains the same position within its spread pattern

#### Scenario: Nearby pins form a chain

- **WHEN** each pin is near its neighbor but distant from the group's leader
- **THEN** grouping does not chain the entire line into one unbounded cluster

#### Scenario: A group exactly fills one ring

- **WHEN** a group's size is such that its ring is sized to hold precisely those pins
- **THEN** all of them are placed on that one ring rather than one being pushed onto a ring of its own
