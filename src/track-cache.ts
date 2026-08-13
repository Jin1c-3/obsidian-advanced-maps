import type { App, TFile } from 'obsidian';
import { parseTrack, type ParsedTrack } from './parse';
import { parseExif, photoTrack, type ExifThumbnail, type PhotoDatum } from './exif';
import { projectGeometry, type CoordSystem } from './coords';
import { PHOTO_EXTS, PHOTO_HEAD_BYTES, PHOTO_ICON_PREFIX } from './constants';

export interface TrackRecord extends ParsedTrack {
	mtime: number;
	error?: string;
	/**
	 * Tile-space geometry, one entry per system asked for. A `Map` rather than a
	 * single slot because two views can be live in two different systems at once
	 * — a GCJ-02 base view and a BD-09 embed of the same file — and a one-slot
	 * memo makes those two thrash, re-projecting the whole track on every redraw
	 * for as long as both are on screen. Bounded at two entries by construction:
	 * `wgs84` never gets stored, since it is the identity.
	 */
	projected?: Map<CoordSystem, ParsedTrack['features']>;
	/**
	 * Set only for a file `PHOTO_EXTS` claims, and only when EXIF actually
	 * stated a usable coordinate — a photo with none still caches with
	 * `features: []`, no `error` and no `photo`, because a photo taken indoors
	 * is not a failure to report. Carries the decoded thumbnail bytes
	 * (`thumbnail` is undefined when the file had none) and the EXIF
	 * orientation the thumbnail — and only the thumbnail — was written under,
	 * for whoever registers it with `map.addImage`.
	 */
	photo?: { thumbnail?: ExifThumbnail; orientation: number };
	/**
	 * Which `PhotoDatum` setting this record's coordinate was converted under.
	 * Undefined for a non-photo file, where the setting plays no part at all.
	 * The mtime memo alone is blind to a datum change — the file on disk has
	 * not moved — so `load()` also compares this before trusting the cache;
	 * see the comment on `load()` for why the argument exists in the first
	 * place rather than reading `photoDatum` off a stored settings object.
	 */
	photoDatum?: PhotoDatum;
}

