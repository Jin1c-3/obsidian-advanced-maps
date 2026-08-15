import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import { pooled, readHead, TrackCache, type TrackRecord } from '../src/track-cache';
import { PhotoIndex, type PhotoIndexEntry } from '../src/photo-index';
import { gcj2wgs } from '../src/coords';

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function geojson(lng: number, lat: number): string {
	return JSON.stringify({
		type: 'FeatureCollection',
		features: [{ type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [lng, lat] } }],
	});
}

function trackFile(mtime = 1): TFile {
	const file = new TFile();
	file.path = 'tracks/walk.geojson';
	file.extension = 'geojson';
	file.stat = { ...file.stat, mtime, size: 100 };
	return file;
}

function appWith(vault: Partial<App['vault']>): App {
	return { vault } as unknown as App;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('TrackCache concurrency', () => {
	it('deduplicates identical in-flight reads', async () => {
		const read = deferred<string>();
		const cachedRead = vi.fn(() => read.promise);
		const cache = new TrackCache(appWith({ cachedRead }));
		const file = trackFile();

		const first = cache.load(file, 'auto');
		const second = cache.load(file, 'auto');
		expect(first).toBe(second);
		expect(cachedRead).toHaveBeenCalledTimes(1);
		expect(cache.has(file.path)).toBe(true);

		read.resolve(geojson(120.1, 30.1));
		const [a, b] = await Promise.all([first, second]);
		expect(a).toBe(b);
		expect(cache.get(file.path)).toBe(a);
	});

	it('never commits old bytes under a newer mtime', async () => {
		const oldRead = deferred<string>();
		const newRead = deferred<string>();
		const cachedRead = vi
			.fn()
			.mockImplementationOnce(() => oldRead.promise)
			.mockImplementationOnce(() => newRead.promise);
		const cache = new TrackCache(appWith({ cachedRead }));
		const file = trackFile(1);

		const oldLoad = cache.load(file, 'auto');
		file.stat.mtime = 2;
		cache.invalidate(file.path);
		const newLoad = cache.load(file, 'auto');

		newRead.resolve(geojson(120.2, 30.2));
		const fresh = await newLoad;
		expect(fresh.mtime).toBe(2);
		expect(fresh.features[0]?.geometry).toEqual({ type: 'Point', coordinates: [120.2, 30.2] });

		oldRead.resolve(geojson(120.1, 30.1));
		const staleCaller = await oldLoad;
		expect(staleCaller).toBe(fresh);
		expect(cache.get(file.path)).toBe(fresh);
		expect(cachedRead).toHaveBeenCalledTimes(2);
	});

	it('promotes a rejoined photo request back to newest across datum changes', async () => {
		const autoResponse = deferred<ArrayBuffer>();
		const gcjResponse = deferred<ArrayBuffer>();
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(async () => ({ ok: true, status: 200, arrayBuffer: () => autoResponse.promise }))
			.mockImplementationOnce(async () => ({ ok: true, status: 200, arrayBuffer: () => gcjResponse.promise }));
		vi.stubGlobal('fetch', fetchMock);
		const app = appWith({ getResourcePath: () => 'app://vault/photo.jpg', readBinary: vi.fn() });
		const file = new TFile();
		file.path = 'photo.jpg';
		file.extension = 'jpg';
		file.stat = { ...file.stat, mtime: 1, size: 4 };
		const cache = new TrackCache(app);

		const firstAuto = cache.load(file, 'auto');
		const gcj = cache.load(file, 'gcj02');
		const finalAuto = cache.load(file, 'auto');
		expect(finalAuto).toBe(firstAuto);
		// Two distinct reads were started, whichever tick each one reaches `fetch`
		// on — request identity is what this is about, not read eagerness.
		await Promise.resolve();
		expect(fetchMock).toHaveBeenCalledTimes(2);

		autoResponse.resolve(Uint8Array.from([0, 1, 2, 3]).buffer);
		const auto = await finalAuto;
		expect(auto.photoDatum).toBe('auto');
		expect(cache.get(file.path)).toBe(auto);

		gcjResponse.resolve(Uint8Array.from([4, 5, 6, 7]).buffer);
		await expect(gcj).resolves.toBe(auto);
		expect(cache.get(file.path)?.photoDatum).toBe('auto');
	});

	it('keeps a cached latest datum from being overwritten by an older in-flight change', async () => {
		const gcjResponse = deferred<ArrayBuffer>();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				arrayBuffer: async () => Uint8Array.from([0, 1, 2, 3]).buffer,
			})
			.mockImplementationOnce(async () => ({ ok: true, status: 200, arrayBuffer: () => gcjResponse.promise }));
		vi.stubGlobal('fetch', fetchMock);
		const app = appWith({ getResourcePath: () => 'app://vault/photo.jpg', readBinary: vi.fn() });
		const file = new TFile();
		file.path = 'photo.jpg';
		file.extension = 'jpg';
		file.stat = { ...file.stat, mtime: 1, size: 4 };
		const cache = new TrackCache(app);

		const auto = await cache.load(file, 'auto');
		const gcj = cache.load(file, 'gcj02');
		await expect(cache.load(file, 'auto')).resolves.toBe(auto);

		gcjResponse.resolve(Uint8Array.from([4, 5, 6, 7]).buffer);
		await expect(gcj).resolves.toBe(auto);
		expect(cache.get(file.path)).toBe(auto);
	});
});

