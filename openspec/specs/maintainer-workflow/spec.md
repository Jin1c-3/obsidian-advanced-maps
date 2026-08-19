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

The pane SHALL present its rows as topical pages reached from a root of navigable entries rather than as one continuous list, each page carrying its own introduction; an entry MAY state the current value of the setting that sums its page up. Every row SHALL remain reachable through settings search wherever it lives, including a row whose editor is a list of nameless entries, and the arrangement SHALL change no setting's key, default, stored value, validation, or refresh behavior.

A row's name and description SHALL say what the setting does and what happens when it is off. Reasoning, worked examples, and the history of a decision belong in the user guide, and SHALL NOT be restated in the pane.

A setting whose value is a list of vault paths SHALL be edited as a list, one path per row, each offering the vault's own folder suggestions; and a list the reader has emptied SHALL be stored as empty rather than restored to its default, while stating in place what an empty list means.

Where one setting decides whether another is written at all, both SHALL sit on one row, and the row SHALL keep the dependent control visible but inert rather than removing it, so the row still states what the value would be.

#### Scenario: Dynamic base-view options are not ready

- **WHEN** the settings UI requests map views before the vault or selected base can be read
- **THEN** it does not falsely report that the base contains no map views, does not cache the miss, and refreshes when a current answer becomes available

#### Scenario: Visual setting changes

- **WHEN** a user changes a setting that affects tracks, photos, coordinates, or embed layout
- **THEN** affected open and lazy views receive the required refresh without waiting for unrelated vault data changes

#### Scenario: A named property is renamed in the open pane

- **WHEN** the coordinate property is edited in the settings pane
- **THEN** every description that names it reads the new name immediately, and the text field being typed in keeps its focus and caret

#### Scenario: A reader opens the pane for one topic

- **WHEN** the settings pane is opened
- **THEN** it shows one navigable entry per topic, and opening an entry shows that topic's introduction and its rows without the other topics' rows in the way

#### Scenario: A row is searched for by name

- **WHEN** a reader searches the settings for a row's name or description
- **THEN** the row is found and reachable even though it lives on a page rather than on the pane's root

#### Scenario: An entry is summed up by one value

- **WHEN** a page's purpose is answered by a single setting, such as the coordinate system or the configured base
- **THEN** the entry states that current value beside its name, and the value shown follows a change made on the page

#### Scenario: The arrangement changes

- **WHEN** rows are moved from one part of the pane to another
- **THEN** each row's stored key, default, placeholder fallback, validation, and view-refresh behavior are unchanged, and an upgrading reader keeps every configured value

#### Scenario: A path list is edited

- **WHEN** the reader adds a row to a setting holding a list of vault paths
- **THEN** the row offers the vault's folders as it is typed into, and the stored value is the list the rows show

#### Scenario: The reader empties a path list

- **WHEN** every row of such a list is deleted
- **THEN** the stored list is empty rather than restored to its default, and the pane states in place what that means

#### Scenario: A dependent value is switched off

- **WHEN** the setting that decides whether a value is used at all is switched off
- **THEN** that value's own control stays on the same row, inert rather than removed, still stating what it holds

### Requirement: Pure logic retains gated test coverage

Coordinate conversion, parsing, statistics, map-link generation, geometry, event binding, location decisions, view options, Around-view generation, map-link parsing, geocoding, pin spreading, and localization SHALL remain independently testable outside Obsidian and SHALL satisfy the repository's configured per-file coverage thresholds.

#### Scenario: Pull request changes pure logic

- **WHEN** a covered pure module is modified
- **THEN** its tests exercise the behavior and `npm run check` enforces the configured coverage, lint, formatting, and type rules

### Requirement: Mobile-visible behavior is verified on a mobile surface

A change that alters what a reader sees or touches on a phone SHALL be verified beyond the desktop pane before it ships, and its pull request SHALL record what was verified and where.

Maintainer documentation SHALL state what each surface can answer. Obsidian's own mobile emulation is the first pass: it resizes the viewport and switches the platform flags a plugin reads, so it reaches mobile-only registrations and touch-sized layout. It draws none of the mobile application's own chrome and runs none of the Android web view. An emulator running the released mobile application is the second: it draws that chrome and runs that web view, so a claim about whether a control sits under an application toolbar, what a resource URL resolves to, or how a permission prompt behaves — including a refusal — SHALL be settled on an emulator or a device, and SHALL NOT be recorded as verified from desktop emulation alone.

An emulator renders in software and runs on host memory. A claim about a phone's graphics or decoded-image budgets, or about whether the result is fast enough to use, SHALL be settled on a device, and a timing or frame rate observed on an emulator SHALL NOT be recorded as verified.

Maintainer documentation SHALL also state how a build reaches each of those surfaces and how each one's console is read, so the emulator pass and the device pass are procedures rather than exercises for the reader.

#### Scenario: A change moves something a reader touches on a phone

- **WHEN** a change alters a control, a readout, or a layout that appears on a map
- **THEN** it is exercised under mobile emulation, and its pull request says so

#### Scenario: The claim is one emulation cannot settle

- **WHEN** the change's claim concerns the mobile application's own chrome, a resource URL, or a permission prompt — none of which Obsidian's desktop mobile emulation draws or runs
- **THEN** it is settled on an emulator or a device, and a desktop-emulation-only check is not recorded as having verified it

