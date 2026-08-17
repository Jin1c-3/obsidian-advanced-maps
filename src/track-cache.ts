import type { App, TFile } from 'obsidian';
import { parseTrack, type ParsedTrack } from './parse';
import { parseExif, photoTrack, type ExifThumbnail, type PhotoDatum, type PhotoExif } from './exif';
import { projectGeometry, type CoordSystem } from './coords';
import { trackStats, type TrackStats } from './stats';
import { PHOTO_EXTS, PHOTO_HEAD_BYTES, PHOTO_ICON_PREFIX } from './constants';
import { indexEntry, storedExif, type PhotoIndex } from './photo-index';

/**
 * A photo's thumbnail state.
 *
 * `has` and `thumbnail` are separate because a record restored from the
 * persistent index knows an embedded thumbnail exists without holding its
 * bytes — the bytes are two orders of magnitude larger than everything else a
 * photo contributes, and are wanted for only the few hundred photos actually
 * being decoded at any moment.
 */
export interface PhotoThumbnailState {
	/** The file has one, whether or not its bytes are in hand. */
	has: boolean;
	/** Present once this session has read them. */
	thumbnail?: ExifThumbnail;
	orientation: number;
	/** Reads the bytes now; undefined when there are none to read. */
	load?: () => Promise<ExifThumbnail | undefined>;
	/** The in-flight read, so two maps decoding one photo share a single one. */
	reading?: Promise<ExifThumbnail | undefined>;
}

export interface TrackRecord extends ParsedTrack {
	mtime: number;
	error?: string;
	/** Tile-space geometry memoized per non-WGS coordinate system. */
	projected?: Map<CoordSystem, ParsedTrack['features']>;
	/** Measurements memoized on first ask; see `recordStats`. */
	stats?: TrackStats;
	/** EXIF thumbnail data, present only when a photo supplied a usable coordinate. */
	photo?: PhotoThumbnailState;
	/** Coordinate setting used for this photo; part of cache freshness. */
	photoDatum?: PhotoDatum;
}

/** The single formula for a photo's `map.addImage` id. */
export function photoImageId(path: string): string {
	return PHOTO_ICON_PREFIX + path;
}

/**
 * Run `read` over `items` with at most `limit` outstanding at once, preserving
 * input order in the result.
 *
 * Rolling admission rather than fixed batches: a batch barrier costs its slowest
 * member every round, and head-read cost varies by an order of magnitude between
 * a local disk and a mounted one, so batching would idle most slots most of the
 * time. This is the same shape `PHOTO_DECODE_CONCURRENCY` already uses one stage
 * later, in layers.ts.
 *
 * `alive` is asked before each item rather than once per refresh, so a superseded
 * caller stops occupying slots at the next item instead of after the whole queue
 * drains. Items never started stay `undefined`.
 *
 * Rejection semantics match the `Promise.all` this replaces: the first failure is
 * rethrown. It is rethrown only once the slots already running have settled —
 * rejecting out from under them would turn a second read error into an unhandled
 * rejection.
 */
export async function pooled<T, R>(
	items: Iterable<T>,
	limit: number,
	read: (item: T) => Promise<R>,
	alive?: () => boolean
): Promise<Array<R | undefined>> {
	const list = [...items];
	const out = new Array<R | undefined>(list.length);
	let next = 0;
	let failure: unknown;
	let failed = false;

	const worker = async (): Promise<void> => {
		for (;;) {
			if (failed) return;
			if (alive && !alive()) return;
			const index = next++;
			if (index >= list.length) return;
			try {
				out[index] = await read(list[index]);
			} catch (e) {
				if (!failed) {
					failed = true;
					failure = e;
				}
				return;
			}
		}
	};

	const width = Math.max(1, Math.min(limit, list.length));
	await Promise.all(Array.from({ length: width }, () => worker()));
	if (failed) throw failure;
	return out;
}

