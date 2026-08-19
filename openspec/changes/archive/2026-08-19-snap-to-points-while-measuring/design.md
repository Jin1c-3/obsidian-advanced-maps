## Context

See proposal.md — Why. Three things this codebase already settled decide most of
the shape.

- A drawn coordinate is in the tile datum and a vault coordinate is WGS-84,
  crossed exactly once at the boundary. A snapped point is read _off the map_,
  so it crosses in the same direction `at()` already crosses in.
- The native pins are not this plugin's to enumerate. `TrackLayer` holds its own
  items, but a note's pin belongs to the native marker manager, and `spread.ts`
  moves pins on screen without moving their coordinates. Asking the map what is
  rendered under a pixel is the one question that answers for both.
- `pinHoldsPointer()` already runs `queryRenderedFeatures` on every hover sample
  over an area layer, so the cost of one box query per pointer frame is a cost
  this plugin has already measured and accepted.

## Goals / Non-Goals

**Goals:**

- A measurement between two things that are on the map is exact — the same
  numbers a reader would get by copying both coordinates out and computing.
- The reader sees which point they are about to take before they take it.
- One pure, testable rule for "which candidate wins", with the map's answers
  fed into it rather than reached from inside it.

**Non-Goals:**

- **Snapping to a line.** A rendered line's vertices are tile-clipped and
  simplified — they are not the coordinates the file holds, and a point taken
  from one would be a coordinate no source ever recorded. Waypoints, endpoints,
  photos and pins are Points, and a Point survives the trip out and back.
- **Snapping to the nearest point on a segment** (perpendicular projection onto
  a track). That is a different feature, needs the unsimplified geometry, and
  nobody asked for it.
- **A setting.** Alt is the bypass; a preference for a behaviour that is only
  live while a button is held down is settings surface rather than a decision
  anyone makes twice. See the same reasoning for the ruler button itself.
- **Snapping in inline maps.** They have no tape.

## Decisions

### D1 — Candidates come from the map, not from this plugin's own model

`queryRenderedFeatures` with a box of `SNAP_PX` around the pointer, over the
four layers that draw Points: the native `marker-pins`, this plugin's track
points and endpoint pins, and the photo dots. One call answers for native and
owned features together, in one space, and it answers about what is _drawn_ —
so a hidden layer, a filtered-out pin or a photo the reader turned off is not a
candidate, without any of that state being tracked twice.

Layers whose ids are absent are filtered out before the call rather than after:
MapLibre throws on an unknown layer id, and a style mid-swap has every id absent.

### D2 — A candidate's coordinate is its geometry; the box query is only the aim

The two are not the same pixel, and the difference is the point. A fanned pin is
drawn up to 140 px from the coordinate it stands for (`spread.ts` moves icons,
never sources), and a native pin's teardrop is drawn above its tip. The reader
aims at what is drawn, so what is drawn decides _whether_ a feature is a
candidate; the coordinate behind it decides _what gets measured_. Ranking among
candidates is by distance from the pointer to the projected coordinate, so a
waypoint 6 px away beats a fanned pin whose icon is under the pointer but whose
note is a hundred pixels off.

This is exactly what the ring is for: it is drawn at the coordinate, not under
the pointer, so a snap that moves the point a long way says so before the click.

### D3 — Photos snap to the dot, never to the thumbnail

`PHOTO_DOT_LAYER` is a small circle at the photo's own position and is drawn
under every thumbnail. `PHOTO_LAYER` is a 48 px image whose quad intersects a
box from up to 24 px away, which would let a click near the corner of a picture
take a coordinate a screen-quarter-inch from where it pointed. The dot is the
photo's position; the thumbnail is its picture.

### D4 — The tape's own points are candidates, except the last one placed

Closing a loop on the place it started is the reason to snap to your own work,
and it needs the first point. The point just placed is excluded for the opposite
reason: the pointer is standing on it the instant after the click, so it would
ring every point as soon as it was placed and offer a leg from a point to
itself, which is not a measurement.

Own points are held in WGS-84 already, so they are candidates without a round
trip — projected to rank, never converted to be taken.

### D5 — The pointer is tracked before the first point is placed

`follow()` used to return early with nothing placed, because there was nothing to
preview. There is now: the ring, which has to be visible before the first click
or the first point of every measurement is the only unaimed one. The early
return is kept for the case it was really about — a pointer crossing open ground
with nothing placed and nothing snapped redraws nothing.

### D6 — The ring is a fourth layer on the tape's own source

`amMeasure: 'snap'`, filtered like the other three, added after them so it draws
over the vertices, and removed with them. It is a hollow circle in the accent
colour: the same vocabulary as the vertex dot, at a size that reads as "this one
is claimed" rather than as another placed point.

### D7 — Alt suppresses it, on the click and on the move

Read from `originalEvent.altKey` on both, so the ring goes out while the key is
held rather than only at the moment of the click. MapLibre's own Alt gesture is
`dragRotate`, which needs a drag; a stationary Alt-click is unclaimed.

## Risks / Trade-offs

- **One box query per pointer frame.** Bounded by the same frame coalescing the
  tape already does, over four layers, in a box 24 px across. If it ever shows,
  the query is the first thing to move behind a pointer-idle check.
- **A snap that moves the point a long way** — a fanned pin — is legal by D2 and
  visible by the ring. The alternative, refusing candidates whose coordinate is
  far from the pointer, would make a fanned cluster the one thing on the map that
  cannot be measured to.
- **Reversing a documented non-goal.** The measuring design ruled snapping out.
  This states why the objection is answered rather than dropping the sentence:
  the ring and the Alt bypass are what turn "quietly moves" into "says what it
  will do, and can be told not to".
