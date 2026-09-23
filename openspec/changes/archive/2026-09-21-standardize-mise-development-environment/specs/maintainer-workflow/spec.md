## ADDED Requirements

### Requirement: Repository-local development tools are reproducible and optional

The repository SHALL provide a committed mise configuration that selects Node
24, makes the supported OpenSpec CLI available, and exposes discoverable task
entry points for the documented development and verification commands. CI,
documentation, and release workflows SHALL use that same Node major.

The default tool installation SHALL remain limited to the tools needed for
ordinary source work. Large or platform-specific tools for Android and a Linux
desktop Obsidian test surface SHALL be installed only when a contributor runs
the corresponding task. Contributor documentation SHALL recommend the mise
path and SHALL retain an equivalent manual npm/tool-install path.

#### Scenario: Contributor chooses the recommended setup

- **WHEN** a contributor with mise clones the repository and follows the setup
  instructions
- **THEN** the repository selects Node 24, provides OpenSpec, and
  offers the documented development and check tasks without global tool setup

#### Scenario: Automation uses the recommended Node release

- **WHEN** CI, documentation, or release automation installs Node
- **THEN** each workflow selects Node 24, matching the repository mise
  configuration

#### Scenario: Contributor needs only ordinary source work

- **WHEN** a contributor runs the default mise installation
- **THEN** Android SDK images and a desktop Obsidian distribution are not
  downloaded

#### Scenario: Contributor prepares an Android verification surface

- **WHEN** a contributor runs the documented Android setup task
- **THEN** the required Java and Android SDK tool versions are activated for
  that task and the documented emulator packages can be installed without a
  global mise configuration

#### Scenario: Linux contributor needs the desktop test surface

- **WHEN** a Linux or WSL contributor runs the documented desktop task
- **THEN** the repository activates its supported Linux desktop distribution
  separately from the `obsidian` CLI client registered by the running app

#### Scenario: Contributor does not use mise

- **WHEN** a contributor follows the manual setup path
- **THEN** the documentation recommends Node 24, distinguishes the package's
  retained `>=20` engine floor, and states the npm commands, optional OpenSpec
  installation, and platform test prerequisites without requiring mise
