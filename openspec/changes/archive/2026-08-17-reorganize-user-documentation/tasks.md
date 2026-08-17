## 1. Migration Inventory

- [x] 1.1 Create `migration-inventory.md` mapping every English and Simplified Chinese README heading to a retained root section or one guide page.
- [x] 1.2 Confirm that the inventory covers every existing example, warning, setting name, supported extension, disclosure, screenshot, and maintainer link before shortening either README.

## 2. Bilingual User Guide

- [x] 2.1 Create the paired guide indexes at `docs/guide/README.md` and `docs/guide/README.zh-CN.md` with language switches and workflow navigation.
- [x] 2.2 Create the paired getting-started pages with requirements, installation, Base boundaries, the first complete recipe, and view-option keys.
- [x] 2.3 Create the paired photo-map pages with folder albums, external-folder setup, linked photos, display behavior, modal interaction, and index lifecycle.
- [x] 2.4 Create the paired tracks-and-areas pages with link/embed behavior, supported track formats, markers, polygons, statistics, and inline-map behavior.
- [x] 2.5 Create the paired Around-and-navigation pages with Around filtering, reusable Base configuration, Open in map, follow active note, and shared-coordinate pin behavior.
- [x] 2.6 Create the paired coordinates-and-services pages with datum handling, external-map links, pasted map links, geocoding, and device location.
- [x] 2.7 Create the paired reference-and-privacy pages with supported media, relevant option reference, network disclosures, operational caveats, and attribution.

## 3. Landing Pages and PR Guidance

- [x] 3.1 Replace both root READMEs with structurally equivalent landing pages of at most 200 lines, retaining the product promise, hero, three workflows, requirements, installation, one minimal Base recipe, and links to the guide and maintainer resources.
- [x] 3.2 Update contributor-facing documentation links where needed so user guidance, contribution workflow, OpenSpec, changelog, and roadmap each have one clear canonical home.
- [x] 3.3 Revise `.github/pull_request_template.md` around outcome, user-visible/specification impact, verification, and focused/squashable scope.

## 4. Verification

- [x] 4.1 Verify that every planned English guide file has its `.zh-CN.md` peer and that both guide indexes and root READMEs link to the complete page set.
- [x] 4.2 Check every changed relative Markdown link and local image target, then reconcile the completed guide against `migration-inventory.md`.
- [x] 4.3 Inspect the diff to confirm there are no executable TypeScript changes and no unrelated documentation rewrites.
- [x] 4.4 Run `npm run format:check`, fix documentation formatting if needed, and run the full `npm run check` successfully.
- [x] 4.5 Report the final README line counts and the two verified stale remote branches without deleting or otherwise mutating remote GitHub state.
