## Context

See `proposal.md` for motivation. The current architecture record is a 2,226-line `CLAUDE.md`, symlinked as `AGENTS.md`, plus unusually large comment bodies across most TypeScript modules. Much of the material is valuable, but it mixes five different lifetimes: user behavior, cross-cutting architecture, proof and measurements, local implementation contracts, and obsolete environment history.

The repository currently has no main OpenSpec capabilities, so this change must establish an initial baseline rather than modify existing specs. The work is documentation-only in intent, but it crosses every source module and contributor surface. The local vault has moved from a Windows mount to `../../Obsidian/jot`; old reload troubleshooting must not be carried forward.

The repository already runs a complete pull-request CI job named `format · lint · types · tests · build`, but ordinary work has been pushed directly to `main`.

## Goals / Non-Goals

**Goals:**

- Give each durable fact one canonical home based on who observes it and how long it remains useful.
- Make capability specs the discoverable contract for existing behavior and acceptance scenarios.
- Make `CLAUDE.md` a short navigation and rules document rather than an architecture database.
- Make comments local enough that reading a function does not require scrolling through its project history.
- Preserve still-valid rationale and proof while explicitly deleting obsolete reload guidance.
- Adopt a low-friction protected-main workflow suitable for one maintainer.

**Non-Goals:**

- Refactor executable code, rename symbols, change user behavior, alter settings, or improve known product gaps.
- Turn specs into line-by-line implementation documentation or copy every old sentence verbatim.
- Put personal absolute paths in committed setup documentation.
- Require a second reviewer or introduce long-lived release/develop branches.
- Rewrite README user documentation unless a link or factual setup statement becomes incorrect.

## Decisions

### 1. Use capability specs as the behavior index

The ten capability paths in `proposal.md` are the initial product and maintenance taxonomy. They are flat because the repository has no existing domain hierarchy and its features overlap heavily. A deeper tree would add navigation cost without clarifying ownership.

Current `CLAUDE.md` material maps as follows:

| Current subject                                                          | Canonical capability     |
| ------------------------------------------------------------------------ | ------------------------ |
| Native Maps patch, lifecycle, styles, safe internals                     | `native-map-integration` |
| Track resolution, formats, cache, ownership, layers, fit                 | `track-map-rendering`    |
| EXIF, photo datum, thumbnails, density, photo actions                    | `photo-map-rendering`    |
| Coincident pin grouping, offsets, popups, hit testing                    | `pin-spreading`          |
| WGS-84/GCJ-02/BD-09 draw/read seams                                      | `coordinate-datum`       |
| Open in map, focus, follow, Around view                                  | `note-map-navigation`    |
| Link parsing, search, reverse geocoding, location                        | `location-and-geocoding` |
| Inline lifecycle, errors, stats, profile, route markers                  | `inline-track-maps`      |
| Native context menu and external destinations                            | `external-map-links`     |
| Docs, comments, settings UI rules, tests, lint, i18n, releases, branches | `maintainer-workflow`    |

A requirement or scenario may be linked from another capability but should be stated normatively in only one place. Cross-capability implementation rationale belongs in this design or later change designs, not duplicated across specs.

**Alternative considered:** one `architecture` spec. Rejected because it would recreate the same unsearchable accumulation under a different filename and would mix user contracts with maintainer process.

### 2. Classify every migrated paragraph instead of shortening by intuition

Implementation starts with a section-level inventory of `CLAUDE.md` and a file-level audit of TypeScript comments. Each non-trivial block receives one disposition:

- **Spec:** observable behavior, compatibility contract, input/output, error behavior, privacy/security constraint, or testable invariant.
- **Design/history:** cross-cutting implementation choice, measured rationale, rejected alternative, or historical cause still useful for future redesign.
- **Test:** a numeric tolerance, parser edge, race, or regression that can be expressed more durably as executable proof.
- **Contributor/README:** commands, source layout, setup, contribution, localization, or release procedure.
- **Keep inline:** units, ranges, adjacent async ordering, malformed-input guard, narrow undocumented-runtime provenance, or a local explanation without which the code is misleading.
- **Delete:** duplication, resolved historical debugging transcript, or obsolete environment claim.

This inventory is the loss-prevention mechanism. The final review compares the old headings and comment hotspots against the new destinations; it does not use raw comment-line reduction as a proxy for quality.

**Alternative considered:** impose a global comment percentage or maximum block length. Rejected because parsers and undocumented type declarations legitimately need more local explanation than straightforward UI wiring.

### 3. Give each documentation surface a strict role

`CLAUDE.md` will retain only:

1. plugin identity and prerequisites;
2. common commands;
3. compact source layout;
4. a short set of non-negotiable coding rules;
5. links to `CONTRIBUTING.md` and the capability specs.

It should normally remain below roughly 250 lines, but content boundaries—not the number—are the acceptance criterion. It must not regain feature histories, live measurements, rejected alternatives, or long testing transcripts.

`CONTRIBUTING.md` owns setup, the branch/PR loop, pre-PR checks, and short release directions. README files remain user-facing. Specs own behavior. Change/archived designs own rationale. Tests own repeatable proof. Inline comments own adjacent implementation facts.

Any source reference that currently says “see CLAUDE.md” is replaced with either a precise spec path, a nearby concise explanation, or nothing when the code and type already state the contract.

**Alternative considered:** keep `CLAUDE.md` as the canonical architecture document and add a generated table of contents. Rejected because navigation does not solve duplication, stale environment notes, or comments that repeat the same narrative.

### 4. Preserve rationale selectively, not verbatim

