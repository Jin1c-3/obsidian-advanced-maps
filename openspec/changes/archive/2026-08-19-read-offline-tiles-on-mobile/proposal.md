## Why

The offline basemap does not draw on a phone, and the cause is this plugin's,
not the platform's. Measured on Android with the released application:

- `Platform.resourcePathPrefix` is `file:///` there, so an absolute template
  resolves to `file:///storage/…`. The web view runs on origin
  `http://localhost` and refuses a `file://` subresource — both `fetch()` and
  `new Image()` fail on a tile that is on disk and readable.
- A vault-relative template resolves to nothing at all, because the base path is
  asked for through `adapter instanceof FileSystemAdapter`, and the mobile
  adapter is not one.

The same tile loads at `http://localhost/_capacitor_file_/storage/…`, which is
the form the host's own `getResourcePath` returns — measured at 256 px, for a
file inside the vault and for one outside it. So the tiles are reachable on a
phone; only the URL this plugin builds is wrong for that platform.

The guide now tells phone readers the feature is desktop-only. That is honest
about what ships and wrong about what is possible, and it is the sentence this
change exists to delete.

## What Changes

- Resolve the tile URL with the prefix the host itself uses on the running
  platform, instead of assuming `Platform.resourcePathPrefix` is fetchable
  everywhere. Desktop keeps the `app://` prefix it resolves today.
- Resolve a vault-relative template against the vault on every platform, rather
  than only where the adapter is a `FileSystemAdapter`.
- Keep resolving per map build and storing nothing, which the existing
  requirement already demands and which matters more on mobile, not less.
- Replace the desktop-only paragraphs in the guide — `offline-basemap.md` and
  the mobile section of `getting-started.md` — in both locales.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `offline-basemap`: the requirement that a pack can be a map's background
  states that the resolved URL is one the host's web view can actually fetch on
  the platform it is running on, and that a vault-relative template resolves
  against the vault on every platform.

## Impact

- `src/basemap.ts`: `offlineTileUrl` and how a prefix reaches it.
- `src/main.ts`: `offlineBasemap()`, which today gates the base path on
  `FileSystemAdapter`.
- `src/types/obsidian-internals.d.ts`: whatever adapter shape the new
  resolution reads, declared with its provenance rather than cast at the call
  site.
- `tests/`: the resolution is pure and already covered; the platform cases are
  new rows rather than a new harness.
- `docs/guide/en` and `docs/guide/zh-cn`: `offline-basemap.md` and
  `getting-started.md`.

Not in scope: iOS is not measured. The prefix is derived from the host rather
than hardcoded, so iOS is expected to follow without a second code path, but
this change claims Android only and says so in the guide.
