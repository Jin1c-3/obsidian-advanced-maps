/*
 * Turning a WGS-84 coordinate into a link that opens the same spot in an
 * external map app — the exact inverse of geolink.ts, which reads a coordinate
 * out of a pasted link. Every decision below already got made there, correctly,
 * with the reasoning written out, so this file mirrors it rather than
 * re-deciding it:
 *
 * - Axis order is per provider, not universal. 高德 writes longitude first;
 *   百度 writes latitude first. Get it backwards and the pin lands in another
 *   province with nothing on screen to say so — the exact trap readAmap() and
 *   readBaidu() exist to dodge on the way in, mirrored here on the way out.
 * - The datum is a property of the provider, not a setting. 高德 and 腾讯 both
 *   serve GCJ-02, 百度 serves BD-09, and Google/Apple serve GCJ-02 inside China
 *   and WGS-84 everywhere else — the same rule `chinaAware()` applies when
 *   *reading* one of their links applies unchanged when *writing* one.
 *
 * Pure and offline: no Obsidian import, no DOM, no network. The caller hands
 * this WGS-84 — that is what every other seam in this plugin un-shifts a
 * coordinate to before it leaves the map, so this file does no un-shifting of
 * its own, only the shift back onto each provider's native datum.
 */

import { COORD_DIGITS, gcj2bd, outOfChina, wgs2gcj } from './coords';

export const EXTERNAL_MAPS = ['amap', 'baidu', 'tencent', 'google', 'apple', 'osm'] as const;
export type ExternalMap = (typeof EXTERNAL_MAPS)[number];

/**
 * A built-in provider as the reader has arranged it: the order they sit in, and
 * whether each one is in the menu at all. A reader who only ever opens 高德 is
 * reading past five items they will never pick, and a menu is a finite thing.
 */
export interface BuiltinMap {
	id: ExternalMap;
	on: boolean;
}

/**
 * One map app the reader added themselves — a name, a URL with `{lat}`/`{lng}`
 * in it, and the datum that URL expects.
 *
 * **The datum is stated, not templated.** It is the one thing the six built-ins
 * do that no amount of string substitution can express: 高德 and 腾讯 want
 * GCJ-02, 百度 wants BD-09, and getting it wrong lands the pin 500 m away with
 * nothing on screen to say so — the same failure `geolink.ts` and the rest of
 * this file exist to keep out. So a custom entry carries its own answer rather
 * than being guessed at from the host, which a self-hosted mirror would defeat.
 */
export interface CustomMap {
	name: string;
	url: string;
	datum: CustomDatum;
}

/** No `auto` here: there is no tile URL to read the answer off. */
export const CUSTOM_DATUMS = ['wgs84', 'gcj02', 'bd09'] as const;
export type CustomDatum = (typeof CUSTOM_DATUMS)[number];

/** The same rounding every other coordinate this plugin writes gets. */
const fmt = (n: number): string => n.toFixed(COORD_DIGITS);

/**
 * The order to list them in — most likely first for this locale.
 *
 * Ordered by *locale*, not by the view's own basemap. Which tiles a particular
 * map happens to be drawing is incidental to which app is actually installed on
 * the reader's phone: a reader in China with an OpenStreetMap embed still
 * reaches for 高德 or 百度 first, and a reader elsewhere with a 高德 base view
 * still reaches for Google or Apple first. All six are always present — the
 * point of asking is only which three lead.
 */
export function mapOrder(locale: 'en' | 'zh'): ExternalMap[] {
	if (locale === 'zh') return ['amap', 'baidu', 'tencent', 'google', 'apple', 'osm'];
	return ['google', 'apple', 'osm', 'amap', 'baidu', 'tencent'];
}

/**
 * What was saved, made whole against what this version knows.
 *
 * Nothing saved means **follow the locale**, which is why the setting's default
 * is an empty list rather than the six written out: writing them out on first
 * render would freeze one locale's order into the settings file, and a reader
 * who later switches Obsidian to Chinese would keep an English menu with no
 * setting on screen admitting to it. An order is stored only once the reader
 * states one.
 *
 * Everything else here is the same rule the two dropdowns follow — a stored
 * setting outlives the version of the plugin that wrote it. An id this version
 * does not know is dropped, a duplicate is taken once, and a provider added by
 * a later version arrives on at the end rather than silently missing.
 */
