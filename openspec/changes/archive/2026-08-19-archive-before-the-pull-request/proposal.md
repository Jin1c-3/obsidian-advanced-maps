## Why

Three pull requests have merged into `main` carrying an OpenSpec change that was still active: #33, #45, and #57. Each was repaired differently — #33 and #57 by a dedicated follow-up pull request, #45 by riding along inside the next feature's pull request, which is the one outcome the "keep a PR focused" rule exists to prevent. The reason the outcomes differ is that no rule was ever written down: `CONTRIBUTING.md` never mentions archiving, and `Changes use a lightweight protected-main workflow` lists six steps from updating `main` to squash-merging without one either. Every occurrence has therefore been settled by whatever judgment was available at the time.

The immediate cause is narrower and worth naming. A change's `tasks.md` should end at verification; when it instead carries "open the pull request" as a task, archiving becomes impossible before the pull request exists, because archiving asks for completed tasks. Delivery is the vehicle that carries a finished change, not a step inside it.

## What Changes

- Require that a change's delta specs are promoted and its directory archived **before** its pull request opens, so one pull request carries the implementation, the promoted specs, and the archived change together.
- Add the archive step to the numbered branch-and-pull-request loop in `CONTRIBUTING.md`, which currently goes from "implement and validate" straight to "push and open a pull request".
- State that a change's task list ends at verification and does not contain branch, push, pull-request, or archive steps.
- Add a repository check, wired into `npm run check`, that fails when a change whose tasks are all complete still sits outside `openspec/changes/archive/`. An in-progress change leaves the check passing, so the command remains runnable throughout implementation.
- Apply the rule to every author. A contribution that completes a change carries its own promotion and archive; there is no exemption for a fork.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `maintainer-workflow`: `Requirement: Changes use a lightweight protected-main workflow` gains the ordering rule for promotion and archiving, the shape of a change's task list, and the check that enforces it, with scenarios for a finished-but-active change, an in-progress change, and a contribution from outside.

## Impact

- Specification: `openspec/specs/maintainer-workflow/spec.md`, one requirement and its scenarios.
- Contributor documentation: `CONTRIBUTING.md`, the `Branch and pull-request workflow` section.
- Tooling: a new script under `.github/scripts/` and one added link in the `check` script in `package.json`. CI gains the check by way of `npm run check`, which it already runs; no workflow file changes.
- No user-facing behavior, plugin source, published documentation, dependency, or build output changes.
- Anyone completing a change now needs the `openspec` CLI to promote and archive it. It is not currently declared by the repository, so contributor documentation names how to get it.
