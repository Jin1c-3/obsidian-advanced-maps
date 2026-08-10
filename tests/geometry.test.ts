import { describe, expect, it, vi } from 'vitest';
import { boundsOf, clamp, extendBounds, styleReady, styleUsable, trackKnob, walkCoords } from '../src/geometry';
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
