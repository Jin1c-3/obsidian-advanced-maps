import { describe, expect, it, vi } from 'vitest';
import {
	applyOfflineTiles,
	boundOfflineSource,
	localResourcePrefix,
	offlineTileUrl,
	offlineZoomBounds,
	findPack,
	nativeTileSets,
	packBackgroundId,
	packBackgroundName,
	packBasemap,
	resolveBackground,
	restyleForBasemap,
	tilePacks,
	tileSetLabel,
	tilesProblem,
	vaultBasePath,
	type OfflineBasemap,
	type TilePack,
} from '../src/basemap';
import type {
	BasesMapView,
	MapConfig,
	MapLibreMap,
	NativeMapsPlugin,
	VaultPaths,
} from '../src/types/obsidian-internals';

const PREFIX = 'app://d8f7f8c48a5edbe498d0f343debc07325525/';
const VAULT = '/home/ethan/Documents/Obsidian/jot';

/** What Android answered, measured through the running application's web view. */
const MOBILE_PREFIX = 'http://localhost/_capacitor_file_/';
const MOBILE_VAULT = '/storage/emulated/0/Documents/advanced-maps-demo';

/**
 * An adapter shaped like the one a phone has: the resource path is the full path
 * behind the prefix, percent-encoded per segment, with no query on the end.
 */
function mobileAdapter(base = MOBILE_VAULT): VaultPaths {
	const full = (path: string) => (path === '' ? `${base}/` : `${base}/${path}`);
	return {
		getFullPath: full,
		getResourcePath: (path) =>
			'http://localhost/_capacitor_file_' +
			full(path)
				.split('/')
				.map((segment) => encodeURIComponent(segment))
				.join('/')
				.replace(/\/$/, ''),
	};
}

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

describe('localResourcePrefix', () => {
	it('derives the prefix a phone serves its own local files behind', () => {
		// Measured on Android: `getResourcePath('x')` is `getFullPath('x')` behind
		// `http://localhost/_capacitor_file_`, which is the one form that loads.
		expect(localResourcePrefix(mobileAdapter())).toBe(MOBILE_PREFIX);
	});

	it('derives it through a vault directory that had to be encoded', () => {
		expect(localResourcePrefix(mobileAdapter('/storage/emulated/0/我的 库'))).toBe(MOBILE_PREFIX);
	});

	it('derives it when the host left that directory unencoded instead', () => {
		const base = '/storage/emulated/0/My Vault';
		expect(
			localResourcePrefix({
				getFullPath: (path) => `${base}/${path}`,
				getResourcePath: (path) => `http://localhost/_capacitor_file_${base}/${path}`,
			})
		).toBe(MOBILE_PREFIX);
	});

	it('derives nothing from answers that do not share a tail', () => {
		// A query on the end, which is one shape a resource path comes in.
		expect(
			localResourcePrefix({
				getFullPath: (path) => `${VAULT}/${path}`,
				getResourcePath: (path) => `${PREFIX}home/ethan/Documents/Obsidian/jot/${path}?1755600000000`,
			})
		).toBeNull();
		// Separators written the other way, which is a Windows vault.
		expect(
			localResourcePrefix({
				getFullPath: (path) => `C:\\Vault\\${path}`,
				getResourcePath: (path) => `${PREFIX}C:/Vault/${path}`,
			})
		).toBeNull();
		// A host that answers with the path and no prefix at all.
		expect(
			localResourcePrefix({
				getFullPath: (path) => `${VAULT}/${path}`,
				getResourcePath: (path) => `${VAULT}/${path}`,
			})
		).toBeNull();
	});

	it('derives nothing from an adapter that will not answer', () => {
		expect(localResourcePrefix(null)).toBeNull();
		expect(localResourcePrefix(undefined)).toBeNull();
		expect(localResourcePrefix({})).toBeNull();
		expect(localResourcePrefix({ getFullPath: (path) => `${VAULT}/${path}` })).toBeNull();
		expect(
			localResourcePrefix({
				getFullPath: (path) => `${VAULT}/${path}`,
				getResourcePath: () => {
					throw new Error('no such file');
				},
			})
		).toBeNull();
		// An answer that is not a string is not a path to subtract from.
		expect(localResourcePrefix({ getFullPath: () => 42, getResourcePath: () => 42 })).toBeNull();
	});
});

