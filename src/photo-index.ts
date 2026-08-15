/*
 * A droppable, on-disk record of what reading a photo already answered.
 *
 * Nothing here is authoritative: every entry is derivable from the photo it
 * names, and deleting the file changes only how much work the next session
 * repeats. Anything that would not survive that deletion does not belong in
 * this store.
 */

import { PHOTO_INDEX_MAX, PHOTO_INDEX_TOUCH_MS, PHOTO_INDEX_WRITE_MS } from './constants';
import type { PhotoExif } from './exif';

/**
 * One photo's derived metadata, minus the thumbnail bytes.
 *
 * `lat`/`lng` are the raw EXIF values, before any datum policy is applied —
 * that is what lets the photo-coordinate setting be reinterpreted against a
 * stored entry instead of invalidating it. Both are absent together when the
 * photo carried no usable coordinate, which is a result worth remembering: on
 * the library this was written against, 5,606 of 12,117 photos were read once
 * per session solely to re-learn that they have none.
 */
export interface PhotoIndexEntry {
	/** File identity this was derived from; all three must still match to be used. */
	size: number;
	mtime: number;
	/** Epoch ms, day-granular in practice. The eviction key; see `touch`. */
	used: number;
	lng?: number;
	lat?: number;
	/** Metres, sign already applied. */
	alt?: number;
	/** Epoch ms. */
	time?: number;
	/** GPSMapDatum verbatim, as `PhotoExif.datum` holds it. */
	datum?: string;
	orientation?: number;
	/** The file has an embedded thumbnail. Its bytes are never stored here. */
	thumb?: boolean;
}

/**
 * Where the index is kept. An interface rather than a direct vault call so the
 * store itself is testable without a vault, and so a failing write is one
 * boundary rather than a case in every method.
 */
export interface PhotoIndexIO {
	/** The stored text, or null when there is nothing stored. */
	read(): Promise<string | null>;
	write(text: string): Promise<void>;
	remove(): Promise<void>;
}

/** Bumped only when an older file could be misread; any doubt discards instead. */
const VERSION = 1;

interface PhotoIndexFile {
	version: number;
	entries: Record<string, PhotoIndexEntry>;
}

/** A finite number, and nothing that `JSON.parse` hands back as a surprise. */
function num(value: unknown): value is number {
	return typeof value === 'number' && isFinite(value);
}

/**
 * A stored value that is still shaped like an entry, or null.
 *
 * Checked per entry rather than per file: a single corrupt row is not a reason
 * to re-read a whole library, and a row that survives this is one whose file
 * identity is still comparable — which is the only thing standing between a
 * stale entry and a pin in the wrong place.
 */
function readEntry(value: unknown): PhotoIndexEntry | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (!num(raw.size) || !num(raw.mtime) || !num(raw.used)) return null;
	const entry: PhotoIndexEntry = { size: raw.size, mtime: raw.mtime, used: raw.used };
	// A coordinate is both halves or neither: half of one is not a place.
	if (num(raw.lng) && num(raw.lat)) {
		entry.lng = raw.lng;
		entry.lat = raw.lat;
		if (num(raw.alt)) entry.alt = raw.alt;
		if (num(raw.time)) entry.time = raw.time;
		if (typeof raw.datum === 'string' && raw.datum !== '') entry.datum = raw.datum;
		if (num(raw.orientation)) entry.orientation = raw.orientation;
		if (raw.thumb === true) entry.thumb = true;
	}
	return entry;
}

/** The serializable half of a read, including the no-coordinate answer. */
export function indexEntry(exif: PhotoExif | null, size: number, mtime: number, now: number): PhotoIndexEntry {
	const entry: PhotoIndexEntry = { size, mtime, used: now };
	if (!exif) return entry;
	entry.lng = exif.lng;
	entry.lat = exif.lat;
	if (exif.alt != null) entry.alt = exif.alt;
	if (exif.time != null) entry.time = exif.time;
	if (exif.datum) entry.datum = exif.datum;
	entry.orientation = exif.orientation;
	if (exif.thumbnail) entry.thumb = true;
	return entry;
}

