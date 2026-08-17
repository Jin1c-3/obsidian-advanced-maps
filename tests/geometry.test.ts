import type { Feature, Geometry } from 'geojson';
import { describe, expect, it, vi } from 'vitest';
import {
	boundsOf,
	clamp,
	extendBounds,
	lineEndpoints,
	styleReady,
	styleUsable,
	trackFeatures,
	trackKnob,
	unwrapGeometry,
	walkCoords,
} from '../src/geometry';
import { TRACK_KNOBS } from '../src/constants';
import type { LngLatBounds, MapLibreMap } from '../src/types/obsidian-internals';

/** Stands in for MapLibre's LngLatBounds, which only needs to collect points. */
function fakeBounds() {
	const seen: unknown[] = [];
	const bounds: LngLatBounds = {
		extend(value) {
			seen.push(value);
			return bounds;
		},
		isEmpty: () => seen.length === 0,
	};
	return { bounds, seen };
}

/**
 * `boundsOf` mints its bounds off the map, the way `emptyBounds` does — MapLibre
 * exports no constructor to import, so a fresh one is built from `getBounds()`'s
 * own class. This stub supplies that class.
 */
function boundsMakingMap() {
	class FakeBounds implements LngLatBounds {
		readonly seen: unknown[] = [];
		extend(value: unknown): LngLatBounds {
			this.seen.push(value);
			return this;
		}
		isEmpty(): boolean {
			return this.seen.length === 0;
		}
	}
	return { getBounds: () => new FakeBounds() } as unknown as MapLibreMap;
}

describe('walkCoords', () => {
	it('reaches every pair at any nesting depth', () => {
		const seen: Array<[number, number]> = [];
		walkCoords(
			[
				[[1, 2]],
				[
					[3, 4],
					[5, 6],
				],
			],
			(lng, lat) => seen.push([lng, lat])
		);
		expect(seen).toEqual([
			[1, 2],
			[3, 4],
			[5, 6],
		]);
	});

	it('skips pairs that are not finite numbers', () => {
		const seen: Array<[number, number]> = [];
		walkCoords(
			[
				[NaN, 2],
				[1, Infinity],
				[3, 4],
			],
			(lng, lat) => seen.push([lng, lat])
		);
		expect(seen).toEqual([[3, 4]]);
	});

	it('does nothing with an empty list or a non-list', () => {
		const fn = vi.fn();
		walkCoords([], fn);
		walkCoords('nope', fn);
		walkCoords(undefined, fn);
		expect(fn).not.toHaveBeenCalled();
	});
});

