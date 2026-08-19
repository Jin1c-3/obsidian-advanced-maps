## Why

`manifest.json` says `isDesktopOnly: false`, and nothing in the repository says
how that claim is checked. The measuring readout shipped in the free bottom-left
corner of the map — free on the desktop, and covered by Obsidian's own toolbar on
Android. Nobody looked, because looking was not part of the workflow.

Obsidian's CLI can emulate mobile inside the desktop app, which reaches most of
what a phone changes: the platform flags a plugin reads, the mobile-only native
registrations, and touch-sized layout. It reaches none of the rest — it draws no
mobile chrome and runs no Android web view — and that gap is exactly where the
readout bug lived. A workflow that does not name the gap invites the next one.

## What Changes

- Add a maintainer requirement: a change that alters what a reader sees or
  touches on a phone is verified beyond the desktop pane, and its pull request
  records what was verified where.
- State in that requirement what emulation covers and what only a device can
  settle, so "checked on mobile" cannot mean two different things.
- Add a **Testing on mobile** section to `CONTRIBUTING.md`: the emulation
  command, the claims it cannot answer, and the device path — getting a build
  onto a phone, and reading its console over USB debugging.
- Repair a copy-paste defect in `maintainer-workflow`: the guide requirement's
  body and all four of its scenarios appear twice.

## Impact

- Affected specs: `maintainer-workflow`.
- Affected code: none.
- Affected docs: `CONTRIBUTING.md`.
- No user-visible behavior, so the user guide needs no update.