Measured values that define behavior or a safety bound remain as requirements, tests, constants with units, or concise local comments. One-off console transcripts, screenshots, and first-attempt stories are summarized into the decision they support. Rejected alternatives are retained only where revisiting them could plausibly reintroduce a bug or violate a contract.

The initial specs deliberately describe observable outcomes rather than internal method names. Details such as exact wrapper seams, source/layer removal order, stale revision gates, image decode admission, and dynamic settings refresh remain in design history, focused tests, or a short comment adjacent to the relevant seam.

**Alternative considered:** move all current prose unchanged into specs. Rejected because it would violate the behavior-contract role of specs and merely relocate the current problem.

### 5. Treat reload troubleshooting as obsolete environment history

The ignored local `.env` changes to:

```dotenv
OBSIDIAN_PLUGIN_DIR=../../Obsidian/jot/.obsidian/plugins/advanced-maps
```

Committed examples continue to say “point this at a vault” and do not name the maintainer's machine. The old `/mnt/c/...` value, the repeated-`plugin:reload` orphan-layer warning, full-window recovery instructions, and test preconditions based on that problem are deleted rather than migrated.

This is a targeted semantic cleanup, not a blind deletion of the word “reload.” A command that reloads the plugin, a style reload that is part of product behavior, or a factual watch-build description may remain if still accurate.

**Alternative considered:** preserve the old warning in an archive section “just in case.” Rejected by the user's explicit decision that the reload problem no longer applies; retaining it would keep stale instructions discoverable as if current.

### 6. Use lightweight GitHub Flow with protected `main`

The normal loop is:

1. update local `main`;
2. create a focused short-lived branch such as `docs/move-technical-notes-to-specs`;
3. commit the coherent change;
4. push the branch and open a pull request;
5. require `CI / format · lint · types · tests · build` to pass and resolve conversations;
6. squash-merge to `main` and delete the branch.

Repository settings should allow squash merge, disable merge commits and rebase merge, and auto-delete merged branches. A ruleset protects `main` from force pushes, deletion, and ordinary direct pushes, and requires a pull request plus the existing CI job. It requires zero approving reviews because the owner cannot provide independent approval to their own pull request. Repository administrators retain bypass for emergencies, documented as exceptional and followed by the same checks.

Releases remain tags created from `main`; no `develop` or release branch is added. Dependabot and other automation use the same pull-request checks.

**Alternative considered:** continue direct pushes with local `npm run check`. Rejected because it makes CI advisory and removes the reviewable checkpoint where accidental documentation loss, release metadata errors, or generated bundle problems can be caught. Git Flow with `develop` and release branches was also rejected as unnecessary ceremony for one maintainer and one releasable line.

### 7. Validate “documentation-only” as a behavior-preservation claim

Before editing, capture the current executable diff baseline and successful checks. During cleanup, do not mix comment removal with code formatting or opportunistic refactors. Afterward:

- inspect `git diff --word-diff=porcelain` and a whitespace-ignored diff around source files;
- verify no executable statements or declarations changed unintentionally;
- run `npm run check` and a production build/smoke load;
- run strict OpenSpec validation;
- search for stale `/mnt/c/`, reload-trap phrases, and source `CLAUDE.md` references;
- verify every old `CLAUDE.md` heading has a destination or an explicit obsolete disposition.

Because minification normally removes comments, a production bundle comparison can provide extra confidence, but an identical hash is not required if tool metadata or ordering differs; source diff review and tests are authoritative.

## Risks / Trade-offs

- **[A valid trap is mistaken for obsolete narrative]** → Inventory every long section and comment before deletion; require a destination or explicit obsolete disposition, and review subsystem by subsystem.
- **[Specs become implementation dumps]** → Enforce observable SHALL/MUST contracts and scenarios; keep symbol-level details in design, tests, types, or adjacent comments.
- **[Too much comment removal makes undocumented internals unsafe]** → Retain narrow provenance and shape/safety contracts in `src/types/obsidian-internals.d.ts` and at runtime seams.
- **[The initial taxonomy has overlaps]** → Choose one normative owner per requirement and use links rather than duplicate text; adjust capability boundaries in future OpenSpec changes if real maintenance pressure appears.
- **[A very large documentation diff is hard to review]** → Apply in ordered passes: specs, `CLAUDE.md`, comments by subsystem, contributor links, then validation; avoid executable edits.
- **[Protected main slows urgent solo fixes]** → Require no reviewer approval and permit administrator emergency bypass with recorded reason and equivalent checks.
- **[Remote branch settings drift from docs]** → Record the intended rules in `maintainer-workflow` and verify GitHub settings during implementation and release maintenance.

## Migration Plan

1. Start implementation on `docs/move-technical-notes-to-specs`, not directly on `main`, and capture baseline checks plus the old-document inventory.
2. Finalize the ten delta specs and validate them strictly before deleting canonical prose elsewhere.
3. Rewrite `CLAUDE.md` to its entry-point role and update `CONTRIBUTING.md` and pull-request guidance.
4. Audit and trim source comments subsystem by subsystem, using the inventory to preserve or deliberately discard each non-trivial claim.
5. Update the ignored `.env`, remove the obsolete reload narrative, and run targeted repository searches.
6. Run the full behavior-preservation validation and review the source diff for executable changes.
7. Push the branch, open the first PR under the new workflow, and require CI to pass.
8. Configure the GitHub merge settings and `main` ruleset before or immediately after merging that PR; verify ordinary direct pushes are rejected and documented administrator bypass remains available.
9. Squash-merge, delete the branch, and archive the OpenSpec change so the capability baselines become main specs.

Rollback is a normal revert of the documentation commit plus restoration of the prior GitHub ruleset if the workflow blocks maintenance unexpectedly. The old reload troubleshooting is not restored unless new evidence establishes a current reproducible problem.
