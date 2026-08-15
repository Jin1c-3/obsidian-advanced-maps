## Context

See `proposal.md` for motivation. The affected native Maps APIs are undocumented host shapes, native map views may predate this plugin or outlive it, and inline maps instead own a bounded MapLibre/WebGL lifecycle. Existing behavior is already specified by `native-map-integration`, `coordinate-datum`, `inline-track-maps`, and `photo-map-rendering`; this change changes implementation and regression coverage only.

The failures share one theme: an asynchronous or delegated operation commits after the ownership state that authorized it has changed. The implementation must therefore make initial camera provenance, map identity, and terminal resource disposal explicit rather than infer them from current fields.

## Goals / Non-Goals

**Goals:**

- Make map enhancement initialization idempotent per MapLibre instance and make detach a terminal cancellation boundary.
- Distinguish the camera datum of a freshly enhanced map from a native map adopted after it already began initialization.
- Release late-created inline maps and all terminally owned native-map photo images without changing ordinary refresh reuse.
- Preserve photo-over-track click specificity and parse standard HEIF-family Exif item payloads.
- Prove pure/container behavior with Vitest and undocumented host timing with focused live checks.

**Non-Goals:**

- Change the native Maps registration, introduce a replacement map, or add a renderer dependency.
- Redesign pin spreading, inline refresh framing, thumbnail admission, or unrelated review findings.
- Change persisted settings, vault coordinates, supported formats, or public commands.
- Add duplicate delta requirements for behavior already present in stable specs.

## Decisions

### 1. Carry initial camera provenance explicitly and initialize each map once

`TrackLayer` will remember the MapLibre instance for which `onMapCreated` effects were installed. Calls for a detached layer or the same map will stand down; native destruction will clear that identity so a later replacement map can receive one fresh set.

The creation entry point will also receive the camera's prior coordinate system. A map created after the wrapper is installed starts in the layer's current tile system because its config and marker seams were already wrapped. A map adopted from a pre-existing native lifecycle starts with a WGS-84 camera unless that same map carries Advanced Maps' own concrete camera-datum marker from an earlier plugin instance. `realignCamera` can then perform the existing `previous -> WGS-84 -> current` conversion exactly once and update that marker, preventing a surviving native map from shifting twice on reload.

Alternatives rejected:

- Leaving `appliedSystem` null still triggers the existing null guard and performs no conversion.
- Inferring the prior camera datum from current `mapConfig` loses the historical fact that adoption occurred after the native camera was created.
- Reinvoking `initializeMap` during adoption risks a second native map and violates host ownership.

### 2. Use a cancellable adoption watcher only for already-open views

The wrapped factory path and the adoption path will be distinguished at `enhance`. If an adopted view has no map because its original `initializeMap` call is already in flight, a low-frequency, cancellable watcher will wait for `view.map`, then run the same idempotent map-created entry point with adopted-camera provenance (recorded plugin datum when present, otherwise WGS-84) and reproject/synchronize the view. It will not be installed for newly constructed factory views, where the wrapper owns completion normally.

Detach and native destruction cancel the watcher. The `initializeMap` wrapper will re-check `detached`, map presence, and freshness after its await before performing plugin work. Map identity protects the watcher and wrapper if host timing nevertheless makes both observe the same map.

Alternatives rejected:

- A bounded short retry can still lose to a slow style fetch and recreate the original half-owned state.
- A frame-by-frame watcher spends unnecessary work during network waits.
- Prototype hooks or a `view.map` property setter would broaden the undocumented integration surface.

### 3. Compensate for inline initialization that completes after ownership is lost

`TrackEmbed.build` already retains the local native `view` across `await view.initializeMap()`. If the embed is dead or no longer owns that same view when the await resumes, it will use the local view to destroy any map that was created late and detach its container before returning. It will not assign `this.map`, bind observers/listeners, refresh, draw, or render statistics.

