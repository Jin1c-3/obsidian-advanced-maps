## Purpose

Defines safe, datum-correct links from a clicked map location to built-in and user-defined external map applications.

## Requirements

### Requirement: External actions augment the native context menu

External map destinations SHALL be added to the existing native map context menu when the host supports that integration, with a flat-item fallback when submenu support is unavailable.

#### Scenario: User opens the map context menu

- **WHEN** the native menu is created for a map click
- **THEN** enabled external destinations appear without replacing or reimplementing native menu actions

### Requirement: Clicked coordinates are normalized exactly once

The coordinate selected on a map SHALL be converted from current tile space to WGS-84 once before destination-specific conversion.

#### Scenario: External link starts on GCJ-02 tiles

- **WHEN** the user selects the same clicked location for OpenStreetMap and Gaode
- **THEN** OpenStreetMap receives WGS-84 and Gaode receives the corresponding GCJ-02 coordinate, with neither a missing nor doubled conversion

### Requirement: Built-in providers honor axis and datum conventions

The six built-in destinations SHALL construct URLs using each provider's required axis order and datum, including China-aware behavior for providers whose datum changes by region.

#### Scenario: Provider conventions differ

- **WHEN** a coordinate is opened in Gaode, Tencent, Baidu, Google, Apple, or OpenStreetMap
- **THEN** each URL contains the expected latitude/longitude order and WGS-84, GCJ-02, or BD-09 value for that provider and location

### Requirement: Built-in ordering follows configuration and locale

Users SHALL be able to reorder and disable built-in destinations; an empty stored order SHALL derive the complete default order from the current locale rather than persisting one locale's order.

#### Scenario: Plugin adds a built-in provider in a later version

- **WHEN** an existing stored order lacks the newly known provider
- **THEN** the provider is appended without duplicating or discarding recognized user ordering

#### Scenario: Stored list contains duplicates or unknown ids

- **WHEN** built-in destinations are resolved
- **THEN** each recognized id appears at most once, unknown ids are ignored, and missing recognized ids are restored

#### Scenario: User disables every built-in destination

- **WHEN** the stored configuration explicitly disables all built-ins and no usable custom destination exists
- **THEN** no external-map item is appended to the native context menu

### Requirement: Custom destinations state their datum

Each custom external map entry SHALL provide a name, URL template, and explicit WGS-84, GCJ-02, or BD-09 datum; raw `{lat}` and `{lng}` substitution SHALL support either query or path placement.

#### Scenario: Custom URL uses placeholders in its path

- **WHEN** a valid template such as `https://example.test/{lat}/{lng}` is opened
- **THEN** both raw placeholders are replaced without an intermediate URL normalization escaping them

### Requirement: Unsafe custom schemes are refused

Custom URL validation SHALL reject `javascript:`, `data:`, `vbscript:`, `blob:`, and `file:` destinations while allowing valid web and application-specific schemes.

#### Scenario: User saves a dangerous template

- **WHEN** a denied scheme is entered or loaded from older settings
- **THEN** the row displays an error and the destination cannot be opened

#### Scenario: User configures a mobile map scheme

- **WHEN** a valid application URL such as an iOS or Android map scheme is entered
- **THEN** it is accepted if the remaining template requirements are satisfied

#### Scenario: Template is incomplete

- **WHEN** a custom destination has no scheme or omits either `{lat}` or `{lng}`
- **THEN** the settings row explains the problem and the destination is excluded from the menu

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
