import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import type { App, CachedMetadata } from 'obsidian';
import { AttachmentResolver } from '../src/attachments';

/** A vault file, as much of one as resolving needs it to be. */
function file(path: string): TFile {
	const slash = path.lastIndexOf('/');
	const name = path.slice(slash + 1);
	const dot = name.lastIndexOf('.');
	return Object.assign(new TFile(), {
		path,
		name,
		basename: dot === -1 ? name : name.slice(0, dot),
		extension: dot === -1 ? '' : name.slice(dot + 1),
	});
}

/**
 * A metadata cache that resolves a link by its exact text.
 *
 * `getFirstLinkpathDest` returns the one `TFile` per path, because identity is
 * what the resolver de-duplicates on — handing back a fresh object per call
 * would make the de-duplication look broken when it is the stub that is.
 */
function host(files: TFile[]): App {
	const byPath = new Map(files.map((f) => [f.path, f]));
	return {
		metadataCache: {
			getFirstLinkpathDest: (link: string) => byPath.get(link) ?? null,
			getFileCache: () => null,
		},
	} as unknown as App;
}

const cache = (refs: Partial<Record<'embeds' | 'links' | 'frontmatterLinks', string[]>>): CachedMetadata =>
	Object.fromEntries(Object.entries(refs).map(([key, links]) => [key, (links ?? []).map((link) => ({ link }))]));

const NOTE = file('notes/Trip.md');

describe('the three reference sources a note can point through', () => {
	const gpx = file('tracks/day.gpx');
	const photo = file('photos/summit.jpg');
	const other = file('notes/Other.md');
	const app = host([gpx, photo, other]);

	it('reads embeds, body links and frontmatter links alike', () => {
		const r = new AttachmentResolver(app, true);
		// Obsidian keeps the three apart and all three count; a reader does not
		// think of a frontmatter link as a different kind of pointing.
		expect(r.linked(NOTE, cache({ embeds: ['tracks/day.gpx'] }), () => true)).toEqual([gpx]);
		expect(r.linked(NOTE, cache({ links: ['tracks/day.gpx'] }), () => true)).toEqual([gpx]);
		expect(r.linked(NOTE, cache({ frontmatterLinks: ['tracks/day.gpx'] }), () => true)).toEqual([gpx]);
	});

	it('keeps reading order across the three, embeds first', () => {
		const r = new AttachmentResolver(app, true);
		const out = r.linked(
			NOTE,
			cache({ embeds: ['photos/summit.jpg'], links: ['tracks/day.gpx'], frontmatterLinks: ['notes/Other.md'] }),
			() => true
		);
		expect(out).toEqual([photo, gpx, other]);
	});

	it('counts a file pointed at twice once', () => {
		const r = new AttachmentResolver(app, true);
		// The same file embedded and linked is one attachment, and keeps the
		// position it was first read in.
		const out = r.linked(NOTE, cache({ embeds: ['tracks/day.gpx'], links: ['tracks/day.gpx'] }), () => true);
		expect(out).toEqual([gpx]);
	});

	it('drops a link that resolves to nothing', () => {
		const r = new AttachmentResolver(app, true);
		expect(r.linked(NOTE, cache({ links: ['tracks/missing.gpx'] }), () => true)).toEqual([]);
	});

	it('asks the caller which extensions it wants', () => {
		const r = new AttachmentResolver(app, true);
		const refs = cache({ embeds: ['tracks/day.gpx', 'photos/summit.jpg'] });
		expect(r.linked(NOTE, refs, (ext) => ext === 'jpg')).toEqual([photo]);
	});
});

describe('what counts as a file this plugin draws', () => {
	const app = host([]);

	it('takes every track format whatever photos are set to', () => {
		for (const on of [true, false]) {
			const r = new AttachmentResolver(app, on);
			expect(r.isTrackFile('gpx')).toBe(true);
			expect(r.isTrackFile('geojson')).toBe(true);
			expect(r.isTrackFile('md')).toBe(false);
		}
	});

	it('takes photos only while they are being shown', () => {
		expect(new AttachmentResolver(app, true).isTrackFile('jpg')).toBe(true);
		expect(new AttachmentResolver(app, false).isTrackFile('jpg')).toBe(false);
	});
});

