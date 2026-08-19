## Why

`maintainer-workflow` describes mobile verification as a two-surface question: Obsidian's own desktop mobile emulation, then a physical device. That was accurate when a phone was the only way to reach Android's web view, and it makes the requirement's device clause carry four unrelated claims at once. An Android emulator running the released APK reaches the real Android web view and the real mobile chrome, so three of those four claims — application-toolbar overlap, what a resource URL resolves to, and how a permission prompt behaves — can now be settled without a phone. Only a device's graphics and decoded-image budgets, and whether the result is fast enough to use, still need real hardware. Recording all four as device-only sends a maintainer to a phone for work an emulator answers, and offers no procedure when no phone is at hand.

## What Changes

- Describe mobile verification as three surfaces rather than two: desktop emulation, an Android emulator running the released APK, and a device.
- Move the application-chrome, resource-URL, and permission-prompt claims out of the device-only clause and into what an emulator settles. Keep graphics and decoded-image budgets device-only, and add real-world speed to that list, since an emulator's software renderer cannot answer it.
- Require maintainer documentation to name the emulator path — how the released APK and a vault reach it, and how its web view console is read — as it already requires for a device.
- State that an emulator's rendering is software-backed, so a timing or frame-rate claim SHALL NOT be recorded as verified from one.
- Land the matching `CONTRIBUTING.md` section describing the emulator setup, alongside the amended device paragraph and the narrowed device-only list.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `maintainer-workflow`: `Requirement: Mobile-visible behavior is verified on a mobile surface` gains the emulator as a middle surface, its device-only clause narrows to graphics/memory budgets and speed, its documentation clause extends to the emulator path, and its scenarios are re-cut to match.

## Impact

- Specification: `openspec/specs/maintainer-workflow/spec.md`, one requirement and its scenarios.
- Contributor documentation: `CONTRIBUTING.md`, the `Testing on mobile` section.
- No user-facing behavior, plugin source, public documentation, dependency, or build output changes. Nothing under `src/`, `tests/`, `docs/guide/`, or `website/` is touched.
- Existing pull-request practice changes only in what a maintainer may record as verified and where; no CI step is added or removed.
