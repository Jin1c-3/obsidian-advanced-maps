import { describe, expect, it } from 'vitest';
import { refreshesTracks } from '../src/settings';

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
