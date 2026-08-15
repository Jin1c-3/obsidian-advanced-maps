import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { READ_CONCURRENCY } from '../src/constants';
import { wgs2gcj } from '../src/coords';
import { TrackLayer } from '../src/track-layer';
import type AdvancedMapsPlugin from '../src/main';
import type { TrackRecord } from '../src/track-cache';
import type { BasesMapView, MapLibreMap } from '../src/types/obsidian-internals';

function mapAt(
	lng = 116.397428,
	lat = 39.90923
): MapLibreMap & { controls: unknown[]; centers: Array<{ lng: number; lat: number }> } {
	let center = { lng, lat };
	const controls: unknown[] = [];
	const centers: Array<{ lng: number; lat: number }> = [];
	const map = {
		controls,
		centers,
		style: { _loaded: true },
		scrollZoom: { disable: () => undefined, enable: () => undefined },
		getSource: () => undefined,
		addSource: () => undefined,
		removeSource: () => undefined,
		getLayer: () => undefined,
		addLayer: () => undefined,
		removeLayer: () => undefined,
		setPaintProperty: () => undefined,
		setLayoutProperty: () => undefined,
		hasImage: () => false,
		addImage: () => undefined,
		removeImage: () => undefined,
		addControl(control: unknown) {
			controls.push(control);
		},
		removeControl: () => undefined,
		on: () => undefined,
		off: () => undefined,
		getCenter: () => center,
		setCenter(next: { lng: number; lat: number }) {
			center = next;
			centers.push(next);
		},
		getBounds: () => ({ extend: () => ({}) as never, isEmpty: () => true }),
		fitBounds: () => undefined,
		unproject: () => center,
		getCanvas: () => document.createElement('canvas'),
		resize: () => undefined,
	};
	return map;
}

function view(map: MapLibreMap | null): BasesMapView {
	const manager = {
		updateMarkers: async () => undefined,
		createGeoJSONFeatures: () => [],
		getCustomColor: () => null,
		resolveColor: (color: string) => color,
		getBounds: () => null,
		getMarkerDrivenProps: () => null,
		onOpenFile: () => undefined,
	};
	return {
		app: {} as BasesMapView['app'],
		map,
		mapConfig: {},
		config: { get: (key) => (key === 'coordSystem' ? 'gcj02' : undefined), getDisplayName: String },
		markerManager: manager,
		popupManager: { showPopup: () => undefined, hidePopup: () => undefined },
		loadConfig: () => ({}),
		switchToTileSet: async () => undefined,
		initializeMap: async () => undefined,
		destroyMap: () => undefined,
		updateMapStyle: () => undefined,
		showMapContextMenu: () => undefined,
		onunload: () => undefined,
	};
}

function plugin(): AdvancedMapsPlugin {
	return {
		settings: { followActiveNote: false, coordSystem: 'gcj02' },
		layers: new Set(),
		resolveTracks: () => [],
	} as unknown as AdvancedMapsPlugin;
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('native map lifecycle', () => {
	it('sets up an adopted map once and aligns its WGS-84 camera exactly once', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const map = mapAt();
		const layer = new TrackLayer(plugin(), view(map), true).attach();

		expect(layer.onMapCreated(map, 'adopted')).toBe(true);
		expect(layer.onMapCreated(map, 'adopted')).toBe(false);
		expect(map.controls).toHaveLength(2);
		expect(map.centers).toHaveLength(1);
		expect(map.centers[0]).toMatchObject(
			Object.fromEntries([
				['lng', wgs2gcj(116.397428, 39.90923)[0]],
				['lat', wgs2gcj(116.397428, 39.90923)[1]],
			])
		);
	});

	it('re-adopts a surviving plugin-shifted map without converting its camera twice', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const map = mapAt();
		const surviving = view(map);
		const first = new TrackLayer(plugin(), surviving, true).attach();
		first.onMapCreated(map, 'adopted');
		first.detach();

		const second = new TrackLayer(plugin(), surviving, true).attach();
		second.onMapCreated(map, 'adopted');

		expect(map.centers).toHaveLength(1);
		expect(map.__advancedMapsCameraSystem).toBe('gcj02');
	});

	it('adopts a map that finishes native initialization later', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const deferred = view(null);
		const layer = new TrackLayer(plugin(), deferred, true).attach();
		vi.spyOn(layer, 'reproject').mockResolvedValue();
		layer.watchAdoptedMap();
		const map = mapAt();
		deferred.map = map;
		await vi.advanceTimersByTimeAsync(250);
		expect(map.controls).toHaveLength(2);
	});

	it('treats a later wrapped map recreation as already being in tile space', async () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const first = mapAt();
		const adopted = view(first);
		const layer = new TrackLayer(plugin(), adopted, true).attach();
		vi.spyOn(layer, 'reproject').mockResolvedValue();
		layer.onMapCreated(first, 'wgs84');
		adopted.destroyMap();

		const recreated = mapAt();
		adopted.map = recreated;
		await adopted.initializeMap();

		expect(recreated.controls).toHaveLength(2);
		expect(recreated.centers).toHaveLength(0);
	});

	it('cancels deferred adoption when detached before native initialization resolves', async () => {
		vi.useFakeTimers();
		const deferred = view(null);
		const layer = new TrackLayer(plugin(), deferred, true).attach();
		layer.watchAdoptedMap();
		layer.detach();
		const map = mapAt();
		deferred.map = map;
		await vi.advanceTimersByTimeAsync(500);
		expect(map.controls).toHaveLength(0);
	});

	it('does not commit wrapper work when detach wins an in-flight initialization', async () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const deferred = view(null);
		let finish: (() => void) | undefined;
		deferred.initializeMap = () =>
			new Promise<void>((resolve) => {
				finish = resolve;
			});
		const layer = new TrackLayer(plugin(), deferred).attach();
		const initializing = deferred.initializeMap();
		layer.detach();
		const map = mapAt();
		deferred.map = map;
		finish?.();
		await initializing;
		expect(map.controls).toHaveLength(0);
	});
});

