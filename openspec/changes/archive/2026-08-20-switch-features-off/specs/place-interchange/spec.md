## ADDED Requirements

### Requirement: Places in and out can be switched off

The reader SHALL be able to switch the exchange of places with files off. With it
off, no import item SHALL be added to a track file's menu and no export item to a
map's menu, and neither SHALL be reachable another way, because the two are one
feature: the same places, in and out.

The setting SHALL default to on, so a reader who never opens it keeps the plugin
they had. Switching it SHALL reach menus opened after that without a restart.
Notes already imported and files already exported SHALL be untouched by either
flip, being ordinary vault files once they are written.

#### Scenario: The exchange is switched off

- **WHEN** the reader switches it off and opens the menu of a supported track
  file, and the context menu of a map showing matched places
- **THEN** neither the import item nor the export item is offered

#### Scenario: Notes already imported

- **WHEN** the feature is switched off after places were imported as notes
- **THEN** those notes are unchanged and go on being drawn like any other placed
  note
