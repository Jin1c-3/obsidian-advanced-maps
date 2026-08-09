/*
 * Track statistics — distance, elevation gain, moving time — computed straight
 * from a parsed track's own GeoJSON features.
 *
 * Everything here is measured in WGS-84, and it has to stay that way. The
 * GCJ-02 and BD-09 offsets used to draw a track on a Chinese tile set are
 * non-linear, so a distance summed after that shift is a distance measured in
 * the wrong space — and the error is small enough per pair of points to look
 * plausible, which is what makes it dangerous rather than merely wrong. Callers
 * must hand this module a track's own `features` — the values it was parsed
 * into — never the output of `projectGeometry` / a view's `projectedFeatures()`.
 * This module imports nothing from Obsidian and touches no DOM, on purpose: it
 * has to run the same way in a test as it does in the app.
 */

import type { Feature, Geometry } from 'geojson';

type Features = Array<Feature<Geometry, Record<string, unknown> | null>>;

export interface TrackStats {
	distance: number; // metres, summed over all LineStrings
	points: number; // positions considered
	ascent: number | null; // metres; null when no elevation anywhere
	descent: number | null;
	minEle: number | null;
	maxEle: number | null;
	start: number | null; // epoch ms
	end: number | null;
	duration: number | null; // ms, end - start
	movingTime: number | null; // ms
	speed: number | null; // m/s over movingTime
}

/**
 * Consumer GPS elevation is noisy at the ±3–5 m level, so a naive sum of every
 * upward step between consecutive points inflates a dead-flat track into
 * hundreds of metres of "climb". 5 m is the conventional hysteresis threshold:
 * big enough to sit above the noise floor, small enough not to eat real hills.
 */
export const ASCENT_THRESHOLD_M = 5;

/**
 * Below any walking pace: an interval slower than this is standing still, not
 * moving slowly.
 *
 * 0.25 m/s is 0.9 km/h, and it is deliberately far under the 0.5 m/s such
 * thresholds are usually set to. Measured on a real 3.2 km stair climb — 300 m
 * of ascent, ten minutes of it spent resting — 0.5 m/s reported 45:36 of moving
 * time against 1:14:57 elapsed, throwing away nearly twenty minutes of genuine
 * uphill walking: 1.8 km/h is a perfectly ordinary pace on steps, so a
 * threshold there does not separate resting from climbing, it just penalises
 * climbing. At 0.25 m/s the same track reports the ten minutes it actually
 * stopped for.
 */
export const MOVING_SPEED_MPS = 0.25;

// WGS-84 mean radius. Good to well under a metre at GPS accuracy; Vincenty buys nothing here.
const EARTH_RADIUS_M = 6371008.8;

