## Why

Several confirmed 1.13.1 defects break already-specified map behavior during adoption, asynchronous teardown, photo interaction, and HEIF-family EXIF parsing. Fixing them together restores the lifecycle and resource-ownership guarantees needed for native maps and bounded inline WebGL maps without changing the plugin's public contract.

## What Changes

- Make adopted native maps complete enhancement setup exactly once, including correct camera datum alignment when the pre-existing camera is still in WGS-84.
- Prevent a detached native enhancement from installing controls, listeners, or locate guards after an in-flight native initialization finishes.
- Destroy an inline map that finishes initialization after its embed has unloaded so no unreachable MapLibre instance or WebGL context survives.
- Give base-map photo features precedence over overlapping track features for a shared click while retaining one-action-per-DOM-event behavior.
- Remove Advanced Maps-owned decoded photo images when detaching from a native map that outlives the plugin, while still retaining them across ordinary redraws.
- Parse HEIC, HEIF, and AVIF Exif item payloads according to `exif_tiff_header_offset`, including a TIFF header at payload offset zero without requiring a literal `Exif\0\0` prefix.
- Add focused automated regressions plus live Obsidian verification for undocumented native-map initialization and event-order assumptions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The implementation is being brought back into compliance with the existing `native-map-integration`, `coordinate-datum`, `inline-track-maps`, and `photo-map-rendering` requirements; their observable contracts do not change.

## Impact

Affected implementation areas are `src/main.ts`, `src/track-layer.ts`, `src/embed.ts`, `src/layers.ts`, and `src/exif.ts`, with focused additions to the corresponding Vitest suites. No dependency, persisted-setting, vault-data, or public command changes are expected. Live verification uses the configured test vault at `/home/ethan/Documents/Obsidian/jot`; the path remains test-only and is not embedded in production code.
