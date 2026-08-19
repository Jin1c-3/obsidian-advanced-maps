## ADDED Requirements

### Requirement: A map view names the background it starts on

Which background a map opens on SHALL be a choice of that view, made where its
background is configured, and stated by name rather than as a yes or no. The
choice SHALL offer the background the native view would resolve on its own, every
background the host offers, and every configured pack, so that one base file can
hold a view on a pack and another on the network.

A view whose stated background no longer exists — a pack since renamed or removed
— SHALL fall back to the background the native view resolves for it rather than
draw nothing, and SHALL say so where the choice is made rather than silently
change what it means.

A map with no view options of its own — an inline track map — SHALL follow the
plugin's own stated default, since that is the only statement of intent available
to it.

#### Scenario: Two views in one base file open on different backgrounds

- **WHEN** one map view names a pack and another names the default background
- **THEN** each opens on what it names, and neither changes the other

#### Scenario: A view names a pack that is no longer configured

- **WHEN** a map view naming a pack is opened after that pack has been removed
- **THEN** the map draws the background the native view resolves for it, and the
  view's own setting reports that what it named is gone

#### Scenario: An inline map has no options of its own

- **WHEN** an inline track map is drawn while a pack is the plugin's default
- **THEN** it draws that pack, following the plugin setting

### Requirement: A reader chooses a map's background from the map

Every configured pack SHALL be offered to the reader wherever the host offers its
own backgrounds, named as the reader named it, so that a local background is
picked the way every other background is. Choosing one SHALL draw it with its own
zoom bounds applied.

A background the reader picks SHALL win over the plugin's own substitution for as
long as that map is on screen, including across a configuration reload, so a map
never returns to a background the reader did not ask for while still reporting
the one they did. The choice SHALL NOT outlive the map, matching how a background
picked from the host's own control already behaves, and SHALL NOT be written to
any file.

The reader SHALL always be able to reach the background they would have with no
pack configured, so that choosing a pack is reversible from the map itself.

Offering these entries depends on a host control this plugin does not own. Where
that control is absent or is not the shape this expects, the plugin SHALL leave
the host's own backgrounds exactly as they were and stand down, and every pack
SHALL remain reachable through the view's own setting.

#### Scenario: The reader picks a pack from the map

- **WHEN** a reader chooses a configured pack where the host offers its
  backgrounds
- **THEN** the map draws that pack, bounded to the levels that pack holds

#### Scenario: The configuration reloads after a pick

- **WHEN** anything reloads a map's configuration after the reader has picked a
  background
- **THEN** the map still draws what the reader picked, and what is offered still
  reports that same background as the current one

#### Scenario: The reader picks their way back

- **WHEN** a reader whose map is drawing a pack chooses the background they would
  have with no pack configured
- **THEN** the map draws that background and does not return to the pack until
  they ask for it

#### Scenario: The map is closed and opened again

- **WHEN** a map whose background the reader picked is closed and opened again
- **THEN** it opens on the background its view names, not on the picked one, and
  nothing about the pick was written to a file

#### Scenario: The host control is not the shape this expects

- **WHEN** the host offers no background control, or one whose shape this plugin
  cannot read
- **THEN** the host's own backgrounds are left exactly as they were, no entry is
  added, and each pack is still reachable from the view's own setting

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

A template that does not carry all three placeholders SHALL be reported as
unusable where it is entered, and SHALL leave the map's own background in place
rather than replacing it with something that cannot draw.

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

### Requirement: The map is bounded to the levels the pack holds

A pack covers a range of zoom levels, and asking for a level outside it fetches
files that are not there. The plugin SHALL bound the map to the stated range of
whichever pack that map is drawing, in the two directions separately, because the
two ends fail differently. A map that changes from one pack to another SHALL be
bounded to the range of the pack it now draws, not the one it drew before.

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

#### Scenario: The map changes to a pack with a different range

- **WHEN** a map drawing one pack is changed to another whose zoom range differs
- **THEN** both bounds follow the pack now drawn, and a camera left outside that
  range is brought back into it

#### Scenario: The style is replaced

- **WHEN** a theme change or a background switch replaces the map style
- **THEN** the bound is applied again to the source the new style built, without
  discarding tiles already drawn

### Requirement: Changing the pack reaches maps already open

Adding, changing or removing a pack SHALL take effect on maps that are already on
screen, both base map views and inline maps, rather than only on maps opened
afterwards. A map drawing a pack that is removed SHALL put back the background it
would have without it, not leave the last resolved URL behind. What is offered to
a reader SHALL follow the same change, so a pack that is gone is not still on
offer and a pack just added is.

#### Scenario: The pack is changed with a map open

- **WHEN** a pack's path or either of its zoom bounds is changed while a map
  drawing it is open
- **THEN** that map redraws its background from the new value

#### Scenario: The pack is cleared with a map open

- **WHEN** a pack is removed while a map drawing it is open
- **THEN** that map returns to the background it would have without that pack,
  and the pack is no longer offered

#### Scenario: A pack is added with a map open

- **WHEN** a pack is added while a map is open
- **THEN** that map keeps the background it is drawing, and the new pack is
  offered on it without reopening it

## REMOVED Requirements

### Requirement: A map view can decline the offline basemap

**Reason**: Declining is now one choice among several rather than the only one a
view can make. A view states which background it opens on by name, which covers
declining — the default background is one of the names — and also covers picking
one pack out of several, which the yes-or-no form could not express.

**Migration**: A view already saying it declines keeps declining: the stored `off`
value continues to name the background the native view resolves, and a view with
nothing stored continues to follow the plugin's own default. No base file needs
editing. The behavior this requirement described is carried by _A map view names
the background it starts on_.