export function resolveBuiltins(stored: unknown, locale: 'en' | 'zh'): BuiltinMap[] {
	const known = new Set<string>(EXTERNAL_MAPS);
	const seen = new Set<ExternalMap>();
	const out: BuiltinMap[] = [];
	if (Array.isArray(stored)) {
		for (const raw of stored) {
			if (raw === null || typeof raw !== 'object') continue;
			const { id, on } = raw as { id?: unknown; on?: unknown };
			if (typeof id !== 'string' || !known.has(id) || seen.has(id as ExternalMap)) continue;
			seen.add(id as ExternalMap);
			// Anything but an explicit false reads as on: a half-written entry
			// should leave a provider in the menu, not take it out.
			out.push({ id: id as ExternalMap, on: on !== false });
		}
	}
	for (const id of mapOrder(locale)) if (!seen.has(id)) out.push({ id, on: true });
	return out;
}

export function enabledBuiltins(list: BuiltinMap[]): ExternalMap[] {
	return list.filter((entry) => entry.on).map((entry) => entry.id);
}

/**
 * GCJ-02 inside China, WGS-84 everywhere else — the write-side twin of
 * `chinaAware()` in geolink.ts. Google's and Apple's URI endpoints take
 * whatever datum the map itself draws in and offer no parameter to state one
 * over the other, so the coordinate has to answer for itself via `outOfChina`,
 * exactly as it does when one of their links is read instead of written.
 */
function chinaAwareOut(lat: number, lng: number): [number, number] {
	if (outOfChina(lng, lat)) return [lng, lat];
	return wgs2gcj(lng, lat);
}

/** WGS-84 → BD-09. There is no direct transform; BD-09 is defined on top of GCJ-02. */
function wgs2bd(lng: number, lat: number): [number, number] {
	const gcj = wgs2gcj(lng, lat);
	return gcj2bd(gcj[0], gcj[1]);
}

/**
 * A WGS-84 coordinate as a URL opening that spot in that provider's web map.
 *
 * Every shape below is a documented public URI endpoint and none takes an API
 * key, so none of these links can go dead because a key later expires or gets
 * revoked.
 *
 * Coordinate only, no label. The one caller is a right-click on empty map — see
 * `addExternalMapItems` — where there is no note and so no name to pass, and
 * inventing one would be worse than none. 高德, 百度 and Apple do each take a
 * label parameter; if the ROADMAP's "stamp an existing note from the map" ever
 * lands, that is the point at which to decide *which* name a pin contributes
 * and to add it back, rather than carrying a guess at the answer until then.
 */
export function externalMapUrl(app: ExternalMap, lat: number, lng: number): string {
	switch (app) {
		case 'amap': {
			// position is longitude-first, matching what readAmap() expects to find
			// on the way back in.
			const [gLng, gLat] = wgs2gcj(lng, lat);
			return `https://uri.amap.com/marker?position=${fmt(gLng)},${fmt(gLat)}&src=obsidian&coordinate=gaode`;
		}

		case 'baidu': {
			// location is latitude-first, matching readBaidu().
			const [bLng, bLat] = wgs2bd(lng, lat);
			return `https://api.map.baidu.com/marker?location=${fmt(bLat)},${fmt(bLng)}&output=html&coord_type=bd09ll`;
		}

		case 'tencent': {
			// coord: is latitude-first, matching readTencent().
			const [tLng, tLat] = wgs2gcj(lng, lat);
			return `https://apis.map.qq.com/uri/v1/marker?marker=coord:${fmt(tLat)},${fmt(tLng)}`;
		}

		case 'google': {
			const [oLng, oLat] = chinaAwareOut(lat, lng);
			return `https://www.google.com/maps/search/?api=1&query=${fmt(oLat)},${fmt(oLng)}`;
		}

		case 'apple': {
			const [oLng, oLat] = chinaAwareOut(lat, lng);
			return `https://maps.apple.com/?ll=${fmt(oLat)},${fmt(oLng)}`;
		}

		case 'osm': {
			// WGS-84, untouched — OpenStreetMap is the one provider here that never
			// needed a conversion. The coordinate appears twice: mlat/mlon drop the
			// pin, and the #map hash centres and zooms the camera on it.
			return `https://www.openstreetmap.org/?mlat=${fmt(lat)}&mlon=${fmt(lng)}#map=16/${fmt(lat)}/${fmt(lng)}`;
		}
	}
}

