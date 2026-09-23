## Why

Contributors currently assemble Node, OpenSpec, Android tooling, and a desktop
Obsidian test surface from separate instructions and global installs. A
repository-owned mise configuration can make the supported versions and common
commands reproducible without forcing every contributor to download the much
larger mobile and desktop test tools.

## What Changes

- Commit a root `mise.toml` that selects Node 24 and provides the OpenSpec CLI
  used by the repository workflow; update CI, documentation, and release
  workflows to use the same Node major.
- Expose common setup, development, check, documentation, Android-emulator, and
  Linux/WSL desktop-launch commands as discoverable mise tasks.
- Keep Java, Android SDK packages, emulator images, and the Linux Obsidian
  desktop download task-scoped so the default `mise install` remains small.
- Update contributor documentation to recommend mise while preserving a clear
  npm/manual path for contributors who do not use it.
- Document that Obsidian CLI is registered by the running desktop application
  and is distinct from the mise-managed Linux desktop executable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `maintainer-workflow`: define the supported repository-local toolchain,
  lightweight default installation, optional test-surface tools, and documented
  fallback workflow.

## Impact

- `mise.toml`: committed tool versions and task entry points.
- `CONTRIBUTING.md`: setup, OpenSpec, Android emulator, and Linux/WSL Obsidian
  instructions.
- `.github/workflows/`: Node 24 for CI, documentation, and release jobs.
- `package.json` keeps `engines.node` at `>=20`; no plugin runtime behavior,
  bundle dependency, settings, user guide, or release metadata changes.
