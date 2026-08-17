## Context

See proposal.md — Why for the measurements.

Two things were verified on a live map before this approach was chosen, because
the whole design rests on them:

- **MapLibre accepts longitudes past ±180 and draws them in the right place.**
  The same Fiji track written with unwrapped coordinates (…179.95, 180.3, 180.7)
  drew as a 166 km line off Vanua Levu with its arrows pointing along travel,
  no errors raised, and the crossing invisible to the reader.
- **The plugin's own bounds then come out right for free.** `boundsOf()` over
  the unwrapped feature answered 179.2 → 180.7, a span of 1.5°, and `fitBounds`
  put the camera at zoom 8.77 centred on 179.95 — against 359.65° and zoom 0.87
  for the same track written the ordinary way.

So this is not a rendering fix and a framing fix. It is one fix, applied
upstream of both, and the second half needs no code of its own.

## Goals / Non-Goals

**Goals:**

- A line or ring that crosses the 180th meridian draws along the ground it
  covers and frames to that ground, on base maps and inline maps alike.
- The coordinates a reader sees, copies, or has written to a note stay in
  ordinary WGS-84 range.
- No change to distance, ascent, duration, the elevation profile, or the datum
  boundary.

**Non-Goals:**

- Framing a scattered _set_ of features that straddles the meridian — photos in
  Fiji and photos in New Zealand, say. That needs a reference meridian chosen
  across features, and it has to agree with native marker bounds this plugin
  does not own. Different problem, different change.
- Polar geometry. A route over a pole has its own degeneracy and is not what
  this is about.
- Great-circle interpolation. MapLibre draws a segment as a straight line in the
  projection; that is what every other segment in this plugin already gets.

## Decisions

### D1 — Unwrap in `trackFeatures()`, not in the parser

The parsed record keeps exactly what the file said. `trackFeatures()` is where
the drawn feature list is built, and it is the last thing both consumers read
from: the GeoJSON source gets its output, and both `TrackLayer.bounds()` and the
embed's framing map over `data.features`.

_Why not the parser:_ `rec.features` is the WGS-84 source of truth. `stats.ts`
measures from it, the elevation profile samples it, the inline hover corridor
projects back through it, and `projectedFeatures()` feeds it to the datum
transform. A longitude of 180.3 in that record would be a lie told to five
readers to satisfy one.

_Why not `projectedFeatures()`:_ that is the datum seam, and GCJ-02's polynomial
takes the longitude as a real position. Unwrapping before it would hand the
transform 180.3 and get an offset computed for nowhere. Unwrapping after it —
which is where `trackFeatures()` sits — keeps the transform seeing what the file
stated.

### D2 — Each line and ring is unwrapped against its own first position

Walk the positions in order; whenever the step from the previous one exceeds
180°, shift the current one by whole turns of 360° until it does not. Rings are
walked the same way, each ring independently, since a hole is a closed path like
any other.

_Why per-feature rather than per-collection:_ two tracks on opposite sides of the
meridian have no path between them, so there is no step to make short. Anchoring
a whole collection on one meridian is the framing problem this change explicitly
does not take on.

_Why the first position:_ it is the one the file starts from, so a track that
never crosses is left bit-identical, and a track that does crosses in the
direction it was walked.

### D3 — New geometry only when a crossing exists

The walk answers the original array when nothing moved. `trackFeatures()` already
passes `feature.geometry` through by reference, so the common case allocates
nothing and the cached record cannot be mutated by the drawing path.

_Why it matters beyond allocation:_ the record is shared and memoized — the same
`rec.features` array backs every map that draws that file, and
`projectedFeatures()` memoizes per datum. Writing into it in place would corrupt
statistics for every other reader of the same file.

### D4 — Points are left exactly as they are

A `Point` or `MultiPoint` gets no treatment.

_Why:_ a single position cannot cross anything; the defect is in the step between
two positions. A `MultiPoint` has no path between its members either — its
members are separate places, and shifting one to be near another would move a
photo or a waypoint to a coordinate it does not have.

_Consequence to accept:_ a base map whose _pins_ straddle the meridian still
frames wide. That is the non-goal above, and it is unchanged by this work rather
than made worse by it.

### D5 — Endpoints are minted after the unwrap

`trackFeatures()` synthesizes start/end Points from `lineEndpoints(geometry)`.
Unwrapping first means those two markers inherit unwrapped coordinates and land
on the drawn line's real ends. Doing it the other way round would put the end
marker a world away from the line it belongs to — which is exactly what the
screenshot in the proposal shows today.

### D6 — Fold the longitude where a pixel becomes a vault coordinate

`normalizeLng` in `coords.ts` folds a longitude back into ±180, and is applied at
the two places a map pixel turns into a coordinate a reader keeps: the temporary
`unproject` wrapper the native context menu reads through, and the external-map
items built beside it.

_Why it is needed at all:_ measured on the framed crossing track, `map.unproject`
answered `180.5`. That is right for the map — MapLibre draws an endless row of
world copies and the camera counts through them — and wrong for **Copy
coordinates**, **New note here**, and any provider URL.

_Why it belongs to this change:_ the defect is reachable on `main` by panning
east across the meridian, so it is not caused here. But automatic framing now
puts the camera there without being asked, which turns a rare manual case into
the ordinary one for exactly the geometry this change exists to support. Shipping
the framing while knowingly handing out `180.5` would be shipping a known wrong
answer.

_Why the menu wrapper now installs on WGS-84 maps too:_ it used to skip them,
because its only job was the datum correction and that is a no-op there. Range is
not a datum question — a WGS-84 map's camera counts past the meridian the same
way. The wrapper is still instance-scoped, still installed for the duration of
one synchronous call, and still restored in a `finally`.

_Why not inside `toWgs84`:_ that is the datum boundary, and folding there would
also reach `realignCamera`, which re-projects the live camera centre between
systems. Moving a camera to the neighbouring world copy is invisible but it is
not this change's business.

## Risks / Trade-offs

- **A drawn coordinate is now outside ±180** → only inside the drawn collection,
  which nothing reads back for display: statistics and the elevation profile read
  the parsed record, and everything a reader copies or stores goes through the
  folded `unproject` seam above. Both halves are pinned by tests.
- **A file that already writes unwrapped longitudes** → the walk is idempotent:
  no step exceeds 180°, so nothing shifts and the file draws as it did.
- **A garbage coordinate far outside range** (say 4000) → the walk shifts it by
  whole turns like anything else, which lands it wherever its neighbours put it.
  That is the same answer this codebase gives every malformed input: draw what
  was written rather than guess what was meant.
- **Two consecutive positions exactly 180° apart** → ambiguous by nature; the
  walk leaves it alone, and either way round is the same distance.

## Migration Plan

None. No persisted data, no settings, no manifest change. A vault with no
crossing geometry renders identically, byte for byte, because the walk answers
the original arrays.

## Open Questions

- Whether the collection-level framing case is worth its own change, or whether
  a base map spanning the meridian is rare enough to leave. Deferrable: it
  changes nothing here.
