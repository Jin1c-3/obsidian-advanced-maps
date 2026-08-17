import { describe, expect, it, vi } from 'vitest';
import {
	applyOfflineTiles,
	boundOfflineSource,
	offlineTileUrl,
	offlineZoomBounds,
	restyleForBasemap,
	tilesProblem,
	usesOfflineTiles,
	type OfflineBasemap,
} from '../src/basemap';
import type { BasesMapView, MapConfig, MapLibreMap } from '../src/types/obsidian-internals';

const PREFIX = 'app://d8f7f8c48a5edbe498d0f343debc07325525/';
const VAULT = '/home/ethan/Documents/Obsidian/jot';

function pack(over: Partial<OfflineBasemap> = {}): OfflineBasemap {
	return { url: `${PREFIX}tiles/{z}/{x}/{y}.png`, sourceMaxZoom: 16, cameraMinZoom: 0, ...over };
}

describe('tilesProblem', () => {
	it('accepts a template carrying all three placeholders', () => {
		expect(tilesProblem('/maps/{z}/{x}/{y}.png')).toBeNull();
		// Order and layout are MapLibre's business, not this check's.
		expect(tilesProblem('/maps/{z}_{y}_{x}.jpg')).toBeNull();
		// `{-y}` is TMS, and MapLibre fills it in as readily as `{y}`.
		expect(tilesProblem('/maps/{z}/{x}/{-y}.png')).toBeNull();
	});

	it('reports a template missing any one of them', () => {
		expect(tilesProblem('/maps/{x}/{y}.png')).toBe('placeholders');
		expect(tilesProblem('/maps/{z}/{y}.png')).toBe('placeholders');
		expect(tilesProblem('/maps/{z}/{x}.png')).toBe('placeholders');
		// Without them the native builder would take the string for a style URL
		// and fetch it, which is not something `app://` can be fetched with.
		expect(tilesProblem('https://tiles.example.com/style.json')).toBe('placeholders');
	});

	it('reports an empty template, which the caller reads as "no pack" first', () => {
		expect(tilesProblem('')).toBe('placeholders');
		expect(tilesProblem('   ')).toBe('placeholders');
	});
});

describe('offlineTileUrl', () => {
	it('puts the live prefix in front of an absolute path', () => {
		expect(offlineTileUrl('/mnt/maps/{z}/{x}/{y}.png', PREFIX, VAULT)).toBe(`${PREFIX}mnt/maps/{z}/{x}/{y}.png`);
	});

	it('joins a relative template onto the vault', () => {
		expect(offlineTileUrl('tiles/{z}/{x}/{y}.png', PREFIX, VAULT)).toBe(
			`${PREFIX}home/ethan/Documents/Obsidian/jot/tiles/{z}/{x}/{y}.png`
		);
		expect(offlineTileUrl('./tiles/{z}/{x}/{y}.png', PREFIX, `${VAULT}/`)).toBe(
			`${PREFIX}home/ethan/Documents/Obsidian/jot/tiles/{z}/{x}/{y}.png`
		);
	});

	it('takes a Windows path, backslashes and drive letter alike', () => {
		expect(offlineTileUrl('D:\\maps\\{z}\\{x}\\{y}.png', PREFIX, 'C:/Vault')).toBe(
			`${PREFIX}D%3A/maps/{z}/{x}/{y}.png`
		);
		expect(offlineTileUrl('tiles\\{z}\\{x}\\{y}.png', PREFIX, 'C:\\Vault')).toBe(
			`${PREFIX}C%3A/Vault/tiles/{z}/{x}/{y}.png`
		);
	});

	it('encodes a segment the way a resource path does, and leaves the braces alone', () => {
		// Measured against `vault.getResourcePath`: a space is `%20` and a CJK
		// folder is percent-encoded, with the separators untouched.
		expect(offlineTileUrl('/mnt/tile pack/{z}/{x}/{y}.png', PREFIX, VAULT)).toBe(
			`${PREFIX}mnt/tile%20pack/{z}/{x}/{y}.png`
		);
		expect(offlineTileUrl('/mnt/图片/{z}/{x}/{y}.png', PREFIX, VAULT)).toBe(
			`${PREFIX}mnt/%E5%9B%BE%E7%89%87/{z}/{x}/{y}.png`
		);
		// Encoded braces would reach MapLibre as literal text and never be filled.
		expect(offlineTileUrl('/mnt/maps/{z}/{x}/{y}.png', PREFIX, VAULT)).not.toContain('%7B');
	});

	it('answers null for anything it cannot resolve', () => {
		expect(offlineTileUrl('', PREFIX, VAULT)).toBeNull();
		expect(offlineTileUrl('/mnt/maps/{x}/{y}.png', PREFIX, VAULT)).toBeNull();
		// No prefix is a platform that cannot serve local files at all.
		expect(offlineTileUrl('/mnt/maps/{z}/{x}/{y}.png', '', VAULT)).toBeNull();
		// A relative template with nowhere to start from; the filesystem root is
		// not a reasonable guess.
		expect(offlineTileUrl('tiles/{z}/{x}/{y}.png', PREFIX, '')).toBeNull();
	});
});

