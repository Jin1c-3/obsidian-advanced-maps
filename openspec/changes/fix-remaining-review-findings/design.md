## Context

Eleven defects, one shared origin: each is a place where a value that stands for something — an ownership flag, a revision number, a set of files, a min/max, a host pattern — was cheaper to write than the thing it stands for, and the gap only shows under a condition the happy path never reaches. They are grouped here because they are individually small and collectively a release; they are not otherwise related, so each decision below stands alone.

The one with real blast radius is the registration flag. `patchMapsView()` stamps its wrapper `__advancedMaps = true` and returns early whenever it sees that stamp, and `unpatchMapsView()` restores only when it still holds `this.patched`. A boolean cannot distinguish a wrapper this instance installed from one left by an instance that has already unloaded, so on a plugin reload — reliably, when a second plugin such as `bases-explode` wraps the same registration and restores in the other order — the live factory is Advanced Maps' own wrapper closing over an unloaded plugin. The new instance sees the stamp, concludes it is already patched, and enhances nothing: no tracks, no spread, no controls, no error. Only restarting Obsidian, or toggling the Maps plugin so Bases mints a fresh registration, recovers it.

## Goals / Non-Goals

**Goals**

- A loading instance can always reach a usable native factory, whatever wrappers preceded it, and a wrapper it cannot remove stops enhancing.
- Each remaining defect is fixed at the level it is wrong at, not papered over at a call site.
- The registration hand-off, ring capacity, host matching, moving time, and profile scaling are provable without Obsidian.

**Non-Goals**

- Rewriting the enhancement lifecycle. The instance-per-view attach/detach model and its flags stay as they are; only the registration seam gains identity.
- A general plugin-interop protocol. Recovering from a foreign wrapper stacked above ours is best-effort: we neutralize our own wrapper, we do not attempt to unwrap someone else's.
- The two review findings this change deliberately leaves open: the Gaode reverse-geocode rounding (unverifiable without a live key) and the per-`mousemove` popup rebuild (needs a hover-state design and live measurement).

## Decisions

### 1. The registration stamp carries identity and the native function

`__advancedMaps` becomes a record rather than a boolean: `{ native, owner }`, where `native` is the function the wrapper replaced and `owner` is a mutable cell holding the installing instance. Three behaviors follow, and all three are what the boolean could not express:

- **Recognition.** `patchMapsView()` treats a stamp whose owner is this instance as "already mine" and returns. Anything else is re-taken.
- **Recovery.** A stamp owned by nobody (or by a different instance) yields its `native`, and that — not the stale wrapper — is what the new wrapper wraps. The stale owner cell is cleared on the way past. The same applies to the options function, which matters because `appendTrackOptions` does not de-duplicate: wrapping a stale options wrapper would append the track option group twice.
- **Inertness.** The wrapper closes over the owner cell, not over `this`, so `unpatchMapsView()` clearing the cell turns any surviving copy into a pass-through to `native`. This is what makes the foreign-wrapper case safe: we may be unable to take ourselves out of another plugin's chain, but we can guarantee that what remains of us does nothing.

`unpatchMapsView()` additionally restores only when the live factory is the exact function this instance installed, which is a stricter and more honest test than "has a stamp".

The stamp logic lives in a new `src/registration.ts` as pure functions over plain objects, so the hand-off can be tested outside Obsidian; `main.ts` keeps only the parts that need the app. `createHeadlessView()` benefits directly: it calls the recovered native factory, where before a re-take would have left it calling a dead instance's wrapper, which would enhance an embed's map as though it were a base view.

**Alternatives rejected.** _Chaining onto the stale wrapper_ keeps the dead instance's `enhance` in the call path. _A module-level registry of live instances_ has the same lifetime problem the flag has — the dead instance's entry is what needs removing, and it is the one that cannot run.

### 2. A style reload defers to a read in flight, and binds after the first draw

`this.map.on('style.load', () => this.draw(this.operationRevision))` passes the live counter, so the revision guard inside `draw()` compares a number to itself. Two consequences: the initial style load draws a second time on top of the build's own draw, and a style load during a refresh's read starts a draw of the pre-refresh data alongside it.

The fix keeps one counter but makes the handler an operation like any other: it claims its own revision, and it stands down entirely while a read has not committed, because that read will draw onto the new style when it lands. The handler is bound after the first draw rather than before it, since the first draw already waits for `styleReady()` and therefore covers the initial load itself.

