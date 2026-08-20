## ADDED Requirements

### Requirement: External destinations can be switched off

The reader SHALL be able to switch external map destinations off in one move,
above the arrangement of individual providers that already exists. With the
feature off, no external destination SHALL be added to the map's context menu,
neither built-in nor custom, and no external application SHALL be reachable from
a map click.

The setting SHALL default to on, so a reader who never opens it keeps the plugin
they had. Switching it SHALL reach maps that are already open, on the next menu
opened rather than after a restart. Which providers are on and in what order, and
every custom destination, SHALL be kept while the feature is off and SHALL stay
on screen where they are configured, stating what they hold.

#### Scenario: External destinations are switched off

- **WHEN** the reader switches the feature off and opens a map's context menu
- **THEN** no external destination is offered, and the menu's other items are
  present and unchanged

#### Scenario: The arrangement survives the switch

- **WHEN** the feature is switched off and on again
- **THEN** the providers that were on are on, in the order they were in, and
  every custom destination is as it was
