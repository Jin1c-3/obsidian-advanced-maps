import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { READ_CONCURRENCY } from '../src/constants';
import { TrackEmbed } from '../src/embed';
import type AdvancedMapsPlugin from '../src/main';
import type { BasesMapView, MapLibreMap } from '../src/types/obsidian-internals';

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	return { promise: new Promise<void>((done) => (resolve = done)), resolve };
}

/** Just enough MapLibre for one embed draw: sources it can add and read back,
 *  layers it never finds, a bounds type of its own, and every fitBounds kept. */
function mapStub() {
	class Bounds {
		points: Array<[number, number]> = [];
		extend(point: [number, number] | Bounds): this {
			if (Array.isArray(point)) this.points.push(point);
			else this.points.push(...point.points);
			return this;
		}
		isEmpty(): boolean {
			return this.points.length === 0;
		}
	}
	const sources = new Map<string, { setData: () => void }>();
	const handlers = new Map<string, Array<(ev?: unknown) => void>>();
	const fits: unknown[] = [];
	const map = {
		style: { _loaded: true },
		getStyle: () => ({}),
		getSource: (id: string) => sources.get(id),
		addSource: (id: string) => sources.set(id, { setData: () => undefined }),
		removeSource: (id: string) => sources.delete(id),
		getLayer: () => undefined,
		addLayer: () => undefined,
		removeLayer: () => undefined,
		setPaintProperty: () => undefined,
		setLayoutProperty: () => undefined,
		// Already carrying the track icons, so no test has to draw one on a canvas
		// happy-dom does not have.
		hasImage: () => true,
		addImage: () => undefined,
		removeImage: () => undefined,
		getBounds: () => new Bounds(),
		fitBounds: (bounds: unknown) => fits.push(bounds),
		getCanvas: () => document.createElement('canvas'),
		getZoom: () => 16,
		project: () => ({ x: 0, y: 0 }),
		resize: () => undefined,
		off: () => undefined,
		on(name: string, second: unknown, third?: unknown) {
			const handler = (typeof second === 'function' ? second : third) as (ev?: unknown) => void;
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
	};
	/** What a reader's own drag looks like: a camera event with a DOM event behind it. */
	const drag = () => {
		for (const handler of handlers.get('dragstart') ?? []) handler({ originalEvent: new Event('mousedown') });
	};
	return { map: map as unknown as MapLibreMap, fits, drag };
}

/** An embed already past build(): a live map, one two-point route, no photos. */
function framedEmbed() {
	const { map, fits, drag } = mapStub();
	const container = document.createElement('div');
	const rootEl = document.createElement('div');
	container.append(rootEl);
	const file = Object.assign(new TFile(), { name: 'route.gpx', path: 'route.gpx', extension: 'gpx' });
	file.stat = { mtime: 1, ctime: 1, size: 10 };
	const rec = {
		mtime: 1,
		features: [
			{
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'LineString',
					coordinates: [
						[116.39, 39.9],
						[116.4, 39.91],
					],
				},
			},
		],
	};
	const plugin = {
		settings: {
			coordSystem: 'wgs84',
			photoDatum: 'wgs84',
			showPhotos: false,
			trackColor: '#ff0000',
			trackWeight: 4,
			trackOpacity: 100,
			trackMarkers: true,
			photoThumbnails: true,
			fitMaxZoom: 16,
			embedHeight: 300,
			trackStats: false,
			elevationProfile: false,
		},
		tracks: { load: vi.fn(async () => rec) },
	} as unknown as AdvancedMapsPlugin;
	const view = {
		map,
		mapConfig: {},
		markerManager: { resolveColor: (color: string) => color },
	} as unknown as BasesMapView;
	const embed = new TrackEmbed(container, plugin, file);
	Reflect.set(embed, 'rootEl', rootEl);
	Reflect.set(embed, 'view', view);
	Reflect.set(embed, 'map', map);
	Reflect.set(embed, 'rec', rec);
	return { embed, file, plugin, fits, drag };
}

describe('TrackEmbed framing', () => {
	it('frames the first draw and leaves the camera alone when the same data is redrawn', async () => {
		const { embed, fits } = framedEmbed();
		await embed.refresh();
		expect(fits).toHaveLength(1);

		// What a write to an unrelated track file, or any visual setting change,
		// reaches this embed as: refresh() on data that has not moved.
		await embed.refresh();
		await embed.refresh();
		expect(fits).toHaveLength(1);
	});

	it('frames again when the embedded file itself changed', async () => {
		const { embed, file, fits } = framedEmbed();
		await embed.refresh();
		file.stat = { ...file.stat, mtime: file.stat.mtime + 1 };
		await embed.refresh();
		expect(fits).toHaveLength(2);
	});

	it('frames again when the map is drawn in a different space', async () => {
		const { embed, plugin, fits } = framedEmbed();
		await embed.refresh();
		(plugin.settings as { coordSystem: string }).coordSystem = 'gcj02';
		await embed.refresh();
		expect(fits).toHaveLength(2);
	});

	it('never frames again once the reader has moved the map', async () => {
		const { embed, file, fits, drag } = framedEmbed();
		await embed.refresh();
		drag();
		file.stat = { ...file.stat, mtime: file.stat.mtime + 1 };
		await embed.refresh();
		expect(fits).toHaveLength(1);
	});
});

