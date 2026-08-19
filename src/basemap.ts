/*
 * Basemap tiles that are already on disk.
 *
 * Everything here is a string substitution and two numbers. The native Maps view
 * turns any tile-template string into a raster source without validating it or
 * routing it through `requestUrl` (obsidian-maps/src/map/style.ts), so a map
 * whose background is a local pack needs no protocol, no source and no layer of
 * this plugin's own — only the right string in the config the native view builds.
 */

import type { BasesMapView, MapConfig, MapLibreMap, RasterTileSource, VaultPaths } from './types/obsidian-internals';

/**
 * What a tile template must carry for MapLibre to fill it in, each entry being
 * the forms that satisfy one of them. `{-y}` is the TMS row order, which
 * MapLibre substitutes as readily as `{y}` and which real packs are laid out in.
 */
const TILE_PLACEHOLDERS: ReadonlyArray<readonly string[]> = [['{z}'], ['{x}'], ['{y}', '{-y}']];

/** The deepest level a tile pyramid is addressed at; MapLibre's own ceiling. */
export const TILE_ZOOM_MAX = 22;

/**
 * A 256 px raster source asks for a tile one level deeper than the map's own
 * zoom — measured: at map zoom 6 MapLibre requested `…/7/62/55.png`. So a pack
 * whose shallowest directory is `2` is fully covered from map zoom 1 upwards.
 */
const TILE_ZOOM_OFFSET = 1;

/** The one thing about a template that can be checked without touching the disk. */
export type TilesProblem = 'placeholders';

/**
 * Why this template cannot be used, or null when it can.
 *
 * Only structural: a path that points nowhere is not detectable without
 * enumerating a directory outside the vault, and probing for one tile proves
 * nothing — a regional pack legitimately has no tile at most x/y for a given z.
 */
export function tilesProblem(template: string): TilesProblem | null {
	const text = template.trim();
	return TILE_PLACEHOLDERS.every((forms) => forms.some((form) => text.includes(form))) ? null : 'placeholders';
}

/** An absolute path on either family: a POSIX root, or a Windows drive letter. */
function isAbsolute(path: string): boolean {
	return path.startsWith('/') || /^[A-Za-z]:\//.test(path);
}

/**
 * One filesystem path as the tail of a resource URL.
 *
 * Percent-encoded per segment, the way Obsidian's own `getResourcePath` answers
 * — measured: a folder named `图片` comes back as `%E5%9B%BE%E7%89%87` and a
 * space as `%20`, with the separators left alone and the leading `/` dropped.
 * The placeholder braces are put back afterwards: encoded, they would reach
 * MapLibre as literal text and never be filled in.
 */
function encodePath(path: string): string {
	return path
		.replace(/^\/+/, '')
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/')
		.replace(/%7B/g, '{')
		.replace(/%7D/g, '}');
}

/**
 * A vault-relative name to ask both path questions about. Nothing is read and
 * the file need not exist: both answers are string arithmetic on the vault's own
 * location. Plain ASCII deliberately — a name carrying a space or a CJK
 * character comes back percent-encoded from one answer and literal from the
 * other, and the two would no longer share a tail.
 */
const PREFIX_PROBE = 'x';

/**
 * The prefix this host puts in front of a local file it serves to its own web
 * view, or null when it cannot be derived.
 *
 * Asked for rather than assumed, because it is not the same string everywhere.
 * `Platform.resourcePathPrefix` is `app://<token>/` on the desktop and
 * `file:///` on Android, where the web view runs on origin `http://localhost`
 * and refuses a `file://` subresource — measured: a tile that is on disk and
 * readable fails both `fetch()` and `new Image()`. The prefix that host uses for
 * its own local resources is `http://localhost/_capacitor_file_/`, and that one
 * loads, for a file inside the vault and for one outside it.
 *
 * Derived by subtraction: `getResourcePath(p)` is `getFullPath(p)` behind the
 * prefix, so what the first answer carries and the second does not is the prefix
 * itself. Deriving it rather than naming a platform is what lets a host this was
 * never measured against be right without a second code path here. Where the
 * subtraction does not hold, nothing is derived and the caller keeps whatever
 * prefix it already had — which is what happens on the desktop, where the
 * resource path ends in a cache-busting `?<mtime>` and the constant is right
 * anyway. Measured there: `app://<token>/…/x?1787148608857`.
 */
