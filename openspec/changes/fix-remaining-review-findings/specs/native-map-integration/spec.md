## ADDED Requirements

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