describe('TrackEmbed deferred initialization', () => {
	it('destroys a map created after unload without committing embed work', async () => {
		const initialized = deferred();
		const container = document.createElement('div');
		const mapContainer = document.createElement('div');
		const detach = vi.fn(() => mapContainer.remove());
		mapContainer.detach = detach;
		container.append(mapContainer);

		const map = {} as MapLibreMap;
		const destroyMap = vi.fn();
		const initializeMap = vi.fn(async () => {
			await initialized.promise;
			view.map = map;
		});
		const view = {
			containerEl: mapContainer,
			initializeMap,
			destroyMap,
		} as unknown as BasesMapView;
		const file = Object.assign(new TFile(), { name: 'route.gpx', path: 'route.gpx', extension: 'gpx' });
		const plugin = {
			settings: { showPhotos: false },
			tracks: { load: vi.fn().mockResolvedValue({ features: [], error: null }) },
			createHeadlessView: vi.fn(() => view),
			embeds: new Set<TrackEmbed>(),
		} as unknown as AdvancedMapsPlugin;
		const embed = new TrackEmbed(container, plugin, file);
		Reflect.set(embed, 'rootEl', container);

		const build = Reflect.get(embed, 'build') as () => Promise<void>;
		const building = build.call(embed);
		await vi.waitFor(() => expect(initializeMap).toHaveBeenCalledTimes(1));
		embed.onunload();
		initialized.resolve();
		await building;

		expect(destroyMap).toHaveBeenCalledTimes(2);
		expect(detach).toHaveBeenCalledTimes(2);
		expect(Reflect.get(embed, 'map')).toBeNull();
		expect(Reflect.get(embed, 'resizeObserver')).toBeNull();
		expect(Reflect.get(embed, 'interactionsBound')).toBe(false);
		expect(container.querySelector('.advanced-maps-panel')).toBeNull();
	});
});

describe('TrackEmbed bounded companion reads', () => {
	/** An embed whose host note carries `count` photos, each read gated. */
	function albumEmbed(count: number) {
		const { map } = mapStub();
		const container = document.createElement('div');
		const rootEl = document.createElement('div');
		container.append(rootEl);
		const track = Object.assign(new TFile(), { name: 'route.gpx', path: 'route.gpx', extension: 'gpx' });
		track.stat = { mtime: 1, ctime: 1, size: 10 };
		const host = Object.assign(new TFile(), { name: 'trip.md', path: 'notes/trip.md', extension: 'md' });
		const photos = Array.from({ length: count }, (_, i) => {
			const photo = Object.assign(new TFile(), {
				name: `p-${i}.jpg`,
				path: `photos/p-${i}.jpg`,
				extension: 'jpg',
			});
			photo.stat = { mtime: 1, ctime: 1, size: 10 };
			return photo;
		});

		const trackRec = { mtime: 1, features: [] };
		const started: string[] = [];
		const gates: Array<() => void> = [];
		const plugin = {
			settings: {
				coordSystem: 'wgs84',
				photoDatum: 'wgs84',
				showPhotos: true,
				trackColor: '#ff0000',
				trackWeight: 4,
				trackOpacity: 100,
				trackMarkers: true,
				photoThumbnails: true,
				fitMaxZoom: 16,
				embedHeight: 300,
				trackStats: false,
				elevationProfile: false,
			},
			app: { vault: { getFileByPath: () => host } },
			embeds: new Set(),
			resolveTracks: () => photos,
			tracks: {
				load: vi.fn((file: TFile) => {
					if (file.extension !== 'jpg') return Promise.resolve(trackRec);
					started.push(file.path);
					return new Promise((resolve) => gates.push(() => resolve({ mtime: 1, features: [] })));
				}),
			},
		} as unknown as AdvancedMapsPlugin;
		const view = {
			map,
			mapConfig: {},
			markerManager: { resolveColor: (color: string) => color },
		} as unknown as BasesMapView;
		const embed = new TrackEmbed(container, plugin, track, 'notes/trip.md');
		Reflect.set(embed, 'rootEl', rootEl);
		Reflect.set(embed, 'view', view);
		Reflect.set(embed, 'map', map);
		Reflect.set(embed, 'rec', trackRec);
		return {
			embed,
			started,
			photos,
			releaseAll: () => {
				for (const release of gates.splice(0)) release();
			},
			async drain() {
				for (let round = 0; round < 500; round++) {
					for (const release of gates.splice(0)) release();
					await new Promise((resolve) => window.setTimeout(resolve, 0));
					if (gates.length === 0) return;
				}
			},
		};
	}

	it('reads a large album under the limit without dropping a photo', async () => {
		const album = albumEmbed(READ_CONCURRENCY * 3);
		const running = album.embed.refresh();
		expect(album.started).toHaveLength(READ_CONCURRENCY);

		await album.drain();
		await running;
		expect(album.started).toHaveLength(album.photos.length);
		expect(new Set(album.started).size).toBe(album.photos.length);
	});

	it('stops starting companion reads once the embed is torn down', async () => {
		const album = albumEmbed(64);
		const running = album.embed.refresh();
		const firstWindow = album.started.length;

		album.embed.onunload();
		album.releaseAll();
		await running;

		expect(album.started.length).toBe(firstWindow);
		expect(album.started.length).toBeLessThan(album.photos.length);
	});
});