/** Parsed tracks (and photos), keyed by path and invalidated by mtime. */
export class TrackCache {
	private readonly entries = new Map<string, TrackRecord>();
	/** In-flight reads by an immutable snapshot of the request. Identical calls
	 *  share one promise instead of reading and parsing the same file twice. */
	private readonly pending = new Map<string, { id: number; promise: Promise<TrackRecord> }>();
	/** The newest still-running request per path. An older read may finish, but
	 *  it must never overwrite or bypass this answer. */
	private readonly latest = new Map<string, { id: number; promise: Promise<TrackRecord> }>();
	/** Monotonic request ids remain after completion without retaining a record. */
	private readonly requestIds = new Map<string, number>();
	/** Bumped by invalidate(), including while no cache entry exists yet. */
	private readonly generations = new Map<string, number>();

	/** Absent in the tests and tools that only want parsing; a photo then reads
	 *  its file exactly as it did before there was an index. */
	constructor(
		private readonly app: App,
		private readonly index?: PhotoIndex
	) {}

	/** Freshness includes photo datum because that setting changes the projected coordinate. */
	isFresh(file: TFile, datum: PhotoDatum): boolean {
		const rec = this.entries.get(file.path);
		if (!rec || rec.mtime !== file.stat.mtime) return false;
		if (PHOTO_EXTS.has(file.extension) && rec.photoDatum !== datum) return false;
		return true;
	}

	get(path: string): TrackRecord | undefined {
		return this.entries.get(path);
	}

	has(path: string): boolean {
		// The vault modify listener asks this before invalidating. An asynchronous
		// first read has no entry yet, but it is still ours: ignoring a change in
		// that window lets the old contents be committed after the event.
		return this.entries.has(path) || this.latest.has(path);
	}

	invalidate(path: string): void {
		this.entries.delete(path);
		this.generations.set(path, (this.generations.get(path) ?? 0) + 1);
	}

	/** `datum` participates only in photo cache identity; ordinary tracks ignore it. */
	load(file: TFile, datum: PhotoDatum): Promise<TrackRecord> {
		// Everything identifying this read is captured before the first await. A
		// TFile is mutable: Obsidian updates its path/stat object in place, so
		// reading either after I/O can stamp old bytes with a new mtime.
		const path = file.path;
		const extension = file.extension;
		const mtime = file.stat.mtime;
		const isPhoto = PHOTO_EXTS.has(extension);
		const generation = this.generations.get(path) ?? 0;
		const cached = this.entries.get(path);
		if (cached && cached.mtime === mtime && (!isPhoto || cached.photoDatum === datum)) {
			// A different-datum request may still be running. Returning this cached
			// value is the newest caller's intent, so supersede that request too;
			// otherwise it can finish later and overwrite the cache behind us.
			if (this.latest.has(path)) {
				this.requestIds.set(path, (this.requestIds.get(path) ?? 0) + 1);
				this.latest.delete(path);
			}
			return Promise.resolve(cached);
		}

		const key = [path, String(mtime), isPhoto ? datum : '', String(generation)].join('\0');
		const pending = this.pending.get(key);
		if (pending) {
			// auto → gcj02 → auto can rejoin the first auto read. Promote that
			// request back to newest; otherwise its completion redirects to the GCJ
			// promise and the final caller receives/cache-stamps the wrong datum.
			if (this.latest.get(path) !== pending) {
				pending.id = (this.requestIds.get(path) ?? 0) + 1;
				this.requestIds.set(path, pending.id);
				this.latest.set(path, pending);
			}
			return pending.promise;
		}

		const requestId = (this.requestIds.get(path) ?? 0) + 1;
		this.requestIds.set(path, requestId);
		const request = {
			id: requestId,
			promise: Promise.resolve({ mtime, features: [] } as TrackRecord),
		};
		const promise = (async (): Promise<TrackRecord> => {
			let rec: TrackRecord;
			try {
				rec = isPhoto ? await this.loadPhoto(file, datum, mtime) : await this.loadTrack(file, extension, mtime);
			} catch (e) {
				rec = {
					mtime,
					features: [],
					error: e instanceof Error ? e.message : String(e),
					...(isPhoto ? { photoDatum: datum } : {}),
				};
				console.warn(`Advanced Maps: could not read ${path}:`, e);
			}

			// A rename, mtime change or explicit invalidation while the read was in
			// flight makes this answer stale. Re-entering load() joins the replacement
			// request when one already exists, or starts it when the modify event only
			// invalidated us. The stale bytes are never exposed or cached.
			if (
				file.path !== path ||
				file.extension !== extension ||
				file.stat.mtime !== mtime ||
				(this.generations.get(path) ?? 0) !== generation
			) {
				return this.load(file, datum);
			}

			// Two different snapshots (most commonly a photo-datum setting change)
			// can overlap without changing the file. Last request wins: an older one
			// waits for and returns the newer result rather than overwriting it.
			if (this.requestIds.get(path) !== request.id) {
				const newest = this.latest.get(path);
				if (newest && newest.id > request.id) return newest.promise;
				const committed = this.entries.get(path);
				return committed ?? this.load(file, datum);
			}

			this.entries.set(path, rec);
			return rec;
		})().finally(() => {
			if (this.pending.get(key) === request) this.pending.delete(key);
			if (this.latest.get(path) === request) this.latest.delete(path);
		});
		request.promise = promise;
		this.pending.set(key, request);
		this.latest.set(path, request);
		return promise;
	}

