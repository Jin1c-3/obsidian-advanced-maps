## MODIFIED Requirements

### Requirement: Native Maps remains the host

The plugin SHALL augment the first-party Maps view registered by Bases and SHALL NOT require a bundled map renderer or a forked replacement view.

The plugin SHALL retain the background the native view resolves, except where the
reader has configured a basemap of their own and the view has not declined it. In
that case the substitution SHALL be made in the configuration object the native
view builds for one map, never by writing into the reader's own view settings, so
the background configured in the base is untouched and returns as soon as the
substitution stops.

#### Scenario: Supported host is available

- **WHEN** Obsidian 1.13.1 or newer has Bases enabled and the first-party Maps plugin installed
- **THEN** Advanced Maps adds its capabilities to the native map view while retaining native backgrounds, controls, markers, and future native updates

#### Scenario: Required host is unavailable

- **WHEN** the first-party Maps view cannot be found or does not expose the expected shape
- **THEN** the plugin stands down without breaking Bases or other views and informs the user when appropriate

#### Scenario: The reader configures a basemap of their own

- **WHEN** a map is built while the reader has configured a basemap this plugin
  resolves, and the view has not declined it
- **THEN** that map draws the configured basemap, and the background stored in the
  base file is left exactly as the reader wrote it
