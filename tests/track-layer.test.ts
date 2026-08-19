import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { ADOPTION_RETRY_MS, ADOPTION_TRIES, READ_CONCURRENCY } from '../src/constants';
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
		removeControl(control: unknown) {
			const at = controls.indexOf(control);
			if (at >= 0) controls.splice(at, 1);
		},
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

function plugin(pack: ReturnType<AdvancedMapsPlugin['offlineBasemap']> = null): AdvancedMapsPlugin {
	return {
		settings: { follow: true, measure: true, followActiveNote: false, coordSystem: 'gcj02' },
		layers: new Set(),
		resolveTracks: () => [],
		offlineBasemap: () => pack,
		// The real Plugin clears this on unload; the layer registers its adoption
		// poll with it as a second line of defence.
		registerInterval: (id: number) => id,
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
		// Zoom to fit, follow the active note, and measure — added once between them.
		expect(map.controls).toHaveLength(3);
		expect(map.centers).toHaveLength(1);
		expect(map.centers[0]).toMatchObject(
			Object.fromEntries([
				['lng', wgs2gcj(116.397428, 39.90923)[0]],
				['lat', wgs2gcj(116.397428, 39.90923)[1]],
			])
		);
	});

	it('adds only the buttons whose settings switch them on', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const map = mapAt();
		const host = plugin();
		host.settings.follow = false;
		host.settings.measure = false;
		const layer = new TrackLayer(host, view(map), true).attach();
		layer.onMapCreated(map, 'adopted');
		// Zoom to fit has no switch; the other two are switched off.
		expect(map.controls).toHaveLength(1);

		// A button switched on reaches a map that is already open, and switching it
		// off again takes it back off.
		host.settings.measure = true;
		layer.refreshControls();
		expect(map.controls).toHaveLength(2);
		host.settings.measure = false;
		layer.refreshControls();
		expect(map.controls).toHaveLength(1);
	});

	it('stops a following map when the button that stops it is taken away', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const map = mapAt();
		const host = plugin();
		host.settings.followActiveNote = true;
		const layer = new TrackLayer(host, view(map), true).attach();
		layer.onMapCreated(map, 'adopted');
		expect(layer.isFollowing()).toBe(true);

		host.settings.follow = false;
		layer.refreshControls();
		// Left following with no button to press, this map would follow forever.
		expect(layer.isFollowing()).toBe(false);
		expect(map.controls).toHaveLength(2);
	});

	it('never starts a new map following where following is switched off', () => {
		const host = plugin();
		host.settings.follow = false;
		host.settings.followActiveNote = true;
		expect(new TrackLayer(host, view(mapAt()), true).isFollowing()).toBe(false);
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
		expect(map.controls).toHaveLength(3);
	});

	it('gives up watching a view that never builds a map', async () => {
		// A Bases map leaf in a collapsed sidebar may never construct one. Without a
		// bound this polled four times a second for the rest of the session; the
		// wrapper on initializeMap is the durable path if it ever does build one.
		vi.useFakeTimers();
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const deferred = view(null);
		const layer = new TrackLayer(plugin(), deferred, true).attach();
		const cleared = vi.spyOn(window, 'clearInterval');
		layer.watchAdoptedMap();

		await vi.advanceTimersByTimeAsync(ADOPTION_RETRY_MS * (ADOPTION_TRIES + 1));
		expect(cleared).toHaveBeenCalled();

		// And having given up, it stays given up: a map appearing afterwards is
		// adopted through the wrapper, not by this timer waking again.
		cleared.mockClear();
		const late = mapAt();
		deferred.map = late;
		await vi.advanceTimersByTimeAsync(ADOPTION_RETRY_MS * 4);
		expect(late.controls).toHaveLength(0);
	});

	it('treats a later wrapped map recreation as already being in tile space', async () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const first = mapAt();
		const adopted = view(first);
		const layer = new TrackLayer(plugin(), adopted, true).attach();
		vi.spyOn(layer, 'reproject').mockResolvedValue();
		layer.onMapCreated(first, 'current');
		adopted.destroyMap();

		const recreated = mapAt();
		adopted.map = recreated;
		await adopted.initializeMap();

		expect(recreated.controls).toHaveLength(3);
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
			settings: {
				follow: true,
				measure: true,
				followActiveNote: false,
				coordSystem: 'gcj02',
				photoDatum: 'auto',
				trackColor: '#ff0000',
			},
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

describe('native popup-content wrapper', () => {
	/**
	 * A popup manager shaped like the real one: the builder is on the prototype,
	 * which is what `override` has to delete rather than assign over. Built fresh
	 * per test, so a test that removes the builder cannot take it from the next.
	 */
	function popups() {
		class Popups {
			built = 0;
			createPopupContent(): HTMLElement {
				this.built++;
				const el = document.createElement('div');
				el.className = 'bases-map-popup';
				return el;
			}
			showPopup(): void {}
			hidePopup(): void {}
		}
		return new Popups();
	}

	function withPopups(): { v: BasesMapView; manager: ReturnType<typeof popups> } {
		const v = view(mapAt());
		const manager = popups();
		v.popupManager = manager;
		return { v, manager };
	}

	it('leaves a card untouched when no feature of this plugin raised it', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const { v, manager } = withPopups();
		new TrackLayer(plugin(), v).attach();

		// What a native `marker-pins` hover does: nothing is pending, so the card
		// comes back exactly as the host built it.
		const card = v.popupManager.createPopupContent?.({} as never, null, String);
		expect(card?.className).toBe('bases-map-popup');
		expect(card?.children).toHaveLength(0);
		expect(manager.built).toBe(1);
	});

	it('does not install over a host that no longer builds its own cards', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const { v } = withPopups();
		delete (Object.getPrototypeOf(v.popupManager) as Record<string, unknown>).createPopupContent;

		expect(() => new TrackLayer(plugin(), v).attach()).not.toThrow();
		expect(Object.prototype.hasOwnProperty.call(v.popupManager, 'createPopupContent')).toBe(false);
	});

	it('restores the prototype builder by deleting the wrapper, not by shadowing it', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const { v } = withPopups();
		const native = (Object.getPrototypeOf(v.popupManager) as Record<string, unknown>).createPopupContent;

		const layer = new TrackLayer(plugin(), v).attach();
		expect(Object.prototype.hasOwnProperty.call(v.popupManager, 'createPopupContent')).toBe(true);
		expect(v.popupManager.createPopupContent === native).toBe(false);

		layer.detach();
		expect(Object.prototype.hasOwnProperty.call(v.popupManager, 'createPopupContent')).toBe(false);
		expect(v.popupManager.createPopupContent === native).toBe(true);
	});
});