describe('bounded attachment reads', () => {
	interface Gate {
		promise: Promise<TrackRecord>;
		release(): void;
	}

	/** A `tracks` stub whose loads block until released, recording start order. */
	function gatedTracks() {
		const started: string[] = [];
		const gates: Gate[] = [];
		let active = 0;
		let peak = 0;
		const records = new Map<string, TrackRecord>();
		return {
			started,
			records,
			get peak() {
				return peak;
			},
			/** Release only what is outstanding now — used where the pool must stop. */
			releaseAll(): void {
				for (const gate of gates.splice(0)) gate.release();
			},
			/** Keep releasing until refilled slots stop producing new reads. */
			async drain(): Promise<void> {
				for (let round = 0; round < 500; round++) {
					for (const gate of gates.splice(0)) gate.release();
					await new Promise((resolve) => window.setTimeout(resolve, 0));
					if (gates.length === 0) return;
				}
			},
			tracks: {
				isFresh: () => false,
				get: (path: string) => records.get(path),
				load: (file: TFile) => {
					started.push(file.path);
					active++;
					peak = Math.max(peak, active);
					let release!: () => void;
					const promise = new Promise<TrackRecord>((resolve) => {
						release = () => {
							const rec: TrackRecord = { mtime: 1, features: [] };
							records.set(file.path, rec);
							active--;
							resolve(rec);
						};
					});
					gates.push({ promise, release });
					return promise;
				},
			},
		};
	}

	function attachments(n: number): TFile[] {
		return Array.from({ length: n }, (_, i) => {
			const file = new TFile();
			file.path = `tracks/route-${i}.geojson`;
			file.extension = 'geojson';
			file.stat = { ...file.stat, mtime: 1, size: 10 };
			return file;
		});
	}

	function syncPlugin(tracks: unknown, resolveTracks: () => TFile[]): AdvancedMapsPlugin {
		return {
			settings: { followActiveNote: false, coordSystem: 'gcj02', photoDatum: 'auto', trackColor: '#ff0000' },
			layers: new Set(),
			resolveTracks,
			tracks,
		} as unknown as AdvancedMapsPlugin;
	}

	function noteEntry(): { file: TFile } {
		const note = new TFile();
		note.path = 'notes/trip.md';
		note.extension = 'md';
		return { file: note };
	}

	it('never exceeds the read limit and still reads every pending attachment', async () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const files = attachments(READ_CONCURRENCY * 3);
		const g = gatedTracks();
		const v = view(mapAt());
		v.data = { data: [noteEntry()], properties: [] };
		const layer = new TrackLayer(
			syncPlugin(g.tracks, () => files),
			v
		);

		const running = layer.sync();
		// Only the first window may have started before anything was released.
		expect(g.started).toHaveLength(READ_CONCURRENCY);

		await g.drain();
		await running;
		// Slots refilled until the queue drained, without ever widening.
		expect(g.started).toHaveLength(files.length);
		expect(new Set(g.started).size).toBe(files.length);
		expect(g.peak).toBe(READ_CONCURRENCY);
	});

	it('a superseded sync stops admitting reads instead of draining its queue', async () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const files = attachments(READ_CONCURRENCY * 4);
		const g = gatedTracks();
		let resolved: TFile[] = files;
		const v = view(mapAt());
		v.data = { data: [noteEntry()], properties: [] };
		const layer = new TrackLayer(
			syncPlugin(g.tracks, () => resolved),
			v
		);

		const stale = layer.sync();
		expect(g.started).toHaveLength(READ_CONCURRENCY);

		// The newer sync claims the revision and needs no reads of its own.
		resolved = [];
		await layer.sync();

		g.releaseAll();
		await stale;

		// The superseded pool stopped admitting rather than draining the queue.
		expect(g.started.length).toBeLessThan(files.length);
	});

	it('stops starting reads once the layer has detached', async () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const files = attachments(READ_CONCURRENCY * 4);
		const g = gatedTracks();
		const v = view(mapAt());
		v.data = { data: [noteEntry()], properties: [] };
		const layer = new TrackLayer(
			syncPlugin(g.tracks, () => files),
			v
		).attach();

		const running = layer.sync();
		expect(g.started).toHaveLength(READ_CONCURRENCY);

		layer.detach();
		g.releaseAll();
		await running;

		expect(g.started.length).toBeLessThan(files.length);
	});
});