describe('TrackCache over a persistent index', () => {
	const NOW = 1755300000000;

	function photoFile(mtime = 1, size = 4096): TFile {
		const file = new TFile();
		file.path = 'Photos/walk.jpg';
		file.basename = 'walk';
		file.extension = 'jpg';
		file.stat = { ...file.stat, mtime, size };
		return file;
	}

	/** An index primed as if a previous session had written it. */
	async function primed(entries: Record<string, PhotoIndexEntry>): Promise<PhotoIndex> {
		const index = new PhotoIndex({
			read: async () => JSON.stringify({ version: 1, entries }),
			write: async () => undefined,
			remove: async () => undefined,
		});
		await index.ready();
		return index;
	}

	/** Every path a photo read could take, all of them failing the test if taken. */
	function noReads() {
		const fetchMock = vi.fn(() => {
			throw new Error('the photo file was read');
		});
		vi.stubGlobal('fetch', fetchMock);
		const readBinary = vi.fn(() => {
			throw new Error('the photo file was read');
		});
		return { fetchMock, app: appWith({ getResourcePath: () => 'app://vault/photo.jpg', readBinary }) };
	}

	function point(rec: TrackRecord): number[] {
		const geometry = rec.features[0]?.geometry;
		if (geometry?.type !== 'Point') throw new Error(`expected one Point, got ${geometry?.type ?? 'nothing'}`);
		return geometry.coordinates;
	}

	it('places a photo from a stored entry without reading the file', async () => {
		const { app } = noReads();
		const index = await primed({
			'Photos/walk.jpg': { size: 4096, mtime: 1, used: NOW, lng: 120.1, lat: 30.1, orientation: 6, thumb: true },
		});
		const cache = new TrackCache(app, index);

		const rec = await cache.load(photoFile(), 'wgs84');
		expect(point(rec)).toEqual([120.1, 30.1]);
		expect(rec.photo?.orientation).toBe(6);
		// The thumbnail is known to exist without its bytes being in hand, and is
		// fetchable on demand for the photos a map actually decodes.
		expect(rec.photo?.has).toBe(true);
		expect(rec.photo?.thumbnail).toBeUndefined();
		expect(typeof rec.photo?.load).toBe('function');
	});

	it('does not re-read a photo already known to carry no GPS', async () => {
		const { app } = noReads();
		const index = await primed({ 'Photos/walk.jpg': { size: 4096, mtime: 1, used: NOW } });
		const cache = new TrackCache(app, index);

		const rec = await cache.load(photoFile(), 'auto');
		expect(rec.features).toEqual([]);
		expect(rec.error).toBeUndefined();
	});

	it('re-reads when the file no longer matches the state the entry was derived from', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			arrayBuffer: async () => Uint8Array.from([0, 1, 2, 3]).buffer,
		});
		vi.stubGlobal('fetch', fetchMock);
		const app = appWith({ getResourcePath: () => 'app://vault/photo.jpg', readBinary: vi.fn() });
		const index = await primed({
			'Photos/walk.jpg': { size: 4096, mtime: 1, used: NOW, lng: 120.1, lat: 30.1, orientation: 1 },
		});
		const cache = new TrackCache(app, index);

		// Edited between sessions: same path, newer mtime.
		await cache.load(photoFile(2), 'wgs84');
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Restored from a backup, which can preserve an mtime but not a size.
		cache.invalidate('Photos/walk.jpg');
		await cache.load(photoFile(1, 8192), 'wgs84');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('reinterprets a stored entry into a new datum without reading the file', async () => {
		const { app } = noReads();
		const index = await primed({
			'Photos/walk.jpg': { size: 4096, mtime: 1, used: NOW, lng: 120.1, lat: 30.1, orientation: 1 },
		});
		const cache = new TrackCache(app, index);
		const file = photoFile();

		const asWgs = point(await cache.load(file, 'wgs84'));
		// The setting changed; nothing about the file did.
		const asGcj = point(await cache.load(file, 'gcj02'));

		expect(asWgs).toEqual([120.1, 30.1]);
		expect(asGcj).toEqual(gcj2wgs(120.1, 30.1));
		expect(asGcj).not.toEqual(asWgs);
	});

	it('records what a read found, including the no-GPS answer', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			arrayBuffer: async () => Uint8Array.from([0, 1, 2, 3]).buffer,
		});
		vi.stubGlobal('fetch', fetchMock);
		const app = appWith({ getResourcePath: () => 'app://vault/photo.jpg', readBinary: vi.fn() });
		const index = await primed({});
		const cache = new TrackCache(app, index);

		await cache.load(photoFile(), 'auto');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		// Recorded against this exact file state, and recorded as having nothing —
		// which is the answer this saves re-deriving for most of a real library.
		const stored = index.get('Photos/walk.jpg', 4096, 1, NOW);
		expect(stored).toMatchObject({ size: 4096, mtime: 1 });
		expect(stored?.lat).toBeUndefined();
		expect(stored?.thumb).toBeUndefined();

		// A second session over the same unchanged file asks the file nothing.
		cache.invalidate('Photos/walk.jpg');
		await cache.load(photoFile(), 'auto');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('places no point from the entry of a photo that was deleted or renamed', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			arrayBuffer: async () => Uint8Array.from([0, 1, 2, 3]).buffer,
		});
		vi.stubGlobal('fetch', fetchMock);
		const app = appWith({ getResourcePath: () => 'app://vault/photo.jpg', readBinary: vi.fn() });
		const index = await primed({
			'Photos/walk.jpg': { size: 4096, mtime: 1, used: NOW, lng: 120.1, lat: 30.1, orientation: 1 },
		});
		const cache = new TrackCache(app, index);

		// What main.ts does on a vault delete, and on a rename for the old path.
		index.forget('Photos/walk.jpg');
		cache.invalidate('Photos/walk.jpg');

		const rec = await cache.load(photoFile(), 'wgs84');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(rec.features).toEqual([]);
	});
});

