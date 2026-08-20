## MODIFIED Requirements

### Requirement: A tile pack on disk can be a map's background

Several tile packs SHALL be configurable, each carrying a name that tells it from
the others and its own two zoom bounds, and each SHALL be usable as the
background of every map this plugin enhances, on every platform the plugin runs
on. A name SHALL be how a pack is offered to a reader and how a view refers to
it.

A pack SHALL be stated as a path template on the local file system, absolute or
relative to the vault, holding the `{z}`, `{x}` and `{y}` placeholders the tiles
are addressed by. The plugin SHALL resolve that template to a URL the map can
fetch at the time the map is built, never storing a resolved URL, because the
prefix a resolved URL carries is regenerated on every application launch and a
stored one would stop working at the next restart.

The resolved URL SHALL be one the host's own web view will load on the platform
it is running on. Where a platform serves local files through a different scheme
than the desktop does, the plugin SHALL resolve the template through the form
that platform's host uses for its own local resources, rather than through a
scheme the web view will refuse.

A vault-relative template SHALL resolve against the vault on every platform,
including those whose vault storage is not a plain file system directory.

Configuring a pack SHALL be possible in any order, so a pack being entered SHALL
be kept as the reader has it: a row exists from the moment it is added, whether
or not it yet carries a name or a path, and only the reader removes it. What can
be drawn is decided where a map is drawn, not where one is typed.

A row that cannot be one of those packs SHALL say so where it is entered, SHALL
be left out of every place a pack is offered rather than being silently absent
from them, and SHALL leave the map's own background in place rather than
replacing it with something that cannot draw. A template missing one of its
placeholders, a row with no name, and a row whose name another row already
carries are each reported this way, because each has the same consequence: no map
can be pointed at that row.

Where a pack is referred to by name, removing it SHALL take the references the
reader cannot see with it — a stored default naming a pack that has just been
removed SHALL become no default rather than a name nothing answers to.

#### Scenario: A pack is configured

- **WHEN** a path template holding `{z}`, `{x}` and `{y}` is configured and a map
  view is opened
- **THEN** the map draws its background from that pack, and issues no tile
  request to the network

#### Scenario: Several packs are configured

- **WHEN** more than one pack is configured, each with its own name, path and
  zoom bounds
- **THEN** each is offered under its own name, and drawing one leaves the others
  configured and available

#### Scenario: A pack is added to the list

- **WHEN** the reader adds a pack and has not yet typed anything into it
- **THEN** the row is there to type into, and stays there across a re-render and
  a restart, while no map is offered a background for it

#### Scenario: A row that no map can be pointed at

- **WHEN** a row carries a path but no name, or a name another row already
  carries
- **THEN** the row says which of the two is wrong, is left out of everywhere a
  background is offered, and stays on screen to be corrected

#### Scenario: The pack the default names is removed

- **WHEN** the reader removes the pack that the default background names
- **THEN** the default becomes none, and every map that was following it draws
  the background the native view resolves

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

- **WHEN** no pack is configured
- **THEN** every map keeps exactly the background the native view resolves for it