describe('native empty-bounds wrapper', () => {
	function bounds(empty: boolean) {
		return { extend: () => ({}) as never, isEmpty: () => empty };
	}

	it('reports empty native bounds as absent so native framing takes its no-bounds path', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = view(mapAt());
		v.markerManager.getBounds = () => bounds(true);
		new TrackLayer(plugin(), v).attach();

		expect(v.markerManager.getBounds()).toBeNull();
	});

	it('passes a non-empty bounds through untouched', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const filled = bounds(false);
		const v = view(mapAt());
		v.markerManager.getBounds = () => filled;
		new TrackLayer(plugin(), v).attach();

		expect(v.markerManager.getBounds()).toBe(filled);
	});

	it('passes null through, and leaves a foreign bounds shape alone', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = view(mapAt());
		const foreign = {} as ReturnType<typeof bounds>;
		v.markerManager.getBounds = () => foreign;
		new TrackLayer(plugin(), v).attach();
		expect(v.markerManager.getBounds()).toBe(foreign);

		const v2 = view(mapAt());
		v2.markerManager.getBounds = () => null;
		new TrackLayer(plugin(), v2).attach();
		expect(v2.markerManager.getBounds()).toBeNull();
	});

	it('does not install over a host that no longer exposes the accessor', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = view(mapAt());
		delete (v.markerManager as Partial<typeof v.markerManager>).getBounds;

		expect(() => new TrackLayer(plugin(), v).attach()).not.toThrow();
		expect(typeof v.markerManager.getBounds).toBe('undefined');
	});

	it('restores the native accessor on detach', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const native = () => bounds(true);
		const v = view(mapAt());
		v.markerManager.getBounds = native;
		const layer = new TrackLayer(plugin(), v).attach();
		expect(v.markerManager.getBounds === native).toBe(false);

		layer.detach();
		expect(v.markerManager.getBounds === native).toBe(true);
		expect(v.markerManager.getBounds()).not.toBeNull();
	});

	it('restores a prototype accessor by deleting the wrapper, not by shadowing it', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		// The real manager is a class instance, so `getBounds` lives on the
		// prototype and `override` must take its delete branch. Restoring by
		// assignment instead would leave a permanent own property behind.
		class Manager {
			getBounds(): ReturnType<typeof bounds> | null {
				return bounds(true);
			}
		}
		const v = view(mapAt());
		v.markerManager = Object.assign(new Manager(), {
			updateMarkers: async () => undefined,
			createGeoJSONFeatures: () => [],
			getCustomColor: () => null,
			resolveColor: (color: string) => color,
			getMarkerDrivenProps: () => null,
			onOpenFile: () => undefined,
		});

		const layer = new TrackLayer(plugin(), v).attach();
		expect(Object.prototype.hasOwnProperty.call(v.markerManager, 'getBounds')).toBe(true);
		expect(v.markerManager.getBounds()).toBeNull();

		layer.detach();
		expect(Object.prototype.hasOwnProperty.call(v.markerManager, 'getBounds')).toBe(false);
		expect(v.markerManager.getBounds()).not.toBeNull();
	});
});
