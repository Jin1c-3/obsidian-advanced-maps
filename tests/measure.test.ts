import { describe, expect, it } from 'vitest';
import type { Feature, Geometry, LineString, Point } from 'geojson';
import { toTileSpace } from '../src/coords';
import {
	cumulativeDistances,
	measureDrawing,
	measuredDistance,
	nearestSnap,
	type MeasureProps,
	type SnapCandidate,
} from '../src/measure';
import { formatDistance } from '../src/stats';

const wgs84 = (lng: number, lat: number): [number, number] => [lng, lat];

/** Two places on the Bund, a shade over 800 m apart. */
const A = { lng: 121.4901, lat: 31.2397 };
const B = { lng: 121.4952, lat: 31.2455 };
const C = { lng: 121.5013, lat: 31.2401 };

type MeasureFeature = Feature<Geometry, MeasureProps>;

function roles(features: MeasureFeature[]): string[] {
	return features.map((f) => f.properties.amMeasure);
}

function only(features: MeasureFeature[], role: string): MeasureFeature[] {
	return features.filter((f) => f.properties.amMeasure === role);
}

describe('cumulativeDistances', () => {
	it('starts at nothing and grows', () => {
		const cumulative = cumulativeDistances([A, B, C]);
		expect(cumulative[0]).toBe(0);
		expect(cumulative[1]).toBeGreaterThan(0);
		expect(cumulative[2]).toBeGreaterThan(cumulative[1]);
	});

	it('agrees with a straight two-point measurement to the metre', () => {
		// One degree of latitude on the mean sphere this plugin measures with.
		const [, one] = cumulativeDistances([
			{ lng: 0, lat: 0 },
			{ lng: 0, lat: 1 },
		]);
		expect(one).toBeCloseTo(111195, 0);
	});

	it('measures the short way round the 180th meridian', () => {
		const across = cumulativeDistances([
			{ lng: 179.5, lat: 0 },
			{ lng: -179.5, lat: 0 },
		]);
		// One degree of longitude at the equator, not 359 of them.
		expect(across[1]).toBeCloseTo(111195, 0);
	});

	it('answers for an empty tape and a tape of one', () => {
		expect(cumulativeDistances([])).toEqual([]);
		expect(cumulativeDistances([A])).toEqual([0]);
		expect(measuredDistance([])).toBe(0);
		expect(measuredDistance([A])).toBe(0);
	});
});

describe('measureDrawing: what is on the map', () => {
	it('draws nothing at all before the first click', () => {
		const { data, labels } = measureDrawing({ points: [], draft: B }, wgs84);
		expect(data.features).toEqual([]);
		expect(labels).toEqual([]);
	});

	it('draws one handle and no line for a single point', () => {
		const { data, labels } = measureDrawing({ points: [A], draft: null }, wgs84);
		expect(roles(data.features)).toEqual(['vertex']);
		// The first point is where the measurement starts; saying so is not a distance.
		expect(labels).toEqual([]);
	});

	it('draws the committed line, a handle per point, and a label per leg', () => {
		const { data, labels } = measureDrawing({ points: [A, B, C], draft: null }, wgs84);
		expect(roles(data.features)).toEqual(['path', 'vertex', 'vertex', 'vertex']);
		const path = only(data.features, 'path')[0].geometry as LineString;
		expect(path.coordinates).toHaveLength(3);
		expect(labels).toHaveLength(2);
		expect(labels.every((label) => !label.draft)).toBe(true);
		// Each label is pinned to the vertex it is the distance to.
		expect(labels[1].at).toEqual([C.lng, C.lat]);
	});

	it('adds one dashed segment and one live label for the leg under the pointer', () => {
		const { data, labels } = measureDrawing({ points: [A, B], draft: C }, wgs84);
		expect(roles(data.features)).toEqual(['path', 'draft', 'vertex', 'vertex']);
		const draft = only(data.features, 'draft')[0].geometry as LineString;
		// From the last committed point to the pointer, and no further back.
		expect(draft.coordinates).toEqual([
			[B.lng, B.lat],
			[C.lng, C.lat],
		]);
		expect(labels).toHaveLength(2);
		expect(labels[1].draft).toBe(true);
		expect(labels[1].at).toEqual([C.lng, C.lat]);
	});

	it('counts the pointer leg into the live label but never into the readout', () => {
		const committed = [A, B];
		const { labels } = measureDrawing({ points: committed, draft: C }, wgs84);
		// The live label is the whole tape including the leg being aimed…
		expect(labels[1].text).toBe(formatDistance(measuredDistance([A, B, C])));
		// …and the readout is what has actually been placed, which is less.
		expect(measuredDistance(committed)).toBeLessThan(measuredDistance([A, B, C]));
		expect(labels[0].text).toBe(formatDistance(measuredDistance(committed)));
	});
});

