## Why

A note can already display or open a photo through an explicit `file:` Markdown
link, but Advanced Maps cannot map that photo because Obsidian does not resolve
an external URL to a vault `TFile`. Readers who keep their GPX files in the
vault and their original photographs elsewhere therefore have to copy or mount
the album before its geotags can accompany the route.

## What Changes

- Notes matched by a Base, and notes containing an inline track map, recognize
  explicitly written `file:` links and embeds whose destination is a supported
  photo on the current device.
- A readable external photo follows the existing EXIF, datum, point,
  thumbnail, interaction, concurrency, and resource-lifetime behavior without
  becoming a vault file or a Base result of its own.
- An invalid, unsupported, or currently unreadable device-specific link is
  skipped without preventing the note's tracks, vault photos, or other readable
  external photos from drawing.
- External files are discovered only from explicit photo links. Directory
  links are not traversed, and Advanced Maps does not create or maintain a
  second external-folder index.
- The guide documents the portable-note pattern: a note may carry different
  `file:` destinations for different devices, and each device uses only the
  destinations it can read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `photo-map-rendering`: supported photos explicitly referenced by `file:` URLs
  can participate without a vault `TFile`; unreadable per-device destinations
  stand down safely; reads, caching, and photo interactions retain their
  bounded behavior.
- `inline-track-maps`: an inline route map resolves external photo links from
  its host note and refreshes when that resolved source set changes.
- `published-documentation`: the bilingual photo-map guide explains external
  file-link syntax, per-device availability, and the boundary between explicit
  files and unsupported folder traversal.

## Impact

- `src/attachments.ts` and a narrow external-photo/link boundary: note-source
  discovery becomes asynchronous and represents vault and external sources
  explicitly rather than casting an external path to `TFile`.
- `src/track-cache.ts`, `src/photo-index.ts`, and `src/basemap.ts`: external
  resource URLs reuse the host's local-resource prefix and bounded range reads;
  cached metadata is trusted only when the current device can validate the
  source state.
- `src/track-layer.ts`, `src/embed.ts`, and `src/photo-modal.ts`: drawing,
  previews, modal opening, and source identity no longer assume every photo can
  be resolved through the vault.
- `src/main.ts`: asynchronous attachment resolution and host-note changes reach
  existing base maps and inline maps while preserving newest-revision and
  cancellation gates.
- `tests/`: Markdown extraction, URI validation, device-specific failures,
  bounded external reads, caching, live refresh, and photo interactions.
- `docs/guide/en/photo-maps.md` and `docs/guide/zh-cn/photo-maps.md`: usage and
  platform-boundary documentation.

No stored setting changes, new runtime dependency, external-folder scan, or
mobile-only API assumption is proposed.