The existing eager `onunload` cleanup remains for normally initialized maps. Revision counters continue to guard data commits, while the local-view compensation specifically guards resource ownership; neither substitutes for the other.

### 4. Register the most specific click targets first

Base-map click delegates for `PHOTO_LAYER` and `PHOTO_DOT_LAYER` will be registered before track line, point, endpoint, and arrow delegates. The existing original-DOM-event guard remains the single-action gate, so a thumbnail and its fallback dot still open exactly one photo modal while an overlapping track cannot consume the event first.

This is deliberately an ordering fix rather than rendered-feature querying: it keeps MapLibre's layer delegate and the current ownership lookup intact and adds no second hit-test path.

### 5. Separate refresh retention from terminal photo-image disposal

`removeTrackLayers` will continue retaining decoded photo images for an immediate redraw. A new terminal disposal operation will be called only after detach removes all photo-referencing layers. It will:

1. clear wanted and queued work so active decodes cannot commit;
2. enumerate Advanced Maps-owned image ids by the reserved photo prefix when the runtime exposes MapLibre's image-listing API, falling back to the module's decode-state ownership set;
3. remove each existing image best-effort and clear the per-map decode state.

The optional image-listing shape will be declared with provenance alongside the other MapLibre host assumptions. Prefix enumeration also cleans images left by an older plugin module whose WeakMap is no longer reachable; relying only on the current `photoIcons` list or WeakMap would miss such orphans.

### 6. Treat `exif_tiff_header_offset` as a TIFF pointer

For an ISOBMFF Exif item, the four-byte big-endian value is relative to the first byte after that field. The parser will validate that `4 + declaredOffset` begins with a little- or big-endian TIFF signature and return the TIFF block from there. It will no longer require `Exif\0\0` at the declared target.

For compatibility with non-conforming encoders already tolerated by the plugin, a bounded fallback may accept `Exif\0\0` immediately after the four-byte field and then validate the following TIFF signature. A bad declared offset with neither valid form returns null. Tests will separate the standard bare-TIFF cases from this legacy fallback instead of conflating a missing prefix with a bad offset.

### 7. Keep automated and live proof complementary

Vitest harnesses will exercise deferred native/inline initialization, map identity, click dispatch order, terminal image disposal, and standard HEIF payload shapes without requiring a vault. The test vault at `/home/ethan/Documents/Obsidian/jot` will cover real style-fetch timing, Chinese tile camera adoption, MapLibre delegated-event order, and WebGL/image cleanup across plugin reload. The vault path is operational input only and will not appear in production code.

## Risks / Trade-offs

- [An adopted view never finishes native initialization] -> Keep the watcher low-frequency and cancel it on detach/destroy; it performs no map work until `view.map` exists.
- [Watcher and wrapper see the same map] -> Gate all side effects on stored map identity and add an exactly-once regression.
- [Terminal image removal races an active decode] -> Delete/clear ownership state before image removal so post-await decode checks reject their result.
- [Image listing is absent on a future host MapLibre shape] -> Shape-check the optional method and fall back to ids owned by the current decode state; native behavior remains usable.
- [Reserved-prefix cleanup removes another owner's image] -> Remove only the plugin-specific `PHOTO_ICON_PREFIX`, which is generated exclusively by Advanced Maps.
- [Legacy HEIF files use a non-standard prefix layout] -> Retain the narrow immediate-prefix fallback, but never ignore a bad offset by scanning arbitrary payload bytes.
- [Mocked event order diverges from Obsidian's MapLibre build] -> Repeat the overlapping photo/track click case in the live test vault before release.

## Migration Plan

No data migration is required. Ship the updated bundle and tests; existing settings and vault files remain untouched. On first detach/reload, the terminal image cleanup also removes reachable orphaned Advanced Maps thumbnails from the surviving native map. Rollback consists of restoring the previous plugin bundle; no persisted state needs reversal.
