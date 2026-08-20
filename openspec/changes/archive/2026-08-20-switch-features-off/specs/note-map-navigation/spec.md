## ADDED Requirements

### Requirement: Open in map can be switched off

The reader SHALL be able to switch open-in-map off. With it off, no item SHALL be
added to a note's menu and the open-in-map command SHALL be unavailable, so a
note carrying a coordinate property offers nothing of this plugin's where the
host offers its own actions. Everything else the plugin draws SHALL be unchanged,
including the coordinate property itself, which other features read and write.

The setting SHALL default to on, so a reader who never opens it keeps the plugin
they had. Switching it SHALL reach menus opened after that without a restart, and
the label the item carries SHALL stay configured while stating that nothing shows
it.

#### Scenario: Open in map is switched off

- **WHEN** the reader switches open-in-map off and opens the menu of a note that
  holds a coordinate
- **THEN** the item is not there, the command cannot be run from the palette, and
  the note's own properties are untouched

#### Scenario: Open in map is switched back on

- **WHEN** the reader switches it on again
- **THEN** the item is on the next menu opened, under the label that was
  configured all along

### Requirement: The nearby-notes map can be switched off

The reader SHALL be able to switch the nearby-notes map off. With it off, no item
SHALL be added to the editor's own menu and its command SHALL be unavailable, so
a note being edited carries nothing of this plugin's. An Around view already
written into a base SHALL be left exactly as it is, and an embed already in a
note SHALL go on drawing, because what is switched off is the offer to write one,
not the views and notes that were written.

The setting SHALL default to on. Switching it SHALL reach menus opened after that
without a restart, and the view name it would use SHALL stay configured.

#### Scenario: The nearby-notes map is switched off

- **WHEN** the reader switches it off and right-clicks in a note
- **THEN** the editor menu carries no item of this plugin's, and its command
  cannot be run from the palette

#### Scenario: A note already holding one of these maps

- **WHEN** a note embedding an Around view is opened with the feature off
- **THEN** the embedded view draws as it always did, and the base file is not
  rewritten