describe('a note that is itself one of these files', () => {
	const gpx = file('tracks/day.gpx');
	const app = host([gpx]);

	it('resolves to itself without consulting its links', () => {
		expect(new AttachmentResolver(app, true).resolveTracks(gpx)).toEqual([gpx]);
	});

	it('resolves nothing for a file that is neither a note nor drawable', () => {
		expect(new AttachmentResolver(app, true).resolveTracks(file('docs/notes.pdf'))).toEqual([]);
	});

	it('resolves a photo to itself only while photos are shown', () => {
		const jpg = file('photos/summit.jpg');
		expect(new AttachmentResolver(host([jpg]), true).resolveTracks(jpg)).toEqual([jpg]);
		expect(new AttachmentResolver(host([jpg]), false).resolveTracks(jpg)).toEqual([]);
	});
});

describe('the memo over a note’s answer', () => {
	const gpx = file('tracks/day.gpx');
	const photo = file('photos/summit.jpg');

	/** A host whose file cache answers every note with the one `CachedMetadata`. */
	function counting(refs: CachedMetadata, files: TFile[]): { app: App } {
		const app = host(files);
		(app.metadataCache as unknown as { getFileCache: () => CachedMetadata }).getFileCache = () => refs;
		return { app };
	}

	it('answers a second ask from the memo', () => {
		const refs = cache({ embeds: ['tracks/day.gpx'] });
		const { app } = counting(refs, [gpx]);
		const r = new AttachmentResolver(app, true);
		const first = r.resolveTracks(NOTE);
		// The same array, not merely an equal one: the memo is the answer, and
		// rebuilding it per ask is what it exists to avoid.
		expect(r.resolveTracks(NOTE)).toBe(first);
	});

	it('forgets everything when told a file appeared or went', () => {
		const refs = cache({ embeds: ['tracks/day.gpx'] });
		const { app } = counting(refs, [gpx]);
		const r = new AttachmentResolver(app, true);
		const first = r.resolveTracks(NOTE);
		r.forgetAll();
		expect(r.resolveTracks(NOTE)).not.toBe(first);
		expect(r.resolveTracks(NOTE)).toEqual(first);
	});

	it('drops the memo when showing photos changes, and not when it is reasserted', () => {
		const refs = cache({ embeds: ['photos/summit.jpg'] });
		const { app } = counting(refs, [photo]);
		const r = new AttachmentResolver(app, true);
		const withPhotos = r.resolveTracks(NOTE);
		expect(withPhotos).toEqual([photo]);

		// The whole reason the setter invalidates: this changes what the note
		// resolves to without Obsidian replacing any CachedMetadata, so a memo
		// kept across it would go on reporting a photo nobody is drawing.
		r.showPhotos = false;
		expect(r.resolveTracks(NOTE)).toEqual([]);

		r.showPhotos = true;
		expect(r.resolveTracks(NOTE)).toEqual([photo]);

		// Setting it to what it already is changes nothing, so the memo stands.
		const held = r.resolveTracks(NOTE);
		r.showPhotos = true;
		expect(r.resolveTracks(NOTE)).toBe(held);
	});

	it('resolves nothing for a note Obsidian has no metadata for', () => {
		const app = host([gpx]);
		expect(new AttachmentResolver(app, true).resolveTracks(NOTE)).toEqual([]);
	});
});

describe('photos for an explicit command', () => {
	const gpx = file('tracks/day.gpx');
	const photo = file('photos/summit.jpg');

	function withCache(refs: CachedMetadata, files: TFile[]): App {
		const app = host(files);
		(app.metadataCache as unknown as { getFileCache: () => CachedMetadata }).getFileCache = () => refs;
		return app;
	}

	it('admits photos even while photos are not being drawn', () => {
		const app = withCache(cache({ embeds: ['photos/summit.jpg', 'tracks/day.gpx'] }), [photo, gpx]);
		// The command was asked for explicitly, so the display setting is not its
		// gate — unlike `resolveTracks`, which is what a map draws.
		const r = new AttachmentResolver(app, false);
		expect(r.resolveTracks(NOTE)).toEqual([gpx]);
		expect(r.resolvePhotos(NOTE)).toEqual([photo]);
	});
});
