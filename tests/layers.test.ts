import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import {
	AREA_LAYER,
	ARROW_LAYER,
	ENDPOINT_LAYER,
	FILL_OPACITY_RATIO,
	LINE_LAYER,
	PHOTO_DOT_LAYER,
	PHOTO_ICON_PREFIX,
	PHOTO_ICON_MAX,
	PHOTO_LAYER,
	POINT_LAYER,
	SRC,
} from '../src/constants';
import {
	applyTrackPaint,
	cancelPhotoImages,
	disposePhotoImages,
	drawTracks,
	ensurePhotoImages,
	PHOTO_DECODE_CONCURRENCY,
	photoIconSource,
	selectPhotoIconIds,
	type PhotoIconSource,
} from '../src/layers';
import { photoImageId, type TrackRecord } from '../src/track-cache';
import type { ExifThumbnail } from '../src/exif';
import type { GeoJSONSource, MapLibreMap } from '../src/types/obsidian-internals';

class LayerMap {
	readonly layers: string[] = [];
	/** Kept alongside `layers` so filter and paint order can be asserted. */
	readonly specs: Array<{ id: string; type?: string; filter?: unknown }> = [];
	readonly paint = new Map<string, Record<string, unknown>>();
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
		const layer = spec as { id: string; type?: string; filter?: unknown };
		this.layers.push(layer.id);
		this.specs.push(layer);
	}

	removeLayer(id: string): void {
		const index = this.layers.indexOf(id);
		if (index >= 0) this.layers.splice(index, 1);
		const spec = this.specs.findIndex((entry) => entry.id === id);
		if (spec >= 0) this.specs.splice(spec, 1);
	}

	setPaintProperty(id: string, key: string, value: unknown): void {
		const props = this.paint.get(id) ?? {};
		props[key] = value;
		this.paint.set(id, props);
	}

	setLayoutProperty(): void {}

	specFor(id: string): { id: string; type?: string; filter?: unknown } | undefined {
		return this.specs.find((spec) => spec.id === id);
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
			AREA_LAYER,
			LINE_LAYER,
			ARROW_LAYER,
			POINT_LAYER,
			ENDPOINT_LAYER,
			PHOTO_DOT_LAYER,
			PHOTO_LAYER,
		]);
	});
});

/** Geometry types a layer's `['==', ['geometry-type'], X]` clauses admit. */
function admittedTypes(filter: unknown): string[] {
	const out: string[] = [];
	const walk = (node: unknown): void => {
		if (!Array.isArray(node)) return;
		if (
			node[0] === '==' &&
			Array.isArray(node[1]) &&
			node[1][0] === 'geometry-type' &&
			typeof node[2] === 'string'
		) {
			out.push(node[2]);
			return;
		}
		for (const child of node) walk(child);
	};
	walk(filter);
	return out;
}

