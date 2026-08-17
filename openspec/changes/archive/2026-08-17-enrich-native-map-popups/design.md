## Context

See proposal.md — Why for the motivation and for what was measured about
`PopupManager`. The constraints this design has to satisfy are the house rules
that already govern every other native seam: wrap instances and never
prototypes, shape-check an undocumented internal before using it, restore
cleanly on detach, and transform coordinates at the map boundary exactly once.

Two existing pieces do most of the work and set the shape of the rest.
`hover()` (`src/track-layer.ts:1168`) already decides which drawn feature a
pointer event is about and already dedupes so one feature raises one popup.
`trackStats()` (`src/stats.ts:75`) already measures a parsed track and is the
same function the inline embed's statistics strip is built from.

## Goals / Non-Goals

**Goals:**

- One mechanism serving all three payloads, so a fourth thing that wants to
  reach inside the card has somewhere obvious to go.
- The pointed track's numbers agree with an inline embed of that same file, on
  every tile datum.
- Detach leaves the host's popups byte-for-byte what the host builds.

**Non-Goals:**

- Reproducing the inline statistics strip in the popup. A popup is narrow; the
  full set and the elevation profile stay inline.
- Any statistics surface on the map other than this popup. The frontmatter
  route that shipped in 1.14.0 stays the way a base sorts and totals them.
- Making a popup appear where the host declines to raise one.

## Decisions

### D1: Wrap `createPopupContent`, not the DOM after `showPopup`

`showPopup` builds nothing itself; it delegates to `createPopupContent`, which
returns the finished card, and only then inserts it. Wrapping the builder means
the rows are part of the card before it is ever laid out.

Alternatives considered:

- **Reach for the element after `showPopup` returns.** `sharedPopup.getElement()`
  does exist and is connected, but it is not the same element between two shows,
  so anything cached is stale by the next hover; and appending after insertion
  means mutating a node MapLibre has already positioned.
- **Build a tooltip of this plugin's own**, as the inline embed does. This is
  what the roadmap assumed and it is the worst option on a base map: the native
  popup is raised on the same hover, `PopupManager` installs its own
  `mouseenter`/`mouseleave` handlers on its element, and two floating boxes over
  one pointer fight for the same space.
- **Wrap `showPopup` and post-process.** Same insertion-order problem, and this
  plugin's `showPopup` wrapper already exists for coordinate projection; giving
  it a second unrelated job would tangle two concerns on one seam.

### D2: A one-shot handoff carries which feature it is

`createPopupContent(entry, properties, displayName)` is told about the note and
nothing about the feature. The call chain from `showPopup` to it is synchronous,
so `hover()` records the pointed feature immediately before calling `show`, and
the wrapper reads it and clears it in the same call.

Clearing is what keeps this honest: the native `marker-pins` hover calls
`showPopup` too, and a value left behind would decorate a pin's popup with the
last track hovered. Verified live — a second popup raised with nothing pending
saw `null`.

Alternatives: deriving the feature inside the wrapper by re-querying the map at
the pointer position (the wrapper has no event and no pointer), or keying on the
`entry` (an entry is a note, and the whole point is that a note can carry several
tracks).

### D3: `amPath` on lines, not a second index

ROADMAP.md proposed "a second index alongside `amIndex`". A path is cheaper and
already half-built: `amPath` is part of `TrackFeatureProps` (`src/geometry.ts:213`),
photo Points carry it today, and `trackFile.path` is in scope in the loop that
builds features (`src/track-layer.ts:899`). It is also the cache key —
`plugin.tracks.get(path)` returns the record — so a numeric index would need a
second table to get back to what the path already names.

**A behavior change falls out of this and is intended.** `hover()`'s dedupe key
is `` `${index} ${role} ${path}` ``. Lines carry no path today, so two tracks of
one note share a key and crossing between them raises no new popup. Once lines
name their file, that crossing re-raises the popup — which is what the existing
"Pointer crosses to a different feature" scenario asks for, and without it the
statistics row would be stuck on whichever track was entered first. The cost is
one extra `addTo` per crossing, ~4.6 ms measured.

### D4: Statistics are the file's, computed unshifted, memoized on the record

`inline-track-maps` already requires statistics to come from unshifted route
data; the same rule applies here, so the walk reads `rec.features` and never the
tile-space geometry in `rec.projected`. Measuring lazily on hover and memoizing
on `TrackRecord` — beside the `projected` map, invalidated with the record it
lives on — means a file is walked at most once per revision and only if someone
points at it. Measuring every drawn track up front would walk files nobody
hovers.

The figures are the **file's**, matching what an inline embed of that file
reports. A file holding several segments is measured whole, exactly as inline;
`trackStats` already ignores polygons (`src/stats.ts:111`), so an area
contributes nothing through the existing `hasStats` gate rather than through a
special case.

### D5: One row per pointed feature, not one row per figure

The card already carries up to twenty of the note's own properties. Nine figures
would swamp it, and three rows still triple the height of the common case.
The row is labelled with the track's own name and its value joins the figures the
file supports — distance, climb, duration — through the existing
`formatDistance`, `formatElevation` and `formatDuration`, so a popup and an
inline strip never disagree about how a number is written.

Alternative considered: a row per figure, more scannable and more native in
shape. Rejected on height. It stays available later without a spec change, since
the specs say what is contributed and not how many rows it occupies.

### D6: No new setting

Every row already has an upstream gate: a track has to be drawn at all, a
waypoint name obeys **Show route markers**, a photo has to have participated in
the map. The rows appear only over features this plugin itself drew. A fourth
toggle asking "should the card tell you which track you are on" would be a
setting for the absence of an answer.

If it turns out to be wanted, it can be added later without touching these
specs — they say what a pointed feature contributes, not that it is
unconditional.

### D7: The photo preview reuses the inline tooltip's source

`getResourcePath` into a bounded `<img>`, the same as `src/embed.ts:590`, rather
than the EXIF-thumbnail decode path that feeds map symbols. That path exists to
bound GPU memory across hundreds of simultaneous symbols; a popup shows one
image, the browser caches it, and CSS bounds it. A file that cannot supply a
resource path yields no `<img>` and leaves the note popup intact — the same
fallback the inline tooltip already takes.

### D8: Restore through the existing wrap seam

The new wrapper is installed through `this.wrap(...)`, so `override()` owns the
restore: the own property is deleted and the prototype's method returns —
confirmed live. Nothing else needs cleaning, because the content node is rebuilt
on every show. As with every other internal here, the method is shape-checked
before it is wrapped; if a Maps update removes or renames it, the enhancement is
skipped and hover behaves exactly as it does today.

## Risks / Trade-offs

- **Maps renames or restructures `createPopupContent`.** → Shape-check before
  wrapping and skip the enhancement when it fails; the popup then says what it
  says today. Declared with provenance in `src/types/obsidian-internals.d.ts`.
- **The native card's class names change.** → An appended row would lose its
  styling but still read as text, and the property list is created only when the
  host did not build one.
- **Crossing between two tracks of one note now costs an extra popup rebuild.**
  → ~4.6 ms, and it is the behavior the existing scenario already specifies.
- **A very large track is walked on first hover.** → Once per record revision,
  and it is the same walk the inline embed already performs for that file.
- **A note whose displayed properties are all empty gets no popup, so no
  statistics either.** → Native behavior, inherited deliberately; 0 of 303 rows
  in the test vault, median 6 properties. Forcing a popup open would mean
  overriding the host's own rule about when a card is worth showing.

## Migration Plan

None. No stored data, no setting, no manifest change. Reverting the change
restores the host's own popups by removing one wrapper.