describe('readHead', () => {
	it('slices a successful response when the app protocol ignores Range', async () => {
		const payload = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			arrayBuffer: async () => payload.buffer,
		});
		vi.stubGlobal('fetch', fetchMock);
		const readBinary = vi.fn();
		const app = appWith({ getResourcePath: () => 'app://vault/photo.jpg', readBinary });
		const file = new TFile();
		file.path = 'photo.jpg';
		file.extension = 'jpg';
		file.stat = { ...file.stat, mtime: 1, size: payload.length };

		await expect(readHead(app, file, 4)).resolves.toEqual(Uint8Array.from([0, 1, 2, 3]));
		expect(fetchMock).toHaveBeenCalledWith('app://vault/photo.jpg', { headers: { Range: 'bytes=0-3' } });
		expect(readBinary).not.toHaveBeenCalled();
	});

	it('falls back to a bounded vault read when ranged fetch fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unsupported scheme')));
		const payload = Uint8Array.from([0, 1, 2, 3, 4, 5]);
		const readBinary = vi.fn().mockResolvedValue(payload.buffer);
		const app = appWith({ getResourcePath: () => 'app://vault/photo.jpg', readBinary });
		const file = new TFile();
		file.path = 'photo.jpg';
		file.extension = 'jpg';
		file.stat = { ...file.stat, mtime: 1, size: payload.length };

		await expect(readHead(app, file, 3)).resolves.toEqual(Uint8Array.from([0, 1, 2]));
		expect(readBinary).toHaveBeenCalledWith(file);
	});
});

