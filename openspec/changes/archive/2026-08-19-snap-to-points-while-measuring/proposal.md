## Why

The tape answers "how far is that from this?" between two pixels. The question
readers actually ask is between two _things_ — this note and that photo, the
trailhead pin and the summit waypoint — and a pixel is not a thing. Aiming by
hand costs whatever a pixel is worth at the zoom the map happens to be at: about
4 m at zoom 15 in Shanghai, and about 33 m at zoom 12. A five-pixel miss at each
end is a hundred metres the readout states to the metre and does not admit to.

Every one of those points is already on the map with an exact WGS-84 coordinate
behind it. Taking that coordinate instead of the pixel near it makes a
measurement between two known places exact rather than approximately aimed, and
it costs one query the map already answers for every hover over an area.

The measuring design ruled this out: "A tape measures where the reader pointed.
A point that quietly moves to something nearby answers a question they did not
ask." The objection was to _quietly_, and it stands. What answers it is saying
so: a ring is drawn on the point that would be taken before the click that takes
it, so the reader sees the answer they are about to get, and Alt held down places
the point on the bare pixel for the times they meant the ground and not the thing
standing on it.

## What Changes

- While the tape is out, a pointer within a short distance of a point already
  drawn on the map takes that point's own coordinate instead of the pixel under
  the pointer. The candidates are a note's native pin, a track's waypoints and
  its start and end pins, a photo's position, and the tape's own earlier
  vertices — which is what lets a route close exactly on the place it started.
- A ring is drawn around the point that would be taken, from the moment the
  pointer is near it, including before the first point of a measurement is
  placed. Nothing else about the tape changes shape.
- Holding Alt while clicking, or while moving, suppresses the ring and places
  the point on the pixel — the bypass every drawing tool has.
- The point taken is the feature's own coordinate crossed back into WGS-84 once,
  like every other coordinate read off a map here, so snapping on a mainland
  background lands on the real place rather than its offset copy.
- No setting, and no new state: the tape still writes nothing and still forgets
  everything when it is put away.

## Impact

- Affected specs: `map-measuring` (modified).
- Affected code: `src/measure.ts`, `src/measure-tool.ts`, `src/layers.ts`,
  `src/constants.ts`, `src/types/obsidian-internals.d.ts`, `styles.css`.
- Affected docs: `docs/guide/{en,zh-cn}/around-and-navigation.md`.
- No change to any map that is not measuring, and none to what a measurement
  costs a note: it still writes nothing.