/**
 * A photo's `map.addImage` id, deterministic from its own vault path. The one
 * function that writes this formula — `loadPhoto` below stamps it onto a
 * photo's `amPhoto` property, and whoever later calls `map.addImage` for the
 * decoded bitmap needs the identical string to land on the same id. Exported
 * rather than duplicated at the call site, on the same reasoning `trackFeatures`
 * in geometry.ts is centralised: two independent formulas for the same id are
 * exactly the kind of pair that drifts the moment one of them is edited.
 */
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

	/**
	 * Whether the cached record for this file can stand in for a reparse.
	 * Mtime alone answers it for a track file, but a photo's coordinate also
	 * depends on `datum` (see `photoDatum` above): a `photoDatum` setting
	 * change moves nothing on disk, so mtime alone would never notice it and
	 * `TrackLayer.sync()` would keep drawing a pin computed under the old
	 * setting until the file's own mtime happened to change. `load()` already
	 * makes this same comparison before trusting its own cache — this is the
	 * read-only half of it, for a caller (`sync()`) that wants to know whether
	 * a reload is needed *before* deciding whether to await one at all.
	 */
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

	/**
	 * `datum` only matters for a photo — a GPX/KML/TCX/GeoJSON file carries its
	 * own coordinate system already resolved by the time it reaches
	 * `parseTrack`, so the argument does nothing for one of those. It is
	 * threaded in as a parameter rather than the cache reaching for
	 * `plugin.settings.photoDatum` itself, because a `TrackCache` is
	 * constructed from nothing but an `App` — see the constructor — and
	 * pulling in the whole plugin just to read one setting would make this
	 * class know about its own owner, which nothing else in it does.
	 */
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
	 * A photo with no usable EXIF coordinate is not a failure — most photos in
	 * a vault were never near a GPS fix, and reporting that as an `error` would
	 * paint an alarming line under every indoor picture a note happens to
	 * embed. It caches as an empty, unremarkable record instead, exactly like a
	 * base-view query that currently matches nothing.
	 */
	private async loadPhoto(file: TFile, datum: PhotoDatum, mtime: number): Promise<TrackRecord> {
		const head = await readHead(this.app, file, PHOTO_HEAD_BYTES);
		const exif = parseExif(head);
		if (!exif) return { features: [], mtime, photoDatum: datum };

		const track = photoTrack(exif, file.basename, datum);
		const feature = track.features[0];
		// The formula photoImageId() writes is the only thing that has to agree
		// with whoever later calls map.addImage for this bitmap — the id itself
		// carries no meaning beyond "the same string both sides compute".
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
 * A ranged read of a file's first `bytes` bytes — EXIF sits in the first few
 * KB of even a multi-megabyte photo (see `PHOTO_HEAD_BYTES` in constants.ts),
 * and reading the whole file to get at it does not scale to a base with
 * hundreds of photos. Measured, 50 concurrent reads of a real 3 MB photo:
 * `vault.readBinary` 711 ms and 152.6 MB allocated; this ranged fetch 100 ms
 * and 0.2 MB.
 *
 * `getResourcePath` hands back an `app://` URL Obsidian itself serves, and a
 * `Range` header on it really does seek — measured live. It answers **200
 * with no `Content-Range`**, but the body is already cut down to the
 * requested length, so this never checks for 206. The range asked for is
 * always `bytes=0-(n-1)` and never anything longer than the file: a range
 * that *starts* past EOF throws `TypeError: Failed to fetch` outright, where
 * one that merely runs past EOF just answers with the whole file and no
 * error — so `end` is clamped against `file.stat.size` up front rather than
 * trusted to the file always being at least `bytes` long.
 *
 * `fetch` trips `eslint-plugin-obsidianmd`'s `no-restricted-globals` (warn
 * only): `requestUrl` cannot stand in for it here, because it throws
 * "ClientRequest only supports http: and https: protocols" on an `app://`
 * URL, measured live — and this needs the `Range` header `requestUrl` cannot
 * be given either way. Left as a plain, unsuppressed warning rather than an
 * `eslint-disable` comment — `eslint-plugin-obsidianmd`'s recommended config
 * brings `eslint-comments` with it and names `no-restricted-globals` as one
 * rule that may not be disabled, so silencing it here trades one warning for
 * two *errors* (`no-restricted-disable` and `require-description`). Measured,
 * not assumed. `npm run lint` is a bare `eslint .`, which fails on errors and
 * not on warnings, so leaving it is also what keeps `npm run check` green.
 *
 * Any failure at all — a platform that refuses `Range`, an `app://` scheme
 * this build blocks, anything — falls back to a plain `vault.readBinary` and a
 * slice, so a photo's coordinate is never lost to *how* it was read. A platform
 * that silently ignores the header cannot be distinguished from Obsidian's
 * measured 200 response (neither carries `Content-Range`), so its response is
 * explicitly sliced too: it may still transfer the whole file, but never keeps
 * or parses more than the requested head. Not verified on mobile; said here
 * rather than assumed, same as the rest of this file's measurements were taken
 * on desktop.
 */
export async function readHead(app: App, file: TFile, bytes: number): Promise<Uint8Array> {
	try {
		if (file.stat.size <= 0) throw new Error('empty file');
		const end = Math.min(bytes, file.stat.size) - 1;
		const url = app.vault.getResourcePath(file);
		// See readHead's own doc comment for why this is `fetch`, not
		// `requestUrl`, and why the resulting lint warning is left unsuppressed.
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
 * A track's geometry in tile space, remembered on the cache record.
 *
 * Shifting is cheap per point but a single watch export runs to five figures,
 * and sync() re-runs on every data change and every style swap. Memoising by
 * system means the arithmetic happens once per file, not once per redraw; a
 * fresh parse replaces the whole record, so the memo cannot go stale.
 *
 * Properties are otherwise dropped on the way through — this used to carry
 * nothing but a waypoint's own `name`. It now also carries a photo's
 * `amRole`/`amPhoto`/`amPath` (see `loadPhoto` above), because those three are
 * a photo's *only* handle back to its own thumbnail image and its own file:
 * dropping them here would empty out the map album on every Chinese tile set
 * while leaving it populated on OpenStreetMap, since `wgs84` is the one
 * system this function never touches at all. `times` still does not survive —
 * nothing downstream needs a timestamp on a *drawn* feature; stats read
 * `rec.features`, never this.
 */
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
