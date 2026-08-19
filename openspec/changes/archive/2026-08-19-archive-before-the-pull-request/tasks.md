## 1. The check

- [x] 1.1 Add `.github/scripts/check-change-archived.mjs`: for each directory under `openspec/changes/` other than `archive/`, read its task list and fail when no checkbox is left unchecked
- [x] 1.2 Treat a change with no readable task list, or with no checkboxes in it, as in progress, so the check stays quiet rather than guessing
- [x] 1.3 Make the failure name the change and the step that is missing — promote its deltas, then move it under `openspec/changes/archive/` — so the fix does not require reading the design
- [x] 1.4 Print what it verified on success, matching the one-line style of `check-docs-links.mjs` and `check-manifest.mjs`
- [x] 1.5 Wire it into the `check` script in `package.json`, beside the other repository checks

## 2. Contributor documentation

- [x] 2.1 Insert the promotion and archive step into the numbered loop in `CONTRIBUTING.md` → `Branch and pull-request workflow`, between implementing the change and pushing the branch
- [x] 2.2 Say that one pull request carries the implementation, the promoted specs, and the archived change together, and that a change does not reach `main` while still active
- [x] 2.3 Say that a change's task list ends at verification and carries no branch, push, pull-request, or archive steps
- [x] 2.4 Name how to get the `openspec` CLI, which completing a change now requires and the repository does not declare

## 3. Verification

- [x] 3.1 Run the check against a change whose tasks are all complete and confirm it fails and names the change
- [x] 3.2 Run it against a change with an unchecked task and confirm it passes, so `npm run check` stays usable during implementation
- [x] 3.3 Run it with only `openspec/changes/archive/` present and confirm it passes
- [x] 3.4 Confirm the amended `Branch and pull-request workflow` section answers every clause of the modified requirement
- [x] 3.5 Run `openspec validate archive-before-the-pull-request --strict`
- [x] 3.6 Run `npm run check`