describe('extendBounds', () => {
	it('counts every point it feeds in', () => {
		const { bounds, seen } = fakeBounds();
		const n = extendBounds(bounds, {
			type: 'LineString',
			coordinates: [
				[1, 2],
				[3, 4],
			],
		});
		expect(n).toBe(2);
		expect(seen).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it('walks into a GeometryCollection', () => {
		const { bounds } = fakeBounds();
		const n = extendBounds(bounds, {
			type: 'GeometryCollection',
			geometries: [
				{ type: 'Point', coordinates: [1, 2] },
				{
					type: 'LineString',
					coordinates: [
						[3, 4],
						[5, 6],
					],
				},
			],
		});
		expect(n).toBe(3);
	});

	it('counts nothing for a missing geometry', () => {
		const { bounds } = fakeBounds();
		expect(extendBounds(bounds, null)).toBe(0);
		expect(extendBounds(bounds, undefined)).toBe(0);
	});
});

describe('unwrapGeometry', () => {
	/** The Fiji track the live check used: five positions, 166 km, crossing east. */
	const crossing: Geometry = {
		type: 'LineString',
		coordinates: [
			[179.2, -16.8],
			[179.6, -16.9],
			[179.95, -17.0],
			[-179.7, -17.1],
			[-179.3, -17.2],
		],
	};

	const lngsOf = (geometry: Geometry): number[] =>
		(geometry as { coordinates: number[][] }).coordinates.map((position) => position[0]);

	it('continues past 180 for a track crossing eastward', () => {
		// 179.95 → -179.7 is 39 km on the ground and 359.65° in the numbers, which
		// is what drew the line back around the world and framed the whole globe.
		expect(lngsOf(unwrapGeometry(crossing))).toEqual([179.2, 179.6, 179.95, 180.3, 180.7]);
	});

	it('continues below -180 for a track crossing westward', () => {
		const west: Geometry = {
			type: 'LineString',
			coordinates: [
				[-179.3, -17.2],
				[-179.7, -17.1],
				[179.95, -17.0],
				[179.6, -16.9],
			],
		};
		expect(lngsOf(unwrapGeometry(west))).toEqual([-179.3, -179.7, -180.05, -180.4]);
	});

	it('answers the very same object when nothing crosses', () => {
		const ordinary: Geometry = {
			type: 'LineString',
			coordinates: [
				[121.4, 31.2],
				[121.5, 31.3],
			],
		};
		// Identity, not equality: an untouched vault must allocate nothing here,
		// and the caller's array is the cached record statistics read from.
		expect(unwrapGeometry(ordinary)).toBe(ordinary);
	});

	it('leaves a file that already wrote unwrapped longitudes alone', () => {
		const already: Geometry = {
			type: 'LineString',
			coordinates: [
				[179.95, -17],
				[180.3, -17.1],
			],
		};
		expect(unwrapGeometry(already)).toBe(already);
	});

	it('leaves a step of exactly half a turn as the file wrote it', () => {
		const exact: Geometry = {
			type: 'LineString',
			coordinates: [
				[0, 0],
				[180, 0],
			],
		};
		// Both ways round are the same distance, so there is nothing to correct.
		expect(unwrapGeometry(exact)).toBe(exact);
	});

	it('keeps elevation and any other trailing members', () => {
		const withEle: Geometry = {
			type: 'LineString',
			coordinates: [
				[179.95, -17, 12, 99],
				[-179.7, -17.1, 34, 98],
			],
		};
		expect((unwrapGeometry(withEle) as { coordinates: number[][] }).coordinates[1]).toEqual([180.3, -17.1, 34, 98]);
	});

	it('unwraps each ring of a polygon on its own and keeps ring order', () => {
		const area: Geometry = {
			type: 'Polygon',
			coordinates: [
				[
					[179.5, -17],
					[-179.5, -17],
					[-179.5, -17.5],
					[179.5, -17],
				],
				[
					[179.8, -17.1],
					[-179.8, -17.1],
					[-179.8, -17.2],
					[179.8, -17.1],
				],
			],
		};
		const rings = (unwrapGeometry(area) as { coordinates: number[][][] }).coordinates;
		expect(rings).toHaveLength(2);
		expect(rings[0].map((p) => p[0])).toEqual([179.5, 180.5, 180.5, 179.5]);
		// A hole is a closed path in its own right and crosses independently.
		expect(rings[1].map((p) => p[0])).toEqual([179.8, 180.2, 180.2, 179.8]);
	});

	it('reaches a crossing line inside a GeometryCollection', () => {
		const collection: Geometry = { type: 'GeometryCollection', geometries: [crossing] };
		const inner = (unwrapGeometry(collection) as { geometries: Geometry[] }).geometries[0];
		expect(lngsOf(inner)).toEqual([179.2, 179.6, 179.95, 180.3, 180.7]);
	});

	it('never moves a point or a multi-point', () => {
		const point: Geometry = { type: 'Point', coordinates: [-179.7, -17.1] };
		const scattered: Geometry = {
			type: 'MultiPoint',
			// Two photos on opposite sides of the meridian are two places, not a
			// path — moving either would put it at a coordinate it does not have.
			coordinates: [
				[179.95, -17],
				[-179.7, -17.1],
			],
		};
		expect(unwrapGeometry(point)).toBe(point);
		expect(unwrapGeometry(scattered)).toBe(scattered);
	});
});

describe('boundsOf', () => {
	const map = boundsMakingMap();

	it('covers every geometry it is given', () => {
		const bounds = boundsOf(map, [
			{ type: 'Point', coordinates: [1, 2] },
			{
				type: 'LineString',
				coordinates: [
					[3, 4],
					[5, 6],
				],
			},
		]);
		expect((bounds as unknown as { seen: unknown[] }).seen).toEqual([
			[1, 2],
			[3, 4],
			[5, 6],
		]);
	});

	// Null is what tells a caller "nothing to frame" apart from "framed on one
	// point" — fit() and the embed both bail on it rather than calling fitBounds.
	it('answers null when there was nothing finite to cover', () => {
		expect(boundsOf(map, [])).toBeNull();
		expect(boundsOf(map, [null, undefined])).toBeNull();
		expect(boundsOf(map, [{ type: 'LineString', coordinates: [] }])).toBeNull();
	});

	it('starts from a seed bounds, which counts on its own', () => {
		const seed = fakeBounds();
		seed.bounds.extend([9, 9]);
		const bounds = boundsOf(map, [], seed.bounds);
		expect(bounds).not.toBeNull();
		expect((bounds as unknown as { seen: unknown[] }).seen).toEqual([seed.bounds]);
	});

	it('ignores an empty seed rather than counting it as a point', () => {
		expect(boundsOf(map, [], fakeBounds().bounds)).toBeNull();
	});
});

describe('lineEndpoints', () => {
	it('answers first and last coordinate of a LineString', () => {
		const geometry: Geometry = {
			type: 'LineString',
			coordinates: [
				[1, 2],
				[3, 4],
				[5, 6],
			],
		};
		expect(lineEndpoints(geometry)).toEqual([
			[1, 2],
			[5, 6],
		]);
	});

	it('answers the same coordinate twice for a one-point LineString', () => {
		const geometry: Geometry = { type: 'LineString', coordinates: [[7, 8]] };
		expect(lineEndpoints(geometry)).toEqual([
			[7, 8],
			[7, 8],
		]);
	});

	it('answers null for a LineString with no coordinates', () => {
		expect(lineEndpoints({ type: 'LineString', coordinates: [] })).toBeNull();
	});

	it('walks a MultiLineString to its true first and last coordinate', () => {
		const geometry: Geometry = {
			type: 'MultiLineString',
			coordinates: [
				[
					[1, 1],
					[2, 2],
				],
				[
					[3, 3],
					[4, 4],
				],
			],
		};
		expect(lineEndpoints(geometry)).toEqual([
			[1, 1],
			[4, 4],
		]);
	});

	it('skips an empty sub-line inside a MultiLineString', () => {
		const geometry: Geometry = {
			type: 'MultiLineString',
			coordinates: [
				[],
				[
					[9, 9],
					[10, 10],
				],
				[],
			],
		};
		expect(lineEndpoints(geometry)).toEqual([
			[9, 9],
			[10, 10],
		]);
	});

	it('answers null for a MultiLineString whose every sub-line is empty', () => {
		expect(lineEndpoints({ type: 'MultiLineString', coordinates: [[], []] })).toBeNull();
		expect(lineEndpoints({ type: 'MultiLineString', coordinates: [] })).toBeNull();
	});

	it('answers null for a geometry with no line to walk', () => {
		expect(lineEndpoints({ type: 'Point', coordinates: [1, 2] })).toBeNull();
		expect(
			lineEndpoints({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0],
					],
				],
			})
		).toBeNull();
		expect(lineEndpoints({ type: 'GeometryCollection', geometries: [] })).toBeNull();
	});
});

