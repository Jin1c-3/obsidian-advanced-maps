## MODIFIED Requirements

### Requirement: A tile pack on disk can be a map's background

A path template naming tiles on the local file system SHALL be usable as the
background of every map this plugin enhances, on every platform the plugin runs
on. The template SHALL be stated as a file system path, absolute or relative to
the vault, holding the `{z}`, `{x}` and `{y}` placeholders the tiles are
addressed by. The plugin SHALL resolve that template to a URL the map can fetch
at the time the map is built, never storing a resolved URL, because the prefix a
resolved URL carries is regenerated on every application launch and a stored one
would stop working at the next restart.

The resolved URL SHALL be one the host's own web view will load on the platform
it is running on. Where a platform serves local files through a different scheme
than the desktop does, the plugin SHALL resolve the template through the form
that platform's host uses for its own local resources, rather than through a
scheme the web view will refuse.

A vault-relative template SHALL resolve against the vault on every platform,
including those whose vault storage is not a plain file system directory.

A template that does not carry all three placeholders SHALL be reported as
unusable where it is entered, and SHALL leave the map's own background in place
rather than replacing it with something that cannot draw.

#### Scenario: A pack is configured

- **WHEN** a path template holding `{z}`, `{x}` and `{y}` is configured and a map
  view is opened
- **THEN** the map draws its background from that pack, and issues no tile
  request to the network

#### Scenario: The application is restarted

- **WHEN** the application is closed and reopened, and a map view is opened again
- **THEN** the pack still draws, because the prefix is resolved again rather than
  remembered

#### Scenario: A pack is configured on a mobile device

- **WHEN** an absolute path template is configured on a device whose host serves
  local files through a scheme the desktop does not use
- **THEN** the map draws that pack, because the URL is built from the form that
  host uses for its own local resources

#### Scenario: A vault-relative pack on a device without a file system adapter

- **WHEN** a vault-relative path template is configured on a platform whose vault
  storage is reached through something other than a file system adapter
- **THEN** the template still resolves against that vault, rather than being
  treated as having no starting point

#### Scenario: The template is missing a placeholder

- **WHEN** a template without one of `{z}`, `{x}` and `{y}` is entered
- **THEN** the entry says what is wrong and the map keeps the background it
  already had

#### Scenario: No pack is configured

- **WHEN** no path template is set
- **THEN** every map keeps exactly the background the native view resolves for it
