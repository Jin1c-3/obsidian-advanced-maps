## Purpose

Defines how maps focus notes, follow the active note without rewriting queries, open note targets safely, and generate reusable Around views.

## Requirements

### Requirement: Open in map references a configured base view

The open-in-map action SHALL target an existing map view in the configured base and SHALL NOT serialize a copy of that view's formulas or filters.

#### Scenario: Open in a tab

- **WHEN** the user opens a coordinate-bearing note in map with tab mode selected
- **THEN** the configured base file and map view open in a workspace leaf where persistent view edits can be written by Bases

#### Scenario: Open in a modal

- **WHEN** the user opens a coordinate-bearing note in map with modal mode selected
- **THEN** a referenced base-view embed opens in a modal, view changes remain ephemeral, and no copied base definition is written

#### Scenario: Note has no configured coordinate

- **WHEN** the current file is not a markdown note with a valid configured coordinate property
- **THEN** note-specific open-in-map actions are unavailable or refuse safely

### Requirement: Focus survives competing camera actions

Focusing a note SHALL use its WGS-84 coordinate, apply the configured open zoom when requested, open its popup when data is available, and remain in place through initialization, automatic framing, configured-center application, and late native load framing unless the user moves the camera.

#### Scenario: Map is not initialized when focus is requested

- **WHEN** a referenced base view exists before its map or rows are ready
- **THEN** the focus request is retained in WGS-84 and applied when the required map and note data arrive within a bounded wait

#### Scenario: User moves after focus

- **WHEN** the user pans or zooms after a focus target was applied
- **THEN** later map lifecycle events do not force the camera back to the target

### Requirement: Following is controlled per open map

Each open map SHALL have its own follow-active-note toggle initialized once from the plugin setting, with no persistence into the base file.

Following SHALL be switchable off altogether. With it off, a map view SHALL offer no follow toggle, no map SHALL follow the active note, and a map that opens while it is off SHALL NOT start following whatever the initial-state setting says. The setting SHALL default to on.

Switching it SHALL reach maps that are already open. Switching it off SHALL stop any map that was following and release the target it held, because a following map whose toggle has gone has nothing left that could stop it. Switching it back on SHALL return the toggle in its off state rather than restoring what a map was doing before.

#### Scenario: User enables following

- **WHEN** following is turned on for one map
- **THEN** that map immediately focuses the current coordinate-bearing note and future eligible file opens, while other maps retain their own toggle state

#### Scenario: User disables following

- **WHEN** following is turned off
- **THEN** the map stops responding to active-note changes, releases the held focus target, and can auto-fit again

#### Scenario: Following is switched off while a map is following

- **WHEN** the reader switches following off while an open map is following the active note
- **THEN** the toggle is gone from every open map, that map stops responding to active-note changes, and it releases the target it held

#### Scenario: A map opens while following is switched off

- **WHEN** a map view opens with following switched off and the initial-state setting on
- **THEN** the map does not follow, and carries no toggle that says it might

### Requirement: Following moves the camera, not the query or zoom

Active-note following SHALL leave the base filter and current zoom unchanged.

#### Scenario: User switches between eligible notes

- **WHEN** a following map observes successive coordinate-bearing notes
- **THEN** its center moves to each note, its zoom is unchanged, and the base result set is not rewritten

### Requirement: Following preserves the editing pane

A programmatic follow popup SHALL return keyboard focus to the previously focused editor, and map clicks SHALL open notes in the pane being followed when that pane remains valid.

#### Scenario: Follow opens a popup beside an editor

- **WHEN** following moves a map in a neighboring split and opens the note popup
- **THEN** the editor keeps its caret and keyboard focus

#### Scenario: User clicks a map item while following

- **WHEN** the map leaf is active but the map is following a note pane
- **THEN** a normal item click opens in the followed pane and does not replace the map; modifier clicks retain native behavior

### Requirement: Around view remains a live base view

The Around command SHALL add, at most once, a map view copied from an existing map view and insert a reference to it in the host note.

#### Scenario: Around view is created

- **WHEN** the configured Around name is unused and a source map view exists
- **THEN** the new view preserves source formulas, marker configuration, and existing filters; removes configured center and zoom; and adds live filters for outward links, inward links, and the coordinate-bearing host note

#### Scenario: Matching Around view already exists

- **WHEN** a map view with the configured name already exists
- **THEN** the base file is not rewritten and the note can receive the same embed reference

#### Scenario: Non-map view occupies the name

- **WHEN** a table or cards view uses the configured Around name
- **THEN** the command refuses with a clear notice rather than embedding the wrong view

#### Scenario: Host note falls outside the base filter

- **WHEN** the base's own top-level filter excludes the host note
- **THEN** the Around view preserves that filter and does not force the host into the result, while other qualifying linked notes remain live

#### Scenario: Around is invoked outside an editable cursor context

- **WHEN** the note is in a mode where an editor command cannot insert text
- **THEN** the insertion command is unavailable rather than writing at an unspecified location

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