describe('trackFeatures', () => {
	type Input = Array<Feature<Geometry, Record<string, unknown> | null>>;

	it('names the file every feature came from, so one note carrying two tracks stays separable', () => {
		const line = (x: number): Input[number] => ({
			type: 'Feature',
			properties: null,
			geometry: {
				type: 'LineString',
				coordinates: [
					[x, 0],
					[x + 1, 1],
				],
			},
		});
		// One note, so both draws share an index; only the path tells them apart.
		const morning = trackFeatures([line(0)], '#f00', 7, 'tracks/morning.gpx');
		const evening = trackFeatures([line(10)], '#f00', 7, 'tracks/evening.gpx');

		expect(morning.map((f) => f.properties.amPath)).toEqual([
			'tracks/morning.gpx',
			'tracks/morning.gpx',
			'tracks/morning.gpx',
		]);
		expect(evening.every((f) => f.properties.amPath === 'tracks/evening.gpx')).toBe(true);
		expect(new Set([...morning, ...evening].map((f) => f.properties.amIndex))).toEqual(new Set([7]));
		// The line and both endpoints, so pointing at either end says the same thing.
		expect(morning.map((f) => f.properties.amRole)).toEqual([undefined, 'start', 'end']);
	});

	it('names no file when there is none to name', () => {
		const input: Input = [{ type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [1, 1] } }];
		const [out] = trackFeatures(input, '#f00', 0, '');
		expect(out.properties.amPath).toBeUndefined();
	});

	it('carries a line, its two synthetic endpoints, and a plain point through unchanged', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: null,
				geometry: {
					type: 'LineString',
					coordinates: [
						[1, 2],
						[3, 4],
					],
				},
			},
			{ type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [5, 6] } },
		];
		const out = trackFeatures(input, '#f00', 2, 'tracks/a.gpx');
		expect(out).toHaveLength(4);

		expect(out[0]).toEqual({
			type: 'Feature',
			geometry: input[0].geometry,
			properties: { amColor: '#f00', amIndex: 2, amPath: 'tracks/a.gpx' },
		});
		expect(out[1]).toEqual({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [1, 2] },
			properties: { amColor: '#f00', amIndex: 2, amPath: 'tracks/a.gpx', amRole: 'start' },
		});
		expect(out[2]).toEqual({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [3, 4] },
			properties: { amColor: '#f00', amIndex: 2, amPath: 'tracks/a.gpx', amRole: 'end' },
		});
		expect(out[3]).toEqual({
			type: 'Feature',
			geometry: input[1].geometry,
			properties: { amColor: '#f00', amIndex: 2, amPath: 'tracks/a.gpx' },
		});
	});

	it('carries an area through with its note colour and mints no endpoints for it', () => {
		const input: Input = [
			{
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
			},
		];
		const out = trackFeatures(input, '#f00', 3, 'tracks/a.gpx');
		// A ring is a closed line, so start and end would land on the same point
		// and claim a direction the area does not have.
		expect(out).toHaveLength(1);
		expect(out[0]).toEqual({
			type: 'Feature',
			geometry: input[0].geometry,
			properties: { amColor: '#f00', amIndex: 3, amPath: 'tracks/a.gpx' },
		});
	});

	it('draws a crossing line unwrapped, with its endpoints on the drawn path', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: null,
				geometry: {
					type: 'LineString',
					coordinates: [
						[179.95, -17],
						[-179.7, -17.1],
					],
				},
			},
		];
		const before = JSON.stringify(input[0].geometry);
		const out = trackFeatures(input, '#f00', 0, 'tracks/a.gpx');

		expect((out[0].geometry as { coordinates: number[][] }).coordinates).toEqual([
			[179.95, -17],
			[180.3, -17.1],
		]);
		// The end marker follows the line rather than staying a world behind it.
		expect(out[1].properties.amRole).toBe('start');
		expect((out[1].geometry as { coordinates: number[] }).coordinates).toEqual([179.95, -17]);
		expect(out[2].properties.amRole).toBe('end');
		expect((out[2].geometry as { coordinates: number[] }).coordinates).toEqual([180.3, -17.1]);

		// The parsed record is shared and memoized, and statistics measure from
		// it, so drawing must not write through to it.
		expect(JSON.stringify(input[0].geometry)).toBe(before);
	});

	it('gives the framing bounds the route rather than the globe', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: null,
				geometry: {
					type: 'LineString',
					coordinates: [
						[179.2, -16.8],
						[179.95, -17],
						[-179.3, -17.2],
					],
				},
			},
		];
		const drawn = trackFeatures(input, '#f00', 0, 'tracks/a.gpx').map((feature) => feature.geometry);
		const bounds = boundsOf(boundsMakingMap(), drawn) as unknown as { seen: number[][] };
		const lngs = bounds.seen.map((position) => position[0]);

		// 179.2 to 180.7 is the 1.5° the track actually covers; before unwrapping
		// the same three positions asked the camera to fit 359.65°.
		expect(Math.min(...lngs)).toBeCloseTo(179.2);
		expect(Math.max(...lngs)).toBeCloseTo(180.7);
	});

	it('carries a named waypoint’s own name as amName', () => {
		const input: Input = [
			{ type: 'Feature', properties: { name: 'Bund' }, geometry: { type: 'Point', coordinates: [1, 1] } },
		];
		const [out] = trackFeatures(input, '#0f0', 0, 'tracks/a.gpx');
		expect(out.properties.amName).toBe('Bund');
	});

	it('never puts a name on a LineString, even when its source named one (the KML case)', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: { name: 'Trail A' },
				geometry: {
					type: 'LineString',
					coordinates: [
						[0, 0],
						[1, 1],
					],
				},
			},
		];
		const [line] = trackFeatures(input, '#00f', 0, 'tracks/a.gpx');
		expect(line.properties.amName).toBeUndefined();
	});

	it('treats an empty or non-string name as absent, not as amName: ""', () => {
		const input: Input = [
			{ type: 'Feature', properties: { name: '' }, geometry: { type: 'Point', coordinates: [0, 0] } },
			{ type: 'Feature', properties: { name: 42 }, geometry: { type: 'Point', coordinates: [1, 1] } },
		];
		const out = trackFeatures(input, '#000', 0, 'tracks/a.gpx');
		for (const feature of out) expect('amName' in feature.properties).toBe(false);
	});

	it('carries a photo point’s amRole, amPhoto and amPath through unchanged', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: { amRole: 'photo', amPhoto: 'advanced-maps-photo-assets/a.jpg', amPath: 'assets/a.jpg' },
				geometry: { type: 'Point', coordinates: [120.1, 30.2] },
			},
		];
		const [out] = trackFeatures(input, '#0f0', 0, 'tracks/a.gpx');
		expect(out.properties).toEqual({
			amColor: '#0f0',
			amIndex: 0,
			amRole: 'photo',
			amPhoto: 'advanced-maps-photo-assets/a.jpg',
			amPath: 'assets/a.jpg',
		});
		// A photo is a Point, so lineEndpoints() answers null for it — no
		// synthetic start/end pair grows out of a photo the way one does for a
		// line, which the length check below is what proves.
		expect(trackFeatures(input, '#0f0', 0, 'tracks/a.gpx')).toHaveLength(1);
	});

	it('carries a photo point with no thumbnail (amPhoto absent) through with amRole/amPath alone', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: { amRole: 'photo', amPath: 'assets/no-thumb.heic' },
				geometry: { type: 'Point', coordinates: [1, 1] },
			},
		];
		const [out] = trackFeatures(input, '#000', 3, 'tracks/a.gpx');
		expect(out.properties).toEqual({
			amColor: '#000',
			amIndex: 3,
			amRole: 'photo',
			amPath: 'assets/no-thumb.heic',
		});
		expect('amPhoto' in out.properties).toBe(false);
	});

	it('never mistakes a real waypoint for a photo just because it sits beside amRole-shaped junk', () => {
		// An ordinary waypoint's properties never carry amRole at all — this
		// pins the negative: no name, no amRole, no amPhoto/amPath leak in.
		const input: Input = [
			{ type: 'Feature', properties: { name: 'Pavilion' }, geometry: { type: 'Point', coordinates: [2, 2] } },
		];
		const [out] = trackFeatures(input, '#fff', 0, 'tracks/a.gpx');
		expect(out.properties).toEqual({ amColor: '#fff', amIndex: 0, amName: 'Pavilion', amPath: 'tracks/a.gpx' });
	});

	it('drops a non-string amPhoto and replaces a non-string amPath with the file it was read from', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: { amRole: 'photo', amPhoto: 42, amPath: null },
				geometry: { type: 'Point', coordinates: [0, 0] },
			},
		];
		const [out] = trackFeatures(input, '#fff', 0, 'tracks/a.gpx');
		expect(out.properties).toEqual({ amColor: '#fff', amIndex: 0, amRole: 'photo', amPath: 'tracks/a.gpx' });
	});

	it('yields two synthetic endpoints for a MultiLineString too', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: null,
				geometry: {
					type: 'MultiLineString',
					coordinates: [
						[
							[0, 0],
							[1, 1],
						],
						[
							[2, 2],
							[3, 3],
						],
					],
				},
			},
		];
		const out = trackFeatures(input, '#fff', 5, 'tracks/a.gpx');
		const roles = out.map((f) => f.properties.amRole);
		expect(roles).toEqual([undefined, 'start', 'end']);
		expect(out[1].geometry).toEqual({ type: 'Point', coordinates: [0, 0] });
		expect(out[2].geometry).toEqual({ type: 'Point', coordinates: [3, 3] });
	});

	it('answers an empty array for an empty input', () => {
		expect(trackFeatures([], '#fff', 0, 'tracks/a.gpx')).toEqual([]);
	});

	it('adds no synthetic points when lineEndpoints() answers null', () => {
		const input: Input = [{ type: 'Feature', properties: null, geometry: { type: 'LineString', coordinates: [] } }];
		const out = trackFeatures(input, '#fff', 0, 'tracks/a.gpx');
		expect(out).toHaveLength(1);
		expect(out[0].properties).toEqual({ amColor: '#fff', amIndex: 0, amPath: 'tracks/a.gpx' });
	});
});

