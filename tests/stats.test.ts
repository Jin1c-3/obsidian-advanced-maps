import { describe, expect, it } from 'vitest';
import {
	ASCENT_THRESHOLD_M,
	MOVING_SPEED_MPS,
	elevationProfile,
	formatDistance,
	formatDuration,
	formatElevation,
	formatSpeed,
	haversine,
	trackStats,
} from '../src/stats';
import type { Feature, Geometry } from 'geojson';

type Features = Array<Feature<Geometry, Record<string, unknown> | null>>;

function line(coords: number[][], times?: Array<number | null>): Features[number] {
	return {
		type: 'Feature',
		properties: times ? { times } : null,
		geometry: { type: 'LineString', coordinates: coords },
	};
}

function point(coord: number[]): Features[number] {
	return { type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: coord } };
}

describe('haversine', () => {
	it('is zero for a point against itself', () => {
		expect(haversine([116.4, 39.9], [116.4, 39.9])).toBe(0);
	});

	it('matches the analytic quarter-circumference distance from the equator to the pole', () => {
		// (0,0) to (0,90) is exactly a quarter of a great circle on a sphere of EARTH_RADIUS_M.
		const d = haversine([0, 0], [0, 90]);
		expect(d).toBeCloseTo((Math.PI * 6371008.8) / 2, 3);
	});

	it('matches the analytic quarter-circumference distance along the equator', () => {
		const d = haversine([0, 0], [90, 0]);
		expect(d).toBeCloseTo((Math.PI * 6371008.8) / 2, 3);
	});

	it('is unaffected by a third (elevation) member', () => {
		const a = haversine([0, 0, 100], [0, 0.01, 500]);
		const b = haversine([0, 0], [0, 0.01]);
		expect(a).toBe(b);
	});
});

describe('trackStats — empty and degenerate input', () => {
	it('is all zero/null for an empty feature list', () => {
		const s = trackStats([]);
		expect(s).toEqual({
			distance: 0,
			points: 0,
			ascent: null,
			descent: null,
			minEle: null,
			maxEle: null,
			start: null,
			end: null,
			duration: null,
			movingTime: null,
			speed: null,
		});
	});

	it('handles a LineString with a single point: counted, no distance, no crash', () => {
		const s = trackStats([line([[0, 0]])]);
		expect(s.points).toBe(1);
		expect(s.distance).toBe(0);
	});

	it('ignores a geometry type that is not a track segment', () => {
		const polygon: Features[number] = {
			type: 'Feature',
			properties: null,
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0],
					],
				],
			},
		};
		const s = trackStats([
			polygon,
			line([
				[0, 0],
				[0, 1],
			]),
		]);
		// Only the LineString's two points are considered.
		expect(s.points).toBe(2);
	});

	it('counts a waypoint as a position but not as distance', () => {
		const s = trackStats([
			point([116.4, 39.9]),
			line([
				[0, 0],
				[0, 1],
			]),
		]);
		expect(s.points).toBe(3); // 1 waypoint + 2 line points
		// Distance is only what the LineString itself covers.
		expect(s.distance).toBeCloseTo(haversine([0, 0], [0, 1]), 6);
	});
});

describe('trackStats — distance', () => {
	it('sums haversine over consecutive points within a LineString', () => {
		const coords = [
			[116.397428, 39.90923],
			[116.398, 39.91],
			[116.399, 39.911],
		];
		const s = trackStats([line(coords)]);
		const expected = haversine(coords[0], coords[1]) + haversine(coords[1], coords[2]);
		expect(s.distance).toBeCloseTo(expected, 6);
	});

	it('never measures a jump between the end of one LineString and the start of the next', () => {
		const near = line([
			[0, 0],
			[0, 0.001],
		]);
		// Far away — if the gap between features were measured, distance would be huge.
		const far = line([
			[100, 40],
			[100, 40.001],
		]);
		const s = trackStats([near, far]);
		const expected = haversine([0, 0], [0, 0.001]) + haversine([100, 40], [100, 40.001]);
		expect(s.distance).toBeCloseTo(expected, 6);
		expect(s.distance).toBeLessThan(1000); // nowhere near the ~11,000 km cross-feature jump
	});
});

