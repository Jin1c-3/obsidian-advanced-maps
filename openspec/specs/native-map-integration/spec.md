## Purpose

Defines the compatibility and lifecycle contract for extending Obsidian's first-party Bases Maps view without replacing its native map implementation.

## Requirements

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

### Requirement: Enhancements are isolated per view

Each map view SHALL own an independent enhancement lifecycle, and removing the enhancement SHALL return that view to native behavior without leaving handlers or method changes active.

#### Scenario: Plugin is disabled with maps open

- **WHEN** Advanced Maps unloads while one or more native map views remain open
- **THEN** every enhanced view stops Advanced Maps interactions and retains usable native Maps behavior

#### Scenario: Multiple maps are open

- **WHEN** two map views are open with different state or tile systems
- **THEN** changing or closing one view does not alter the enhancement state of the other

### Requirement: Unsupported internals fail safely

Every entry point that depends on undocumented host behavior MUST validate the runtime shape it needs before using it.

#### Scenario: A host update removes an expected member

- **WHEN** an Obsidian or Maps update changes an undocumented member used by an enhancement
- **THEN** that enhancement is skipped without an uncaught exception and unrelated native map behavior continues

### Requirement: Existing views are eligible for enhancement

The plugin SHALL enhance compatible native map views that were already open before Advanced Maps loaded as well as views created afterward.

#### Scenario: Plugin loads after a map view

- **WHEN** a compatible map view already has an initialized map at plugin load time
- **THEN** the view receives the same Advanced Maps layers, coordinate handling, and interactions as a newly opened view

#### Scenario: Native Maps replaces its registration

- **WHEN** the first-party Maps plugin re-registers its Bases view type while Advanced Maps remains loaded
- **THEN** Advanced Maps restores its factory and option augmentation, adopts compatible surviving views once, and does not stack duplicate enhancement lifecycles

### Requirement: Style replacement restores owned content

Advanced Maps-owned sources, images, layers, paint, and interactions SHALL recover after a native background or style replacement without duplicating registrations.

#### Scenario: User switches map background

- **WHEN** a style change removes custom map content
- **THEN** Advanced Maps restores its currently enabled content after the new style becomes usable and each user action is handled once

### Requirement: Registration wrappers name their owning instance

A wrapper installed over the native Bases map registration SHALL identify the plugin instance that installed it and SHALL carry the native function it replaced. A loading instance SHALL recognize its own wrapper, SHALL re-take a wrapper left by an instance that is no longer loaded by wrapping the native function that wrapper carries rather than the wrapper itself, and SHALL NOT stack a second augmentation on top of the first. An unloading instance SHALL leave any surviving wrapper of its own inert, so a wrapper it cannot remove behaves as the native registration rather than enhancing views on behalf of an unloaded plugin.

#### Scenario: The plugin is reloaded

- **WHEN** Advanced Maps unloads and loads again while Bases keeps the same map registration
- **THEN** the new instance enhances new and existing map views, and the map view options are augmented once rather than twice

#### Scenario: Another plugin wraps the same registration

- **WHEN** a second plugin wraps the map registration and its restore order leaves an Advanced Maps wrapper from an unloaded instance in place
- **THEN** the loading instance re-takes the registration from the native function that wrapper carries and enhancement works without restarting Obsidian

#### Scenario: An Advanced Maps wrapper outlives its instance

- **WHEN** a wrapper installed by an unloaded instance is still called because another plugin's wrapper holds a reference to it
- **THEN** the map view is created natively and no enhancement is attached on behalf of the unloaded instance

### Requirement: Native defects the plugin makes reachable are neutralized in place

Where a supported configuration makes a native map defect reachable, the plugin
SHALL neutralize it through an instance-scoped wrapper that leaves native
behavior otherwise intact, rather than by reimplementing the native path or
leaving an uncaught native exception in place. Such a wrapper SHALL be treated
as an undocumented-internal dependency: it SHALL validate the shape it needs
before installing, SHALL stand down when that shape is absent, and SHALL be
removed when the enhancement is removed so the view returns to native behavior.

Specifically, when the native marker bounds are reported as present but cover no
marker, the plugin SHALL report them as absent, so that native code guarding on
their presence takes its no-bounds path instead of computing a center from
nothing.

#### Scenario: Query results arrive after the map finishes loading

- **WHEN** a base result large enough that the native map finishes loading while no valid marker has been published yet
- **THEN** the native framing step takes its no-bounds path, no uncaught exception is raised, and the map's camera remains usable

#### Scenario: Result contains no note with coordinates

- **WHEN** every entry in a base result lacks a usable coordinate property, as when the result is entirely photo files
- **THEN** the native framing step still takes its no-bounds path and Advanced Maps frames the camera from the features it drew

#### Scenario: Enhancement is removed from a view

- **WHEN** Advanced Maps detaches from a view or unloads
- **THEN** the native bounds accessor is restored to its original behavior

#### Scenario: The native bounds accessor is not the expected shape

- **WHEN** the expected marker-manager accessor is missing or is not a function
- **THEN** the wrapper is not installed, the omission does not raise, and the rest of the enhancement proceeds