describe('pooled', () => {
	/** Records the high-water mark of simultaneously running reads. */
	function tracker() {
		let active = 0;
		let peak = 0;
		const gates: Array<Deferred<void>> = [];
		return {
			gates,
			get peak() {
				return peak;
			},
			read: (n: number) => {
				active++;
				peak = Math.max(peak, active);
				const gate = deferred<void>();
				gates.push(gate);
				return gate.promise.then(() => {
					active--;
					return n * 2;
				});
			},
		};
	}

	it('never runs more than the limit at once and still processes every item', async () => {
		const t = tracker();
		const items = Array.from({ length: 20 }, (_, i) => i);
		const done = pooled(items, 4, t.read);

		// Release in waves so the pool has to refill slots rather than run once.
		for (let released = 0; released < 20; released++) {
			await Promise.resolve();
			t.gates[released]?.resolve();
		}
		await Promise.resolve();
		for (const gate of t.gates) gate.resolve();

		await expect(done).resolves.toEqual(items.map((i) => i * 2));
		// Exactly the limit, not merely under it: `toBeLessThanOrEqual` would also
		// pass for an implementation that lost its parallelism entirely.
		expect(t.peak).toBe(4);
	});

	it('preserves input order even when reads settle out of order', async () => {
		const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
		const done = pooled([0, 1, 2], 3, async (n: number) => {
			await gates[n].promise;
			return `item-${n}`;
		});

		gates[2].resolve();
		gates[0].resolve();
		gates[1].resolve();

		await expect(done).resolves.toEqual(['item-0', 'item-1', 'item-2']);
	});

	it('a limit above the item count runs everything without stranding a slot', async () => {
		await expect(pooled([1, 2], 16, async (n: number) => n + 1)).resolves.toEqual([2, 3]);
		await expect(pooled([], 16, async (n: number) => n)).resolves.toEqual([]);
	});

	it('rethrows the first failure after in-flight reads settle, without stranding the pool', async () => {
		const settled: number[] = [];
		const attempt = await pooled(
			[0, 1, 2, 3],
			2,
			async (n: number) => {
				if (n === 0) throw new Error('read failed');
				settled.push(n);
				return n;
			},
			undefined
		).then(
			() => 'resolved',
			(e: unknown) => (e instanceof Error ? e.message : String(e))
		);

		expect(attempt).toBe('read failed');
		// The other slot finished its item rather than being abandoned mid-read.
		expect(settled).toContain(1);
	});

	it('stops starting reads once the caller is no longer alive', async () => {
		const started: number[] = [];
		let alive = true;
		const result = await pooled(
			Array.from({ length: 10 }, (_, i) => i),
			2,
			async (n: number) => {
				started.push(n);
				if (started.length === 4) alive = false;
				return n;
			},
			() => alive
		);

		expect(started.length).toBeLessThan(10);
		// Items never started are absent rather than fabricated.
		expect(result[9]).toBeUndefined();
	});

	it('starts nothing at all when the caller is already superseded', async () => {
		const read = vi.fn(async (n: number) => n);
		await expect(pooled([1, 2, 3], 4, read, () => false)).resolves.toEqual([undefined, undefined, undefined]);
		expect(read).not.toHaveBeenCalled();
	});
});
