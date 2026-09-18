import { describe, expect, it } from 'vitest';
import { Platform, type App } from 'obsidian';
import { externalPhotoSource, externalPhotoSources, externalResourcePrefix } from '../src/map-source';

const PREFIX = 'app://local/';

describe('external photo destinations', () => {
	it('canonicalizes POSIX and Windows photos into local resource URLs', () => {
		expect(externalPhotoSource('file:///home/me/My%20Photo.JPG', PREFIX)).toMatchObject({
			uri: 'file:///home/me/My%20Photo.JPG',
			name: 'My Photo.JPG',
			basename: 'My Photo',
			extension: 'jpg',
			resourceUrl: 'app://local/home/me/My%20Photo.JPG',
		});
		expect(externalPhotoSource('file:///G:\\My Drive\\Camera\\P 20260911 091346.jpg', PREFIX)).toMatchObject({
			uri: 'file:///G:/My%20Drive/Camera/P%2020260911%20091346.jpg',
			resourceUrl: 'app://local/G%3A/My%20Drive/Camera/P%2020260911%20091346.jpg',
		});
	});

	it('encodes Unicode once and accepts localhost as the local machine', () => {
		expect(externalPhotoSource('file://localhost/home/我/相片.webp', PREFIX)).toMatchObject({
			name: '相片.webp',
			resourceUrl: 'app://local/home/%E6%88%91/%E7%9B%B8%E7%89%87.webp',
		});
	});

	it('rejects non-local, ambiguous and unsupported destinations', () => {
		for (const value of [
			'https://example.com/photo.jpg',
			'file:photo.jpg',
			'file://server/share/photo.jpg',
			'file:///photo.jpg?revision=2',
			'file:///photo.jpg#part',
			'file:///folder/',
			'file:///track.gpx',
		]) {
			expect(externalPhotoSource(value, PREFIX), value).toBeNull();
		}
		expect(externalPhotoSource('file:///photo.jpg', '')).toBeNull();
	});
});

describe('external local-resource prefix', () => {
	it('prefers the adapter-derived Android route', () => {
		const app = {
			vault: {
				adapter: {
					getFullPath: (path: string) => `/storage/emulated/0/Vault/${path}`,
					getResourcePath: (path: string) =>
						`http://localhost/_capacitor_file_/storage/emulated/0/Vault/${path}`,
				},
			},
		} as unknown as App;
		expect(externalResourcePrefix(app)).toBe('http://localhost/_capacitor_file_/');
	});

	it('falls back to the desktop app prefix and nowhere else', () => {
		const app = { vault: { adapter: {} } } as unknown as App;
		const desktop = Platform.isDesktopApp;
		const prefix = Platform.resourcePathPrefix;
		try {
			Platform.isDesktopApp = true;
			Platform.resourcePathPrefix = 'app://session/';
			expect(externalResourcePrefix(app)).toBe('app://session/');
			Platform.isDesktopApp = false;
			expect(externalResourcePrefix(app)).toBe('');
		} finally {
			Platform.isDesktopApp = desktop;
			Platform.resourcePathPrefix = prefix;
		}
	});
});

describe('external Markdown photo discovery', () => {
	it('reads normal links and embeds in body order and canonicalizes duplicates', () => {
		const sources = externalPhotoSources(
			[
				'[first](<file:///tmp/My Photo.jpg>)',
				'![second](file:///tmp/second.heic)',
				'![again](file:///tmp/My%20Photo.jpg "same")',
			].join('\n'),
			PREFIX
		);
		expect(sources.map((source) => source.name)).toEqual(['My Photo.jpg', 'second.heic']);
	});

	it('ignores frontmatter, fenced code, inline code, references, HTML and folders', () => {
		const sources = externalPhotoSources(
			[
				'---',
				'photo: "[front](<file:///tmp/front.jpg>)"',
				'---',
				'`[inline](<file:///tmp/inline.jpg>)`',
				'```md',
				'[fenced](<file:///tmp/fenced.jpg>)',
				'```',
				'[reference][photo]',
				'[photo]: file:///tmp/reference.jpg',
				'<img src="file:///tmp/raw.jpg">',
				'[folder](<file:///tmp/photos/>)',
				'[real](<file:///tmp/real.avif>)',
			].join('\n'),
			PREFIX
		);
		expect(sources.map((source) => source.name)).toEqual(['real.avif']);
	});

	it('handles nested and escaped label punctuation plus an optional title', () => {
		const sources = externalPhotoSources(
			'[a [nested] and \\] escaped](<file:///tmp/photo%20one.jpeg> "title (kept)")',
			PREFIX
		);
		expect(sources.map((source) => source.name)).toEqual(['photo one.jpeg']);
	});
});
