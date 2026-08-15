## ADDED Requirements

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