describe('trackStats — ascent/descent (hysteresis)', () => {
	it('reports null when no feature carries elevation anywhere', () => {
		const s = trackStats([
			line([
				[0, 0],
				[0, 1],
			]),
		]);
		expect(s.ascent).toBeNull();
		expect(s.descent).toBeNull();
		expect(s.minEle).toBeNull();
		expect(s.maxEle).toBeNull();
	});

	it('a flat but noisy track (±3 m jitter) climbs nothing once filtered, unlike the naive sum', () => {
		// 21 points oscillating in a 6 m band around 100 m — below ASCENT_THRESHOLD_M (5 m).
		const eles = [
			100, 103, 100, 97, 100, 103, 100, 97, 100, 103, 100, 97, 100, 103, 100, 97, 100, 103, 100, 97, 100,
		];
		const coords = eles.map((ele, i) => [0, i * 0.0001, ele]);

		// The naive sum of positive deltas — what a buggy implementation would produce.
		let naive = 0;
		for (let i = 1; i < eles.length; i++) {
			const d = eles[i] - eles[i - 1];
			if (d > 0) naive += d;
		}
		expect(naive).toBe(30); // the naive answer is large (30 m of "climb" on a flat track) and wrong

		const s = trackStats([line(coords)]);
		expect(s.ascent).toBe(0); // the correct answer is 0
		expect(s.descent).toBe(0);
	});

	it('credits a real, gradual climb in full even though it commits in threshold-sized steps', () => {
		// A steady 40 m climb over 8 steps of 5 m each — each step exactly at the threshold.
		const eles = [100, 105, 110, 115, 120, 125, 130, 135, 140];
		const coords = eles.map((ele, i) => [0, i * 0.0001, ele]);
		const s = trackStats([line(coords)]);
		expect(s.ascent).toBe(40);
		expect(s.descent).toBe(0);
	});

	it('sums ascent/descent across multiple LineStrings', () => {
		const up = line([
			[0, 0, 100],
			[0, 0.001, 120],
		]);
		const down = line([
			[1, 0, 200],
			[1, 0.001, 170],
		]);
		const s = trackStats([up, down]);
		expect(s.ascent).toBe(20);
		expect(s.descent).toBe(30);
	});

	it('skips points with no elevation, in a line where some points have it and some do not', () => {
		// [0,0,100] -> [0,0.001] (no ele) -> [0,0.002,130]: the gap is bridged, treating 100→130 as the sequence.
		const s = trackStats([
			line([
				[0, 0, 100],
				[0, 0.001],
				[0, 0.002, 130],
			]),
		]);
		expect(s.ascent).toBe(30);
	});

	it('tracks minEle/maxEle across LineStrings and waypoints together', () => {
		const s = trackStats([
			line([
				[0, 0, 50],
				[0, 0.001, 80],
			]),
			point([1, 1, 10]), // lower than anything on the line
		]);
		expect(s.minEle).toBe(10);
		expect(s.maxEle).toBe(80);
	});
});

