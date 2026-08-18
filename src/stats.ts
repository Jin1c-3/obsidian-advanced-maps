/* Pure track statistics over raw WGS-84 features, never tile-projected geometry. */

import type { Feature, Geometry } from 'geojson';
import { linesOf, pointsOf } from './geometry';

type Features = Array<Feature<Geometry, Record<string, unknown> | null>>;

export interface TrackStats {
	distance: number; // metres, summed along every path, never across the gap between two
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

		// A waypoint is one position with nothing before or after it in the track,
		// so it has no distance and no ascent/descent of its own — but it is still a
		// position, and its elevation (a summit marker, say) is still a real extreme
		// worth reflecting in minEle/maxEle.
		for (const pos of pointsOf(geometry)) {
			const ele = pos[2];
			if (typeof ele === 'number' && isFinite(ele)) noteElevation(ele);
		}

		// Every path this geometry holds, not just a bare LineString: a merged
		// export is one MultiLineString, and measuring it as nothing was the whole
		// bug. Timestamps are position-aligned across the feature's paths in order,
		// which is the only reading a flat `times` array on a multi-path feature
		// can have.
		const lines = linesOf(geometry);
		if (lines.length === 0) continue;
		const times = alignedTimes(
			feature,
			lines.reduce((n, line) => n + line.length, 0)
		);
		let offset = 0;

