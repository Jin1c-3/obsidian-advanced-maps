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
		const out = trackFeatures(input, '#f00', 2);
		expect(out).toHaveLength(4);

		expect(out[0]).toEqual({
			type: 'Feature',
			geometry: input[0].geometry,
			properties: { amColor: '#f00', amIndex: 2 },
		});
		expect(out[1]).toEqual({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [1, 2] },
			properties: { amColor: '#f00', amIndex: 2, amRole: 'start' },
		});
		expect(out[2]).toEqual({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [3, 4] },
			properties: { amColor: '#f00', amIndex: 2, amRole: 'end' },
		});
		expect(out[3]).toEqual({
			type: 'Feature',
			geometry: input[1].geometry,
			properties: { amColor: '#f00', amIndex: 2 },
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
		const out = trackFeatures(input, '#f00', 3);
		// A ring is a closed line, so start and end would land on the same point
		// and claim a direction the area does not have.
		expect(out).toHaveLength(1);
		expect(out[0]).toEqual({
			type: 'Feature',
			geometry: input[0].geometry,
			properties: { amColor: '#f00', amIndex: 3 },
		});
	});

	it('carries a named waypoint’s own name as amName', () => {
		const input: Input = [
			{ type: 'Feature', properties: { name: 'Bund' }, geometry: { type: 'Point', coordinates: [1, 1] } },
		];
		const [out] = trackFeatures(input, '#0f0', 0);
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
		const [line] = trackFeatures(input, '#00f', 0);
		expect(line.properties.amName).toBeUndefined();
	});

	it('treats an empty or non-string name as absent, not as amName: ""', () => {
		const input: Input = [
			{ type: 'Feature', properties: { name: '' }, geometry: { type: 'Point', coordinates: [0, 0] } },
			{ type: 'Feature', properties: { name: 42 }, geometry: { type: 'Point', coordinates: [1, 1] } },
		];
		const out = trackFeatures(input, '#000', 0);
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
		const [out] = trackFeatures(input, '#0f0', 0);
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
		expect(trackFeatures(input, '#0f0', 0)).toHaveLength(1);
	});

	it('carries a photo point with no thumbnail (amPhoto absent) through with amRole/amPath alone', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: { amRole: 'photo', amPath: 'assets/no-thumb.heic' },
				geometry: { type: 'Point', coordinates: [1, 1] },
			},
		];
		const [out] = trackFeatures(input, '#000', 3);
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
		const [out] = trackFeatures(input, '#fff', 0);
		expect(out.properties).toEqual({ amColor: '#fff', amIndex: 0, amName: 'Pavilion' });
	});

	it('drops a non-string amPhoto/amPath rather than passing a garbage value through', () => {
		const input: Input = [
			{
				type: 'Feature',
				properties: { amRole: 'photo', amPhoto: 42, amPath: null },
				geometry: { type: 'Point', coordinates: [0, 0] },
			},
		];
		const [out] = trackFeatures(input, '#fff', 0);
		expect(out.properties).toEqual({ amColor: '#fff', amIndex: 0, amRole: 'photo' });
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
		const out = trackFeatures(input, '#fff', 5);
		const roles = out.map((f) => f.properties.amRole);
		expect(roles).toEqual([undefined, 'start', 'end']);
		expect(out[1].geometry).toEqual({ type: 'Point', coordinates: [0, 0] });
		expect(out[2].geometry).toEqual({ type: 'Point', coordinates: [3, 3] });
	});

	it('answers an empty array for an empty input', () => {
		expect(trackFeatures([], '#fff', 0)).toEqual([]);
	});

	it('adds no synthetic points when lineEndpoints() answers null', () => {
		const input: Input = [{ type: 'Feature', properties: null, geometry: { type: 'LineString', coordinates: [] } }];
		const out = trackFeatures(input, '#fff', 0);
		expect(out).toHaveLength(1);
		expect(out[0].properties).toEqual({ amColor: '#fff', amIndex: 0 });
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