describe('offlineZoomBounds', () => {
	it('bounds the source at the deepest level and the camera one above the shallowest', () => {
		// A 256 px raster source asks for a tile one level deeper than the map's
		// zoom, so a pack starting at z2 is covered from map zoom 1 up.
		expect(offlineZoomBounds(2, 14)).toEqual({ sourceMaxZoom: 14, cameraMinZoom: 1 });
	});

	it('leaves the camera unbounded for a pack that starts at the top', () => {
		expect(offlineZoomBounds(0, 16)).toEqual({ sourceMaxZoom: 16, cameraMinZoom: 0 });
	});

	it('orders bounds given the wrong way round rather than rejecting them', () => {
		expect(offlineZoomBounds(14, 2)).toEqual({ sourceMaxZoom: 14, cameraMinZoom: 1 });
	});

	it('clamps to what a tile pyramid can be addressed at', () => {
		expect(offlineZoomBounds(-5, 99)).toEqual({ sourceMaxZoom: 22, cameraMinZoom: 0 });
		expect(offlineZoomBounds(3.6, 15.2)).toEqual({ sourceMaxZoom: 15, cameraMinZoom: 3 });
	});

	it('falls back to no bound at all for a stored value that is not a number', () => {
		expect(offlineZoomBounds('4', null)).toEqual({ sourceMaxZoom: 22, cameraMinZoom: 0 });
		expect(offlineZoomBounds(undefined, Number.NaN)).toEqual({ sourceMaxZoom: 22, cameraMinZoom: 0 });
	});
});

describe('applyOfflineTiles', () => {
	it('writes the pack into both themes', () => {
		const config: MapConfig = { mapTiles: ['https://tiles.example.com/{z}/{x}/{y}.png'], mapTilesDark: [] };
		expect(applyOfflineTiles(config, pack())).toBe(true);
		// Dark too: leaving it alone would send the map back to the network at the
		// next theme change.
		expect(config.mapTiles).toEqual([pack().url]);
		expect(config.mapTilesDark).toEqual([pack().url]);
	});

	it('raises the minimum zoom but never lowers one already set higher', () => {
		const low: MapConfig = { minZoom: 0, defaultZoom: 4 };
		applyOfflineTiles(low, pack({ cameraMinZoom: 6 }));
		expect(low.minZoom).toBe(6);
		// A default below the new minimum is a camera that jumps on the first frame.
		expect(low.defaultZoom).toBe(6);

		const high: MapConfig = { minZoom: 9, defaultZoom: 12 };
		applyOfflineTiles(high, pack({ cameraMinZoom: 6 }));
		expect(high.minZoom).toBe(9);
		expect(high.defaultZoom).toBe(12);
	});

	it('changes nothing without a pack, or without a config', () => {
		const config: MapConfig = { mapTiles: ['native'], minZoom: 0 };
		expect(applyOfflineTiles(config, null)).toBe(false);
		expect(config).toEqual({ mapTiles: ['native'], minZoom: 0 });
		expect(applyOfflineTiles(undefined, pack())).toBe(false);
	});

	it('leaves a config that states no zoom numbers alone', () => {
		const config: MapConfig = {};
		applyOfflineTiles(config, pack({ cameraMinZoom: 3 }));
		expect(config.minZoom).toBeUndefined();
		expect(config.defaultZoom).toBeUndefined();
	});
});

/** A map answering with one style and remembering the sources handed back. */
function mapWith(sources: Record<string, unknown>): {
	map: MapLibreMap;
	handles: Record<string, { maxzoom?: number; setTiles: () => void }>;
} {
	const handles: Record<string, { maxzoom?: number; setTiles: () => void }> = {};
	for (const id of Object.keys(sources)) handles[id] = { setTiles: vi.fn() };
	const map = {
		getStyle: () => ({ sources }),
		getSource: (id: string) => handles[id],
	} as unknown as MapLibreMap;
	return { map, handles };
}

