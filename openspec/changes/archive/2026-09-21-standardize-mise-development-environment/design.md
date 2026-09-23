## Context

See `proposal.md` for motivation and the maintainer-workflow delta for the
observable contributor contract.

CI, documentation, and release workflows currently select Node 22, while
`package.json` accepts Node 20 or newer. The repository will move its
recommended and automated development version to Node 24 without raising that
package engine floor. OpenSpec is required only for changes that carry planning
artifacts. Android verification additionally needs Java, Android command-line
tools, emulator packages, an AVD, and KVM; Linux/WSL live testing may use an
official Obsidian desktop release plus the separate CLI client registered from
Obsidian settings.

The current untracked mise configuration proves each tool can be installed, but
placing all of them under top-level `[tools]` would make an ordinary
`mise install` download the heavyweight optional surfaces. Its renamed Linux
desktop executable is also a platform-specific convenience rather than a
cross-platform project prerequisite.

## Goals / Non-Goals

**Goals:**

- Make the smallest common contributor toolchain reproducible from the repo.
- Align the recommended local Node version and every GitHub workflow on Node 24.
- Keep npm scripts authoritative while adding discoverable mise task aliases.
- Install mobile and Linux desktop verification tools only on demand.
- Explain the distinction between the Linux desktop executable and Obsidian's
  registered CLI socket client.
- Preserve a complete workflow for contributors who do not use mise.

**Non-Goals:**

- Replace npm scripts, `package-lock.json`, GitHub Actions, or the release
  workflow with mise.
- Automate Android permissions, APK licensing/download, device attachment, or
  nested virtualization.
- Manage Obsidian on Windows or macOS, where normal platform installers remain
  the supported path.
- Commit personal vault paths, AVD state, or a per-machine `.env`.

## Decisions

### Keep only Node 24 and OpenSpec as default tools

The root `[tools]` table will select Node 24 and an exact OpenSpec CLI version
known to read the repository schema. CI, documentation, and release workflows
will move to Node 24 at the same time. Ordinary `mise install` then prepares
source, test, documentation, and planning work without downloading a GUI
application or mobile SDK.

`package.json` will retain `engines.node = ">=20"`. That field is the accepted
npm floor rather than the repository's recommended or continuously verified
version; raising it would reject otherwise usable contributor environments
without changing the shipped plugin, which does not execute under Node.

Alternative considered: retain Java, Android SDK, and Obsidian under top-level
`[tools]`. Rejected because the default installation would be much larger and
would install platform-specific tools for contributors who never exercise those
surfaces.

### Use task-scoped tools for optional verification surfaces

Android setup/emulator tasks will declare Java 21 and Android SDK 23.0 through
each task's `tools` field. A Linux/WSL desktop task will declare the official
Obsidian GitHub release backend for that task and launch its desktop executable
with the Linux AppImage sandbox flag. Mise installs task tools when the task is
actually run, so the task name is both the opt-in and the discoverable command.

Alternative considered: commit environment-specific mise files selected with
`MISE_ENV`. Rejected because contributors would have to keep an environment
selector active for later `adb` and emulator commands, while task-scoped tools
keep each documented operation self-contained.

### Treat npm scripts as the command source of truth

Mise tasks will delegate to `npm install`, `npm run dev`, `npm run check`, and
the existing documentation scripts. This adds discovery and automatic tool
selection without creating a second build definition.

Alternative considered: reproduce the check pipeline directly in mise. Rejected
because it would drift from `package.json` and CI.

### Document both recommended and manual paths together

`CONTRIBUTING.md` will lead with the short mise setup, then state the manual
Node/npm/OpenSpec equivalents and keep `.env` setup common to both. The mobile
section will use the repository Android tasks instead of modifying a
contributor's global mise config. The Linux/WSL note will state that the desktop
task does not install the CLI client; the running app registers that client
from Settings → General. The manual path will recommend Node 24 while noting the
retained Node 20 package-engine floor.

Alternative considered: make mise mandatory. Rejected because Node and npm are
already sufficient for contributors who do not create OpenSpec changes or run
the optional verification surfaces.

## Risks / Trade-offs

- **[Risk] Optional tool versions age while Obsidian and Android releases move.**
  → Keep versions explicit, exercise tasks during relevant platform changes,
  and update the config and contributor prose together.
- **[Risk] A Node 24-only CI pass misses a regression on the retained Node 20
  engine floor.** → Treat Node 24 as the supported contributor baseline and
  keep the broader engine declaration only while no project dependency or
  script requires a higher minimum; raise it in a separate compatibility change
  if that ceases to be true.
- **[Risk] A task-scoped executable shadows a similarly named personal binary.**
  → Give tasks surface-specific names and document that the Linux desktop task
  intentionally invokes the task tool while the standalone `obsidian` command
  remains the registered CLI outside it.
- **[Risk] Android setup downloads a large image unexpectedly.** → Keep it out
  of default tools, name the setup task clearly, and state its purpose before
  the command.
- **[Risk] Mise becomes a second build system.** → Every ordinary task delegates
  to the existing npm script and CI continues to run npm directly.

## Migration Plan

Commit the root configuration, workflow version updates, and contributor
documentation together. Existing contributors may continue using their global
Node/OpenSpec/Android tools; local or global mise configuration remains able to
override project defaults. Remove the committed configuration, restore the
workflow Node selection, and revert the documentation to the manual commands to
roll back; no plugin, vault, or release data requires migration.