/* ---- entries the reader added themselves ---- */

/**
 * Schemes a menu item must never carry.
 *
 * The six above are this file's own constants; a custom entry is a string
 * somebody typed, and it ends up at `window.open`. `javascript:` there runs
 * code, and `data:`/`blob:` open a document that claims to be one. The check is
 * a deny list rather than an allow list of `http`/`https` on purpose: the whole
 * point of a custom entry on a phone is `iosamap://`, `baidumap://`,
 * `comgooglemaps://` or `waze://`, and an allow list would refuse exactly the
 * case this feature exists for.
 */
const UNSAFE_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'blob', 'file']);

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

export type UrlProblem = 'scheme' | 'unsafe' | 'placeholder';

/**
 * Why this URL cannot be used, or null when it can.
 *
 * Separate from `customMapUrl` so the settings pane can say which of the three
 * it is while the reader is still typing, rather than the entry going quietly
 * missing from a menu it was never seen in.
 */
export function customUrlProblem(url: string): UrlProblem | null {
	const trimmed = url.trim();
	const scheme = SCHEME.exec(trimmed);
	// No scheme at all would resolve against Obsidian's own origin.
	if (!scheme) return 'scheme';
	if (UNSAFE_SCHEMES.has(scheme[1].toLowerCase())) return 'unsafe';
	if (!trimmed.includes('{lat}') || !trimmed.includes('{lng}')) return 'placeholder';
	return null;
}

/**
 * The reader's URL with the coordinate in it, or null if the URL is unusable.
 *
 * `{lat}` and `{lng}` rather than a fixed order, which is what lets one template
 * serve both axis conventions — 高德 writes longitude first and 百度 latitude
 * first, and here that is the reader's business rather than a rule to encode.
 * Substitution is on the raw string, never on a parsed URL: `{` and `}` are in
 * the WHATWG path percent-encode set, so a round trip through `new URL()` turns
 * `https://x/{lat}/{lng}` into `%7Blat%7D/%7Blng%7D` and there is nothing left
 * to substitute. (A placeholder in the *query* survives, which is what makes
 * this worth stating rather than obvious — half the templates would work.)
 */
export function customMapUrl(entry: CustomMap, lat: number, lng: number): string | null {
	const url = entry.url.trim();
	if (customUrlProblem(url) !== null) return null;
	const [outLng, outLat] = shiftTo(entry.datum, lng, lat);
	return url.split('{lat}').join(fmt(outLat)).split('{lng}').join(fmt(outLng));
}

function shiftTo(datum: CustomDatum, lng: number, lat: number): [number, number] {
	switch (datum) {
		case 'gcj02':
			return wgs2gcj(lng, lat);
		case 'bd09':
			return wgs2bd(lng, lat);
		default:
			return [lng, lat];
	}
}

/** What to call an entry in the menu: its name, or the host it points at. */
export function customMapLabel(entry: CustomMap): string {
	const name = entry.name.trim();
	if (name !== '') return name;
	const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(entry.url.trim());
	return host ? host[1] : entry.url.trim();
}

/**
 * A saved list read back as something this version can use — same reason
 * `resolveBuiltins` exists, applied to three fields instead of two. A datum the
 * dropdown no longer offers falls back to WGS-84 rather than to a conversion
 * nobody asked for.
 */
export function customMaps(stored: unknown): CustomMap[] {
	if (!Array.isArray(stored)) return [];
	const out: CustomMap[] = [];
	for (const raw of stored) {
		if (raw === null || typeof raw !== 'object') continue;
		const { name, url, datum } = raw as { name?: unknown; url?: unknown; datum?: unknown };
		out.push({
			name: typeof name === 'string' ? name : '',
			url: typeof url === 'string' ? url : '',
			datum: (CUSTOM_DATUMS as readonly unknown[]).includes(datum) ? (datum as CustomDatum) : 'wgs84',
		});
	}
	return out;
}