/** Great-circle distance between two `[lon, lat, ...]` positions, in metres. Extra members (elevation) are ignored. */
export function haversine(a: number[], b: number[]): number {
	const [lon1, lat1] = a;
	const [lon2, lat2] = b;
	const rLat1 = (lat1 * Math.PI) / 180;
	const rLat2 = (lat2 * Math.PI) / 180;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
	// h can drift a hair past 1 from floating-point error at antipodal-ish inputs; clamp rather than hand asin a NaN.
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Ascent/descent over one ordered, already-elevation-only sequence, via
 * hysteresis rather than a running sum.
 *
 * A naive sum of every positive delta between consecutive points is wrong: GPS
 * elevation jitters at the ±3–5 m level even standing still, so a flat track
 * "climbs" by the sum of its own noise — hundreds of metres over a long enough
 * export. The fix is to compare each new point against the last *committed*
 * elevation (`base`) rather than against its immediate predecessor. Small
 * back-and-forth wobble never moves `base`, so it never accumulates; only once
 * a point has drifted `ASCENT_THRESHOLD_M` or more away from the last committed
 * value does that whole move get credited to ascent or descent, and `base`
 * jumps to the new point. A real, gradual climb still gets counted in full: it
 * simply commits in `ASCENT_THRESHOLD_M`-ish increments as it goes, and those
 * increments sum to the true climb.
 */
function hysteresisClimb(elevations: number[]): { ascent: number; descent: number } {
	let ascent = 0;
	let descent = 0;
	let base = elevations.length > 0 ? elevations[0] : 0;
	for (let i = 1; i < elevations.length; i++) {
		const diff = elevations[i] - base;
		if (diff >= ASCENT_THRESHOLD_M) {
			ascent += diff;
			base = elevations[i];
		} else if (diff <= -ASCENT_THRESHOLD_M) {
			descent += -diff;
			base = elevations[i];
		}
		// Otherwise the point sits inside the noise band around `base`: leave
		// `base` where it is and keep comparing later points against it.
	}
	return { ascent, descent };
}

/** `properties.times`, trimmed to line up with `coordinates` when a merged export disagrees on length. */
function alignedTimes(feature: Features[number], length: number): Array<number | null> | null {
	const props = feature.properties;
	const raw = props && Array.isArray(props.times) ? (props.times as Array<number | null>) : null;
	// A shorter `times` is trusted over `coordinates`: points past the end of
	// `times` are simply treated as having no time, the same as a `null` entry.
	// A longer one is trimmed rather than read out of bounds. Either way there is
	// no way to know *which* end lost entries, so "trust the shorter" is the only
	// answer that cannot silently misalign the two arrays.
	return raw ? raw.slice(0, length) : null;
}

export function trackStats(features: Features): TrackStats {
	let distance = 0;
	let points = 0;
	let ascent = 0;
	let descent = 0;
	let minEle = Infinity;
	let maxEle = -Infinity;
	let anyElevation = false;
	let start: number | null = null;
	let end: number | null = null;
	let movingTime = 0;
	let anyTime = false;

	const noteElevation = (ele: number) => {
		anyElevation = true;
		if (ele < minEle) minEle = ele;
		if (ele > maxEle) maxEle = ele;
	};

	for (const feature of features) {
		const geometry = feature.geometry;

		if (geometry.type === 'Point') {
			// A waypoint is one position with nothing before or after it in the
			// track, so it has no distance and no ascent/descent of its own — but
			// it is still a position, and its elevation (a summit marker, say) is
			// still a real extreme worth reflecting in minEle/maxEle.
			points++;
			const ele = geometry.coordinates[2];
			if (typeof ele === 'number' && isFinite(ele)) noteElevation(ele);
			continue;
		}

		// parse.ts only ever hands this module LineStrings and Points; anything
		// else (a Polygon dragged in from a hand-edited GeoJSON file, say) is not
		// a track segment and contributes nothing rather than being guessed at.
		if (geometry.type !== 'LineString') continue;

		const coords = geometry.coordinates;
		points += coords.length;
		const times = alignedTimes(feature, coords.length);

		const lineEles: number[] = [];
		let lastCoord: number[] | null = null;
		let lastTime: number | null = null;
		// Distance walked since the last point whose time is known — reset every
		// time a known time is seen, so the implied speed for an interval counts
		// the ground actually covered even when a point or two inside it lacks a
		// timestamp of its own.
		let distSinceLastTime = 0;

		for (let i = 0; i < coords.length; i++) {
			const pos = coords[i];

			const ele = pos[2];
			if (typeof ele === 'number' && isFinite(ele)) {
				noteElevation(ele);
				lineEles.push(ele);
			}

			if (lastCoord) {
				const seg = haversine(lastCoord, pos);
				distance += seg;
				distSinceLastTime += seg;
			}
			lastCoord = pos;

			const t =
				times && typeof times[i] === 'number' && isFinite(times[i] as number) ? (times[i] as number) : null;
			if (t !== null) {
				anyTime = true;
				if (start === null || t < start) start = t;
				if (end === null || t > end) end = t;

				if (lastTime !== null) {
					const dt = t - lastTime;
					// A merged export can carry a point or two whose timestamp runs
					// backwards relative to the last one. dt <= 0 makes "implied
					// speed" meaningless (division by zero or a negative duration),
					// so the interval is simply not counted as moving time rather
					// than clamped to some guessed value — the ground it covered is
					// still in `distance` and folds into the next valid interval's
					// distSinceLastTime.
					if (dt > 0) {
						const impliedSpeed = distSinceLastTime / (dt / 1000);
						if (impliedSpeed >= MOVING_SPEED_MPS) movingTime += dt;
					}
				}
				lastTime = t;
				distSinceLastTime = 0;
			}
		}

		const climb = hysteresisClimb(lineEles);
		ascent += climb.ascent;
		descent += climb.descent;
	}

	// start/end are the earliest and latest timestamp seen anywhere in the
	// track, not "the first point's time" — a merged export is not guaranteed to
	// be in time order across its segments. Taking the min/max rather than the
	// first/last value seen also guarantees end >= start, so duration can never
	// come out negative.
	const duration = start !== null && end !== null ? end - start : null;
	const speed = movingTime > 0 ? distance / (movingTime / 1000) : null;

	return {
		distance,
		points,
		ascent: anyElevation ? ascent : null,
		descent: anyElevation ? descent : null,
		minEle: anyElevation ? minEle : null,
		maxEle: anyElevation ? maxEle : null,
		start,
		end,
		duration,
		movingTime: anyTime ? movingTime : null,
		speed,
	};
}

function clampFinite(value: number, fallback = 0): number {
	return isFinite(value) ? value : fallback;
}

/** "13.6 km" past 1000 m, "840 m" under it. A non-finite or negative input reads as zero rather than "NaN km". */
export function formatDistance(metres: number): string {
	const m = Math.max(0, clampFinite(metres));
	if (m < 1000) return `${Math.round(m)} m`;
	return `${(m / 1000).toFixed(1)} km`;
}

/** "2:41:05" once there is an hour to show, "41:05" below one — the hour field is omitted, not zero-padded into view. */
export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(clampFinite(ms) / 1000));
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(s).padStart(2, '0');
	if (h > 0) return `${h}:${mm}:${ss}`;
	return `${m}:${ss}`;
}

