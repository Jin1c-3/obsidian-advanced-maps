## ADDED Requirements

### Requirement: Writing a clicked point into a note can be switched off

The reader SHALL be able to switch off the map menu's offer to write a clicked
coordinate into a note. With it off, that item SHALL NOT be added to the map's
menu, and no other item on that menu SHALL move or change — the clicked
coordinate is still read once for the items that remain.

The setting SHALL default to on, so a reader who never opens it keeps the plugin
they had. Switching it SHALL reach maps that are already open, on the next menu
opened rather than after a restart. Switching it off SHALL NOT change the
coordinate property it would have written, which other features read and write.

#### Scenario: The item is switched off

- **WHEN** the reader switches it off and opens the context menu of a map already
  on screen
- **THEN** the item is not there, and the menu's other coordinate items are
  present and carry the same coordinate they would have carried

#### Scenario: The item is switched back on

- **WHEN** the reader switches it on again
- **THEN** the item is on the next menu opened, and confirms before replacing a
  coordinate exactly as it did before