describe('boundOfflineSource', () => {
	const url = pack().url;

	it('bounds the raster source drawing this pack', () => {
		const { map, handles } = mapWith({
			'custom-tiles-0': { type: 'raster', tiles: [url] },
		});
		expect(boundOfflineSource(map, url, 14)).toBe(1);
		expect(handles['custom-tiles-0'].maxzoom).toBe(14);
		// Assignment only: `setTiles` would abort every in-flight request and drop
		// the tiles already drawn, and is measured unnecessary.
		expect(handles['custom-tiles-0'].setTiles).not.toHaveBeenCalled();
	});

	it('leaves every source that is not this pack alone', () => {
		const { map, handles } = mapWith({
			openmaptiles: { type: 'vector', url: 'https://example.com/tiles.json' },
			'custom-tiles-0': { type: 'raster', tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'] },
			broken: { type: 'raster' },
		});
		expect(boundOfflineSource(map, url, 14)).toBe(0);
		for (const handle of Object.values(handles)) expect(handle.maxzoom).toBeUndefined();
	});

	it('finds the source by its URL rather than by the id the host happens to mint', () => {
		const { map, handles } = mapWith({ 'some-other-id': { type: 'raster', tiles: [url] } });
		expect(boundOfflineSource(map, url, 9)).toBe(1);
		expect(handles['some-other-id'].maxzoom).toBe(9);
	});

	it('stands down on a map that cannot answer with a style', () => {
		expect(boundOfflineSource({} as MapLibreMap, url, 14)).toBe(0);
		expect(
			boundOfflineSource(
				{
					getStyle: () => {
						throw new Error('map is gone');
					},
				} as unknown as MapLibreMap,
				url,
				14
			)
		).toBe(0);
		expect(boundOfflineSource({ getStyle: () => ({}) } as unknown as MapLibreMap, url, 14)).toBe(0);
	});

	it('stands down when the style names a source the map will not hand back', () => {
		const map = {
			getStyle: () => ({ sources: { 'custom-tiles-0': { type: 'raster', tiles: [url] } } }),
			getSource: () => undefined,
		} as unknown as MapLibreMap;
		expect(boundOfflineSource(map, url, 14)).toBe(0);
	});
});

describe('usesOfflineTiles', () => {
	it('reads an unset option as using the pack', () => {
		expect(usesOfflineTiles('')).toBe(true);
		expect(usesOfflineTiles(undefined)).toBe(true);
		expect(usesOfflineTiles(null)).toBe(true);
	});

	it('declines only on the value that says so', () => {
		expect(usesOfflineTiles('off')).toBe(false);
		// Anything a stored base file might hold means on: the only way to decline
		// is to have said so.
		expect(usesOfflineTiles('yes')).toBe(true);
	});
});

describe('restyleForBasemap', () => {
	/** Mocks held by name rather than read back off the view, which lint reads
	 *  as an unbound method. */
	function harness(over: Partial<BasesMapView> = {}) {
		const setMinZoom = vi.fn();
		const loadConfig = vi.fn((): MapConfig => ({ minZoom: 5 }));
		const updateMapStyle = vi.fn();
		const view = {
			map: { setMinZoom } as unknown as MapLibreMap,
			mapConfig: { currentTileSetId: 'satellite' },
			loadConfig,
			updateMapStyle,
			...over,
		} as unknown as BasesMapView;
		return { view, setMinZoom, loadConfig, updateMapStyle };
	}

	it('rebuilds the config, applies its minimum zoom and restyles', () => {
		const { view, setMinZoom, loadConfig, updateMapStyle } = harness();
		expect(restyleForBasemap(view)).toBe(true);
		// The tile set the map was on is carried through, so a restyle is not also
		// a silent switch back to the first background.
		expect(loadConfig).toHaveBeenCalledWith('satellite');
		expect(view.mapConfig).toEqual({ minZoom: 5 });
		expect(setMinZoom).toHaveBeenCalledWith(5);
		expect(updateMapStyle).toHaveBeenCalledTimes(1);
	});

	it('carries no tile set when the config does not name one', () => {
		const { view, loadConfig } = harness({ mapConfig: {} });
		restyleForBasemap(view);
		expect(loadConfig).toHaveBeenCalledWith(undefined);
	});

	it('does nothing for a view with no map yet, or one that cannot rebuild', () => {
		const noMap = harness({ map: null });
		expect(restyleForBasemap(noMap.view)).toBe(false);
		expect(noMap.loadConfig).not.toHaveBeenCalled();
		expect(restyleForBasemap(harness({ loadConfig: undefined as never }).view)).toBe(false);
		expect(restyleForBasemap(harness({ updateMapStyle: undefined as never }).view)).toBe(false);
		expect(restyleForBasemap(null)).toBe(false);
	});

	it('restyles a map that cannot take a minimum zoom', () => {
		const { view, updateMapStyle } = harness({ map: {} as unknown as MapLibreMap });
		expect(restyleForBasemap(view)).toBe(true);
		expect(updateMapStyle).toHaveBeenCalledTimes(1);
	});
});
