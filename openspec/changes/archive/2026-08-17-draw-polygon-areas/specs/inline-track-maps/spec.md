## MODIFIED Requirements

### Requirement: Statistics use unshifted route data

Distance, ascent, elapsed time, moving time, speed, and elevation profiles SHALL be calculated from raw WGS-84 route features, not coordinates transformed for the current tile datum. Distance covered during an interval whose timestamp does not advance SHALL be carried into the next interval that does, rather than discarded. Geometry that is not a route SHALL contribute nothing to these figures, and an embed left with no route SHALL still draw what its file contains.

#### Scenario: Same route uses different map backgrounds

- **WHEN** one route is displayed on WGS-84 and Chinese-datum tiles
- **THEN** both embeds report the same statistics

#### Scenario: Elevation contains consumer noise

- **WHEN** elevation changes fail to exceed the configured ascent hysteresis or movement stays below the moving-speed threshold
- **THEN** the corresponding noise is not counted as committed ascent or moving time

#### Scenario: A timestamp runs backwards

- **WHEN** a merged export contains a point whose timestamp is not later than the previous one
- **THEN** that interval contributes no moving time, and the ground it covered still counts toward the next interval's implied speed

#### Scenario: An embedded file contains only areas

- **WHEN** a note embeds a file whose geometry is entirely areas
- **THEN** the inline map draws those areas and frames them, and shows no statistics bar and no elevation profile rather than reporting a zero-length route