/** The reverse: an entry back into what `photoTrack` takes, minus the bytes. */
export function storedExif(entry: PhotoIndexEntry): PhotoExif | null {
	if (entry.lng == null || entry.lat == null) return null;
	return {
		lng: entry.lng,
		lat: entry.lat,
		alt: entry.alt,
		time: entry.time,
		datum: entry.datum,
		// The same fallback `readTiffExif` applies to a file that states none.
		orientation: entry.orientation ?? 1,
	};
}

/**
 * The store: one in-memory map, read once and written on a debounce.
 *
 * Every method is safe to call before `ready()` resolves — an unloaded store is
 * simply an empty one, which is the same thing a first run has.
 */
export class PhotoIndex {
	private readonly entries = new Map<string, PhotoIndexEntry>();
	private loading: Promise<void> | null = null;
	private dirty = false;
	private timer: number | null = null;
	/** Serializes flushes so an unload write cannot interleave with a debounced one. */
	private writing: Promise<void> = Promise.resolve();
	/** Set by clear(), so a write already queued behind it cannot restore the file. */
	private cleared = false;

	constructor(
		private readonly io: PhotoIndexIO,
		/** Overridden only by tests; what ships is the one named constant. */
		private readonly max: number = PHOTO_INDEX_MAX
	) {}

	/**
	 * Read the file, once per store.
	 *
	 * Callers await this before treating a photo as a miss; the promise is kept
	 * rather than the answer so the very first map — the one this exists to
	 * speed up — waits for the read instead of racing it.
	 */
	ready(): Promise<void> {
		this.loading ??= this.load();
		return this.loading;
	}

	private async load(): Promise<void> {
		let text: string | null;
		try {
			text = await this.io.read();
		} catch (e) {
			console.warn('Advanced Maps: could not read the photo index', e);
			return;
		}
		if (text === null || text === '') return;
		let file: unknown;
		try {
			file = JSON.parse(text);
		} catch {
			// Truncated by a crash, or half-written by a sync. An empty index is
			// behaviourally identical to a full one, so this needs no repair path.
			console.warn('Advanced Maps: the photo index could not be parsed; starting empty.');
			return;
		}
		const parsed = file as Partial<PhotoIndexFile> | null;
		if (!parsed || typeof parsed !== 'object' || parsed.version !== VERSION) return;
		const stored = parsed.entries;
		if (!stored || typeof stored !== 'object') return;
		for (const [path, value] of Object.entries(stored)) {
			const entry = readEntry(value);
			if (entry) this.entries.set(path, entry);
		}
	}

	/** How many entries are held, for tests and for the settings description. */
	get size(): number {
		return this.entries.size;
	}

	/**
	 * The entry for this exact file state, or undefined.
	 *
	 * Path, size and mtime all have to match. mtime alone is what the in-memory
	 * cache uses and is enough within one session; across sessions an index can
	 * meet a file restored from a backup or written by a sync with its mtime
	 * preserved, and size is free to compare.
	 */
	get(path: string, size: number, mtime: number, now: number): PhotoIndexEntry | undefined {
		const entry = this.entries.get(path);
		if (!entry || entry.size !== size || entry.mtime !== mtime) return undefined;
		this.touch(entry, now);
		return entry;
	}

	/**
	 * Mark an entry as wanted by this session.
	 *
	 * The stamp always moves in memory, but only a stamp already a day stale
	 * dirties the file: otherwise a warm start over a large library would
	 * rewrite every entry it read, once per session, to record nothing but the
	 * clock.
	 */
	private touch(entry: PhotoIndexEntry, now: number): void {
		const stale = now - entry.used >= PHOTO_INDEX_TOUCH_MS;
		entry.used = now;
		if (stale) this.schedule();
	}

	set(path: string, entry: PhotoIndexEntry): void {
		this.entries.set(path, entry);
		this.schedule();
	}

