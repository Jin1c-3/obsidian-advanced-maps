/* Pure track statistics over raw WGS-84 features, never tile-projected geometry. */

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

/** Metres of elevation change required to commit through consumer-GPS noise. */
export const ASCENT_THRESHOLD_M = 5;

/** 0.25 m/s (0.9 km/h) keeps slow uphill walking while excluding stationary intervals. */
export const MOVING_SPEED_MPS = 0.25;

// WGS-84 mean radius in metres; adequate at consumer GPS accuracy.
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

/** Commit ascent/descent only after movement from the last base crosses the noise threshold. */
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

/** One resampled point of an elevation profile — see `elevationProfile`. */
export interface ProfileSample {
	d: number; // cumulative distance from the start of the track, metres
	ele: number; // metres
	// WGS-84 — the coordinate this sample's own position already was. Riding
	// along for free (no extra pass over the track needed) is what lets a hover
	// anywhere on the map find its way back to the nearest sample here, and a
	// hover on the profile find its way back to a point on the map.
	lng: number;
	lat: number;
}

/**
 * A resampled series for a sparkline — and for the map ↔ profile hover link —
 * downsampled to at most `samples` points so an 11 k-point export does not
 * become an 11 k-point SVG path.
 *
 * `d` mirrors `trackStats`' own rule for `distance`: it accumulates within each
 * LineString but never jumps the gap between one LineString and the next, since
 * that gap is not distance actually travelled. Points with no elevation are
 * skipped for the series itself (there is nothing to plot) but still counted
 * into `d`, so the points that remain stay at their true distance along the
 * track rather than bunching together.
 */
export function elevationProfile(features: Features, samples = 160): ProfileSample[] {
	const full: ProfileSample[] = [];
	let cumulative = 0;

	for (const feature of features) {
		const geometry = feature.geometry;
		if (geometry.type !== 'LineString') continue;

		let lastCoord: number[] | null = null;
		for (const pos of geometry.coordinates) {
			if (lastCoord) cumulative += haversine(lastCoord, pos);
			lastCoord = pos;

			const ele = pos[2];
			if (typeof ele === 'number' && isFinite(ele)) {
				full.push({ d: cumulative, ele, lng: pos[0], lat: pos[1] });
			}
		}
	}

	if (full.length === 0 || full.length <= samples) return full;
	if (samples <= 1) return [full[full.length - 1]];

	// Even index spacing is deterministic, O(n), bounded, and preserves endpoints.
	const out: ProfileSample[] = [];
	for (let i = 0; i < samples; i++) {
		out.push(full[Math.round((i * (full.length - 1)) / (samples - 1))]);
	}
	return out;
}

/** Closest cumulative-distance sample; bounded linear scan, first match wins ties. */
export function nearestByDistance(samples: ProfileSample[], targetD: number): number {
	let best = 0;
	let bestDist = Infinity;
	for (let i = 0; i < samples.length; i++) {
		const dist = Math.abs(samples[i].d - targetD);
		if (dist < bestDist) {
			bestDist = dist;
			best = i;
		}
	}
	return best;
}

/** Closest WGS-84 sample by squared degree-space distance; first match wins ties. */
export function nearestByPosition(samples: ProfileSample[], lng: number, lat: number): number {
	let best = 0;
	let bestDist = Infinity;
	for (let i = 0; i < samples.length; i++) {
		const dLng = samples[i].lng - lng;
		const dLat = samples[i].lat - lat;
		const dist = dLng * dLng + dLat * dLat;
		if (dist < bestDist) {
			bestDist = dist;
			best = i;
		}
	}
	return best;
}
