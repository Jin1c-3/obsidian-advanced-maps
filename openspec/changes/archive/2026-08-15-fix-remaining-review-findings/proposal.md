## Why

Eleven confirmed defects from the 1.13.0 review are still true of the 1.13.3 tree. The worst of them silently disables the whole plugin: a registration wrapper is stamped with a boolean that cannot tell this instance's wrapper from one a previous, now-unloaded instance left behind, so after a plugin reload — especially alongside another plugin that wraps the same Bases registration — the live factory belongs to a dead instance, no map is enhanced at all, and nothing says so. The rest are narrower but each makes stated behavior untrue: thumbnails that are switched off still decode and hold their images, a style reload draws twice or over an in-flight read, adding a photo to a note updates the base map but not that note's inline map, one backwards timestamp discards the distance before it, one group size out of every sixty-nine flings a pin onto a ring of its own, a hostile host containing `google.` is parsed with Google's rules, a single waypoint elevation flattens the elevation chart, a note renamed mid-request strands its guard forever, a failed write after choosing a search result reports success, and the auto-fill description keeps naming a coordinate property the user has already renamed.

## What Changes

- Give the Bases registration wrapper the identity of the instance that installed it and the native function it replaced, so a live instance can recognize its own wrapper, re-take one a dead instance left behind, and leave a surviving wrapper inert rather than enhancing views on behalf of an unloaded plugin.
- Stop decoding and holding photo thumbnails while the thumbnail setting is off, and release the ones already decoded, without affecting the fallback dots that keep every photo visible.
- Make a style reload redraw exactly once and never race a read that is still in flight.
- Refresh an inline map when its host note's resolved photo set changes, and only then.
- Keep the distance walked across an interval whose timestamp did not advance, instead of discarding it.
- Count a spread ring's capacity without losing a slot to floating-point error.
- Recognize Google map hosts by their actual domain shape rather than by any host whose remainder happens to be letters and dots.
- Scale the elevation profile and its accessible label to the samples it actually plots.
- Key the automatic-fill in-flight guard on file identity, so a rename during the request cannot strand it.
- Report a failed note write after a search result is chosen instead of losing it as an unhandled rejection.
- Keep a settings description that names a configured property current while the pane is open, without re-rendering the field being typed in.
- Add regressions for the registration hand-off, ring capacity, host matching, moving time, and profile scaling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-map-integration`: a new requirement that a registration wrapper identifies its owning instance and carries the native function it replaced.
- `photo-map-rendering`: the thumbnail memory requirement gains the disabled case — no decoding and no retained images while thumbnails are off.
- `inline-track-maps`: the newest-refresh requirement covers style reloads; the host-photo requirement covers a changing photo set; the statistics requirement covers a non-advancing timestamp; a new requirement scales the elevation profile to its plotted samples.
- `pin-spreading`: the slot requirement states that a ring holds every pin it has room for.
- `location-and-geocoding`: link parsing rejects look-alike provider hosts; automatic fill survives a rename mid-request; a failed write after a chosen search result is reported.
- `maintainer-workflow`: a settings description that names a configured value stays current while the pane is open.

## Impact

Affected implementation areas are `src/main.ts`, a new `src/registration.ts` for the pure half of the registration hand-off, `src/embed.ts`, `src/track-layer.ts`, `src/stats.ts`, `src/spread.ts`, `src/geolink.ts`, `src/search-modal.ts`, `src/settings.ts`, and `src/i18n.ts`, with additions to the Vitest suites and `src/registration.ts` added to the coverage-gated list. One English and one Chinese notice string are added for a failed note write; no existing user-facing string changes meaning, no persisted setting changes shape, and no migration is required. Users who switched thumbnails off get the memory back that the setting implied; everything else is a defect disappearing. Live verification uses the configured test vault, since the registration hand-off, the thumbnail release, and the host-note photo refresh have no meaning outside a running map.