	private async loadTrack(file: TFile, extension: string, mtime: number): Promise<TrackRecord> {
		const text = await this.app.vault.cachedRead(file);
		return { ...parseTrack(text, extension), mtime };
	}

	/**
	 * Missing GPS is a normal empty photo record, not a parse error.
	 *
	 * The index is consulted first and is asked for this exact file state, so a
	 * warm start places its points without opening a single photo. A miss reads
	 * the file exactly as before and records what came out — including the
	 * no-coordinate answer, which is the majority result on a real library and
	 * was previously re-derived once per session.
	 */
	private async loadPhoto(file: TFile, datum: PhotoDatum, mtime: number): Promise<TrackRecord> {
		const size = file.stat.size;
		// Awaited once for the store rather than once per photo: treating a
		// not-yet-read index as a miss would make the very first map — the one
		// this exists to speed up — read every file anyway. Guarded rather than
		// `await this.index?.ready()`, so a cache built without an index does not
		// even pay the microtask — it reads exactly as it did before there was one.
		if (this.index) await this.index.ready();
		const stored = this.index?.get(file.path, size, mtime, Date.now());
		if (stored) return this.photoRecord(file, storedExif(stored), datum, mtime, stored.thumb === true);

		const head = await readHead(this.app, file, PHOTO_HEAD_BYTES);
		const exif = parseExif(head);
		// Recorded against the state this read started from: `mtime` captured by
		// `load()`, `size` captured above, both before any await. A TFile mutates
		// in place, so re-reading `file.stat` here could stamp these bytes with a
		// newer file — which is the one way a stored entry could misplace a pin.
		this.index?.set(file.path, indexEntry(exif, size, mtime, Date.now()));
		return this.photoRecord(file, exif, datum, mtime, !!exif?.thumbnail, exif?.thumbnail);
	}

	/** The one shape a photo becomes, whether its values were read or restored. */
	private photoRecord(
		file: TFile,
		exif: PhotoExif | null,
		datum: PhotoDatum,
		mtime: number,
		hasThumbnail: boolean,
		thumbnail?: ExifThumbnail
	): TrackRecord {
		if (!exif) return { features: [], mtime, photoDatum: datum };

		const track = photoTrack(exif, file.basename, datum);
		const feature = track.features[0];
		// Stamp the same id the thumbnail registrar later passes to map.addImage.
		const imageId = hasThumbnail ? photoImageId(file.path) : undefined;
		const properties: Record<string, unknown> = {
			...feature.properties,
			amRole: 'photo',
			amPath: file.path,
		};
		if (imageId) properties.amPhoto = imageId;

		const photo: PhotoThumbnailState = { has: hasThumbnail, thumbnail, orientation: exif.orientation };
		const rec: TrackRecord = {
			features: [{ ...feature, properties }],
			mtime,
			photoDatum: datum,
			photo,
		};
		// Only a restored record carries a loader: one that read its own file
		// already has whatever bytes that file held.
		if (hasThumbnail && !thumbnail) photo.load = () => this.readThumbnail(file, rec);
		return rec;
	}

