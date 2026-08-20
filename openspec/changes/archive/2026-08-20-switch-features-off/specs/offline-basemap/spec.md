## ADDED Requirements

### Requirement: Offline basemaps can be switched off

The reader SHALL be able to switch offline basemaps off. With them off, no pack
SHALL be resolved, offered or drawn anywhere — not on a base map view, not on an
inline map, and not among a map's own options — and the host's own background
control SHALL be left holding the host's own list of backgrounds, so that a
reader who does not use this feature is left with the host they would have
without this plugin: a background they add where the host configures its own
reaches an open map's control the next time that control is opened.

The packs themselves SHALL be kept, and SHALL stay on screen where they are
configured, stating what they hold, so that switching the feature off is never a
way of losing them.

The setting SHALL default to on for a reader who already has a pack configured,
and to off for everyone else. A reader upgrading with a pack therefore keeps the
background they have, and a reader who has never configured one is not charged
for a feature they do not use.

Switching it SHALL reach maps that are already open: a map drawing a pack SHALL
return to the background it would have without one, and that pack SHALL stop
being offered where a background is picked. Switching it back on SHALL make every
configured pack drawable and pickable again, through the map's own options at
once and where the host offers its backgrounds once that map is opened again,
because the host's control is handed what it offers only when it is built.

#### Scenario: A reader who configured no pack opens a map

- **WHEN** offline basemaps are off and a map view is opened
- **THEN** no background entry of this plugin's is added, the map's options carry
  no background of this plugin's to pick, and the host's background control lists
  exactly what the host itself configured — including a background added in the
  host's own settings since that map was opened

#### Scenario: The feature is switched off while a map draws a pack

- **WHEN** offline basemaps are switched off with a map drawing one on screen
- **THEN** that map returns to the background it would have without any pack, the
  pack is no longer offered anywhere on it, and no pack is removed from the
  configuration

#### Scenario: The configuration while the feature is off

- **WHEN** the reader opens the offline basemap settings with the feature off
- **THEN** every configured pack is shown as they left it and none of it can be
  edited until the feature is switched on

#### Scenario: The feature is switched back on

- **WHEN** offline basemaps are switched on again
- **THEN** the configured packs are drawable and are offered among a map's own
  options without reopening it, and are offered where the host offers its
  backgrounds on maps opened after that

#### Scenario: A reader upgrades

- **WHEN** the plugin is upgraded to the version that adds this switch
- **THEN** a reader who has a pack configured has the feature on and sees no
  change, and a reader who has none has it off