describe('trackStats — times, duration, moving time, speed', () => {
	it('is null for start/end/duration/movingTime/speed when no feature carries times', () => {
		const s = trackStats([
			line([
				[0, 0],
				[0, 1],
			]),
		]);
		expect(s.start).toBeNull();
		expect(s.end).toBeNull();
		expect(s.duration).toBeNull();
		expect(s.movingTime).toBeNull();
		expect(s.speed).toBeNull();
	});

	it('computes start/end/duration from the min and max timestamp seen', () => {
		const t0 = 1_000_000;
		const s = trackStats([
			line(
				[
					[0, 0],
					[0, 0.01],
					[0, 0.02],
				],
				[t0, t0 + 10_000, t0 + 20_000]
			),
		]);
		expect(s.start).toBe(t0);
		expect(s.end).toBe(t0 + 20_000);
		expect(s.duration).toBe(20_000);
	});

	it('excludes a stop (implied speed under MOVING_SPEED_MPS) from moving time', () => {
		// Two points 1 m apart (a "lunch stop"), 10 minutes apart in time —
		// far below MOVING_SPEED_MPS — followed by a real move.
		const t0 = 1_000_000;
		const stopLat = 1 / 111_320; // ~1 m of latitude
		const s = trackStats([
			line(
				[
					[0, 0],
					[0, stopLat],
					[0, 0.01],
				],
				[t0, t0 + 10 * 60_000, t0 + 10 * 60_000 + 10_000]
			),
		]);
		const movingSeg = haversine([0, stopLat], [0, 0.01]);
		expect(movingSeg / 10).toBeGreaterThan(MOVING_SPEED_MPS); // sanity: the second leg is "moving"
		expect(s.movingTime).toBe(10_000); // only the second, genuinely-moving interval counts
		expect(s.duration).toBe(10 * 60_000 + 10_000); // wall-clock still counts the stop
	});

	it('counts a slow uphill pace as moving, not as a stop', () => {
		// 1.4 km/h — an ordinary pace on stone steps, and the case a 0.5 m/s
		// threshold silently threw away: measured on a real 300 m climb it
		// discarded nearly twenty minutes of walking as if it were resting.
		const t0 = 0;
		const metres = 1 / 111_320;
		const leg = 100 * metres;
		const seconds = 100 / 0.39;
		const s = trackStats([
			line(
				[
					[0, 0],
					[0, leg],
				],
				[t0, t0 + Math.round(seconds * 1000)]
			),
		]);
		expect(s.movingTime).toBe(s.duration);
	});

	it('computes speed as distance / movingTime, the moving average not the overall one', () => {
		const t0 = 0;
		const stopLat = 1 / 111_320;
		const s = trackStats([
			line(
				[
					[0, 0],
					[0, stopLat],
					[0, 0.01],
				],
				[t0, t0 + 600_000, t0 + 610_000]
			),
		]);
		// The numerator is the *whole* track's distance (including the near-zero
		// creep during the stop) — it is only the denominator, movingTime, that
		// excludes the stop. That is what makes this the moving average rather
		// than the overall one: a shorter time divisor over the same distance.
		const totalDistance = haversine([0, 0], [0, stopLat]) + haversine([0, stopLat], [0, 0.01]);
		expect(s.speed).toBeCloseTo(totalDistance / 10, 6); // 10 s of moving time
	});

	it('does not let a backwards timestamp produce a negative moving time', () => {
		// Second point's time is earlier than the first's — a real thing in merged exports.
		const s = trackStats([
			line(
				[
					[0, 0],
					[0, 0.01],
					[0, 0.02],
				],
				[10_000, 5_000, 20_000]
			),
		]);
		expect(s.movingTime).not.toBeNull();
		expect(s.movingTime as number).toBeGreaterThanOrEqual(0);
		// start/end are min/max regardless of order, so duration is still non-negative.
		expect(s.start).toBe(5_000);
		expect(s.end).toBe(20_000);
		expect(s.duration).toBe(15_000);
	});

	it('trusts the shorter array when times is shorter than coordinates', () => {
		const s = trackStats([
			line(
				[
					[0, 0],
					[0, 0.01],
					[0, 0.02],
				],
				[1000, 2000]
			),
		]);
		// Only two timestamps for three points: the third point has no time, so
		// only one interval (1000 -> 2000) is ever measurable.
		expect(s.start).toBe(1000);
		expect(s.end).toBe(2000);
	});

	it('trusts the shorter array when times is longer than coordinates', () => {
		const s = trackStats([
			line(
				[
					[0, 0],
					[0, 0.01],
				],
				[1000, 2000, 3000, 4000]
			),
		]);
		expect(s.end).toBe(2000); // the extra entries past coordinates.length are never read
	});

	it('treats a null entry in times as an unknown timestamp, not zero', () => {
		const s = trackStats([
			line(
				[
					[0, 0],
					[0, 0.01],
					[0, 0.02],
				],
				[1000, null, 3000]
			),
		]);
		expect(s.start).toBe(1000);
		expect(s.end).toBe(3000);
	});
});

describe('formatDistance', () => {
	it('shows metres below 1000', () => {
		expect(formatDistance(840)).toBe('840 m');
		expect(formatDistance(999)).toBe('999 m');
	});

	it('switches to km with one decimal at the 1000 m boundary', () => {
		expect(formatDistance(1000)).toBe('1.0 km');
		expect(formatDistance(13600)).toBe('13.6 km');
	});

	it('never prints NaN for a non-finite or zero input', () => {
		expect(formatDistance(0)).toBe('0 m');
		expect(formatDistance(NaN)).toBe('0 m');
		expect(formatDistance(-5)).toBe('0 m');
		expect(formatDistance(Infinity)).toBe('0 m');
	});
});

describe('formatDuration', () => {
	it('omits the hour field below an hour', () => {
		expect(formatDuration(41 * 60_000 + 5_000)).toBe('41:05');
	});

	it('shows the hour field at and above an hour', () => {
		expect(formatDuration(2 * 3_600_000 + 41 * 60_000 + 5_000)).toBe('2:41:05');
	});

	it('the 59:59 / 1:00:00 boundary', () => {
		expect(formatDuration(59 * 60_000 + 59_000)).toBe('59:59');
		expect(formatDuration(60 * 60_000)).toBe('1:00:00');
	});

	it('never prints NaN for a non-finite or zero input', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(NaN)).toBe('0:00');
		expect(formatDuration(-1000)).toBe('0:00');
	});
});

