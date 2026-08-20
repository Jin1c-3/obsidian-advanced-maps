import { describe, expect, it } from 'vitest';
import {
	basemapStartsOn,
	DEFAULT_SETTINGS,
	dropLegacyBasemap,
	excludedFragments,
	exclusionRows,
	fallsBackToDefault,
	forceKnownEnums,
	isExcluded,
	migratedPack,
	packNameFromPath,
	refreshesTracks,
	storedExclusions,
	typedLevel,
	type AdvancedMapsSettings,
	type LegacyBasemap,
} from '../src/settings';

describe('refreshesTracks', () => {
	it('refreshes every paint, framing and embed-size setting on open maps', () => {
		for (const key of [
			'trackColor',
			'trackWeight',
			'trackOpacity',
			'fitMaxZoom',
			'embedHeight',
			'trackStats',
			'elevationProfile',
			'trackMarkers',
			'showPhotos',
			'photoThumbnails',
			'photoDatum',
		]) {
			expect(refreshesTracks(key), key).toBe(true);
		}
	});

	it('leaves unrelated settings to their own side effects', () => {
		for (const key of ['basePath', 'geocodeProvider', 'locate', 'unknown']) {
			expect(refreshesTracks(key), key).toBe(false);
		}
	});
});

describe('fallsBackToDefault', () => {
	// Restated rather than imported, deliberately: a key silently dropped from the
	// list is exactly what this is here to catch, and a test reading the same
	// array cannot see that happen.
	const KEYS = ['coordsProperty', 'placeProperty', 'trackColor'] as const;

	it('covers every text row that shows its default as the placeholder', () => {
		for (const key of KEYS) expect(fallsBackToDefault(key), key).toBe(true);
	});

	it('gives each of them something to fall back to', () => {
		// A listed key whose default is '' would make the fallback a no-op and the
		// greyed placeholder a lie about what clearing the box does.
		for (const key of KEYS) expect(DEFAULT_SETTINGS[key], key).not.toBe('');
	});

	it('leaves keys whose empty value means something alone', () => {
		for (const key of ['amapKey', 'amapSecretId', 'aroundViewName', 'basePath', 'autoFillExclude', 'unknown']) {
			expect(fallsBackToDefault(key), key).toBe(false);
		}
	});
});

describe('the skip list', () => {
	it('excludes templates out of the box', () => {
		expect(isExcluded('templates/daily.md', DEFAULT_SETTINGS.autoFillExclude)).toBe(true);
	});

	it('skips nothing once the reader has removed every row', () => {
		// No longer a placeholder-backed box: an emptied list is an answer, and
		// restoring `templates` under a reader who just deleted it would be the
		// pane refusing what it offered.
		expect(fallsBackToDefault('autoFillExclude')).toBe(false);
		expect(isExcluded('templates/daily.md', '')).toBe(false);
	});

	it('keeps a row the reader has added but not yet typed into', () => {
		// What the pane draws and what matches a path differ in exactly one place:
		// a blank row is a row, and is never a fragment every path contains.
		expect(exclusionRows('templates, ')).toEqual(['templates', '']);
		expect(excludedFragments('templates, ')).toEqual(['templates']);
		expect(isExcluded('anywhere/at/all.md', 'templates, ')).toBe(false);
	});

	it('has no rows at all for an empty list', () => {
		expect(exclusionRows('')).toEqual([]);
	});

	it('survives the round trip, one blank row included', () => {
		// The blank row is the case a join cannot state: `['']` joins to `''`, and
		// `''` reads back as no rows at all — so adding a row to an emptied list
		// used to add one that was gone before it could be drawn.
		for (const rows of [[], [''], ['templates'], ['templates', ''], ['templates', 'archive']]) {
			expect(exclusionRows(storedExclusions(rows)), JSON.stringify(rows)).toEqual(rows);
		}
	});

	it('excludes nothing on the strength of a blank row', () => {
		expect(excludedFragments(storedExclusions(['']))).toEqual([]);
		expect(isExcluded('anywhere/at/all.md', storedExclusions(['']))).toBe(false);
	});
});

describe('a zoom level typed by hand', () => {
	it('holds what was typed inside the range a tile pyramid has', () => {
		expect(typedLevel('4', 16)).toBe(4);
		expect(typedLevel('4.6', 16)).toBe(5);
		expect(typedLevel('-2', 16)).toBe(0);
		expect(typedLevel('99', 16)).toBe(22);
	});

	it('keeps the level the pack had when the box is emptied to type a new one', () => {
		// `Number('')` is 0, and 0 as a deepest level is the whole world in a
		// single tile — a pack silently ruined between two keystrokes.
		expect(typedLevel('', 16)).toBe(16);
		expect(typedLevel('   ', 16)).toBe(16);
		expect(typedLevel('nine', 16)).toBe(16);
		expect(typedLevel(undefined, 16)).toBe(16);
		expect(typedLevel(null, 16)).toBe(16);
	});
});

