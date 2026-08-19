## MODIFIED Requirements

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
