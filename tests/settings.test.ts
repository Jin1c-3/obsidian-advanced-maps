import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	excludedFragments,
	exclusionRows,
	fallsBackToDefault,
	isExcluded,
	refreshesTracks,
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