export function localResourcePrefix(adapter: VaultPaths | null | undefined): string | null {
	if (!adapter || typeof adapter.getResourcePath !== 'function' || typeof adapter.getFullPath !== 'function') {
		return null;
	}
	let resource: unknown;
	let full: unknown;
	try {
		resource = adapter.getResourcePath(PREFIX_PROBE);
		full = adapter.getFullPath(PREFIX_PROBE);
	} catch {
		// An adapter that throws on a path naming nothing says nothing useful.
		return null;
	}
	if (typeof resource !== 'string' || typeof full !== 'string' || full === '') return null;
	// Both forms of the tail, because a host may or may not have encoded it: a
	// vault directory holding a space or a CJK character is the only case that
	// tells them apart, and a plain-ASCII vault answers the same either way.
	for (const tail of [encodePath(full), full.replace(/^\/+/, '')]) {
		if (tail === '' || !resource.endsWith(tail)) continue;
		const prefix = resource.slice(0, resource.length - tail.length);
		// A prefix names a scheme. Without one, the two answers were the same path
		// and what is left is a bare separator, which would build an origin-relative
		// URL — a request back to the host rather than a file on disk.
		if (!prefix.includes('://')) continue;
		// Both tails dropped the path's own leading separator, exactly as
		// `encodePath` does for a real template, so the prefix carries it instead —
		// which is how `Platform.resourcePathPrefix` already ends.
		return prefix.endsWith('/') ? prefix : `${prefix}/`;
	}
	return null;
}

/**
 * Where this vault starts, or '' when the adapter will not say.
 *
 * `getFullPath('')` rather than `getBasePath()`: the latter is a
 * `FileSystemAdapter` method — measured absent on Android — so testing for that
 * class was really a test for the desktop wearing the name of a capability, and
 * a vault-relative pack resolved to nothing on a phone. Both shipped adapters
 * answer `getFullPath`, and both were measured to answer the same directory the
 * desktop's `getBasePath()` does — Android with a trailing separator, the desktop
 * without one, and `offlineTileUrl` strips either.
 */
export function vaultBasePath(adapter: VaultPaths | null | undefined): string {
	if (!adapter || typeof adapter.getFullPath !== 'function') return '';
	let full: unknown;
	try {
		full = adapter.getFullPath('');
	} catch {
		return '';
	}
	return typeof full === 'string' ? full : '';
}

/**
 * A path template as a URL the renderer can fetch, or null when it is unusable.
 *
 * `prefix` is the one this host serves local files behind — `app://<random>/` on
 * the desktop, rebuilt at every application launch and persisted nowhere. That
 * is why this is resolved when a map is built and the result is never stored: a
 * URL written into a base file would stop working at the next restart.
 *
 * A relative template is taken as vault-relative. A pack inside the vault is a
 * bad idea — six figures of files for Obsidian to index — but a reader who does
 * it should get a map rather than a silently blank one.
 */
export function offlineTileUrl(template: string, prefix: string, vaultBase: string): string | null {
	const text = template.trim();
	if (text === '' || tilesProblem(text) !== null || prefix === '') return null;
	let path = text.replace(/\\/g, '/');
	if (!isAbsolute(path)) {
		const base = vaultBase.replace(/\\/g, '/').replace(/\/+$/, '');
		// No base path means no way to say where a relative template starts. The
		// filesystem root is not a reasonable guess.
		if (base === '') return null;
		path = `${base}/${path.replace(/^\.\//, '')}`;
	}
	return prefix + encodePath(path);
}

/** What a pack draws and how far the map may go over it. */
export interface OfflineBasemap {
	url: string;
	/** The pack's deepest level, which is the raster source's own bound. */
	sourceMaxZoom: number;
	/** The shallowest zoom the camera may reach over this pack. */
	cameraMinZoom: number;
}

function level(value: unknown, fallback: number): number {
	const number = typeof value === 'number' ? value : Number.NaN;
	if (!isFinite(number)) return fallback;
	return Math.min(TILE_ZOOM_MAX, Math.max(0, Math.round(number)));
}

/**
 * The two bounds a pack implies, from the two levels the reader stated.
 *
 * The ends are bounded differently because they fail differently. Past the
 * deepest level, bounding the *source* leaves MapLibre drawing overzoomed parent
 * tiles: blurry rather than blank, and no request for a tile that is not there.
 * Below the shallowest, bounding the source instead empties it — measured: at
 * map zoom 0 with `minzoom: 2` the source held zero tiles — so the camera is
 * bounded there and simply stops at the edge of the pack.
 *
 * Stated the wrong way round, the two are ordered rather than rejected: the
 * reader meant a range either way.
 */
export function offlineZoomBounds(minZoom: unknown, maxZoom: unknown): Omit<OfflineBasemap, 'url'> {
	const a = level(minZoom, 0);
	const b = level(maxZoom, TILE_ZOOM_MAX);
	const shallowest = Math.min(a, b);
	return {
		sourceMaxZoom: Math.max(a, b),
		cameraMinZoom: Math.max(0, shallowest - TILE_ZOOM_OFFSET),
	};
}

