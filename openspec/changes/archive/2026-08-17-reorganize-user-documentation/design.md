## Context

See `proposal.md` for the motivation. The current English and Simplified Chinese READMEs contain the project landing page, installation guide, workflow tutorials, feature reference, privacy statement, attribution, and contributor entry point in one file per language. Existing screenshots already live under `docs/`, while contributor workflow and technical contracts already have canonical homes in `CONTRIBUTING.md` and `openspec/specs/`.

GitHub Wiki is enabled, but its content is stored and reviewed separately from the main repository. The user guide must stay versioned with the plugin and must not introduce a second source for claims that change with a release.

## Goals / Non-Goals

**Goals:**

- Give a first-time reader a concise path from product promise to installation and a working map.
- Preserve all useful claims and examples from both READMEs in a browsable bilingual guide.
- Make the location of user guidance, contributor workflow, technical contracts, release history, and PR evidence unambiguous.
- Keep English and Simplified Chinese pages visibly paired and reviewable in the same change.
- Make future PR descriptions shorter without weakening specification or verification evidence.

**Non-Goals:**

- Change plugin behavior, settings, supported formats, terminology, or release metadata.
- Publish or mirror the guide to GitHub Wiki or GitHub Pages.
- Rewrite historical PR bodies or relabel historical PRs.
- Delete remote branches or make other remote GitHub mutations.
- Add a documentation framework, generator, search engine, dependency, or deployment workflow.

## Decisions

### Keep the canonical guide in the main repository

Create Markdown pages under `docs/guide/`. This keeps documentation changes in the same diff and CI run as the implementation they describe, reuses existing media without copying it, and remains readable directly on GitHub.

GitHub Wiki was considered because it supplies navigation and direct browser editing. It remains an optional future presentation layer, but making it canonical would separate review history from the plugin and require a synchronization policy before it solves the duplication problem.

### Pair translations by filename in one directory

Use an English page and a `.zh-CN.md` peer at the same directory level. Each page links to its translation and to the guide index. Keeping peers adjacent makes omissions visible in file listings and gives both languages the same relative paths to shared images.

The planned pages are:

| English                       | Simplified Chinese                  | Content moved from the current READMEs                                                       |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `README.md`                   | `README.zh-CN.md`                   | Guide index and workflow navigation                                                          |
| `getting-started.md`          | `getting-started.zh-CN.md`          | Requirements, installation, Base boundary, first complete recipe, view keys                  |
| `photo-maps.md`               | `photo-maps.zh-CN.md`               | Folder albums, external folders, linked photos, thumbnails, popups, indexing                 |
| `tracks-and-areas.md`         | `tracks-and-areas.zh-CN.md`         | Normal links versus embeds, formats, route markers, areas, statistics                        |
| `around-and-navigation.md`    | `around-and-navigation.zh-CN.md`    | Around views, reusable Base, Open in map, follow active note, shared pins                    |
| `coordinates-and-services.md` | `coordinates-and-services.zh-CN.md` | Coordinate datums, external maps, map-link parsing, search, reverse geocoding, location      |
| `reference-and-privacy.md`    | `reference-and-privacy.zh-CN.md`    | Supported file types, option reference, network disclosure, operational caveats, attribution |

A language subdirectory was considered, but peer files avoid different image-link depths and make translation parity easier to inspect without tooling.

### Make README a landing page, not an abbreviated manual

Each root README will retain:

- name, badges, language switch, short product promise, and one hero image;
- the three primary workflows and their composability;
- runtime requirements and installation methods;
- one minimal Base recipe that produces a useful result;
- links to the six guide topics, privacy details, contributing, OpenSpec, roadmap, changelog, and license.

Detailed recipes and exhaustive behavior move to the guide. The target is at most 200 lines per root README, with equivalent section structure between languages. This is a readability guard rather than a reason to remove a unique warning or requirement.

### Preserve content by inventory, then trim duplication

Implementation first copies each current section into its destination topic and checks that every example, warning, setting name, supported extension, and disclosure has a home. Only after that inventory is complete are the root READMEs shortened. Existing images remain at their current paths.

No claim should be broadened or modernized during migration. If source inspection reveals an existing documentation defect, fix it separately or explicitly record it rather than silently mixing behavior correction into the move.

### Keep PRs as change summaries

Revise the PR template around four questions: outcome, user-visible/specification impact, verification, and focused/squashable scope. Detailed rationale and repeatable measurements belong in the linked OpenSpec design; a PR may retain the decisive numbers or screenshot needed to review the change.

The template will not require labels or automation. At the repository's current volume, a labeler would add more maintenance than navigation value. Generated-tool signatures and session URLs are not requested by the template.

### Verify documentation as a behavior-preserving change

Validation includes:

- a migration inventory covering every heading in both source READMEs;
- a check that every relative Markdown link and local image target in the changed documentation resolves;
- parity checks for the English/Chinese page set and root README structure;
- inspection that executable TypeScript has no diff;
- `npm run format:check` during editing and the full `npm run check` before handoff, as required for behavior-preservation changes.

## Risks / Trade-offs

- [Readers land on a shorter page and miss a capability] → Keep the three-workflow overview and a prominent topic index above the fold.
- [A paragraph is lost during the move] → Complete a heading-to-destination inventory before deleting it from either README.
- [Translations drift] → Keep paired filenames and update both indexes and root README links in the same PR.
- [Relative image links break after moving Markdown deeper] → Reuse assets in place and validate every changed local link from the containing file.
- [Guide and OpenSpec duplicate technical contracts] → Write the guide in user-task language and link to OpenSpec only from maintainer-facing entry points.
- [GitHub Wiki later becomes another stale copy] → Treat any future Wiki publication as a generated mirror with an explicit synchronization owner, never an independently edited canonical copy.

## Migration Plan

1. Record the current English and Chinese README headings and their destination pages.
2. Create both guide indexes and all paired topic pages by moving existing content and fixing only links and transitions required by the new locations.
3. Replace the root READMEs with concise, structurally equivalent landing pages linked to the guide.
4. Update contributor-facing documentation links and the PR template without touching executable source.
5. Validate translation pairs, relative targets, formatting, the TypeScript diff, and the full repository check.

Rollback is a normal Git revert: the change adds Markdown pages and edits existing Markdown/template files without data migration or runtime effects.