	/**
	 * Read one photo's thumbnail bytes on demand, memoized onto its record.
	 *
	 * Reached only from a photo the map has admitted for decoding, so the head
	 * read that the index avoided at draw time happens for the few hundred
	 * photos on screen rather than for the whole result. The mtime is rechecked
	 * after the read: a file rewritten in between would otherwise hand these
	 * bytes to a point derived from the old one.
	 */
	private async readThumbnail(file: TFile, rec: TrackRecord): Promise<ExifThumbnail | undefined> {
		const photo = rec.photo;
		if (!photo) return undefined;
		if (photo.thumbnail) return photo.thumbnail;
		photo.reading ??= (async () => {
			try {
				const head = await readHead(this.app, file, PHOTO_HEAD_BYTES);
				if (file.stat.mtime !== rec.mtime) return undefined;
				const thumbnail = parseExif(head)?.thumbnail;
				if (thumbnail) photo.thumbnail = thumbnail;
				return thumbnail;
			} catch (e) {
				console.warn(`Advanced Maps: could not read a thumbnail from ${file.path}:`, e);
				return undefined;
			} finally {
				// Cleared either way: a failed read should be retried the next time
				// this photo is admitted, not remembered as "no thumbnail".
				photo.reading = undefined;
			}
		})();
		return photo.reading;
	}
}

/**
 * Read a bounded prefix through Obsidian's ranged `app://` resource URL.
 * Clamp the range before EOF, slice even successful responses because some
 * platforms ignore Range, and fall back to `vault.readBinary` on any failure.
 * `requestUrl` cannot serve `app://` ranges, so the fetch lint warning is intentional.
 */
export async function readHead(app: App, file: TFile, bytes: number): Promise<Uint8Array> {
	try {
		if (file.stat.size <= 0) throw new Error('empty file');
		const end = Math.min(bytes, file.stat.size) - 1;
		const url = app.vault.getResourcePath(file);
		// `requestUrl` cannot read ranged app:// resources.
		const res = await fetch(url, { headers: { Range: `bytes=0-${end}` } });
		if (!res.ok) throw new Error(`ranged read of ${file.path} failed: ${res.status}`);
		// Some app:// implementations may ignore Range and return the whole file.
		// Keep the memory contract even there; EXIF parsing never needs bytes past
		// the requested head.
		return new Uint8Array(await res.arrayBuffer()).slice(0, bytes);
	} catch {
		const full = await app.vault.readBinary(file);
		return new Uint8Array(full).slice(0, bytes);
	}
}

/**
 * Measure a record once, on demand, and keep the answer on the record.
 *
 * Read from `features` and never from `projected`: statistics describe the
 * ground, and a tile datum moves a point by hundreds of metres — the same rule
 * the inline statistics strip follows. Lazy because most drawn tracks are never
 * asked about, and memoized on the record so a file is walked at most once per
 * revision: the cache replaces the whole record when a file changes, which
 * takes this with it.
 */
export function recordStats(rec: TrackRecord | undefined): TrackStats | null {
	if (!rec || rec.error || !rec.features) return null;
	return (rec.stats ??= trackStats(rec.features));
}

/** Project once per tile system, preserving only properties used by map layers. */
export function projectedFeatures(rec: TrackRecord | undefined, system: CoordSystem): ParsedTrack['features'] {
	if (!rec || !rec.features) return [];
	if (system === 'wgs84') return rec.features;
	const memo = (rec.projected ??= new Map<CoordSystem, ParsedTrack['features']>());
	const hit = memo.get(system);
	if (hit) return hit;
	const features = rec.features.map((feature) => {
		const p = feature.properties;
		const properties: Record<string, unknown> = {};
		if (typeof p?.name === 'string' && p.name !== '') properties.name = p.name;
		if (typeof p?.amRole === 'string' && p.amRole !== '') properties.amRole = p.amRole;
		if (typeof p?.amPhoto === 'string' && p.amPhoto !== '') properties.amPhoto = p.amPhoto;
		if (typeof p?.amPath === 'string' && p.amPath !== '') properties.amPath = p.amPath;
		return {
			type: 'Feature' as const,
			properties: Object.keys(properties).length > 0 ? properties : null,
			geometry: projectGeometry(feature.geometry, system),
		};
	});
	memo.set(system, features);
	return features;
}