/**
 * Point one map's config at the pack, in the object the native view just built.
 *
 * Deliberately here and not in the base file: `config.get('mapTiles')` keeps
 * answering whatever the reader configured, so turning the pack off needs no
 * undo — the next `loadConfig` simply does not substitute — and no URL carrying
 * a per-launch token is ever written to a file that syncs.
 *
 * Both light and dark are written: one pack draws in both themes, and leaving
 * dark alone would send the map back to the network at the next theme change.
 */
export function applyOfflineTiles(config: MapConfig | undefined, pack: OfflineBasemap | null): boolean {
	if (!config || !pack) return false;
	config.mapTiles = [pack.url];
	config.mapTilesDark = [pack.url];
	// Raised, never lowered: a view that already refuses to zoom out past 4 keeps
	// refusing. The default zoom comes up with it, since the native view hands
	// both to the MapLibre constructor and a default below the minimum is a
	// camera that jumps on the first frame.
	if (typeof config.minZoom === 'number' && config.minZoom < pack.cameraMinZoom) {
		config.minZoom = pack.cameraMinZoom;
	}
	if (typeof config.defaultZoom === 'number' && typeof config.minZoom === 'number') {
		config.defaultZoom = Math.max(config.defaultZoom, config.minZoom);
	}
	return true;
}

/** The style's sources, when the map answers with the shape this expects. */
function styleSources(map: MapLibreMap): Record<string, unknown> | null {
	if (typeof map.getStyle !== 'function') return null;
	let style: unknown;
	try {
		style = map.getStyle();
	} catch {
		// A map torn down between the style event and this call.
		return null;
	}
	const sources = (style as { sources?: unknown } | null | undefined)?.sources;
	return sources && typeof sources === 'object' ? (sources as Record<string, unknown>) : null;
}

/**
 * Stop the map asking for levels the pack does not have. Answers how many
 * sources were bounded, which is 0 on any map not drawing this pack.
 *
 * The source is found by the URL this plugin resolved rather than by the
 * `custom-tiles-0` id the native style builder mints: the id is a naming
 * convention in someone else's file, the URL is this plugin's own value.
 *
 * Assignment only. `setTiles()` would also work, and would additionally abort
 * every in-flight request and drop the tiles already drawn — measured
 * unnecessary: assigning `maxzoom` alone took one zoom-in from 20 failed fetches
 * to zero, and raising it back without `setTiles` brought the failures back, so
 * MapLibre reads the field when it computes covering tiles.
 */
export function boundOfflineSource(map: MapLibreMap, url: string, maxZoom: number): number {
	const sources = styleSources(map);
	if (!sources) return 0;
	let bounded = 0;
	for (const [id, spec] of Object.entries(sources)) {
		const raster = spec as { type?: unknown; tiles?: unknown } | null;
		if (!raster || raster.type !== 'raster' || !Array.isArray(raster.tiles)) continue;
		if (!raster.tiles.includes(url)) continue;
		const source = map.getSource<RasterTileSource>(id);
		if (!source) continue;
		source.maxzoom = maxZoom;
		bounded++;
	}
	return bounded;
}

/**
 * Rebuild one map's config and restyle it, so a pack that has just been
 * configured, changed or cleared reaches a map already on screen.
 *
 * The native view decides whether to restyle by comparing a snapshot of its own
 * option values, none of which changed — so nothing would happen on its own.
 * Rebuilding the config is what re-runs whatever substitutes into it, and what
 * stops substituting once the pack is gone: the native background comes back
 * because it was never overwritten anywhere, only shadowed.
 *
 * Answers false, having done nothing, for a view with no map yet — the next
 * `initializeMap` will build one from the current settings anyway.
 */
export function restyleForBasemap(view: BasesMapView | null | undefined): boolean {
	if (!view || !view.map) return false;
	if (typeof view.loadConfig !== 'function' || typeof view.updateMapStyle !== 'function') return false;
	const current = view.mapConfig?.currentTileSetId;
	const config = view.loadConfig(typeof current === 'string' ? current : undefined);
	view.mapConfig = config;
	const map = view.map;
	// The camera bound goes on the live map by hand: the native view applies it
	// from this config only when it builds a map or notices its own options
	// changing, and neither is happening here.
	if (typeof map.setMinZoom === 'function' && typeof config.minZoom === 'number') map.setMinZoom(config.minZoom);
	view.updateMapStyle();
	return true;
}

/**
 * Does this view draw the pack? The view option is empty — the default, meaning
 * use it — or `off`. Anything else a stored base file might hold means on, since
 * the only way to decline is to have said so.
 */
export const OFFLINE_TILES_OFF = 'off';

export function usesOfflineTiles(option: unknown): boolean {
	return option !== OFFLINE_TILES_OFF;
}
