## Purpose

Defines what it means for one of this plugin's features to be switched off: which additions carry a switch at all, how completely a switch takes its feature away, what a switch leaves behind, and what an upgrading reader gets. Product capabilities state only what "off" means for their own feature and defer the shared policy here.

## Requirements

### Requirement: A feature that appears where it was not asked for carries a switch

Anything this plugin puts into a surface the reader did not open for it SHALL be
switchable off: an item added to a menu the host owns, an option or control added
to a map, a file extension claimed across the vault, or a structure handed to
another plugin's object. A command SHALL NOT need a switch of its own, being
invoked rather than encountered, and a command belonging to a switched feature
SHALL follow that feature's switch.

A switch SHALL take away everything its feature does rather than only what is
visible: with it off, the surface SHALL be what it would be with this plugin
absent. The feature's own configuration SHALL be kept rather than cleared, and
SHALL stay on screen where it is configured, inert, so a reader can see what
switching back on returns to them.

Flipping a switch SHALL reach what is already open — menus, maps and the settings
pane alike — rather than waiting for a restart. Where something already built
cannot be reached, what needs reopening SHALL be stated where the reader is,
rather than left to be discovered.

A switch SHALL default so that an upgrading reader keeps the plugin they already
had. Where a feature's on state costs a reader who does not use it something they
cannot otherwise avoid, the default SHALL instead be off, and a reader whose
existing configuration shows they use it SHALL be switched on once, when their
settings are read.

#### Scenario: A feature is switched off

- **WHEN** the reader switches off a feature that adds an item to a menu the host
  owns
- **THEN** the next time that menu is opened the item is absent, the feature's
  own commands are unavailable, and the menu is what it would be with this plugin
  absent

#### Scenario: A switched-off feature's configuration

- **WHEN** a settings page for a switched-off feature is opened
- **THEN** what was configured is on screen, stating what it holds, and cannot be
  edited until the feature is switched on

#### Scenario: A reader upgrades into a new switch

- **WHEN** settings written before a switch existed are read
- **THEN** the feature is on where it was on before, and off only where leaving it
  on would charge a reader who does not use it
