import type { App, TFile } from 'obsidian';
import { parseTrack, type ParsedTrack } from './parse';
import { parseExif, photoTrack, type ExifThumbnail, type PhotoDatum } from './exif';
import { projectGeometry, type CoordSystem } from './coords';
import { PHOTO_EXTS, PHOTO_HEAD_BYTES, PHOTO_ICON_PREFIX } from './constants';

export interface TrackRecord extends ParsedTrack {
	mtime: number;
	error?: string;
	/** Tile-space geometry memoized per non-WGS coordinate system. */
	projected?: Map<CoordSystem, ParsedTrack['features']>;
	/** EXIF thumbnail data, present only when a photo supplied a usable coordinate. */
	photo?: { thumbnail?: ExifThumbnail; orientation: number };
	/** Coordinate setting used for this photo; part of cache freshness. */
	photoDatum?: PhotoDatum;
}

/** The single formula for a photo's `map.addImage` id. */
export function photoImageId(path: string): string {
	return PHOTO_ICON_PREFIX + path;
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

	constructor(private readonly app: App) {}

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

	/** Missing GPS is a normal empty photo record, not a parse error. */
	private async loadPhoto(file: TFile, datum: PhotoDatum, mtime: number): Promise<TrackRecord> {
		const head = await readHead(this.app, file, PHOTO_HEAD_BYTES);
		const exif = parseExif(head);
		if (!exif) return { features: [], mtime, photoDatum: datum };

		const track = photoTrack(exif, file.basename, datum);
		const feature = track.features[0];
		// Stamp the same id the thumbnail registrar later passes to map.addImage.
		const imageId = exif.thumbnail ? photoImageId(file.path) : undefined;
		const properties: Record<string, unknown> = {
			...feature.properties,
			amRole: 'photo',
			amPath: file.path,
		};
		if (imageId) properties.amPhoto = imageId;

		return {
			features: [{ ...feature, properties }],
			mtime,
			photoDatum: datum,
			photo: { thumbnail: exif.thumbnail, orientation: exif.orientation },
		};
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
