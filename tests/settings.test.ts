import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	dropLegacyBasemap,
	excludedFragments,
	exclusionRows,
	fallsBackToDefault,
	isExcluded,
	migratedPack,
	packNameFromPath,
	refreshesTracks,
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