describe('the one pack that had no name', () => {
	it('becomes one named pack, keeping both of its levels', () => {
		expect(
			migratedPack({
				offlineTiles: '/home/you/tiles/{z}/{x}/{y}.png',
				offlineTilesMinZoom: 2,
				offlineTilesMaxZoom: 14,
			})
		).toEqual({ name: 'tiles', path: '/home/you/tiles/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 14 });
	});

	it('migrates nothing for a reader who never configured one', () => {
		expect(migratedPack(null)).toBeNull();
		expect(migratedPack({})).toBeNull();
		expect(migratedPack({ offlineTiles: '   ' })).toBeNull();
		// The two levels on their own are the defaults, not a pack.
		expect(migratedPack({ offlineTilesMinZoom: 2, offlineTilesMaxZoom: 14 })).toBeNull();
	});

	it('names it after the last directory above its placeholders', () => {
		expect(packNameFromPath('/home/you/tiles/{z}/{x}/{y}.png')).toBe('tiles');
		// A dot-folder inside the vault, which is the layout the guide recommends
		// to a reader whose settings sync.
		expect(packNameFromPath('.tiles/{z}/{x}/{y}.png')).toBe('.tiles');
		expect(packNameFromPath('C:/Maps/Hangzhou/{z}/{x}/{-y}.jpg')).toBe('Hangzhou');
		expect(packNameFromPath('D:\\packs\\coast\\{z}\\{x}\\{y}.png')).toBe('coast');
		// Placeholders and nothing else: there is no directory to read a name off.
		expect(packNameFromPath('{z}/{x}/{y}.png')).not.toBe('');
	});

	it('drops the old keys, and only rewrites the file when there were any', () => {
		const upgraded = {
			...DEFAULT_SETTINGS,
			offlineTiles: '/tiles/{z}/{x}/{y}.png',
			offlineTilesMaxZoom: 14,
		} as AdvancedMapsSettings & LegacyBasemap;
		expect(dropLegacyBasemap(upgraded)).toBe(true);
		expect('offlineTiles' in upgraded).toBe(false);
		expect('offlineTilesMaxZoom' in upgraded).toBe(false);

		// A reader who never configured a pack has none of them, so nothing is
		// written: the alternative is rewriting data.json on every launch.
		const fresh = { ...DEFAULT_SETTINGS };
		expect(dropLegacyBasemap(fresh)).toBe(false);
		expect(fresh).toEqual(DEFAULT_SETTINGS);
	});

	it('starts a fresh install with no packs and no default', () => {
		expect(DEFAULT_SETTINGS.tilePacks).toEqual([]);
		expect(DEFAULT_SETTINGS.defaultBasemap).toBe('');
	});
});

describe('the switches a feature carries', () => {
	it('leaves every feature that exists today on, so an upgrade changes nothing', () => {
		for (const key of [
			'openInMap',
			'nearbyMap',
			'stampNote',
			'placeExchange',
			'inlineMaps',
			'externalLinks',
		] as const) {
			expect(DEFAULT_SETTINGS[key]).toBe(true);
		}
	});

	it('starts offline basemaps off, because on is what costs a reader who has no pack', () => {
		expect(DEFAULT_SETTINGS.offlineBasemap).toBe(false);
	});
});

describe('basemapStartsOn', () => {
	const PACK = { name: 'City', path: 'a/{z}/{x}/{y}.png', minZoom: 0, maxZoom: 16 };

	it('switches a reader who already has a pack on, so they keep their background', () => {
		expect(basemapStartsOn({ tilePacks: [PACK] }, [PACK])).toBe(true);
	});

	it('leaves a reader who has none off', () => {
		expect(basemapStartsOn({}, [])).toBe(false);
		expect(basemapStartsOn(null, [])).toBe(false);
	});

	it('says nothing about settings that already answer, either way', () => {
		expect(basemapStartsOn({ offlineBasemap: false }, [PACK])).toBeNull();
		expect(basemapStartsOn({ offlineBasemap: true }, [])).toBeNull();
	});
});

describe('a stored setting that is not one of its own values', () => {
	const loaded = (saved: Partial<AdvancedMapsSettings>): AdvancedMapsSettings =>
		Object.assign({}, DEFAULT_SETTINGS, saved);

	it('puts back the default rather than handing on a provider nothing can look up', () => {
		// What `data.json` holds after a hand edit, a restored backup, or a sync
		// from a build that knows one provider more than this one does. The old
		// pair of ternaries read anything unrecognised as Nominatim; the table
		// that replaced them is a total lookup, so an unknown key reaches
		// `PROVIDERS[provider].needsKey` and throws out of the search command.
		const settings = loaded({ geocodeProvider: 'some-future-provider' as AdvancedMapsSettings['geocodeProvider'] });
		forceKnownEnums(settings);
		expect(settings.geocodeProvider).toBe(DEFAULT_SETTINGS.geocodeProvider);
	});

	it('leaves a provider this build does know exactly where it is', () => {
		const settings = loaded({ geocodeProvider: 'amap' });
		forceKnownEnums(settings);
		expect(settings.geocodeProvider).toBe('amap');
	});

	it('checks every fixed-list setting, not just the one that threw', () => {
		const settings = loaded({
			amapKeyStore: 'keychain' as AdvancedMapsSettings['amapKeyStore'],
			openIn: 'elsewhere' as AdvancedMapsSettings['openIn'],
			photoDatum: 'moon' as AdvancedMapsSettings['photoDatum'],
		});
		forceKnownEnums(settings);
		expect(settings.amapKeyStore).toBe(DEFAULT_SETTINGS.amapKeyStore);
		expect(settings.openIn).toBe(DEFAULT_SETTINGS.openIn);
		expect(settings.photoDatum).toBe(DEFAULT_SETTINGS.photoDatum);
	});

	it('trims a coordinate mode rather than reading the whitespace as unknown', () => {
		// The one key the table excludes: `knownMode` accepts what a plain
		// `includes` would throw away.
		const settings = loaded({ coordSystem: ' gcj02 ' as AdvancedMapsSettings['coordSystem'] });
		forceKnownEnums(settings);
		expect(settings.coordSystem).toBe('gcj02');
	});

	it('restores the default coordinate mode when the stored one names nothing', () => {
		const settings = loaded({ coordSystem: 'utm' as AdvancedMapsSettings['coordSystem'] });
		forceKnownEnums(settings);
		expect(settings.coordSystem).toBe(DEFAULT_SETTINGS.coordSystem);
	});
});
