# offline-basemap Specification

## Purpose

A map view's background can be a tile pack already on disk, so a vault's maps —
the notes, the routes, the photos and the ground under them — work with no
network at all.

## Requirements

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

### Requirement: The map is bounded to the levels the pack holds

A pack covers a range of zoom levels, and asking for a level outside it fetches
files that are not there. The plugin SHALL bound the map to the pack's stated
range in the two directions separately, because the two ends fail differently.

Past the deepest level, the plugin SHALL bound the raster source itself, so the
map draws the deepest tiles it has, magnified, and issues no request for a level
the pack does not hold. Below the shallowest level, the plugin SHALL raise the
map's own minimum zoom instead, so the camera stops at the edge of the pack —
bounding the source at that end empties it and leaves the map blank.

#### Scenario: The reader zooms past the deepest level in the pack

- **WHEN** the map is zoomed in past the pack's deepest level
- **THEN** the map keeps drawing, magnifying the tiles it has, and requests no
  tile the pack does not hold

#### Scenario: The reader zooms out past the shallowest level in the pack

- **WHEN** the map is zoomed out towards a level shallower than the pack's
  shallowest
- **THEN** the camera stops at the shallowest level the pack covers rather than
  emptying the map

#### Scenario: The style is replaced

- **WHEN** a theme change or a background switch replaces the map style
- **THEN** the bound is applied again to the source the new style built, without
  discarding tiles already drawn

### Requirement: A map view can decline the offline basemap

Whether a map draws the configured pack SHALL be a choice of that view, made
where its background is configured. Declining SHALL restore the background the
native view resolves for it, and SHALL leave every other map on the pack.

A map with no view options of its own — an inline track map — SHALL follow the
plugin setting, since that is the only statement of intent available to it.

#### Scenario: One view opts out

- **WHEN** a map view is set not to use the offline basemap
- **THEN** that view draws the background the native view resolves for it and
  every other view keeps drawing the pack

#### Scenario: An inline map has no options of its own

- **WHEN** an inline track map is drawn while a pack is configured
- **THEN** it draws the pack, following the plugin setting

### Requirement: Changing the pack reaches maps already open

Changing the pack or its zoom range SHALL take effect on maps that are already on
screen, both base map views and inline maps, rather than only on maps opened
afterwards. Turning the pack off SHALL put back the background the native view
resolves, not leave the last resolved URL behind.

#### Scenario: The pack is changed with a map open

- **WHEN** the path template or either zoom bound is changed while a map is open
- **THEN** that map redraws its background from the new value

#### Scenario: The pack is cleared with a map open

- **WHEN** the path template is emptied while a map is open
- **THEN** that map returns to the background the native view resolves for it

### Requirement: The pack is only ever read

This feature SHALL read tiles and SHALL NOT write, move, delete or fetch them. No
part of it SHALL download tiles from a provider, since bulk-fetching a provider's
tiles is that provider's terms to grant rather than this plugin's to assume on a
reader's behalf.

#### Scenario: A pack is in use

- **WHEN** a map draws from a configured pack
- **THEN** nothing under the pack's path is created, changed or removed, and no
  tile is fetched from a provider