describe('vaultBasePath', () => {
	it('asks the adapter where the vault starts, trailing separator and all', () => {
		expect(vaultBasePath(mobileAdapter())).toBe(`${MOBILE_VAULT}/`);
		expect(vaultBasePath({ getFullPath: () => VAULT })).toBe(VAULT);
	});

	it('answers empty for an adapter that will not say', () => {
		expect(vaultBasePath(null)).toBe('');
		expect(vaultBasePath(undefined)).toBe('');
		expect(vaultBasePath({})).toBe('');
		expect(vaultBasePath({ getFullPath: () => 42 })).toBe('');
		expect(
			vaultBasePath({
				getFullPath: () => {
					throw new Error('no vault');
				},
			})
		).toBe('');
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

	it('keeps a dot-folder, which is how a pack hides from the vault index', () => {
		// `.tiles` is not `./tiles`: only the second is a "start here" prefix to
		// strip, and eating the dot would point the map one level too high.
		expect(offlineTileUrl('.tiles/{z}/{x}/{y}.png', PREFIX, VAULT)).toBe(
			`${PREFIX}home/ethan/Documents/Obsidian/jot/.tiles/{z}/{x}/{y}.png`
		);
		expect(offlineTileUrl('.tiles/{z}/{x}/{y}.png', MOBILE_PREFIX, vaultBasePath(mobileAdapter()))).toBe(
			`${MOBILE_PREFIX}storage/emulated/0/Documents/advanced-maps-demo/.tiles/{z}/{x}/{y}.png`
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

	it('builds the same two shapes from a phone prefix', () => {
		const base = vaultBasePath(mobileAdapter());
		expect(offlineTileUrl('/sdcard/tiles/{z}/{x}/{y}.png', MOBILE_PREFIX, base)).toBe(
			`${MOBILE_PREFIX}sdcard/tiles/{z}/{x}/{y}.png`
		);
		expect(offlineTileUrl('tiles/{z}/{x}/{y}.png', MOBILE_PREFIX, base)).toBe(
			`${MOBILE_PREFIX}storage/emulated/0/Documents/advanced-maps-demo/tiles/{z}/{x}/{y}.png`
		);
	});

	it('answers null for anything it cannot resolve', () => {
		expect(offlineTileUrl('', PREFIX, VAULT)).toBeNull();
		expect(offlineTileUrl('/mnt/maps/{x}/{y}.png', PREFIX, VAULT)).toBeNull();
		// No prefix is a platform that cannot serve local files at all.
		expect(offlineTileUrl('/mnt/maps/{z}/{x}/{y}.png', '', VAULT)).toBeNull();
		// A relative template with nowhere to start from; the filesystem root is
		// not a reasonable guess.
		expect(offlineTileUrl('tiles/{z}/{x}/{y}.png', PREFIX, '')).toBeNull();
		// Nothing derivable and no constant either: no pack, rather than a URL the
		// web view would refuse a tile at a time.
		expect(offlineTileUrl('/sdcard/tiles/{z}/{x}/{y}.png', localResourcePrefix({}) ?? '', '')).toBeNull();
		expect(offlineTileUrl('tiles/{z}/{x}/{y}.png', MOBILE_PREFIX, vaultBasePath({}))).toBeNull();
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

describe('tilePacks', () => {
	it('reads a stored list, holding each level inside the range a pyramid has', () => {
		expect(
			tilePacks([
				{ name: 'City', path: '/packs/city/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 16 },
				{ name: 'Trail', path: '.tiles/{z}/{x}/{y}.png', minZoom: -3, maxZoom: 99 },
			])
		).toEqual([
			{ name: 'City', path: '/packs/city/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 16 },
			{ name: 'Trail', path: '.tiles/{z}/{x}/{y}.png', minZoom: 0, maxZoom: 22 },
		]);
	});

	it('leaves out a row with no name, since nothing could refer to it', () => {
		expect(tilePacks([{ path: '/packs/{z}/{x}/{y}.png' }, { name: '   ', path: '/x/{z}/{x}/{y}.png' }])).toEqual(
			[]
		);
	});

	it('keeps the first of two rows sharing a name', () => {
		const packs = tilePacks([
			{ name: 'City', path: '/first/{z}/{x}/{y}.png' },
			{ name: 'City', path: '/second/{z}/{x}/{y}.png' },
		]);
		expect(packs).toHaveLength(1);
		expect(packs[0].path).toBe('/first/{z}/{x}/{y}.png');
	});

	it('answers an empty list for anything that is not one', () => {
		expect(tilePacks(undefined)).toEqual([]);
		expect(tilePacks('/packs/{z}/{x}/{y}.png')).toEqual([]);
		expect(tilePacks([null, 7, 'x'])).toEqual([]);
	});

	it('falls back to the whole range for a level a stored file states as anything else', () => {
		expect(tilePacks([{ name: 'City', path: 'x/{z}/{x}/{y}.png', minZoom: '4', maxZoom: null }])).toEqual([
			{ name: 'City', path: 'x/{z}/{x}/{y}.png', minZoom: 0, maxZoom: 22 },
		]);
	});
});

describe('findPack', () => {
	const packs: TilePack[] = [
		{ name: 'City', path: '/city/{z}/{x}/{y}.png', minZoom: 0, maxZoom: 16 },
		{ name: 'Trail', path: '/trail/{z}/{x}/{y}.png', minZoom: 8, maxZoom: 14 },
	];

	it('finds a pack by the name the reader gave it', () => {
		expect(findPack(packs, 'Trail')?.path).toBe('/trail/{z}/{x}/{y}.png');
	});

	it('answers null for a name nothing has', () => {
		expect(findPack(packs, 'Coast')).toBeNull();
		expect(findPack([], 'City')).toBeNull();
	});
});

describe('background ids', () => {
	it('round-trips a pack name through the id a view stores', () => {
		expect(packBackgroundName(packBackgroundId('Trail'))).toBe('Trail');
		// A name with the separator in it survives, because only the first one is
		// the prefix.
		expect(packBackgroundName(packBackgroundId('pack:Trail'))).toBe('pack:Trail');
	});

	it('answers null for every id that is not one of ours', () => {
		// A host background's id is a `Date.now()` string minted by its settings tab.
		expect(packBackgroundName('1786085922534')).toBeNull();
		expect(packBackgroundName('off')).toBeNull();
		expect(packBackgroundName('')).toBeNull();
		expect(packBackgroundName('pack:')).toBeNull();
		expect(packBackgroundName(undefined)).toBeNull();
	});
});

describe('resolveBackground', () => {
	const PLUGIN_DEFAULT = packBackgroundId('City');

	it('puts the reader ahead of the view, and the view ahead of the plugin', () => {
		expect(resolveBackground(packBackgroundId('Trail'), 'off', PLUGIN_DEFAULT)).toBe(packBackgroundId('Trail'));
		expect(resolveBackground(null, 'off', PLUGIN_DEFAULT)).toBe('off');
		expect(resolveBackground(null, '', PLUGIN_DEFAULT)).toBe(PLUGIN_DEFAULT);
	});

	it('reads a stored `off` as naming the background the native view resolves', () => {
		// The value a base file has been holding since before there was more than
		// one background to name, and it still means what it meant.
		expect(resolveBackground(null, 'off', PLUGIN_DEFAULT)).toBe('off');
	});

	it('reads a host background a view names, so one base file can hold both', () => {
		expect(resolveBackground(null, '1786085922534', PLUGIN_DEFAULT)).toBe('1786085922534');
	});

	it('ignores a pick and a view value that are not strings', () => {
		expect(resolveBackground(undefined, undefined, PLUGIN_DEFAULT)).toBe(PLUGIN_DEFAULT);
		expect(resolveBackground(7, { off: true }, PLUGIN_DEFAULT)).toBe(PLUGIN_DEFAULT);
	});
});

describe('packBasemap', () => {
	const city: TilePack = { name: 'City', path: '/packs/city/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 16 };
	const trail: TilePack = { name: 'Trail', path: 'tiles/{z}/{x}/{y}.png', minZoom: 10, maxZoom: 14 };

	it('resolves one pack with its own two bounds', () => {
		expect(packBasemap(city, PREFIX, VAULT)).toEqual({
			url: `${PREFIX}packs/city/{z}/{x}/{y}.png`,
			sourceMaxZoom: 16,
			cameraMinZoom: 1,
		});
	});

	it('gives two packs their own ranges rather than one shared pair', () => {
		const first = packBasemap(city, PREFIX, VAULT);
		const second = packBasemap(trail, PREFIX, VAULT);
		expect(first?.sourceMaxZoom).toBe(16);
		expect(first?.cameraMinZoom).toBe(1);
		expect(second?.sourceMaxZoom).toBe(14);
		expect(second?.cameraMinZoom).toBe(9);
		// The vault-relative one starts at the vault, not at the other pack.
		expect(second?.url).toBe(`${PREFIX}home/ethan/Documents/Obsidian/jot/tiles/{z}/{x}/{y}.png`);
	});

	it('answers null for no pack, and for a pack whose template cannot draw', () => {
		expect(packBasemap(null, PREFIX, VAULT)).toBeNull();
		expect(packBasemap({ ...city, path: '' }, PREFIX, VAULT)).toBeNull();
		expect(packBasemap({ ...city, path: '/packs/city.png' }, PREFIX, VAULT)).toBeNull();
	});
});

describe('nativeTileSets', () => {
	it('reads the host backgrounds it can switch to', () => {
		const maps = {
			settings: {
				tileSets: [
					{ id: '1786085922534', name: 'Liberty', lightTiles: 'https://tiles.example/styles/liberty' },
					{ id: '1786102216451', name: 'ArcGIS satellite' },
				],
			},
		} as NativeMapsPlugin;
		expect(nativeTileSets(maps).map((entry) => entry.id)).toEqual(['1786085922534', '1786102216451']);
	});

	it('leaves out an entry the host could not switch to either', () => {
		const maps = { settings: { tileSets: [{ name: 'No id' }, { id: '' }, null, 'x'] } } as NativeMapsPlugin;
		expect(nativeTileSets(maps)).toEqual([]);
	});

	it('answers an empty list for a shape this cannot read', () => {
		expect(nativeTileSets(null)).toEqual([]);
		expect(nativeTileSets({})).toEqual([]);
		expect(nativeTileSets({ settings: {} })).toEqual([]);
		expect(nativeTileSets({ settings: { tileSets: 'nope' } })).toEqual([]);
	});

	it('falls back to the id for a host background with no name', () => {
		expect(tileSetLabel({ id: '1786085922534', name: '  ' })).toBe('1786085922534');
		expect(tileSetLabel({ id: '1786085922534', name: 'Liberty' })).toBe('Liberty');
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
