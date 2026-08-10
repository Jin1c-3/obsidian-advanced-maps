import type { App, TFile } from 'obsidian';
import { parseTrack, type ParsedTrack } from './parse';
import { projectGeometry, type CoordSystem } from './coords';

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
}

/** Parsed tracks, keyed by path and invalidated by mtime. */
export class TrackCache {
	private readonly entries = new Map<string, TrackRecord>();

	constructor(private readonly app: App) {}

	isFresh(file: TFile): boolean {
		const rec = this.entries.get(file.path);
		return !!rec && rec.mtime === file.stat.mtime;
	}

	get(path: string): TrackRecord | undefined {
		return this.entries.get(path);
	}

	has(path: string): boolean {
		return this.entries.has(path);
	}

	invalidate(path: string): void {
		this.entries.delete(path);
	}

	async load(file: TFile): Promise<TrackRecord> {
		const cached = this.entries.get(file.path);
		if (cached && cached.mtime === file.stat.mtime) return cached;
		let rec: TrackRecord;
		try {
			const text = await this.app.vault.cachedRead(file);
			rec = { ...parseTrack(text, file.extension), mtime: file.stat.mtime };
		} catch (e) {
			rec = { mtime: file.stat.mtime, features: [], error: e instanceof Error ? e.message : String(e) };
			console.warn(`Advanced Maps: could not read ${file.path}:`, e);
		}
		this.entries.set(file.path, rec);
		return rec;
	}
}

/**
 * A track's geometry in tile space, remembered on the cache record.
 *
 * Shifting is cheap per point but a single watch export runs to five figures,
 * and sync() re-runs on every data change and every style swap. Memoising by
 * system means the arithmetic happens once per file, not once per redraw; a
 * fresh parse replaces the whole record, so the memo cannot go stale.
 */
export function projectedFeatures(rec: TrackRecord | undefined, system: CoordSystem): ParsedTrack['features'] {
	if (!rec || !rec.features) return [];
	if (system === 'wgs84') return rec.features;
	const memo = (rec.projected ??= new Map<CoordSystem, ParsedTrack['features']>());
	const hit = memo.get(system);
	if (hit) return hit;
	const features = rec.features.map((feature) => ({
		type: 'Feature' as const,
		properties: null,
		geometry: projectGeometry(feature.geometry, system),
	}));
	memo.set(system, features);
	return features;
}
