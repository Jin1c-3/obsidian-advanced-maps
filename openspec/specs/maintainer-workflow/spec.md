## Purpose

Defines the repository's durable documentation boundaries and the maintenance safeguards needed to keep behavior, comments, tests, settings, translations, and releases coherent.

## Requirements

### Requirement: OpenSpec is the technical source of truth

Stable observable behavior, cross-cutting invariants, edge cases, and acceptance scenarios SHALL live in capability specs; cross-capability implementation rationale SHALL live in the change design or archived design history.

#### Scenario: Contributor needs architecture context

- **WHEN** a maintainer follows the repository entry documentation
- **THEN** it points to the relevant capability spec or design instead of duplicating the full explanation

### Requirement: CLAUDE.md remains a concise entry point

`CLAUDE.md` SHALL contain only the plugin identity and prerequisites, commands, high-level source map, non-negotiable contributor rules, and links to canonical specs or contributor documentation.

#### Scenario: Existing long-form section is migrated

- **WHEN** a current architecture, measurement, trap, or feature-history section is removed from `CLAUDE.md`
- **THEN** every still-valid contract is represented in a capability spec, design decision, test, or focused contributor document, while obsolete claims are explicitly discarded

### Requirement: Source comments explain adjacent code only

Source comments SHALL be retained for local contracts, units and ranges, non-obvious safety or security constraints, undocumented-runtime provenance, and reasoning necessary to understand the adjacent implementation. Historical narratives, measurement transcripts, rejected alternatives, duplicated architecture, and references to `CLAUDE.md` SHALL NOT remain inline when the same knowledge belongs in OpenSpec.

#### Scenario: Comment audit is reviewed

- **WHEN** the TypeScript comment cleanup is complete
- **THEN** removed non-obvious current constraints can be traced to specs, tests, or design; adjacent code remains understandable; and no source comment uses `CLAUDE.md` as its explanation target

### Requirement: Documentation migration preserves runtime behavior

The documentation and comment migration SHALL NOT intentionally change executable TypeScript, plugin APIs, user settings, persisted data, runtime dependencies, or bundle semantics.

#### Scenario: Migration is validated

- **WHEN** the migration is complete
- **THEN** formatting, linting, typechecking, tests, coverage gates, and production build all pass, and any executable diff is either absent or separately justified as a correction to documentation-only scaffolding

### Requirement: Local development uses the relocated jot vault

The maintainer's ignored local `.env` SHALL target `../../Obsidian/jot/.obsidian/plugins/advanced-maps`, while committed setup examples SHALL remain portable and describe the vault target generically.

#### Scenario: Development watcher starts locally

- **WHEN** `npm run dev` is launched from this repository with the local environment file
- **THEN** builds are written to the relocated jot vault without relying on a `/mnt/c/...` mount

### Requirement: Obsolete reload troubleshooting is removed

Maintainer documentation and source comments SHALL NOT retain warnings, recovery procedures, or test preconditions that assert repeated plugin reload leaves orphaned layers or requires a full-window recovery. Factual build/watch and plugin-reload commands MAY remain where they are still useful.

#### Scenario: Reload references are audited

- **WHEN** repository documentation is searched after migration
- **THEN** the obsolete repeated-reload/orphan-layer narrative and old mounted path are absent, while ordinary reload terminology describing actual product lifecycle or a command is not removed merely for containing the word

### Requirement: Settings remain declarative and current

Plugin settings SHALL be exposed through searchable setting definitions, route writes through one typed value-update seam, refresh affected live views explicitly, preserve meaningful defaults when placeholder-backed fields are cleared, and distinguish an unresolved asynchronous view list from a confirmed empty list. A setting description that names the current value of another setting SHALL state the current value while the pane stays open, without re-rendering the field being edited.

#### Scenario: Dynamic base-view options are not ready

- **WHEN** the settings UI requests map views before the vault or selected base can be read
- **THEN** it does not falsely report that the base contains no map views, does not cache the miss, and refreshes when a current answer becomes available

#### Scenario: Visual setting changes

- **WHEN** a user changes a setting that affects tracks, photos, coordinates, or embed layout
- **THEN** affected open and lazy views receive the required refresh without waiting for unrelated vault data changes

#### Scenario: A named property is renamed in the open pane

- **WHEN** the coordinate property is edited in the settings pane
- **THEN** every description that names it reads the new name immediately, and the text field being typed in keeps its focus and caret

### Requirement: Pure logic retains gated test coverage

Coordinate conversion, parsing, statistics, map-link generation, geometry, event binding, location decisions, view options, Around-view generation, map-link parsing, geocoding, pin spreading, and localization SHALL remain independently testable outside Obsidian and SHALL satisfy the repository's configured per-file coverage thresholds.

#### Scenario: Pull request changes pure logic

- **WHEN** a covered pure module is modified
- **THEN** its tests exercise the behavior and `npm run check` enforces the configured coverage, lint, formatting, and type rules

### Requirement: Localization keys remain complete

English SHALL remain the localization key source of truth, and every supported locale SHALL provide matching keys and placeholders.

#### Scenario: Translation key is added

- **WHEN** a new English localization entry contains placeholders
- **THEN** compilation and localization tests require corresponding entries with matching placeholders in every locale

### Requirement: Changes use a lightweight protected-main workflow

Ordinary repository changes SHALL update local `main`, use a focused short-lived branch, proceed through a pull request, resolve conversations, pass `CI / format · lint · types · tests · build`, and squash-merge into protected `main`. Repository merge settings SHALL allow squash merge only and automatically delete merged head branches. The `main` ruleset SHALL block deletion and force pushes, require a pull request and the named CI check, and require zero approving reviews. Because the repository is maintained by one person, administrator bypass SHALL be reserved for emergencies and followed by equivalent validation with a recorded reason.

#### Scenario: Ordinary change is ready

- **WHEN** a branch has a focused change and its pull request passes `format · lint · types · tests · build`
- **THEN** it is squash-merged to `main` and the source branch is deleted

#### Scenario: Pull request has an unresolved conversation

- **WHEN** required CI passes but a pull-request conversation remains unresolved
- **THEN** the protected branch rule still prevents merge until the conversation is resolved

#### Scenario: Direct push is attempted

- **WHEN** an ordinary non-emergency update targets `main` without a pull request
- **THEN** repository protection rejects it

#### Scenario: Emergency bypass is used

- **WHEN** an administrator must bypass the pull-request rule for an urgent repair
- **THEN** the reason is recorded and the same checks run before or immediately after the push

#### Scenario: Solo maintainer opens a pull request

- **WHEN** the repository owner proposes an ordinary change
- **THEN** no approving review is required, while the pull request, conversation-resolution, and required-CI rules still apply

#### Scenario: Dependabot or routine automation proposes a change

- **WHEN** routine automation updates the repository
- **THEN** it uses a pull request and the same required CI instead of receiving a broad direct-push bypass

### Requirement: Releases remain reproducible and guarded

A release SHALL be cut from `main` and have a matching changelog section, synchronized package/manifest/version metadata, passing CI checks, tag/version agreement, and build provenance for published assets.

#### Scenario: Version tag lacks release notes

- **WHEN** a release tag has no matching changelog section
- **THEN** the release workflow fails before publishing assets

#### Scenario: Release assets are published

- **WHEN** a valid tag on `main` completes the release workflow
- **THEN** `main.js`, `manifest.json`, and `styles.css` are published with verifiable build provenance
