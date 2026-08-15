## Purpose

Defines the compatibility and lifecycle contract for extending Obsidian's first-party Bases Maps view without replacing its native map implementation.

## Requirements

### Requirement: Native Maps remains the host

The plugin SHALL augment the first-party Maps view registered by Bases and SHALL NOT require a bundled map renderer or a forked replacement view.

#### Scenario: Supported host is available

- **WHEN** Obsidian 1.13.1 or newer has Bases enabled and the first-party Maps plugin installed
- **THEN** Advanced Maps adds its capabilities to the native map view while retaining native backgrounds, controls, markers, and future native updates

#### Scenario: Required host is unavailable

- **WHEN** the first-party Maps view cannot be found or does not expose the expected shape
- **THEN** the plugin stands down without breaking Bases or other views and informs the user when appropriate

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
