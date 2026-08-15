import { afterEach, describe, expect, it, vi } from 'vitest';
import { wgs2gcj } from '../src/coords';
import { TrackLayer } from '../src/track-layer';
import type AdvancedMapsPlugin from '../src/main';
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
