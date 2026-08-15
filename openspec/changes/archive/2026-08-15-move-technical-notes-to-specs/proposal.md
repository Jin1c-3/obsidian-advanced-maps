## Why

`CLAUDE.md` has grown into a 2,226-line mixture of architecture, behavior, measurements, historical debugging notes, and contributor instructions, while many of the same explanations are repeated in source comments. This makes the rules that still matter harder to find and lets environment-specific guidance become stale; OpenSpec should become the structured source of truth, and the old `/mnt/c/...` reload guidance is now obsolete because the jot vault lives at `../../Obsidian/jot`.

## What Changes

- Establish baseline OpenSpec capabilities for the plugin's existing observable behavior, invariants, and acceptance scenarios; this is a documentation migration, not a runtime behavior change.
- Reduce `CLAUDE.md` to a concise contributor entry point containing the project identity, commands, source layout, non-negotiable coding rules, and links to the relevant specs.
- Audit TypeScript comments and retain only local contracts, units, safety/security constraints, undocumented-internal provenance, and explanations needed to understand the adjacent implementation. Move duplicated architecture, historical narratives, measurements, rejected alternatives, and test transcripts to OpenSpec, then remove stale `CLAUDE.md` references from source.
- Update contributor-documentation links so maintainers are directed to the capability specs rather than treating `CLAUDE.md` as the architecture encyclopedia.
- Update the local development target to `../../Obsidian/jot/.obsidian/plugins/advanced-maps` and remove all obsolete reload-problem warnings and recovery procedures, including the repeated-`plugin:reload` orphan-layer warning. Keep only factual build/watch instructions that remain valid.
- Adopt a lightweight GitHub Flow for this solo-maintained repository: short-lived branches, pull requests, required CI, squash merges, no mandatory reviewer approval, and protected `main` with an emergency-only administrator bypass.
- Preserve current plugin behavior, public documentation, tests, build output, and runtime dependencies.

## Capabilities

### New Capabilities

- `native-map-integration`: Safe extension of the first-party Bases Maps view, wrapper lifecycle, style recovery, and undocumented-internal boundaries.
- `track-map-rendering`: Track discovery, parsing, caching, ownership, layer composition, interaction, and framing on native map views.
- `photo-map-rendering`: EXIF coordinate and thumbnail extraction, photo density, image lifecycle, and photo interactions.
- `pin-spreading`: Stable screen-space separation and interaction of pins that share or nearly share a rendered position.
- `coordinate-datum`: WGS-84, GCJ-02, and BD-09 conversion boundaries for drawn data, camera state, controls, popups, and data written back out.
- `note-map-navigation`: Open-in-map, active-note following, following-pane behavior, and Around-view generation.
- `location-and-geocoding`: Map-link parsing, place search, reverse geocoding, secret handling, and device-location writes.
- `inline-track-maps`: Lazy inline track embeds, refresh/error lifecycle, track statistics, elevation/profile interaction, and route markers.
- `external-map-links`: Built-in and custom external map destinations, provider datum conversion, ordering, validation, and menu integration.
- `maintainer-workflow`: Canonical documentation ownership, source-comment policy, local development setup, testing, settings-definition conventions, localization, linting, and release safeguards.

### Modified Capabilities

- None. The repository has no existing main specs; this change records the current behavior as its initial capability baseline.

## Impact

- Documentation and planning: `CLAUDE.md`/`AGENTS.md`, `CONTRIBUTING.md`, pull-request guidance, `openspec/specs/**` after archive, and this change's design/spec/task artifacts.
- Source readability only: comments in `src/**/*.ts` and `src/types/obsidian-internals.d.ts`; executable statements and declarations are not intended to change.
- Local development configuration: ignored `.env` points to the new jot vault location; shared examples remain machine-independent.
- No user-facing behavior, API, stored data, dependency, or bundle semantics are intentionally changed.