describe('the places a map can export', () => {
	/** What `mapPlaces` is: private in TypeScript, an ordinary method at runtime. */
	type Exporter = { mapPlaces(nameId: string): Array<{ name: string; lat: number; lng: number; path?: string }> };

	function withMarkers(markers: unknown[]): BasesMapView {
		const v = view(mapAt());
		(v.markerManager as unknown as { markers: unknown[] }).markers = markers;
		return v;
	}

	function marker(path: string, coordinates: [number, number], value?: unknown) {
		return {
			entry: {
				file: { path, basename: path.replace(/^.*\//, '').replace(/\.md$/, '') },
				getValue: () => value,
			},
			coordinates,
		};
	}

	it('reads the notes own coordinates, not the shifted ones the map drew', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const wgs: [number, number] = [39.90923, 116.397428];
		const v = withMarkers([marker('notes/Gate.md', wgs)]);
		const layer = new TrackLayer(plugin(), v).attach();

		// The stub view is on GCJ-02, where this point is drawn some 500 m away.
		const [shiftedLng, shiftedLat] = wgs2gcj(wgs[1], wgs[0]);
		expect(shiftedLat === wgs[0]).toBe(false);
		expect(shiftedLng === wgs[1]).toBe(false);

		const places = (layer as unknown as Exporter).mapPlaces('file');
		expect(places).toEqual([{ name: 'Gate', description: '', lat: wgs[0], lng: wgs[1], path: 'notes/Gate.md' }]);
	});

	it('names a place by the file, or by a property when one is chosen', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = withMarkers([
			marker('notes/20250405.md', [30.1, 120.1], { isTruthy: () => true, toString: () => 'West Lake' }),
			// A row whose chosen property is empty keeps its file name.
			marker('notes/20250406.md', [30.2, 120.2], { isTruthy: () => false, toString: () => '' }),
		]);
		v.data = { data: [], properties: ['note.place'] };
		const layer = new TrackLayer(plugin(), v).attach();
		const exporter = layer as unknown as Exporter;

		expect(exporter.mapPlaces('file').map((p) => p.name)).toEqual(['20250405', '20250406']);
		expect(exporter.mapPlaces('p0').map((p) => p.name)).toEqual(['West Lake', '20250406']);
	});

	it('answers nothing when the manager cannot say what it holds', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = view(mapAt());
		const layer = new TrackLayer(plugin(), v).attach();
		// No `markers` at all: the entry is not offered rather than an empty file
		// being written.
		expect((layer as unknown as Exporter).mapPlaces('file')).toEqual([]);

		const empty = new TrackLayer(plugin(), withMarkers([])).attach();
		expect((empty as unknown as Exporter).mapPlaces('file')).toEqual([]);
	});

	it('skips a marker whose coordinate is not a pair of numbers', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = withMarkers([
			marker('notes/Bad.md', [NaN, 120] as [number, number]),
			{ entry: { file: { path: 'notes/None.md', basename: 'None' } }, coordinates: null },
			marker('notes/Good.md', [30.3, 120.3]),
		]);
		const layer = new TrackLayer(plugin(), v).attach();
		expect((layer as unknown as Exporter).mapPlaces('file').map((p) => p.name)).toEqual(['Good']);
	});
});

