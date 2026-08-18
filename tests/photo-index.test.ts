import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_INDEX_TOUCH_MS } from '../src/constants';
import { indexEntry, PhotoIndex, storedExif, type PhotoIndexEntry, type PhotoIndexIO } from '../src/photo-index';
import { photoTrack, type PhotoExif } from '../src/exif';

/** An in-memory stand-in for the plugin's own data file. */
function store(initial: string | null = null) {
	const state = { text: initial, writes: 0, removed: 0 };
	const io: PhotoIndexIO = {
		read: async () => state.text,
		write: async (text) => {
			state.text = text;
			state.writes++;
		},
		remove: async () => {
			state.text = null;
			state.removed++;
		},
	};
	return { state, io };
}

function file(entries: Record<string, Partial<PhotoIndexEntry>>, version = 1): string {
	return JSON.stringify({ version, entries });
}

const NOW = 1755300000000;

afterEach(() => {
	vi.restoreAllMocks();
});

describe('PhotoIndex storage', () => {
	it('round-trips an entry through a written file', async () => {
		const first = store();
		const index = new PhotoIndex(first.io);
		await index.ready();
		index.set('Photos/a.jpg', {
			size: 10,
			mtime: 20,
			used: NOW,
			lng: 120.1,
			lat: 30.1,
			orientation: 6,
			thumb: true,
		});
		index.set('Photos/b.jpg', { size: 11, mtime: 21, used: NOW });
		await index.flush();
		expect(first.state.writes).toBe(1);

		const reopened = new PhotoIndex({ ...first.io, read: async () => first.state.text });
		await reopened.ready();
		expect(reopened.size).toBe(2);
		expect(reopened.get('Photos/a.jpg', 10, 20, NOW)).toMatchObject({
			lng: 120.1,
			lat: 30.1,
			orientation: 6,
			thumb: true,
		});
		// The no-coordinate answer survives too: that is the result worth keeping.
		const negative = reopened.get('Photos/b.jpg', 11, 21, NOW);
		expect(negative).toBeDefined();
		expect(storedExif(negative!)).toBeNull();
	});

	it('starts empty on a version it was not written by', async () => {
		const index = new PhotoIndex(store(file({ 'a.jpg': { size: 1, mtime: 2, used: NOW } }, 99)).io);
		await index.ready();
		expect(index.size).toBe(0);
	});

	it('starts empty on malformed JSON rather than throwing', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const index = new PhotoIndex(store('{"version":1,"entries":{"a.jpg"').io);
		await index.ready();
		expect(index.size).toBe(0);
	});

	it('drops individual entries that no longer carry a comparable identity', async () => {
		const index = new PhotoIndex(
			store(
				file({
					'good.jpg': { size: 1, mtime: 2, used: NOW, lng: 1, lat: 2 },
					'no-identity.jpg': { used: NOW, lng: 1, lat: 2 },
					// Half a coordinate is not a place; the entry survives as a
					// no-coordinate one rather than placing a pin on a missing axis.
					'half.jpg': { size: 3, mtime: 4, used: NOW, lat: 2 },
				})
			).io
		);
		await index.ready();
		expect(index.size).toBe(2);
		expect(index.get('no-identity.jpg', 1, 2, NOW)).toBeUndefined();
		expect(storedExif(index.get('half.jpg', 3, 4, NOW)!)).toBeNull();
	});

	it('does not throw when the file cannot be written', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const index = new PhotoIndex({
			read: async () => null,
			write: () => Promise.reject(new Error('read-only vault')),
			remove: async () => undefined,
		});
		await index.ready();
		index.set('a.jpg', { size: 1, mtime: 2, used: NOW });
		await expect(index.flush()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
	});

	it('evicts least-recently-used entries down to the bound', async () => {
		const backing = store();
		const index = new PhotoIndex(backing.io, 2);
		await index.ready();
		index.set('old.jpg', { size: 1, mtime: 1, used: NOW - 3000 });
		index.set('middle.jpg', { size: 1, mtime: 1, used: NOW - 2000 });
		index.set('recent.jpg', { size: 1, mtime: 1, used: NOW - 1000 });
		await index.flush();

		expect(index.size).toBe(2);
		const written = JSON.parse(backing.state.text!) as { entries: Record<string, PhotoIndexEntry> };
		expect(Object.keys(written.entries).sort()).toEqual(['middle.jpg', 'recent.jpg']);
	});

	it('rewrites for a use only once the stamp is a day stale', async () => {
		const backing = store(file({ 'a.jpg': { size: 1, mtime: 2, used: NOW } }));
		const index = new PhotoIndex(backing.io);
		await index.ready();

		// A second read in the same session records nothing new: the stamp moves
		// in memory, and the file is not worth rewriting to say so.
		index.get('a.jpg', 1, 2, NOW + 1000);
		await index.flush();
		expect(backing.state.writes).toBe(0);

		// A day after the last use, it is.
		index.get('a.jpg', 1, 2, NOW + 1000 + PHOTO_INDEX_TOUCH_MS);
		await index.flush();
		expect(backing.state.writes).toBe(1);
	});

	it('removes the file when the index is cleared, and does not restore it behind the clear', async () => {
		const backing = store();
		const index = new PhotoIndex(backing.io);
		await index.ready();
		index.set('a.jpg', { size: 1, mtime: 2, used: NOW });

		// A flush already in the air when the user clears must not put the file back.
		const flushing = index.flush();
		await index.clear();
		await flushing;

		expect(index.size).toBe(0);
		expect(backing.state.text).toBeNull();
		expect(backing.state.removed).toBe(1);
	});

	it('forgets and prunes paths the vault no longer has', async () => {
		const backing = store(
			file({
				'kept.jpg': { size: 1, mtime: 1, used: NOW },
				'renamed.jpg': { size: 1, mtime: 1, used: NOW },
				'gone.jpg': { size: 1, mtime: 1, used: NOW },
			})
		);
		const index = new PhotoIndex(backing.io);
		await index.ready();

		index.forget('renamed.jpg');
		expect(index.prune((path) => path === 'kept.jpg')).toBe(1);
		expect(index.size).toBe(1);
		expect(index.get('gone.jpg', 1, 1, NOW)).toBeUndefined();
	});
});