#### Scenario: The claim needs real hardware

- **WHEN** the change's claim concerns a device's graphics or decoded-image budget, or whether the result is fast enough to use
- **THEN** it is settled on a device, and a measurement taken on an emulator's software renderer is not recorded as having verified it

#### Scenario: A maintainer needs the emulator path

- **WHEN** a maintainer has a build and no phone at hand
- **THEN** the contributor documentation names how the released mobile application and a vault reach an emulator, and how that emulator's web view console is read

#### Scenario: A maintainer needs the device path

- **WHEN** a maintainer has a build and a phone
- **THEN** the contributor documentation names how the built plugin reaches a vault on that device and how its console is read

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

### Requirement: Tracked source carries no invisible bytes

The repository's checks SHALL reject a tracked text file containing a C0 control
character other than tab and newline, a DEL character, a bidirectional
formatting override, a zero-width space, or a byte-order mark, and SHALL reject a
tracked file that is neither a declared binary asset nor decodable as UTF-8.
The check SHALL run both from the repository's local check command and as its own
continuous-integration step.

#### Scenario: A control character reaches a source file

- **WHEN** a tracked text file gains a NUL, a carriage return, or any other C0 control character that is not a tab or a newline
- **THEN** the check fails, naming the file, the line, and which character was found, before the change can merge

#### Scenario: Bidirectional or zero-width characters are introduced

- **WHEN** a tracked text file gains a bidirectional formatting override, a zero-width space, or a byte-order mark
- **THEN** the check fails and identifies it, because such a character can make reviewed source read differently from what is compiled

#### Scenario: A new binary asset is added

- **WHEN** a tracked file cannot be decoded as UTF-8 and its type is not among the repository's declared binary asset types
- **THEN** the check fails rather than skipping the file, so the new type is declared deliberately

#### Scenario: Existing binary assets are checked

- **WHEN** the check runs against the repository's declared binary assets, such as the documentation screenshots
- **THEN** they are skipped without being reported, and the check passes

### Requirement: Shipped user-facing behavior reaches the user guide

A change that adds, removes, or alters behavior a reader can invoke, see, or configure SHALL update the user guide in the same change, in every locale the guide supports, by extending an existing page or adding a new one; a change that adds a page SHALL add it under every locale's guide directory and make both the guide index and the published site's navigation point at it. Guide passages naming a command, setting, property, or the place a setting is found SHALL match what the change ships. A change with no user-visible behavior SHALL record that no guide update is needed rather than leaving the question unanswered.

#### Scenario: A change ships user-visible behavior

- **WHEN** a change adds a command, setting, property, or visible map behavior
- **THEN** the same change updates the user guide in English and Simplified Chinese, extending an existing page or adding a new one that the guide index links

#### Scenario: A shipped label or location changes

- **WHEN** a change renames a setting or command, or moves where a setting is found
- **THEN** every guide passage that names it is corrected in the same change, so the guide never directs a reader to a label or place that no longer exists

#### Scenario: A change is not user-visible

- **WHEN** a change is confined to refactoring, tests, tooling, or maintainer documentation
- **THEN** it records that the guide needs no update, rather than leaving the guide silently behind

#### Scenario: A page is added to the guide

- **WHEN** a change adds a guide page
- **THEN** the page exists under each locale's guide directory and is reachable from that locale's guide index and from the published site's navigation, so no locale carries an orphaned page

### Requirement: Figures come from a persistent demo folder

Documentation figures SHALL be captured from one persistent demo folder in the maintainer's local vault that is kept between sessions rather than built and deleted per figure. The folder SHALL be self-contained, SHALL be excluded from the vault's personal bases and note queries, and SHALL be the only part of the vault that appears in a published figure. Invented places, coordinates, and geometry inside it SHALL be real WGS-84 locations rather than hand-typed approximations, so a figure cannot make a correct coordinate conversion look broken. A figure SHALL NOT show a private note, a personal property, a real person, or a name from the maintainer's own notes.

#### Scenario: A new figure is needed

- **WHEN** a change needs a figure for the guide
- **THEN** it is captured from the existing demo folder, extending that folder if the case is not yet covered, rather than by rebuilding a throwaway one

#### Scenario: A figure would show personal content

- **WHEN** the case being illustrated only occurs in the maintainer's personal notes
- **THEN** an equivalent case is created inside the demo folder and captured there instead

#### Scenario: A demo coordinate is invented

- **WHEN** a demo note or track needs a location
- **THEN** it uses a real WGS-84 coordinate for a real place, so a datum error remains visually distinguishable from correct output

### Requirement: Figures are captured against an English interface

Published figures SHALL show Obsidian's English interface, and one figure set SHALL serve every locale of the documentation rather than one set per locale. A figure whose meaning depends on interface text SHALL be described in the surrounding prose of each locale, so a reader of another locale is not left to translate the picture.

#### Scenario: A figure is captured

- **WHEN** a figure showing Obsidian's interface is captured
- **THEN** the interface language is English, and the same file is referenced by every locale of the guide

#### Scenario: A figure shows a named control

- **WHEN** a figure shows a command, setting, or menu label
- **THEN** the page's prose names that control in the page's own locale, rather than relying on the figure's English text alone
