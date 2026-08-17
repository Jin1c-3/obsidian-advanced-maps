## 1. Unwrapping

- [x] 1.1 Add the unwrap walk to `src/geometry.ts`: for a line or ring, shift each position by whole turns of 360° until its step from the previous one is at most 180°, anchored on the feature's own first position
- [x] 1.2 Answer the original coordinate arrays when nothing moved, so a file that does not cross allocates nothing and the shared, memoized record cannot be mutated by the drawing path
- [x] 1.3 Apply it to `LineString`, `MultiLineString`, `Polygon`, and `MultiPolygon` — each line and each ring independently — and leave `Point` and `MultiPoint` untouched, with the reason stated adjacent
- [x] 1.4 Recurse into `GeometryCollection` members, since `extendBounds` already does and a collection can hold a crossing line

## 2. Draw path

- [x] 2.1 Call it from `trackFeatures()` before the geometry is pushed and before `lineEndpoints()` mints the start and end Points, so both markers land on the drawn path
- [x] 2.2 Confirm no other caller needs it: `TrackLayer.bounds()` and the embed's framing both map over the drawn features, so the framing half follows with no code of its own

## 3. Reading a coordinate back

- [x] 3.1 Add `normalizeLng` to `src/coords.ts`, beside the datum pair, taking whole turns at once and returning an in-range value untouched
- [x] 3.2 Apply it in the `unproject` wrapper the native context menu reads through, and install that wrapper on WGS-84 maps too — range is not a datum question
- [x] 3.3 Apply it to the external-map items, after the datum conversion and before any provider URL is built
- [x] 3.4 Cover the fold: an ordinary longitude comes back identical, ±180 is left as written, a camera past the meridian folds to the place a note would store, several laps fold in one step, and a non-finite value passes through

## 4. Coverage

- [x] 4.1 Test the walk directly: an eastward crossing continues past 180°, a westward crossing continues below −180°, a track that does not cross comes back as the same arrays, a file already written unwrapped is left alone, and elevation and other trailing members survive
- [x] 4.2 Test that a `Polygon` straddling the meridian unwraps each ring and keeps its ring order, and that a `MultiPoint` is returned untouched
- [x] 4.3 Test framing: `boundsOf()` over an unwrapped crossing line spans the route rather than the globe, and the synthetic start and end Points sit at the drawn ends
- [x] 4.4 Test that the parsed record is unchanged after drawing, and that `trackStats()` reports the same distance before and after — the record is what statistics read

## 5. Verification

- [x] 5.1 Run `npm run check`
- [x] 5.2 Live-verify in the test vault: a GeoJSON track crossing the meridian draws as one short path on a base map and in an inline embed, frames to itself rather than the globe, keeps its arrows pointing along travel with the endpoints at the drawn ends; the context menu's copied coordinate over that map is in ordinary range; `dev:errors` stays clean
- [x] 5.3 Add the changelog entry; no README line — the README describes what the plugin does, and drawing a route where it is was never something it offered not to do