describe('measureDrawing: the datum boundary', () => {
	it('projects every drawn coordinate and leaves the measurement alone', () => {
		const points = [A, B];
		const { data, labels } = measureDrawing({ points, draft: null }, (lng, lat) => toTileSpace('gcj02', lng, lat));
		const path = only(data.features, 'path')[0].geometry as LineString;
		// Drawn where the Chinese tiles put these places…
		expect(path.coordinates[0][0]).not.toBeCloseTo(A.lng, 5);
		expect(path.coordinates[0]).toEqual(toTileSpace('gcj02', A.lng, A.lat));
		// …and the label still says the distance between the real ones.
		expect(labels[0].text).toBe(formatDistance(cumulativeDistances(points)[1]));
	});

	it('pins a label to the projected vertex it belongs to', () => {
		const { labels } = measureDrawing({ points: [A, B], draft: null }, (lng, lat) => toTileSpace('bd09', lng, lat));
		expect(labels[0].at).toEqual(toTileSpace('bd09', B.lng, B.lat));
	});
});

describe('measureDrawing: across the 180th meridian', () => {
	const west = { lng: 179.9, lat: -16.5 };
	const east = { lng: -179.9, lat: -16.6 };

	it('draws the short way, and puts the label on the segment it belongs to', () => {
		const { data, labels } = measureDrawing({ points: [west, east], draft: null }, wgs84);
		const path = only(data.features, 'path')[0].geometry as LineString;
		// Unwrapped: 180.1, not a line back across the whole world to -179.9.
		expect(path.coordinates[1][0]).toBeCloseTo(180.1, 6);
		expect(labels[0].at[0]).toBeCloseTo(180.1, 6);
	});

	it('unwraps the handles onto the same turn as the line', () => {
		const { data } = measureDrawing({ points: [west, east], draft: null }, wgs84);
		const handles = only(data.features, 'vertex').map((f) => (f.geometry as Point).coordinates[0]);
		expect(handles[1]).toBeCloseTo(180.1, 6);
	});

	it('carries the pointer leg over with it', () => {
		const { data } = measureDrawing({ points: [west, east], draft: { lng: -179.5, lat: -16.7 } }, wgs84);
		const draft = only(data.features, 'draft')[0].geometry as LineString;
		expect(draft.coordinates[0][0]).toBeCloseTo(180.1, 6);
		expect(draft.coordinates[1][0]).toBeCloseTo(180.5, 6);
	});
});

describe('nearestSnap', () => {
	const at = (x: number, y: number, lng = 0, lat = 0): SnapCandidate => ({ point: { lng, lat }, at: { x, y } });
	const pointer = { x: 100, y: 100 };

	it('offers nothing when nothing is close enough', () => {
		expect(nearestSnap(pointer, [at(120, 100), at(100, 130)], 12)).toBeNull();
		expect(nearestSnap(pointer, [], 12)).toBeNull();
	});

	it('offers the candidate nearest the pointer, not the first one in range', () => {
		const near = at(104, 100, 5, 5);
		const found = nearestSnap(pointer, [at(108, 100), near, at(100, 110)], 12);
		expect(found?.point).toEqual(near.point);
	});

	it('measures in both axes at once, so a corner of the box is out of range', () => {
		// 12 px right and 12 px down is 17 px away, and the radius is a radius.
		expect(nearestSnap(pointer, [at(112, 112)], 12)).toBeNull();
		expect(nearestSnap(pointer, [at(108, 108)], 12)).not.toBeNull();
	});

	it('keeps the first of two candidates at exactly the same distance', () => {
		const first = at(105, 100, 1, 1);
		const second = at(95, 100, 2, 2);
		expect(nearestSnap(pointer, [first, second], 12)?.point).toEqual(first.point);
	});

	it('skips a candidate the map could not place', () => {
		const real = at(110, 100, 3, 3);
		expect(nearestSnap(pointer, [at(NaN, NaN), real], 12)?.point).toEqual(real.point);
	});
});

describe('measureDrawing: the point a click would take', () => {
	it('rings the draft, and only when it is one already on the map', () => {
		const free = measureDrawing({ points: [A], draft: B }, wgs84);
		expect(roles(free.data.features)).toEqual(['draft', 'vertex']);
		const snapped = measureDrawing({ points: [A], draft: B, snapped: true }, wgs84);
		expect(roles(snapped.data.features)).toEqual(['draft', 'vertex', 'snap']);
		expect((only(snapped.data.features, 'snap')[0].geometry as Point).coordinates).toEqual([B.lng, B.lat]);
	});

	it('rings a point before the first one has been placed', () => {
		const { data, labels } = measureDrawing({ points: [], draft: A, snapped: true }, wgs84);
		// The ring and nothing else: no line to draw yet, and no distance to claim.
		expect(roles(data.features)).toEqual(['snap']);
		expect(labels).toEqual([]);
	});

	it('rings the projected coordinate, so the ring is on the pin the tiles drew', () => {
		const { data } = measureDrawing({ points: [A], draft: B, snapped: true }, (lng, lat) =>
			toTileSpace('gcj02', lng, lat)
		);
		expect((only(data.features, 'snap')[0].geometry as Point).coordinates).toEqual(
			toTileSpace('gcj02', B.lng, B.lat)
		);
	});

	it('rings a point east of the 180th meridian on the turn the line is drawn on', () => {
		const { data } = measureDrawing(
			{ points: [{ lng: 179.9, lat: -16.5 }], draft: { lng: -179.9, lat: -16.6 }, snapped: true },
			wgs84
		);
		expect((only(data.features, 'snap')[0].geometry as Point).coordinates[0]).toBeCloseTo(180.1, 6);
	});
});
