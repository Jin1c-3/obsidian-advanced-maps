## Why

The English and Chinese READMEs have grown into complete user manuals, which makes the project landing page difficult to scan and duplicates responsibilities already separated for contributor guidance and technical contracts. The user documentation needs a navigable, repository-owned home that can change in the same pull request as the behavior it describes.

## What Changes

- Establish `docs/guide/` as the canonical bilingual user guide, with an index and paired English and Simplified Chinese pages organized by user workflow.
- Move long-form recipes, feature explanations, option reference, privacy details, and troubleshooting guidance out of both READMEs without changing their claims.
- Reduce both READMEs to concise landing pages covering the product promise, primary workflows, requirements, installation, one minimal quick start, and links to deeper documentation.
- Keep maintainer workflow in `CONTRIBUTING.md`, stable technical contracts in OpenSpec, release history in `CHANGELOG.md`, and future intent in `ROADMAP.md`; link rather than duplicate these sources.
- Refine the pull-request template so future PRs summarize the outcome, user-visible or specification impact, and verification while detailed design remains in OpenSpec.
- Keep GitHub Wiki optional rather than canonical. Do not duplicate the guide into the separate Wiki repository in this change.
- Leave existing merged PRs unchanged and report verified stale remote branches separately instead of deleting them as part of the documentation edit.

## Capabilities

### New Capabilities

None. This is a documentation-only reorganization and does not introduce product behavior.

### Modified Capabilities

None. Existing user-visible contracts remain unchanged, so this change opts out of delta specs.

## Impact

- Documentation: `README.md`, `README.zh-CN.md`, new Markdown files under `docs/guide/`, and documentation links in contributor-facing entry points where needed.
- Maintainer workflow: `.github/pull_request_template.md` wording only.
- Media: existing assets under `docs/` remain shared and are not duplicated.
- Runtime code, settings, APIs, dependencies, build output, and stable OpenSpec capability requirements are unaffected.