describe('PhotoIndex entry conversion', () => {
	const exif: PhotoExif = {
		lng: 120.1,
		lat: 30.1,
		alt: 12.5,
		time: 1700000000000,
		datum: 'WGS-84',
		orientation: 6,
		thumbnail: { bytes: Uint8Array.from([0xff, 0xd8]) },
	};

	it('keeps the raw EXIF values and records the thumbnail without its bytes', () => {
		const entry = indexEntry(exif, 100, 200, NOW);
		expect(entry).toEqual({
			size: 100,
			mtime: 200,
			used: NOW,
			lng: 120.1,
			lat: 30.1,
			alt: 12.5,
			time: 1700000000000,
			datum: 'WGS-84',
			orientation: 6,
			thumb: true,
		});
		expect(JSON.stringify(entry)).not.toContain('bytes');

		const back = storedExif(entry);
		// The datum is stored verbatim rather than applied, which is what lets the
		// photo-coordinate setting be reinterpreted against a stored entry.
		expect(back).toEqual({
			lng: 120.1,
			lat: 30.1,
			alt: 12.5,
			time: 1700000000000,
			datum: 'WGS-84',
			orientation: 6,
		});
	});

	it('records a photo with no usable coordinate as identity alone', () => {
		const entry = indexEntry(null, 100, 200, NOW);
		expect(entry).toEqual({ size: 100, mtime: 200, used: NOW });
		expect(storedExif(entry)).toBeNull();
	});

	/**
	 * The delete-the-file test, at the one seam where it could fail: a point
	 * drawn from a stored entry has to land exactly where the same photo's own
	 * read would have put it, under every datum setting. If this ever diverges,
	 * discarding the index would move pins — which is the whole thing the index
	 * is not allowed to do.
	 */
	it.each(['auto', 'wgs84', 'gcj02'] as const)('places a stored entry exactly where a read would, in %s', (datum) => {
		for (const source of [exif, { ...exif, datum: 'GCJ-02' }, { ...exif, datum: undefined, alt: undefined }]) {
			const restored = storedExif(indexEntry(source, 1, 2, NOW));
			expect(restored).not.toBeNull();
			expect(photoTrack(restored!, 'walk', datum)).toEqual(photoTrack(source, 'walk', datum));
		}
	});
});