/** "5.1 km/h". Metric only — this plugin's audience is CN + international OSM, and neither reaches for mph. */
export function formatSpeed(mps: number): string {
	const v = Math.max(0, clampFinite(mps));
	return `${((v * 3600) / 1000).toFixed(1)} km/h`;
}

/** "420 m", or a negative figure for anything below sea level — unlike distance/speed, elevation is not clamped to zero. */
export function formatElevation(metres: number): string {
	return `${Math.round(clampFinite(metres))} m`;
}

/**
 * A resampled `{ d, ele }` series for a sparkline: cumulative distance from the
 * start of the track against elevation, downsampled to at most `samples`
 * points so an 11 k-point export does not become an 11 k-point SVG path.
 *
 * `d` mirrors `trackStats`' own rule for `distance`: it accumulates within each
 * LineString but never jumps the gap between one LineString and the next, since
 * that gap is not distance actually travelled. Points with no elevation are
 * skipped for the series itself (there is nothing to plot) but still counted
 * into `d`, so the points that remain stay at their true distance along the
 * track rather than bunching together.
 */
export function elevationProfile(features: Features, samples = 160): Array<{ d: number; ele: number }> {
	const full: Array<{ d: number; ele: number }> = [];
	let cumulative = 0;

	for (const feature of features) {
		const geometry = feature.geometry;
		if (geometry.type !== 'LineString') continue;

		let lastCoord: number[] | null = null;
		for (const pos of geometry.coordinates) {
			if (lastCoord) cumulative += haversine(lastCoord, pos);
			lastCoord = pos;

			const ele = pos[2];
			if (typeof ele === 'number' && isFinite(ele)) full.push({ d: cumulative, ele });
		}
	}

	if (full.length === 0 || full.length <= samples) return full;
	if (samples <= 1) return [full[full.length - 1]];

	// Evenly-spaced indices rather than peak-preserving simplification: a
	// sparkline only has to look roughly right at a glance, and this is O(n),
	// trivial to reason about, and always lands on the same points for the same
	// input. Spacing by index (not by distance) and rounding each one means the
	// first and last samples land exactly on index 0 and full.length - 1 — the
	// two points a sparkline can least afford to distort — while the count never
	// exceeds `samples`, unlike a fixed stride that overshoots by up to one.
	const out: Array<{ d: number; ele: number }> = [];
	for (let i = 0; i < samples; i++) {
		out.push(full[Math.round((i * (full.length - 1)) / (samples - 1))]);
	}
	return out;
}
