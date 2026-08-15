## Purpose

Defines accessible, stable separation of map pins that would otherwise overlap while preserving their real coordinates and native marker behavior.

## Requirements

### Requirement: Overlapping pins receive stable spread slots

Pins close enough to overlap at the configured full-spread zoom SHALL be grouped deterministically and assigned stable positions based on note identity rather than base row order.

#### Scenario: Base order changes

- **WHEN** the same group of overlapping notes is returned in a different order
- **THEN** each note retains the same position within its spread pattern

#### Scenario: Nearby pins form a chain

- **WHEN** each pin is near its neighbor but distant from the group's leader
- **THEN** grouping does not chain the entire line into one unbounded cluster

### Requirement: Spreading does not change stored geography

Pin separation SHALL be a rendered screen-space offset from each pin's own coordinate and SHALL NOT alter note properties, copied coordinates, context-menu coordinates, bounds data, or persisted values.

#### Scenario: User copies a spread pin's coordinates

- **WHEN** a visibly displaced pin is used for a coordinate action
- **THEN** the action receives the note's original geographic coordinate

### Requirement: Spread is zoom-dependent and screen-stable

Pin offsets SHALL be closed below the configured start zoom, SHALL be visibly open at the configured start zoom, SHALL grow by one step per whole zoom level until they reach their full pixel radius at the configured end zoom, and SHALL remain screen-sized rather than ground-sized thereafter.

#### Scenario: User zooms through the spread range

- **WHEN** the camera moves from below the start zoom to or beyond the end zoom
- **THEN** pins are stacked below the start zoom, are already separated once the start zoom is reached, grow one step per whole zoom level, and are at their full spread radius by the end zoom

#### Scenario: Camera rests between two whole zoom levels

- **WHEN** the camera settles anywhere inside one whole zoom level of the spread range
- **THEN** every pin shows the offset belonging to that whole zoom level, unchanged across the level and without a further snap after the camera settles

### Requirement: Interaction follows rendered pins

Hit testing and note popups SHALL target the displayed spread position rather than the shared geographic anchor, using the same per-zoom-level offset the pin was drawn with.

#### Scenario: User points at one pin in a spread ring

- **WHEN** several notes share one coordinate and the user hovers or clicks a specific rendered pin
- **THEN** the selected note is the one represented by that pin and its popup is anchored beside that rendered position

#### Scenario: User hovers a spread pin part-way through the ramp

- **WHEN** the camera is inside the spread range at a zoom where the fan is open but not at its full radius
- **THEN** the popup is anchored at the offset actually rendered for that zoom level rather than at a position derived from the fractional camera zoom

### Requirement: Spread can be toggled safely

Changing the pin-spread setting SHALL regenerate native marker features and styling immediately, and disabling the enhancement SHALL restore zero marker offset.

#### Scenario: User turns spreading off

- **WHEN** spread pins is disabled on an open map
- **THEN** all affected pins return to their own coordinates and no spread-specific native marker styling remains

#### Scenario: Background replacement recreates the native marker layer

- **WHEN** spreading is enabled and a style switch replaces the marker layer
- **THEN** the current spread plan is applied to the replacement layer once, while disabling the plugin restores the native zero offset

### Requirement: Unexpected marker data fails whole

If the marker and feature data cannot be matched safely, spreading SHALL stand down for that update rather than apply a partial plan.

#### Scenario: Host marker shape changes

- **WHEN** marker rows and generated point features are not one-to-one or lack stable identities
- **THEN** no pins in that update receive Advanced Maps spread slots
