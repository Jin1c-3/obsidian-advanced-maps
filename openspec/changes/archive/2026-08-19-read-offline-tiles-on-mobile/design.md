## Context

See proposal.md — Why for the measurements. Three of them shape the approach.

`Platform.resourcePathPrefix` is `file:///` on Android, while the prefix the
host uses for its own local resources is `http://localhost/_capacitor_file_`.
Both were read from the running application; they disagree, and only the second
one loads.

The adapter carries the vault's location as a `basePath` property and exposes
`getResourcePath`, `getFullPath`, `getNativePath`, `getRealPath` and
`getFullRealPath`. `getBasePath()` — the method `FileSystemAdapter` is checked
for today — is absent.

`adapter.getResourcePath(p)` prepends the vault base path, so it answers for
vault contents only; handed an absolute path it concatenates the two and returns
nonsense. A pack usually lives outside the vault, which the guide recommends, so
that method cannot be called with the pack path directly.

## Goals / Non-Goals

**Goals:**

- One pack path draws on desktop and on a phone, absolute or vault-relative.
- The desktop path keeps resolving exactly as it does now.
- No platform name hardcoded in the resolution: the prefix is asked for, not
  assumed.

**Non-Goals:**

- Reworking how the pack reaches the map. The hook that answers `mapTiles` and
  `minZoom`, the per-build resolution, and the never-store rule all stay.
- Claiming iOS. The derivation is platform-agnostic and iOS is expected to
  follow, but nothing here is measured there and the guide will not say it is.
- Making tiles inside the vault a good idea. It stays a bad one for the reason
  the guide already gives.

## Decisions

**Derive the prefix from the host instead of hardcoding `_capacitor_file_`.**
For a vault-relative path `p`, `adapter.getResourcePath(p)` carries
`adapter.getFullPath(p)` behind the prefix, and the text before it is the prefix
— measured as `http://localhost/_capacitor_file_` on Android. Deriving it means
iOS, or a future scheme change, needs no second code path and no new constant.
The alternative, writing `http://localhost/_capacitor_file_` into `constants.ts`,
is one string today and a per-platform table the first time a host changes.

The tail is matched in both the encoded and the raw form, because a vault
directory holding a space or a CJK character is the one case that tells them
apart and neither answer can be assumed for a host this was not measured on. A
derived prefix must also name a scheme: two answers that are the same path leave
a bare separator behind, which would build an origin-relative URL — a request
back to the host rather than a file on disk.

**Keep `Platform.resourcePathPrefix` for the desktop.** It is what resolves
`app://<token>/` there, it is already the seam this code uses, and nothing about
the desktop is broken. The new derivation is what answers where that prefix is
not fetchable — chosen per platform, not per template. On the desktop the
derivation declines on its own: `getResourcePath` ends in a cache-busting
`?<mtime>` there, so no tail matches and the constant answers, which is measured
rather than arranged.

**Take the base path from the adapter's own answer rather than its class.**
`adapter instanceof FileSystemAdapter` is a test for the desktop wearing the name
of a capability. What the code actually needs is where the vault starts, which
mobile also knows. `getFullPath('')` is what it asks — measured equal to the
desktop's `getBasePath()`, and answered on Android too. It is published on both
shipped adapter classes but not on the `DataAdapter` interface `vault.adapter` is
typed as, so it is shape-checked before use and declared in
`src/types/obsidian-internals.d.ts` with its provenance, per the repository's
rule about internals.

**One setting, two file systems: answer it in the guide, not in a second
setting.** The setting is one string, so a synced `data.json` hands every device
the same path, and an absolute one can only be right on the machine it was typed
on — measured on Android, a desktop path resolves, 404s per tile and leaves the
map drawing nothing but its pins, where before this change it was ignored and the
network background stayed. The fix is a layout, not a code path: a dot-folder
inside the vault is skipped by Obsidian's index — measured, 85 tile files under
`.tiles` left the vault's file count and a Base's result count unchanged, while
the same files under `_tiles` added 85 files and 23 rows — so a relative
`.tiles/{z}/{x}/{y}.png` is one string every device resolves against its own
vault. A per-platform settings row would buy the same thing at the cost of a
second value to keep in step.

**A pack that cannot resolve still leaves the map alone.** Unchanged, and it
carries the mobile cases too: if the derivation finds no prefix, the map keeps
its network background rather than drawing nothing.

## Risks / Trade-offs

- **The suffix derivation stops matching if a host answers in a third shape** →
  the derivation is guarded: where neither the encoded nor the raw tail matches,
  no prefix is derived and the code falls back to today's behavior, which is a
  map with its network background rather than a broken one.
- **iOS may serve local files through a scheme this is not measured against** →
  nothing is hardcoded, so it is expected to work; the guide claims only what
  was measured, and iOS stays an open question rather than an unverified claim.
- **A pack outside the vault could sit where the app has no read permission** →
  out of this change's hands and already the reader's to check; the existing
  "if that file is not there, neither is the tile" guidance covers it, and the
  failure mode is the unchanged one.
- **Two prefixes now exist in one code path** → they are resolved in one place
  and handed to `offlineTileUrl` as an argument, which is already how that
  function takes a prefix; the function itself does not learn about platforms.