describe('formatSpeed', () => {
	it('converts m/s to km/h with one decimal', () => {
		expect(formatSpeed(1.4166666)).toBe('5.1 km/h');
	});

	it('never prints NaN for a non-finite or zero input', () => {
		expect(formatSpeed(0)).toBe('0.0 km/h');
		expect(formatSpeed(NaN)).toBe('0.0 km/h');
		expect(formatSpeed(-2)).toBe('0.0 km/h');
	});
});

describe('formatElevation', () => {
	it('rounds to the nearest metre', () => {
		expect(formatElevation(419.6)).toBe('420 m');
	});

	it('allows negative elevation (below sea level), unlike distance/speed', () => {
		expect(formatElevation(-86)).toBe('-86 m');
	});

	it('never prints NaN for a non-finite input', () => {
		expect(formatElevation(NaN)).toBe('0 m');
	});
});

describe('elevationProfile', () => {
	it('is empty when there is no elevation data', () => {
		expect(
			elevationProfile([
				line([
					[0, 0],
					[0, 1],
				]),
			])
		).toEqual([]);
	});

	it('is empty for an empty feature list', () => {
		expect(elevationProfile([])).toEqual([]);
	});

	it('returns cumulative distance against elevation for every point when under the sample cap', () => {
		const coords = [
			[0, 0, 10],
			[0, 0.001, 20],
			[0, 0.002, 15],
		];
		const profile = elevationProfile([line(coords)]);
		expect(profile).toHaveLength(3);
		expect(profile[0]).toEqual({ d: 0, ele: 10 });
		expect(profile[1].d).toBeCloseTo(haversine(coords[0], coords[1]), 6);
		expect(profile[2].ele).toBe(15);
	});

	it('carries cumulative distance across a LineString boundary without adding a bogus cross-segment jump', () => {
		const a = line([
			[0, 0, 10],
			[0, 0.001, 11],
		]);
		const b = line([
			[0, 0.002, 12],
			[0, 0.003, 13],
		]);
		const profile = elevationProfile([a, b]);
		expect(profile).toHaveLength(4);
		// The first point of `b` picks up exactly where `a` left off — same `d` as
		// the last point of `a` — because no distance is measured *between*
		// LineStrings, mirroring trackStats' own rule for `distance`.
		expect(profile[2].d).toBe(profile[1].d);
		// But distance keeps accumulating *within* `b` from there.
		expect(profile[3].d).toBeGreaterThan(profile[2].d);
	});

	it('downsamples to at most `samples` points, always keeping the first and last', () => {
		const coords: number[][] = [];
		for (let i = 0; i < 1000; i++) coords.push([0, i * 0.0001, i]);
		const profile = elevationProfile([line(coords)], 100);
		expect(profile.length).toBeLessThanOrEqual(100);
		expect(profile[0]).toEqual({ d: 0, ele: 0 });
		expect(profile[profile.length - 1]).toEqual({ d: expect.any(Number) as number, ele: 999 });
	});

	it('uses the default sample cap when none is given', () => {
		const coords: number[][] = [];
		for (let i = 0; i < 5000; i++) coords.push([0, i * 0.0001, i]);
		const profile = elevationProfile([line(coords)]);
		expect(profile.length).toBeLessThanOrEqual(160);
	});

	it('ignores a non-LineString feature rather than plotting it', () => {
		const s = elevationProfile([
			point([0, 0, 50]),
			line([
				[0, 0, 10],
				[0, 0.001, 20],
			]),
		]);
		expect(s).toHaveLength(2);
		expect(s[0]).toEqual({ d: 0, ele: 10 });
	});

	it('handles a degenerate sample cap of 1 by returning just the last point', () => {
		const coords: number[][] = [];
		for (let i = 0; i < 50; i++) coords.push([0, i * 0.0001, i]);
		expect(elevationProfile([line(coords)], 1)).toEqual([{ d: expect.any(Number) as number, ele: 49 }]);
	});

	it('skips positions with no elevation but keeps their distance folded into the next known point', () => {
		const coords = [
			[0, 0, 10],
			[0, 0.001], // no elevation
			[0, 0.002, 20],
		];
		const profile = elevationProfile([line(coords)]);
		expect(profile).toHaveLength(2);
		expect(profile[1].d).toBeCloseTo(haversine(coords[0], coords[1]) + haversine(coords[1], coords[2]), 6);
	});
});

describe('exported constants', () => {
	it('ASCENT_THRESHOLD_M is the conventional 5 m', () => {
		expect(ASCENT_THRESHOLD_M).toBe(5);
	});

	it('MOVING_SPEED_MPS is below any walking pace', () => {
		expect(MOVING_SPEED_MPS).toBe(0.25);
	});
});
