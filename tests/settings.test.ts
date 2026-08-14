import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, fallsBackToDefault, isExcluded, refreshesTracks } from '../src/settings';

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
	const KEYS = ['coordsProperty', 'placeProperty', 'trackColor', 'autoFillExclude'] as const;

	it('covers every text row that shows its default as the placeholder', () => {
		for (const key of KEYS) expect(fallsBackToDefault(key), key).toBe(true);
	});

	it('gives each of them something to fall back to', () => {
		// A listed key whose default is '' would make the fallback a no-op and the
		// greyed placeholder a lie about what clearing the box does.
		for (const key of KEYS) expect(DEFAULT_SETTINGS[key], key).not.toBe('');
	});

	it('leaves keys whose empty value means something alone', () => {
		for (const key of ['amapKey', 'amapSecretId', 'aroundViewName', 'basePath', 'unknown']) {
			expect(fallsBackToDefault(key), key).toBe(false);
		}
	});

	it('keeps the automatic fill off templates once the box is cleared', () => {
		// The whole point of the row being on the list: '' reads as "exclude
		// nothing" to isExcluded, so a cleared box that stored it would stamp every
		// template note with the device's real position.
		expect(isExcluded('templates/daily.md', '')).toBe(false);
		expect(isExcluded('templates/daily.md', DEFAULT_SETTINGS.autoFillExclude)).toBe(true);
	});
});
