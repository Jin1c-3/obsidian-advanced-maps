import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import {
	ARROW_LAYER,
	ENDPOINT_LAYER,
	LINE_LAYER,
	PHOTO_DOT_LAYER,
	PHOTO_ICON_MAX,
	PHOTO_LAYER,
	POINT_LAYER,
	SRC,
} from '../src/constants';
import {
	cancelPhotoImages,
	drawTracks,
	ensurePhotoImages,
	PHOTO_DECODE_CONCURRENCY,
	selectPhotoIconIds,
	type PhotoIconSource,
} from '../src/layers';
import type { GeoJSONSource, MapLibreMap } from '../src/types/obsidian-internals';

class LayerMap {
	readonly layers: string[] = [];
	private source: GeoJSONSource | undefined;
	throwAt: number | null = null;
	private addCount = 0;

	getStyle(): unknown {
		return {};
	}

	getSource(id: string): GeoJSONSource | undefined {
		return id === SRC ? this.source : undefined;
	}

	addSource(id: string): void {
		if (id === SRC) this.source = { setData: () => undefined };
	}

	removeSource(id: string): void {
		if (id === SRC) this.source = undefined;
	}

	getLayer(id: string): unknown {
		return this.layers.includes(id) ? { id } : undefined;
	}

	addLayer(spec: unknown): void {
		this.addCount++;
		if (this.throwAt === this.addCount) throw new Error('style changed');
		this.layers.push((spec as { id: string }).id);
	}

	removeLayer(id: string): void {
		const index = this.layers.indexOf(id);
		if (index >= 0) this.layers.splice(index, 1);
	}

	hasImage(): boolean {
		// Keep icon rasterisation out of this structural layer test.
		return true;
	}

	removeImage(): void {}

	asMap(): MapLibreMap {
		return this as unknown as MapLibreMap;
	}
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function photos(count: number): PhotoIconSource[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `photo-${index}`,
		thumbnail: { bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), width: 1, height: 1 },
		orientation: 1,
		coordinates: [index, index],
	}));
}

describe('drawTracks', () => {
	it('rolls back a partial layer install so the next sync can recover', () => {
		const map = new LayerMap();
		map.throwAt = 3;
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(drawTracks(map.asMap(), EMPTY)).toBe(false);
		expect(map.getSource(SRC)).toBeUndefined();
		expect(map.layers).toEqual([]);

		map.throwAt = null;
		expect(drawTracks(map.asMap(), EMPTY)).toBe(true);
		expect(map.getSource(SRC)).toBeDefined();
		expect(map.layers).toEqual([
			LINE_LAYER,
			ARROW_LAYER,
			POINT_LAYER,
			ENDPOINT_LAYER,
			PHOTO_DOT_LAYER,
			PHOTO_LAYER,
		]);
	});
});

describe('photo icon bounds', () => {
	function projectedMap(width: number, height: number): MapLibreMap {
		return {
			project: ([x, y]: [number, number]) => ({ x, y }),
			getCanvas: () => ({ clientWidth: width, clientHeight: height }) as HTMLCanvasElement,
		} as unknown as MapLibreMap;
	}

	it('selects visible, non-overlapping icons instead of the first records', () => {
		const records = photos(PHOTO_ICON_MAX + 60);
		for (let i = 0; i < PHOTO_ICON_MAX + 20; i++) records[i].coordinates = [24, 24];
		records[PHOTO_ICON_MAX + 20].coordinates = [96, 24];
		records[PHOTO_ICON_MAX + 21].coordinates = [600, 24];

		const selected = selectPhotoIconIds(projectedMap(200, 100), records);
		expect([...selected]).toEqual(['photo-0', `photo-${PHOTO_ICON_MAX + 20}`]);
	});

	it('admits every icon that a large screen can actually display', () => {
		const records = photos(PHOTO_ICON_MAX + 60);
		for (let i = 0; i < records.length; i++) records[i].coordinates = [i * 64 + 24, 24];
		const selected = selectPhotoIconIds(projectedMap(records.length * 64, 100), records);
		expect(selected.size).toBe(records.length);
		expect([...selected].at(-1)).toBe(`photo-${records.length - 1}`);
	});

	it('keeps the no-projection fallback bounded', () => {
		const records = photos(PHOTO_ICON_MAX + 60);
		const selected = selectPhotoIconIds({} as MapLibreMap, records);
		expect(selected.size).toBe(PHOTO_ICON_MAX);
	});

	it('starts only a bounded number of JPEG decodes at once', () => {
		const decode = vi.fn(() => new Promise<ImageBitmap>(() => undefined));
		vi.stubGlobal('createImageBitmap', decode);
		const records = photos(PHOTO_DECODE_CONCURRENCY + 20);
		const map = {
			getStyle: () => ({}),
			hasImage: () => false,
			removeImage: () => undefined,
		} as unknown as MapLibreMap;

		ensurePhotoImages(map, records);
		expect(decode).toHaveBeenCalledTimes(PHOTO_DECODE_CONCURRENCY);
	});

	it('cancels queued work when its owner detaches from a still-live map', async () => {
		let resolve!: (bitmap: ImageBitmap) => void;
		const decode = vi.fn(
			() =>
				new Promise<ImageBitmap>((done) => {
					resolve = done;
				})
		);
		vi.stubGlobal('createImageBitmap', decode);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const addImage = vi.fn();
		const records = photos(PHOTO_DECODE_CONCURRENCY + 20);
		const map = {
			getStyle: () => ({}),
			hasImage: () => false,
			addImage,
			removeImage: () => undefined,
		} as unknown as MapLibreMap;

		ensurePhotoImages(map, records);
		cancelPhotoImages(map);
		resolve({ close: () => undefined, width: 1, height: 1 });
		await Promise.resolve();
		await Promise.resolve();
		expect(addImage).not.toHaveBeenCalled();
		expect(decode).toHaveBeenCalledTimes(PHOTO_DECODE_CONCURRENCY);
	});
});
