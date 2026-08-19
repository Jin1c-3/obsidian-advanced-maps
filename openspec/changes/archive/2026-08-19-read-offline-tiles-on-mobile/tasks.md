## 1. Resolving the prefix

- [x] 1.1 Add a helper that derives the host's local-resource prefix by
      comparing `adapter.getResourcePath(p)` with `adapter.getFullPath(p)` for a
      vault-relative path, returning null when the first does not end with the
      second
- [x] 1.2 Declare every adapter member the helper reads in
      `src/types/obsidian-internals.d.ts`, with provenance, and shape-check each
      before use rather than casting at the call site
- [x] 1.3 Choose between that prefix and `Platform.resourcePathPrefix` once per
      resolution, so `offlineTileUrl` keeps taking a prefix as an argument and
      learns nothing about platforms

## 2. Resolving the vault base path

- [x] 2.1 Replace the `adapter instanceof FileSystemAdapter` gate in
      `offlineBasemap()` with a read of the vault's own base path that works on
      both platforms, keeping the empty-base case that makes a relative template
      resolve to null when there is genuinely no vault path

## 3. Tests

- [x] 3.1 Cover the derivation: a matching pair yields the prefix, a mismatched
      pair yields null, and an already-encoded answer does not produce a wrong
      prefix
- [x] 3.2 Cover `offlineTileUrl` with a mobile prefix for an absolute template
      and for a vault-relative one, alongside the existing desktop rows
- [x] 3.3 Cover the fallback: no derivable prefix leaves the map with no pack
      rather than a URL that cannot draw
- [x] 3.4 Cover a dot-folder template on both prefixes, since the `./` strip
      must not eat the dot that keeps a pack out of the vault index

## 4. Verify on both surfaces

- [x] 4.1 Desktop: a pack that draws today still draws, absolute and
      vault-relative, and the resolved URL still carries the `app://` prefix
- [x] 4.2 Android emulator with the released application: push a small pack
      outside the vault, set an absolute template, and confirm the map draws it
      and issues no network tile request
- [x] 4.3 Android: set a vault-relative template against a pack inside the vault
      and confirm it resolves and draws
- [x] 4.4 Android: confirm a restart still draws the pack, since the prefix is
      resolved again rather than remembered
- [x] 4.5 Android: confirm an unusable template leaves the network background in
      place rather than a blank map
- [x] 4.6 Record that iOS was not exercised, so no claim about it is made

## 5. Guide

- [x] 5.1 Replace the desktop-only paragraph in `offline-basemap.md` with what
      now works on a phone, and keep whatever remains true about paths and
      permissions
- [x] 5.2 Remove the offline basemap from the desktop-only sentence in
      `getting-started.md`'s mobile section
- [x] 5.3 Carry both edits into `docs/guide/zh-cn/`, in the guide's own Chinese
      voice
- [x] 5.4 State which platform the mobile claim was measured on, so the guide
      does not imply iOS was verified
- [x] 5.5 Name the dot-folder as the layout that lets one setting serve a
      desktop and a phone, and say what an absolute path does on the device it
      was not typed on

## 6. Verification

- [x] 6.1 Confirm the diff leaves the pack read-only: nothing writes, moves or
      deletes a tile, and no code path fetches one from a provider
- [x] 6.2 Run `node .github/scripts/check-docs-links.mjs`
- [x] 6.3 Run `openspec validate read-offline-tiles-on-mobile --strict`
- [x] 6.4 Run `npm run check`
