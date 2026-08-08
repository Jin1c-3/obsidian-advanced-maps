import { describe, expect, it, vi } from 'vitest';
import { clamp, extendBounds, styleReady, styleUsable, walkCoords } from '../src/geometry';
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
