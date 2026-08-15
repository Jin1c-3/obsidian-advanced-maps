## MODIFIED Requirements

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