		for (const coords of lines) {
			const lineEles: number[] = [];
			// Per path, never across the gap between two: that gap is not ground
			// travelled, and a climb spanning it was never walked.
			let lastCoord: number[] | null = null;
			let lastTime: number | null = null;
			// Distance walked since the last point whose time is known — reset every
			// time a known time is seen, so the implied speed for an interval counts
			// the ground actually covered even when a point or two inside it lacks a
			// timestamp of its own.
			let distSinceLastTime = 0;

			for (let i = 0; i < coords.length; i++) {
				const pos = coords[i];
				const at = offset + i;

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

				const stamp = times?.[at];
				const t = typeof stamp === 'number' && isFinite(stamp) ? stamp : null;
				if (t !== null) {
					anyTime = true;
					if (start === null || t < start) start = t;
					if (end === null || t > end) end = t;

					const dt = lastTime === null ? null : t - lastTime;
					if (dt !== null) {
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
					// Only an interval that counted consumes the distance behind it.
					// Zeroing this unconditionally is what used to discard the ground
					// covered before a backwards timestamp, against the promise above.
					if (dt === null || dt > 0) distSinceLastTime = 0;
				}
			}

			const climb = hysteresisClimb(lineEles);
			ascent += climb.ascent;
			descent += climb.descent;
			offset += coords.length;
		}
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

/** Is there anything here to report? The one condition both surfaces are gated on. */
export function hasStats(stats: TrackStats): boolean {
	return (
		stats.distance !== 0 ||
		stats.ascent !== null ||
		stats.descent !== null ||
		(stats.minEle !== null && stats.maxEle !== null) ||
		stats.duration !== null ||
		stats.movingTime !== null ||
		stats.speed !== null
	);
}

/**
 * The nine figures a note can carry, in the order they are written, each with
 * the suffix its default name is built from.
 *
 * The unit is part of the default name — `distance-km`, not `distance` — because
 * a bare number in frontmatter is otherwise unlabelled forever, and a column
 * header is the one place the unit stays beside the value. `lowest`/`highest`
 * rather than `min`/`max`: `min` next to `duration-min` would read as minutes in
 * one name and minimum in the other.
 *
 * Not localized. These are property names in a vault, not labels on screen: a
 * default that followed the interface language would rename every reader's
 * columns the day they switched languages.
 */
const STATS_SUFFIXES = {
	distance: 'distance-km',
	ascent: 'ascent-m',
	descent: 'descent-m',
	lowest: 'lowest-m',
	highest: 'highest-m',
	duration: 'duration-min',
	moving: 'moving-min',
	speed: 'speed-kmh',
	start: 'start',
} as const;

export type StatsFigure = keyof typeof STATS_SUFFIXES;

/** In writing order, which is the order the properties are named in. */
export const STATS_FIGURES = Object.keys(STATS_SUFFIXES) as StatsFigure[];

/** A name per figure; an empty one means "no answer", not "a nameless property". */
export type StatsNames = Partial<Record<StatsFigure, string>>;

/** One note property derived from a track's figures; `null` for a figure the file never recorded. */
export interface StatsProperty {
	/** Which figure this is, so a caller can say what clashed by name. */
	figure: StatsFigure;
	/** The full property name: the figure's own configured name, or the prefixed default. */
	key: string;
	value: number | string | null;
}

/**
 * What a figure's property is called: the name configured for it, or the
 * prefixed default when none is.
 *
 * A configured name replaces the whole name rather than being suffixed onto the
 * prefix. The prefix exists to keep a generated family of names away from the
 * reader's own properties; a name the reader typed needs no such fence, and
 * putting one in front of it produces exactly what they were avoiding —
 * `track-距离` when they asked for `距离`.
 */
export function statsPropertyName(figure: StatsFigure, prefix: string, names: StatsNames = {}): string {
	const chosen = (names[figure] ?? '').trim();
	if (chosen !== '') return chosen;
	const head = normalizePrefix(prefix);
	// A prefix cleared to nothing still has to produce usable names rather than
	// ones that start with the separator.
	return head === '' ? STATS_SUFFIXES[figure] : `${head}-${STATS_SUFFIXES[figure]}`;
}

/** Rounded to what the source can support, and never `NaN` — the same guard the formatters above apply. */
function metric(value: number, places: number): number {
	const factor = 10 ** places;
	return Math.round(clampFinite(value) * factor) / factor;
}

/**
 * `YYYY-MM-DDTHH:mm` in this device's own timezone — the shape Obsidian types as
 * a `datetime` property.
 *
 * To the minute, and not to the second. Measured against Obsidian 1.13:
 * `2024-05-01T09:30` is inferred as `datetime`, `2024-05-01` as `date`, and
 * `2024-05-01T09:30:15` as plain **text**. A second field is not more precision
 * here — it is the difference between a property a base can sort as a time and
 * one it compares as a string. The seconds are dropped rather than rounded, so
 * the stamp names the minute the earliest point falls in.
 *
 * Local rather than UTC: a GPX timestamp is UTC and states no timezone, so the
 * trip's own local time is not recoverable from the file. Device-local is the
 * only available answer and the one that matches "I set off at nine". It is
 * stamped once, into text, so it does not move when the vault is opened
 * somewhere else — which is what a recorded date should do.
 */
export function localStamp(ms: number): string {
	const at = new Date(ms);
	const pad = (value: number, width = 2) => String(value).padStart(width, '0');
	const date = `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
	return `${date}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Trailing separators and surrounding space are how the box was typed, not part of a name. */
function normalizePrefix(prefix: string): string {
	return prefix.trim().replace(/[-_\s]+$/, '');
}

/**
 * A track's figures as note properties, in a fixed order, each under the name
 * `statsPropertyName` resolves for it.
 *
 * Every entry is returned every time. A `null` value means the file recorded
 * nothing behind that figure, and what that does to an existing property is the
 * caller's business rather than this function's.
 */
export function statsProperties(stats: TrackStats, prefix: string, names: StatsNames = {}): StatsProperty[] {
	const name = (figure: StatsFigure) => statsPropertyName(figure, prefix, names);
	const climb = (value: number | null) => (value === null ? null : metric(value, 0));
	const minutes = (ms: number | null) => (ms === null ? null : metric(ms / 60000, 0));
	const values: Record<StatsFigure, number | string | null> = {
		distance: metric(stats.distance / 1000, 2),
		ascent: climb(stats.ascent),
		descent: climb(stats.descent),
		lowest: climb(stats.minEle),
		highest: climb(stats.maxEle),
		duration: minutes(stats.duration),
		moving: minutes(stats.movingTime),
		speed: stats.speed === null ? null : metric((stats.speed * 3600) / 1000, 1),
		start: stats.start === null ? null : localStamp(stats.start),
	};
	return STATS_FIGURES.map((figure) => ({ figure, key: name(figure), value: values[figure] }));
}

/** The first two figures configured to one property name, or null when every name is its own. */
export function duplicateStatsName(
	properties: StatsProperty[]
): { key: string; figures: [StatsFigure, StatsFigure] } | null {
	const seen = new Map<string, StatsFigure>();
	for (const { figure, key } of properties) {
		const first = seen.get(key);
		// Refused rather than de-duplicated: a note whose ascent silently
		// overwrites its distance is worse than a command that does nothing.
		if (first !== undefined) return { key, figures: [first, figure] };
		seen.set(key, figure);
	}
	return null;
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
		for (const coords of linesOf(feature.geometry)) {
			let lastCoord: number[] | null = null;
			for (const pos of coords) {
				if (lastCoord) cumulative += haversine(lastCoord, pos);
				lastCoord = pos;

				const ele = pos[2];
				if (typeof ele === 'number' && isFinite(ele)) {
					full.push({ d: cumulative, ele, lng: pos[0], lat: pos[1] });
				}
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