describe('area layers', () => {
	it('fills areas underneath every other owned layer', () => {
		const map = new LayerMap();
		expect(drawTracks(map.asMap(), EMPTY)).toBe(true);

		// An area can cover the whole viewport, so it is the one layer whose
		// position in the group is load-bearing rather than a matter of taste.
		expect(map.layers[0]).toBe(AREA_LAYER);
		expect(map.specFor(AREA_LAYER)?.type).toBe('fill');
		expect(admittedTypes(map.specFor(AREA_LAYER)?.filter)).toEqual(['Polygon', 'MultiPolygon']);
	});

	it('strokes area boundaries with the track line but gives them no arrows', () => {
		const map = new LayerMap();
		drawTracks(map.asMap(), EMPTY);

		expect(admittedTypes(map.specFor(LINE_LAYER)?.filter)).toContain('Polygon');
		expect(admittedTypes(map.specFor(LINE_LAYER)?.filter)).toContain('MultiPolygon');
		// A ring is a closed line, so nothing but this filter stops direction
		// arrows from marching around a boundary that has no travel direction.
		expect(admittedTypes(map.specFor(ARROW_LAYER)?.filter)).toEqual(['LineString', 'MultiLineString']);
	});

	it('derives fill opacity from the track opacity setting', () => {
		const map = new LayerMap();
		drawTracks(map.asMap(), EMPTY);
		applyTrackPaint(map.asMap(), 4, 0.8, '#ffffff', true, true);

		expect(map.paint.get(AREA_LAYER)?.['fill-opacity']).toBeCloseTo(0.8 * FILL_OPACITY_RATIO);
		// The boundary keeps the setting itself; only the fill is stepped back.
		expect(map.paint.get(LINE_LAYER)?.['line-opacity']).toBe(0.8);
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

	it('removes every registered Advanced Maps image when MapLibre can enumerate them', () => {
		const own = `${PHOTO_ICON_PREFIX}one`;
		const removed = vi.fn();
		const map = {
			listImages: () => [own, `${PHOTO_ICON_PREFIX}two`, 'native-marker'],
			removeImage: removed,
		} as unknown as MapLibreMap;

		disposePhotoImages(map);

		expect(removed).toHaveBeenCalledTimes(2);
		expect(removed).toHaveBeenCalledWith(own);
		expect(removed).toHaveBeenCalledWith(`${PHOTO_ICON_PREFIX}two`);
		expect(removed).not.toHaveBeenCalledWith('native-marker');
	});

	it('falls back to current decode-state ownership when image enumeration is unavailable', () => {
		const record = { ...photos(1)[0], id: `${PHOTO_ICON_PREFIX}known` };
		const removed = vi.fn();
		const map = {
			getStyle: () => ({}),
			hasImage: (id: string) => id === record.id,
			removeImage: removed,
		} as unknown as MapLibreMap;

		ensurePhotoImages(map, [record]);
		disposePhotoImages(map);

		expect(removed).toHaveBeenCalledWith(record.id);
	});

	it('reads a deferred thumbnail only for the photos a map admits for decoding', async () => {
		const thumbnail: ExifThumbnail = { bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), width: 1, height: 1 };
		const load = vi.fn(() => Promise.resolve(thumbnail));
		const decode = vi.fn(() => new Promise<ImageBitmap>(() => undefined));
		vi.stubGlobal('createImageBitmap', decode);
		// Two photos in one collision cell: the selection admits the first only.
		const records: PhotoIconSource[] = [0, 1].map((index) => ({
			id: `deferred-${index}`,
			load,
			orientation: 1,
			coordinates: [24, 24],
		}));
		const map = {
			getStyle: () => ({}),
			project: ([x, y]: [number, number]) => ({ x, y }),
			getCanvas: () => ({ clientWidth: 200, clientHeight: 100 }) as HTMLCanvasElement,
			hasImage: () => false,
			removeImage: () => undefined,
		} as unknown as MapLibreMap;

		ensurePhotoImages(map, records);
		await Promise.resolve();

		// One read, for the one photo on screen — not one per record.
		expect(load).toHaveBeenCalledTimes(1);
		expect(decode).toHaveBeenCalledTimes(1);
	});

	it('never asks for bytes a photo is recorded as not having', () => {
		const rec: TrackRecord = {
			mtime: 1,
			features: [
				{
					type: 'Feature',
					properties: { amRole: 'photo' },
					geometry: { type: 'Point', coordinates: [120.1, 30.1] },
				},
			],
			photo: { has: false, orientation: 1 },
		};
		expect(photoIconSource('Photos/plain.jpg', rec, 'wgs84')).toBeNull();

		// The same record, restored from the index as having one: eligible, with
		// the bytes still unread.
		const load = vi.fn(() => Promise.resolve(undefined));
		const withThumb: TrackRecord = { ...rec, photo: { has: true, orientation: 8, load } };
		const source = photoIconSource('Photos/plain.jpg', withThumb, 'wgs84');
		expect(source).toMatchObject({ id: photoImageId('Photos/plain.jpg'), orientation: 8, load });
		expect(source?.thumbnail).toBeUndefined();
		expect(load).not.toHaveBeenCalled();
	});

	it('leaves a photo as a dot when its deferred read comes back empty', async () => {
		const decode = vi.fn(() => new Promise<ImageBitmap>(() => undefined));
		vi.stubGlobal('createImageBitmap', decode);
		const map = {
			getStyle: () => ({}),
			hasImage: () => false,
			removeImage: () => undefined,
		} as unknown as MapLibreMap;

		ensurePhotoImages(map, [
			{ id: 'gone', load: () => Promise.resolve(undefined), orientation: 1, coordinates: [0, 0] },
		]);
		await Promise.resolve();

		expect(decode).not.toHaveBeenCalled();
	});

	it('does not let an active decode re-add an image after terminal disposal', async () => {
		let resolve!: (bitmap: ImageBitmap) => void;
		vi.stubGlobal(
			'createImageBitmap',
			() =>
				new Promise<ImageBitmap>((done) => {
					resolve = done;
				})
		);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const addImage = vi.fn();
		const map = {
			getStyle: () => ({}),
			hasImage: () => false,
			addImage,
			removeImage: () => undefined,
		} as unknown as MapLibreMap;

		ensurePhotoImages(map, photos(1));
		disposePhotoImages(map);
		resolve({ close: () => undefined, width: 1, height: 1 });
		await Promise.resolve();
		await Promise.resolve();
		expect(addImage).not.toHaveBeenCalled();
	});
});