**Alternative rejected.** Having the handler always claim the newest revision would cancel an in-flight refresh, and the refresh's data would then never be drawn at all — a worse bug than the one being fixed.

### 3. The host note's photo set is compared, not assumed

The vault `modify` gate returns early unless the written file is a cached track, so editing a note never reaches its own inline map, whose photos come from that note's links. The listener for this is `metadataCache.on('changed')` rather than `vault.on('modify')`, because the resolution reads the note's cache and the cache is current only in the former.

That event fires on every edit of the note, so the embed answers a cheaper question first: it records the photo paths it resolved during its last load, and refreshes only when the freshly resolved list differs. The recorded list is the resolved set _before_ the GPS filter, so a photo with no coordinate does not read as a change on every subsequent keystroke.

### 4. Everything else is a local correction

- **Thumbnails off.** Both photo call sites skip `ensurePhotoImages` and release what is decoded while `photoThumbnails` is false. The candidate list is still built, so toggling the setting back on redraws through the existing refresh path. The always-visible dot layer is untouched, so "every mapped photo remains visible" still holds.
- **Moving time.** `distSinceLastTime` is zeroed only when the interval actually counted, which is what the comment above it already claimed.
- **Ring capacity.** `radius` comes from a division by 2π and the capacity multiplies it back, so the product is an ulp under a whole number; `floor` is given a small epsilon. Only n=15 in 2..70 is affected today, but the arithmetic is wrong for every size that lands exactly on a ring.
- **Google hosts.** `google\.[a-z.]+$` accepts any host whose remainder is letters and dots, including `google.evil.com` and `maps.google.com.attacker.tld`. It becomes an explicit domain shape: `google.<tld>` or `google.{com,co}.<cc>`. Every other provider is already matched on a fixed suffix.
- **Profile scale.** The chart's y-range comes from the samples passed to it, not from `stats`, which counts waypoint elevations the chart never plots.
- **Fill guard.** The in-flight set is keyed on the `TFile`, which Obsidian mutates in place on rename, instead of on the path string it had when the request started. A `WeakSet` also drops entries for deleted files without bookkeeping.
- **Search write.** The chained success notice gains the missing `catch`, with a new pair of localized strings for a failed write.
- **Settings description.** `desc` accepts a `DocumentFragment`, so the description that names the coordinate property puts the name in a classed span, and a write to that property rewrites every such span in the rendered pane. This is deliberately not `update()`: the pane re-render would take the focus out of the text field being typed in, which is the same reason list-field edits already avoid it. The spans are found through the rendered DOM rather than held from when they were built, because `getSettingDefinitions()` also runs to index the pane for search — held nodes from a call that rendered nothing are not the ones the reader is looking at. Verified live: the rendered description follows the rename, and a plain `app.setting.open()` is not what renders it.

## Risks / Trade-offs

- **The registration stamp is a wire format between plugin versions.** A 1.13.3 instance unloading leaves a boolean stamp, and a version with this change must not mistake it for its own. Treating any stamp that is not this instance's record as "not mine, unwrap what you can" covers it: an old boolean stamp carries no `native`, so the wrapper it names cannot be peeled, and the new instance wraps what is there. That case still leaves a dead wrapper in the chain — unavoidable, since the old version stored nothing that could recover the native factory — but it is no worse than today and self-corrects on the next Maps re-registration.
- **`metadataCache.on('changed')` is a busy event.** The comparison in front of the refresh is what keeps it cheap; if the resolved-set check were ever dropped, every keystroke in a note would reload its track files.
- **Releasing thumbnails on disable costs a re-decode on re-enable.** That is the trade the setting asks for, and the decode is already bounded and concurrent-limited.
- **The Google host pattern is a list, and lists go stale.** A Google map domain outside `google.<tld>` / `google.{com,co}.<cc>` would stop being recognized. No such host is currently produced by Google Maps sharing, and failing closed on an unrecognized host is the safe direction.

## Migration Plan

None. No persisted setting changes shape, no command or public seam changes name, and the two added localization keys are additive. The registration change takes effect on the next plugin load; a vault currently stuck with a dead wrapper recovers on that load rather than needing a restart.
