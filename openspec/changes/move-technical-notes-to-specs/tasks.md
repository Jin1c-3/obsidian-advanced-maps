## 1. Establish a Safe Baseline

- [x] 1.1 Create and switch to `docs/move-technical-notes-to-specs` before making implementation commits; do not continue the change directly on `main`.
- [x] 1.2 Run the current `npm run check` and production bundle smoke check, recording any pre-existing failure before documentation or comments are edited.
- [x] 1.3 Inventory every `CLAUDE.md` heading and each source file's non-trivial comment blocks as spec, design/history, test, contributor/README, keep-inline, or obsolete; ensure the ten-capability mapping in `design.md` covers every current heading.

## 2. Complete the Capability Baseline

- [x] 2.1 Review `native-map-integration`, `track-map-rendering`, `photo-map-rendering`, `pin-spreading`, and `coordinate-datum` against their corresponding `CLAUDE.md` sections and existing tests, adding any missing observable contract or regression scenario without copying implementation narration.
- [x] 2.2 Review `note-map-navigation`, `location-and-geocoding`, `inline-track-maps`, and `external-map-links` against their corresponding sections and tests, adding any missing user-visible behavior, error, privacy, or compatibility scenario.
- [x] 2.3 Review `maintainer-workflow` against settings, localization, CI, release, documentation, comment, local-vault, and branch-policy sections; confirm it specifies short-lived branches, PRs, required CI, squash merge, zero mandatory approvals, and emergency-only administrator bypass.
- [x] 2.4 Run `openspec validate move-technical-notes-to-specs --strict` and fix every purpose, requirement, scenario, and delta-format error before removing canonical prose elsewhere.

## 3. Rewrite Contributor Documentation

- [x] 3.1 Rewrite `CLAUDE.md` as a concise entry point containing only identity/prerequisites, commands, a compact source map, non-negotiable coding rules, and links to `CONTRIBUTING.md` plus all canonical capability specs; keep it near the design's 250-line budget and remove feature deep dives.
- [x] 3.2 Update `CONTRIBUTING.md` so setup remains machine-independent, architecture links point to capability specs, and the normal workflow is update `main` → short-lived branch → PR → required CI → squash merge → branch deletion.
- [x] 3.3 Document that solo PRs require no approving review, that ordinary direct pushes to `main` are prohibited, and that administrator bypass is emergency-only with equivalent checks and a recorded reason.
- [x] 3.4 Update `.github/pull_request_template.md` with concise checks for linked OpenSpec impact, `npm run check`, behavior-preservation evidence when relevant, and focused/squashable scope.
- [x] 3.5 Update README links or setup statements only where the new documentation ownership makes them inaccurate; keep user-facing feature prose and generic vault setup unchanged.
- [x] 3.6 Update the ignored local `.env` to `OBSIDIAN_PLUGIN_DIR=../../Obsidian/jot/.obsidian/plugins/advanced-maps` without committing a maintainer-specific path into shared examples.

## 4. Trim Source Comments by Subsystem

- [x] 4.1 Audit `src/track-layer.ts` and `src/types/obsidian-internals.d.ts`; keep narrow wrapper/lifecycle contracts and undocumented-runtime provenance, move project-wide behavior and history to specs/design, and do not change declarations or executable statements.
- [x] 4.2 Audit `src/layers.ts`, `src/track-cache.ts`, `src/constants.ts`, and `src/geometry.ts`; keep units, layer/source ordering hazards, async ownership, and local bounds while removing duplicated narratives and measurement transcripts now represented by specs/tests.
- [x] 4.3 Audit `src/embed.ts`, `src/photo-modal.ts`, and `src/exif.ts`; keep adjacent error-ordering, binary-safety, orientation, and resource-lifecycle explanations while removing feature histories and duplicated photo/embed architecture.
- [x] 4.4 Audit `src/coords.ts`, `src/spread.ts`, `src/parse.ts`, and `src/stats.ts`; retain formulas, units, parser ambiguity, and numeric-contract explanations while moving live measurement stories and rejected alternatives out of source.
- [x] 4.5 Audit `src/main.ts`, `src/map-block.ts`, `src/modal.ts`, `src/link-modal.ts`, `src/search-modal.ts`, `src/locate.ts`, `src/geolink.ts`, `src/geocode.ts`, and `src/maplinks.ts`; retain local privacy, provider-order, async race, and write-safety contracts while removing duplicated feature narratives.
- [x] 4.6 Audit `src/settings.ts`, `src/view-options.ts`, `src/map-events.ts`, `src/i18n.ts`, and remaining source files; preserve only adjacent API contracts and replace every source-level `CLAUDE.md` reference with a precise spec link, a short local explanation, or no comment when the code is self-explanatory.

## 5. Remove Obsolete and Duplicate Guidance

- [x] 5.1 Delete the old `/mnt/c/...` development target and all current-warning language about repeated `plugin:reload`, orphaned map layers/views, full-window recovery, or reload-specific test preconditions; do not remove factual style lifecycle text or useful reload commands solely because they contain the word “reload.”
- [x] 5.2 Search tracked documentation and `src/` for stale `CLAUDE.md` explanation links, duplicated long-form architecture, and old reload-trap phrases, resolving every match according to the documentation roles in `design.md`.
- [x] 5.3 Reconcile the completed migration against the heading/comment inventory so every still-valid non-obvious claim has one canonical destination and every discarded claim is explicitly classified as duplicate or obsolete.

## 6. Configure the Repository Workflow

- [x] 6.1 Configure GitHub repository merge settings to allow squash merge only and automatically delete merged head branches.
- [x] 6.2 Add or update a `main` ruleset that blocks deletion and force pushes, requires a pull request, requires the existing `CI / format · lint · types · tests · build` check, requires conversation resolution, and requires zero approving reviews.
- [x] 6.3 Configure repository administrators as the emergency bypass actor, then verify through the GitHub UI or API that ordinary direct pushes are rejected while the documented bypass remains available.
- [x] 6.4 Confirm Dependabot and routine automation continue through pull requests and the same required CI rather than receiving a broad direct-push exemption.

## 7. Validate Behavior Preservation and Finish Through a PR

- [x] 7.1 Review the TypeScript diff with whitespace-insensitive and word-level views, confirming executable statements, declarations, settings, dependencies, and persisted-data behavior are unchanged or separately justified.
- [x] 7.2 Run formatting, type-aware lint, typecheck, coverage tests, production build, and bundle smoke loading via `npm run check` and the repository's production build path; record the results in the pull request.
- [x] 7.3 Run strict OpenSpec validation again and search for `/mnt/c/`, obsolete reload-trap language, and source `CLAUDE.md` references, excluding dependency and Git history directories.
- [ ] 7.4 Push the short-lived branch, open a focused pull request using the updated template, and confirm the required CI check succeeds under the new protection rules.
- [ ] 7.5 Squash-merge the pull request into `main` and verify the source branch is deleted; leave release tagging to the existing release process and archive the OpenSpec change only through the separate archive workflow.