describe('trackKnob', () => {
	it('gives back a value that is already inside the knob’s bounds', () => {
		expect(trackKnob('trackWeight', 6)).toBe(6);
		expect(trackKnob('trackOpacity', 50)).toBe(50);
	});

	// The sliders stop at `max`, but a base file is YAML somebody can edit by
	// hand — that is what `hardMax` is for, and why it is not simply `max`.
	it('honours a hand-edited value past the slider, up to the hard bound', () => {
		expect(trackKnob('trackWeight', 20)).toBe(20);
		expect(trackKnob('trackWeight', 999)).toBe(TRACK_KNOBS.trackWeight.hardMax);
		expect(trackKnob('fitMaxZoom', 0)).toBe(TRACK_KNOBS.fitMaxZoom.hardMin);
	});

	it('falls back to the knob’s own default when the value is not a number', () => {
		expect(trackKnob('trackWeight', 'abc')).toBe(TRACK_KNOBS.trackWeight.def);
		expect(trackKnob('trackOpacity', undefined)).toBe(TRACK_KNOBS.trackOpacity.def);
		expect(trackKnob('fitMaxZoom', null)).toBe(TRACK_KNOBS.fitMaxZoom.def);
	});
});

describe('clamp', () => {
	it('holds a value inside the range', () => {
		expect(clamp(5, 1, 10, 4)).toBe(5);
		expect(clamp(0, 1, 10, 4)).toBe(1);
		expect(clamp(99, 1, 10, 4)).toBe(10);
	});

	it('reads numeric strings, and falls back on anything else', () => {
		expect(clamp('7', 1, 10, 4)).toBe(7);
		expect(clamp('abc', 1, 10, 4)).toBe(4);
		expect(clamp(undefined, 1, 10, 4)).toBe(4);
		expect(clamp(NaN, 1, 10, 4)).toBe(4);
	});
});