	/** A file that has gone or moved: its entry describes nothing now. */
	forget(path: string): void {
		if (this.entries.delete(path)) this.schedule();
	}

	/** Drop entries for paths the vault no longer has. */
	prune(exists: (path: string) => boolean): number {
		let dropped = 0;
		for (const path of [...this.entries.keys()]) {
			if (exists(path)) continue;
			this.entries.delete(path);
			dropped++;
		}
		if (dropped > 0) this.schedule();
		return dropped;
	}

	/** Discard everything, on disk as well as in memory. */
	async clear(): Promise<void> {
		this.entries.clear();
		this.dirty = false;
		this.cleared = true;
		this.cancel();
		// Behind the same chain as a flush, so a write already in the air lands
		// first and the removal is what the file is left in.
		this.writing = this.writing.then(async () => {
			try {
				await this.io.remove();
			} catch (e) {
				console.warn('Advanced Maps: could not remove the photo index', e);
			}
		});
		await this.writing;
	}

	private cancel(): void {
		if (this.timer === null) return;
		window.clearTimeout(this.timer);
		this.timer = null;
	}

	private schedule(): void {
		this.dirty = true;
		this.cleared = false;
		if (this.timer !== null) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, PHOTO_INDEX_WRITE_MS);
	}

	/**
	 * Write pending changes now.
	 *
	 * A failure is logged and swallowed: the running session is already correct
	 * without the file, and a map is the wrong place to learn that a cache could
	 * not be saved.
	 */
	flush(): Promise<void> {
		if (!this.dirty) return this.writing;
		this.dirty = false;
		this.cancel();
		this.evict();
		const text = JSON.stringify({ version: VERSION, entries: Object.fromEntries(this.entries) });
		this.writing = this.writing.then(async () => {
			// clear() ran while this was queued. Writing now would put the file
			// back, which is not what discarding the index means.
			if (this.cleared) return;
			try {
				await this.io.write(text);
			} catch (e) {
				console.warn('Advanced Maps: could not write the photo index', e);
			}
		});
		return this.writing;
	}

	/** Oldest last-used first, down to the bound. An evicted photo is re-read. */
	private evict(): void {
		if (this.entries.size <= this.max) return;
		const byAge = [...this.entries.entries()].sort((a, b) => a[1].used - b[1].used);
		for (let i = 0; i < byAge.length - this.max; i++) this.entries.delete(byAge[i][0]);
	}
}

/** Minimal plugin surface, so this file needs no import cycle back to main.ts. */
interface IndexHost {
	app: {
		vault: {
			adapter: {
				exists(path: string): Promise<boolean>;
				read(path: string): Promise<string>;
				write(path: string, data: string): Promise<void>;
				remove(path: string): Promise<void>;
			};
		};
	};
	manifest: { dir?: string };
}

/** The file name inside the plugin's own data directory. */
export const PHOTO_INDEX_FILE = 'photo-index.json';

/**
 * The index's own file beside `data.json`, never inside it.
 *
 * Settings are declarative and go through a typed update seam; a derived index
 * of this size has no business in that contract, and would be rewritten by
 * every unrelated setting change if it were.
 *
 * A plugin with no `manifest.dir` — which Obsidian only omits in situations
 * where there is nowhere to write anyway — gets a store that reads nothing and
 * saves nothing, which the spec already requires to be harmless.
 */
export function pluginIndexIO(host: IndexHost): PhotoIndexIO {
	const dir = host.manifest.dir;
	if (!dir) {
		return {
			read: () => Promise.resolve(null),
			write: () => Promise.resolve(),
			remove: () => Promise.resolve(),
		};
	}
	const path = `${dir}/${PHOTO_INDEX_FILE}`;
	const adapter = host.app.vault.adapter;
	return {
		read: async () => ((await adapter.exists(path)) ? adapter.read(path) : null),
		write: (text) => adapter.write(path, text),
		remove: async () => {
			if (await adapter.exists(path)) await adapter.remove(path);
		},
	};
}
