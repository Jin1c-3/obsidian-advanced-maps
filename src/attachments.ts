/* Which files a note points at, and which of those this plugin will draw. */

import type { App, CachedMetadata, TFile } from 'obsidian';
import { PHOTO_EXTS, TRACK_EXTS } from './constants';

/**
 * The attachments a note points at, and the memo over that answer.
 *
 * Its own object rather than four methods on the plugin: the rule that all
 * three reference sources count, the order they count in, and the moments the
 * memo stops being true are one thing, and that thing is testable without a
 * vault. It holds the host and one boolean rather than the plugin, so a memo
 * that outlives a note keeps nothing else alive with it.
 */
export class AttachmentResolver {
	/** Which files a note points at, memoised against the metadata that answered. */
	private memo = new WeakMap<CachedMetadata, TFile[]>();

	constructor(
		private readonly app: App,
		/** Whether photos count as attachments this plugin draws; see `showPhotos`. */
		private photos: boolean
	) {}

	/**
	 * Whether photos are admitted, and the memo that answer was built under.
	 *
	 * Kept together because they cannot disagree: `showPhotos` changes what a
	 * note resolves to without Obsidian replacing any `CachedMetadata`, so a memo
	 * built under the old answer would survive a change that invalidates it. The
	 * setter is the invalidation, rather than a caller being trusted to remember.
	 */
	set showPhotos(on: boolean) {
		if (on === this.photos) return;
		this.photos = on;
		this.forgetAll();
	}

	get showPhotos(): boolean {
		return this.photos;
	}

	/**
	 * Whether this extension is one `resolveTracks` will pick up: a track format
	 * outright, or a photo format with **Show photos** on.
	 *
	 * Gating the photo half here rather than after the fact is what lets the memo
	 * self-correct on a toggle, since the setter above drops it.
	 */
	isTrackFile(extension: string): boolean {
		return TRACK_EXTS.has(extension) || (this.photos && PHOTO_EXTS.has(extension));
	}

	/**
	 * Forget every memoised answer.
	 *
	 * Reached when a file is deleted or renamed, when one this plugin draws is
	 * created — a note's unresolved link becomes a resolved one without that
	 * note being re-indexed — and when a setting changes what counts.
	 */
	forgetAll(): void {
		this.memo = new WeakMap();
	}

	/**
	 * The attachments a note points at that `accept` admits, in reading order.
	 *
	 * The three reference sources are read separately because Obsidian keeps them
	 * separate, and all three count. Stated once: every caller has to agree on
	 * the order and on the de-duplication, and a second copy of this loop is a
	 * second place for a fourth source or an ordering rule to be missed.
	 */
	linked(file: TFile, cache: CachedMetadata, accept: (extension: string) => boolean): TFile[] {
		const out: TFile[] = [];
		// A Set beside the list rather than scanning `out`: an album note can
		// reference hundreds of photos, and a linear scan per reference makes
		// resolving one note quadratic in its own attachments.
		const seen = new Set<TFile>();
		// Embeds first, so a note that both embeds and links the same file keeps
		// the order it reads in; `getFirstLinkpathDest` answers the same TFile for
		// both, which is what makes the identity check enough to de-duplicate.
		for (const ref of [...(cache.embeds ?? []), ...(cache.links ?? []), ...(cache.frontmatterLinks ?? [])]) {
			const dest = this.app.metadataCache.getFirstLinkpathDest(ref.link, file.path);
			if (dest && accept(dest.extension) && !seen.has(dest)) {
				seen.add(dest);
				out.push(dest);
			}
		}
		return out;
	}

	/**
	 * The track and photo files this note is drawn from: itself when it is one,
	 * otherwise everything it embeds or links that this plugin draws.
	 *
	 * Metadata-cache discovery leaves the base query unchanged, and `TFile`
	 * identity de-duplicates.
	 */
	resolveTracks(file: TFile): TFile[] {
		if (this.isTrackFile(file.extension)) return [file];
		if (file.extension !== 'md') return [];
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return [];

		// Cache-object identity invalidates naturally when Obsidian re-indexes the note.
		const memo = this.memo.get(cache);
		if (memo) return memo;

		const out = this.linked(file, cache, (extension) => this.isTrackFile(extension));
		this.memo.set(cache, out);
		return out;
	}

	/**
	 * Every photo a note references, whether or not photos are being drawn.
	 *
	 * Not memoised like `resolveTracks`, and deliberately past `isTrackFile`:
	 * this answers an explicit command, so it admits photos whether or not the
	 * display setting draws them.
	 */
	resolvePhotos(file: TFile): TFile[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return [];
		return this.linked(file, cache, (extension) => PHOTO_EXTS.has(extension));
	}
}
