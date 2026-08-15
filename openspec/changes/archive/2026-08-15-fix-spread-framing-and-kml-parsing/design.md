## Context

See `proposal.md` for motivation. Three constraints shape the approach.

The pins are the native Maps view's own markers; the only seam this plugin has on them is `setLayoutProperty(MARKER_LAYER, 'icon-offset', …)`. `icon-offset` is a **symbol layout** property, so MapLibre evaluates it once per tile while the symbol bucket is built, at that tile's zoom — not per frame. Any `['interpolate', …, ['zoom'], …]` written into it is therefore sampled only at whole zoom levels. Measured on a live map at 1.13.2: 0 px at z15.5, 15 px at z16.5, 29.5 px at z17.5. The current expression ramps from `SPREAD.fromZoom` (15) to `SPREAD.toZoom` (18), which makes 15 the level that evaluates to zero — so nothing moves until z16, while the settings text and the spec both say 15 — and `fanned()` reads the _continuous_ camera zoom, so the hover card sits somewhere the icon is not.

The inline embed and the base-map layer draw the same data through the same helpers, but only `TrackLayer` has framing guards: a content signature that decides whether a redraw is a new dataset, and a `userMoved` flag armed by user-driven camera events. `TrackEmbed.refresh()` has neither, and `refreshTracks()` calls it on every open embed for any settings change or any cached-track write.

`parse.ts` reads KML coordinates by splitting on whitespace and then on commas, which is correct only for tuples written without spaces. KML permits whitespace around the separators inside a tuple.

## Goals / Non-Goals

**Goals:**

- Make one function the single source of truth for how far open the fan is at a given camera zoom, and make that function return what the renderer actually bakes.
- Put the first visible spread step at `SPREAD.fromZoom`, so the constant means the zoom named in the English and Chinese setting text.
- Give inline maps the same framing guards base maps already have, without changing what a refresh redraws or how failures are reported.
- Read whitespace-separated KML tuples with or without spaces around their commas, and keep rejecting genuinely unusable ones.

**Non-Goals:**

- Redesign spread geometry (ring sizing, grouping, slot assignment) or change `SPREAD`'s pixel constants.
- Narrow `refreshTracks()` so a track write only reaches the embeds that reference it — the guards make the extra refreshes camera-neutral, which is what the spec needs.
- Add a fit/reframe control to inline maps, or otherwise extend inline map UI.
- Touch the other twelve open review findings, including the `style.load` revision tautology in the same file.

## Decisions

### 1. State the ramp as one offset per whole zoom level, from one shared function

`spreadFactor(zoom)` becomes the definition of the ramp for both consumers: quantize the camera zoom down to the whole zoom level the renderer will have used, and map level `L` to `(L - fromZoom + 1) / (toZoom - fromZoom + 1)`, clamped to `[0, 1]` and zero below `fromZoom`. With the current constants that is 0.25 / 0.5 / 0.75 / 1 at z15 / z16 / z17 / z18 — the first step lands on the advertised zoom, which is what the user chose over keeping today's stops and renaming the zoom in the UI.

`iconOffsetExpression()` writes a `['step', ['zoom'], …]` expression whose stops are those same whole levels and factors, rather than an `interpolate`. A `step` and an `interpolate` evaluate identically here — the sampling zoom is always whole — so this is chosen for honesty: the style says what the renderer does, and the next reader is not told a smooth ramp is being requested. The literal offsets stay integer-rounded per slot so they survive vector-tile serialization, as today.

`fanned()` keeps calling `spreadFactor(map.getZoom())`; because the function now quantizes, the card is placed at the offset the icon was drawn with at every zoom, not only at the two ends.

`icon-size` is a layout property too, and MapLibre multiplies each offset by the size evaluated at the same whole zoom the offsets were baked at — while the current code divides every level by the size at `toZoom` alone. The native marker layer's measured `icon-size` is a zoom curve (0.225 at z15 against 0.24 at z18), so that single divisor is wrong by ~6% at the open end of the ramp and the card would still miss the pin. Emitting one branch per level makes the correction free: each level divides by its own `markerIconScale(iconSize, level)`, so `iconOffsetExpression` takes the layer's raw `icon-size` value instead of a pre-evaluated number, and the unusable-value fallback stays where it already was, inside `markerIconScale`.

Alternatives rejected:

- Rewriting `icon-offset` per frame from a `zoom`/`move` handler with the factor pre-applied: `setLayoutProperty` on a symbol layer invalidates that layer's buckets and re-runs the worker for every tile of the source, so a zoom gesture would thrash the parser to produce what is still a per-tile result.
- `icon-translate`: paint-side and per-frame, but a single vector for the whole layer, so it cannot fan pins in different directions.
- Moving the markers' own coordinates instead of offsetting them: forbidden by `pin-spreading` ("Spreading does not change stored geography") and by the datum rules.
- Keeping the stops and changing `SPREAD.fromZoom`'s meaning to "where the ramp starts, one level below where it shows": the constant is interpolated straight into the settings description, so the name a user reads and the name in the code would have to disagree.

### 2. Mirror `TrackLayer`'s two framing guards into `TrackEmbed`

A framing signature identifies the dataset an embed drew: the track file's path and mtime, each host photo's path and mtime, the effective coordinate system, and the photo datum — `TrackLayer.signature()`'s ingredients minus the per-note colour, which an embed does not vary and which is paint rather than geometry. `refresh()` computes it after `loadAll()` and clears `framed` only when it differs from the one the current camera was framed for; an unchanged dataset therefore redraws in place. mtime is what makes an edit to the embed's own track count as a new dataset even though its path did not move.

`userMoved` is armed exactly as in `TrackLayer`: `dragstart`, `zoomstart`, `rotatestart` and `pitchstart` handlers that only count an event carrying an `originalEvent`, so programmatic moves — including the plugin's own `fitTo` — do not disarm framing. They are bound inside the existing one-shot `bindInteractions()`, which already owns listeners that outlive a refresh and a style change and are released with the map. The frame step then returns early when `userMoved` is set, alongside the existing `framed` check.

Both guards sit outside the revision/`dead` checks that decide whether a refresh may commit at all, so "Only the newest refresh commits" and the in-place failure path are unaffected: a refresh that must not commit still returns before framing is considered.

Alternatives rejected:

- Reusing `TrackLayer.signature()` directly: it walks `DrawItem`s built from base rows, which an embed does not have.
- Clearing `framed` only for settings changes and not for file writes: the file-write case is the one that reframes an unrelated note's map, and the settings case is the one a reader notices most.
- Skipping the whole redraw when the signature matches, as `sync()` does for its feature upload: an embed's refresh is also how paint, statistics, the profile and the height reach it, and those must keep running.

### 3. Normalize separator whitespace before splitting KML tuples

`parseKmlCoordinates()` collapses `\s*,\s*` to `,` in the raw text, then splits on whitespace exactly as it does today. Tuples remain whitespace-separated and the existing per-tuple validation is unchanged, so a tuple that still fails to yield two finite numbers is still skipped rather than guessed at.

One consequence is worth stating: a stray trailing comma (`1,2, 3,4`) now joins two tuples into one four-number tuple, of which the first three are read as lon/lat/ele and the rest ignored. That is the same "read what is there, invent nothing" behavior the parser already applies to over-long tuples, and it replaces today's outcome for that file, which is total rejection.

Alternatives rejected:

- Matching tuples with a single regex over the whole text: more surface for a malformed file to defeat, and no additional tolerance.
- Accepting whitespace as a _substitute_ for the comma: `1 2 3` cannot be distinguished from three separate one-number tuples, so tolerance there would invent coordinates.

## Risks / Trade-offs

- The native marker source's `maxzoom` caps the zoom any tile is built at, and everything above it is overscaled from that level. If the native Maps GeoJSON source is configured below `SPREAD.toZoom` (18, MapLibre's own GeoJSON default), the ramp would saturate early or never open → verify live at z14–z19 in the test vault before merging, and keep the invariant `toZoom <= source maxzoom` written next to the constants.
- Pins now move at z15, where today they do not, so a reader with spreading on sees a change → this is the behavior the setting has always described; the largest ring at 25% is well under a phone screen's width, and the setting can be turned off.
- An inline map the reader has panned will not re-frame afterwards, and inline maps have no ⛶ control to ask for framing back → re-rendering the note (reopening it, or scrolling the embed out of view and back) rebuilds the embed and frames it again; adding the control is left as a separate change rather than folded in here.
- A stepped fan is what the renderer can honor, so the pop at each whole zoom level remains → the spec now says so, and the hover card no longer contradicts it.

## Migration Plan

No persisted state, stored coordinates, or settings change, so there is nothing to migrate and nothing to roll back beyond reverting the commit.