/** Enough of a MapLibre map for the style gate. */
function fakeMap(loaded: boolean) {
	const listeners = new Map<string, Array<() => void>>();
	const map = {
		style: { _loaded: loaded },
		on(type: string, fn: () => void) {
			const list = listeners.get(type) ?? [];
			list.push(fn);
			listeners.set(type, list);
		},
		off(type: string, fn: () => void) {
			listeners.set(
				type,
				(listeners.get(type) ?? []).filter((f) => f !== fn)
			);
		},
	} as unknown as MapLibreMap;
	const fire = (type: string) => {
		for (const fn of [...(listeners.get(type) ?? [])]) fn();
	};
	return { map, fire, listeners };
}

describe('styleUsable', () => {
	it('reads the flag addSource itself checks', () => {
		expect(styleUsable(fakeMap(true).map)).toBe(true);
		expect(styleUsable(fakeMap(false).map)).toBe(false);
	});

	it('falls back to isStyleLoaded() when there is no style object', () => {
		expect(styleUsable({ isStyleLoaded: () => true } as unknown as MapLibreMap)).toBe(true);
		expect(styleUsable({} as unknown as MapLibreMap)).toBe(false);
	});
});

describe('styleReady', () => {
	it('resolves at once when the style is already usable', async () => {
		await expect(styleReady(fakeMap(true).map)).resolves.toBeUndefined();
	});

	it('waits for the style, then unsubscribes', async () => {
		const { map, fire, listeners } = fakeMap(false);
		const pending = styleReady(map, 1000);
		(map.style as { _loaded: boolean })._loaded = true;
		fire('style.load');
		await expect(pending).resolves.toBeUndefined();
		for (const type of ['styledata', 'style.load', 'load']) {
			expect(listeners.get(type) ?? []).toHaveLength(0);
		}
	});

	it('gives up after the timeout rather than wedging the caller', async () => {
		vi.useFakeTimers();
		try {
			const pending = styleReady(fakeMap(false).map, 50);
			vi.advanceTimersByTime(50);
			await expect(pending).resolves.toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});
});