describe('the basemap a map draws', () => {
	const PACK = {
		url: 'app://token/mnt/tiles/{z}/{x}/{y}.png',
		sourceMaxZoom: 14,
		cameraMinZoom: 2,
	};

	/** A view whose native `loadConfig` answers with the background it is given. */
	function configured(option: unknown, native: string) {
		const v = view(mapAt());
		v.config = {
			get: (key) => (key === 'offlineTiles' ? option : undefined),
			getDisplayName: String,
		};
		v.loadConfig = () => ({ mapTiles: [native], mapTilesDark: [native], minZoom: 0, defaultZoom: 4 });
		return v;
	}

	it('substitutes the pack where the shared config object is built', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = configured('', 'https://tiles.example.com/{z}/{x}/{y}.png');
		new TrackLayer(plugin(PACK), v).attach();

		const config = v.loadConfig();
		expect(config.mapTiles).toEqual([PACK.url]);
		expect(config.mapTilesDark).toEqual([PACK.url]);
		// The camera bound rides along on the number the native view already applies.
		expect(config.minZoom).toBe(2);
		expect(config.defaultZoom).toBe(4);
	});

	it('leaves a view that has declined it on its own background', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = configured('off', 'https://tiles.example.com/{z}/{x}/{y}.png');
		new TrackLayer(plugin(PACK), v).attach();

		expect(v.loadConfig().mapTiles).toEqual(['https://tiles.example.com/{z}/{x}/{y}.png']);
		expect(v.loadConfig().minZoom).toBe(0);
	});

	it('leaves every view alone when no pack is configured', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		const v = configured('', 'https://tiles.example.com/{z}/{x}/{y}.png');
		new TrackLayer(plugin(null), v).attach();

		expect(v.loadConfig().mapTiles).toEqual(['https://tiles.example.com/{z}/{x}/{y}.png']);
	});

	it('projects the configured centre against the tiles that will actually be drawn', () => {
		vi.stubGlobal('createDiv', () => document.createElement('div'));
		// Automatic mode, and a Chinese background the pack is about to replace.
		const amap = () => {
			const v = view(mapAt());
			v.config = {
				get: (key) => (key === 'offlineTiles' ? '' : key === 'coordSystem' ? 'auto' : undefined),
				getDisplayName: String,
			};
			v.loadConfig = () => ({
				mapTiles: ['https://webrd01.is.autonavi.com/{z}/{x}/{y}.png'],
				center: '30.242000,120.149000',
			});
			return v;
		};

		const packed = amap();
		new TrackLayer(plugin(PACK), packed).attach();
		// A local path names no provider, so automatic answers WGS-84 and the
		// centre is left where the base file put it — shifted, it would be the
		// GCJ-02 value against tiles that never moved.
		expect(packed.loadConfig().center).toBe('30.242000,120.149000');

		// The same view without a pack keeps the Amap background, and there the
		// same centre does move — which is what makes the assertion above about
		// the order of the two substitutions rather than about nothing happening.
		const plain = amap();
		new TrackLayer(plugin(null), plain).attach();
		const [lng, lat] = wgs2gcj(120.149, 30.242);
		expect(plain.loadConfig().center).toBe(`${lat},${lng}`);
	});
});
