## 1. Native Map Adoption and Teardown

- [x] 1.1 Distinguish factory-created and adopted views, make map-created setup idempotent by map identity, and pass explicit WGS-84 camera provenance when adopting an existing map.
- [x] 1.2 Add a low-frequency cancellable watcher for an adopted view whose original initialization is already in flight, and guard every post-`initializeMap` plugin side effect against detach and stale map ownership.
- [x] 1.3 Add native lifecycle regressions for one-time setup, adopted Chinese-datum camera alignment without double conversion, adoption during deferred initialization, and detach before deferred completion.

## 2. Inline Map Late-Initialization Cleanup

- [x] 2.1 Destroy and detach a locally captured headless view when its initialization completes after the embed is dead or has lost ownership, without committing map state or refresh work.
- [x] 2.2 Add a deferred inline-initialization regression proving that a map created after unload is destroyed after creation and installs no observers, listeners, layers, or statistics.

## 3. Photo Interaction and Terminal Resources

- [x] 3.1 Register base-map photo click delegates before track delegates while preserving one action for the thumbnail/fallback-dot pair and existing modifier-click behavior.
- [x] 3.2 Add a terminal photo-image disposal API, declare and shape-check optional MapLibre image enumeration, and invoke disposal only after `TrackLayer.detach` removes referencing layers.
- [x] 3.3 Add regressions for overlapping photo/track click precedence, one modal across both photo layers, removal of registered prefixed images on detach, fallback cleanup without image enumeration, and rejection of active decode results after disposal.

## 4. HEIF-Family EXIF Payloads

- [x] 4.1 Resolve `exif_tiff_header_offset` directly to a validated TIFF header while retaining only the bounded immediate `Exif\0\0` compatibility fallback.
- [x] 4.2 Split HEIC/HEIF/AVIF fixtures and regressions across standard bare-TIFF offset zero, a non-zero declared TIFF offset, the legacy prefix fallback, and invalid declared/prefix combinations.

## 5. Verification

- [x] 5.1 Run focused suites during implementation, then run `npm run check` and inspect the TypeScript diff for lifecycle, removal-order, async-cancellation, and undocumented-shape regressions.
- [x] 5.2 In `/home/ethan/Documents/Obsidian/jot`, verify Chinese-datum adoption, initialization-time disable/close, overlapping photo/track clicks, thumbnail cleanup across plugin reload, and non-growing inline WebGL contexts.
