/*
 * Reading a coordinate out of whatever was on the clipboard.
 *
 * The gap this fills: a location almost never arrives as a coordinate. It
 * arrives as a share link from a phone — 高德, 百度, 腾讯, Google, Apple — and
 * copying the numbers out by hand means knowing, per provider, which of the two
 * numbers comes first and which datum they are in. Get either wrong and the pin
 * lands in the wrong province with no visible complaint.
 *
 * So each provider gets its own reader, and each reader states the datum it
 * knows the provider writes in. The conversion to WGS-84 happens once, at the
 * end, through coords.ts — nothing here does arithmetic on a coordinate.
 *
 * Everything in this file is pure and offline. Short links (surl.amap.com,
 * maps.app.goo.gl, j.map.baidu.com) are deliberately *not* followed: resolving
 * one means a network request to a third party carrying the link, which is a
 * different kind of decision from parsing text. They are recognised only so the
 * caller can say "that link has to be opened once first" instead of "no
 * coordinate here".
 */

import { outOfChina, toWgs84, type CoordSystem } from './coords';

/** Who wrote the text, as far as we can tell. Names the UI can show. */
export type Provider = 'amap' | 'baidu' | 'tencent' | 'google' | 'apple' | 'osm' | 'geo' | 'dms' | 'plain';

export interface ParsedPoint {
	/** The numbers as written, still in `system`. */
	lat: number;
	lng: number;
	/** The datum those numbers are in. */
	system: CoordSystem;
	provider: Provider;
}

/** A link we recognise but cannot read without a network round-trip. */
export interface ShortLink {
	provider: Provider;
	url: string;
}

const isLat = (n: number): boolean => Number.isFinite(n) && n >= -90 && n <= 90;
const isLng = (n: number): boolean => Number.isFinite(n) && n >= -180 && n <= 180;

/** Both halves valid, and not the null island a failed parse so often produces. */
function point(lat: number, lng: number, system: CoordSystem, provider: Provider): ParsedPoint | null {
	if (!isLat(lat) || !isLng(lng)) return null;
	if (lat === 0 && lng === 0) return null;
	return { lat, lng, system, provider };
}

/**
 * The first of `names` that is present and numeric, or null.
 *
 * Not `Number(q.get(…))`: a missing parameter gives null, and `Number(null)` is
 * 0 rather than NaN, so an absent `lat` reads as a perfectly finite equator.
 */
function numParam(q: URLSearchParams, ...names: string[]): number | null {
	for (const name of names) {
		const raw = q.get(name);
		if (raw === null || raw.trim() === '') continue;
		const value = Number(raw);
		if (Number.isFinite(value)) return value;
	}
	return null;
}

/** "30.24,120.14" → [30.24, 120.14], in the order written. */
function pair(value: string | null | undefined): [number, number] | null {
	if (!value) return null;
	const parts = value.split(/[,;\s]+/).filter(Boolean);
	if (parts.length < 2) return null;
	const a = Number(parts[0]);
	const b = Number(parts[1]);
	return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

/**
 * Google and Apple both draw China from GCJ-02 and hand out GCJ-02 in their
 * URLs, and both use WGS-84 everywhere else. There is no flag in the link that
 * says which, so the coordinate has to answer for itself — which is exactly what
 * `outOfChina` is for. Wrong only in the strip along the border where the
 * bounding box and the real border disagree, and wrong by ~500 m there rather
 * than catastrophically.
 */
function chinaAware(lat: number, lng: number): CoordSystem {
	return outOfChina(lng, lat) ? 'wgs84' : 'gcj02';
}

/* ---- per-provider readers ---- */

/**
 * 高德. `uri.amap.com` writes **longitude first** — the one detail that makes
 * hand-copying from an Amap link go wrong most often.
 */
function readAmap(url: URL): ParsedPoint | null {
	const q = url.searchParams;

	const position = pair(q.get('position') ?? q.get('to') ?? q.get('from'));
	if (position) return point(position[1], position[0], 'gcj02', 'amap');

	const lat = numParam(q, 'lat');
	const lng = numParam(q, 'lng', 'lon');
	if (lat !== null && lng !== null) return point(lat, lng, 'gcj02', 'amap');

	// The web map keeps its camera in the fragment: #/map?...&center=lng,lat
	const centre = pair(new URLSearchParams(url.hash.replace(/^#\/?[^?]*\??/, '')).get('center'));
	if (centre) return point(centre[1], centre[0], 'gcj02', 'amap');

	return null;
}

/**
 * 百度, the one provider that says out loud which datum it used: `coord_type`
 * is part of its URI spec, so it is believed when present and BD-09 assumed
 * when absent, that being the default for every 百度 endpoint.
 */
function readBaidu(url: URL): ParsedPoint | null {
	const q = url.searchParams;

	const declared = (q.get('coord_type') ?? '').toLowerCase();
	const system: CoordSystem = declared.startsWith('wgs84')
		? 'wgs84'
		: declared.startsWith('gcj02')
			? 'gcj02'
			: 'bd09';

	// location / latlng are lat,lng. `destination=latlng:39.9,116.4|name:x` too.
	const raw = q.get('location') ?? q.get('latlng') ?? q.get('center') ?? q.get('destination') ?? q.get('origin');
	const cleaned = raw?.replace(/^latlng:/, '').split('|')[0];
	const latlng = pair(cleaned);
	if (latlng) return point(latlng[0], latlng[1], system, 'baidu');

	return null;
}

/** 腾讯. `marker=coord:39.9,116.4;title:…` — lat first, GCJ-02. */
function readTencent(url: URL): ParsedPoint | null {
	const q = url.searchParams;

	const marker = q.get('marker') ?? q.get('to') ?? q.get('from');
	const coord = marker?.match(/coord:\s*([-\d.]+\s*,\s*[-\d.]+)/i)?.[1];
	const fromMarker = pair(coord);
	if (fromMarker) return point(fromMarker[0], fromMarker[1], 'gcj02', 'tencent');

	const plain = pair(q.get('coord') ?? q.get('center') ?? q.get('latlng'));
	if (plain) return point(plain[0], plain[1], 'gcj02', 'tencent');

	const lat = numParam(q, 'lat');
	const lng = numParam(q, 'lng', 'lon');
	if (lat !== null && lng !== null) return point(lat, lng, 'gcj02', 'tencent');

	return null;
}

/**
 * Google. Three coordinates can appear in one URL and they are not equally
 * good: `!3d…!4d…` inside the `data` blob is the place itself, `@lat,lng,zoom`
 * is only wherever the camera happened to be, and `q=` is whatever was typed.
 * Preferred in that order, so a link to a restaurant gives the restaurant and
 * not the corner of the screen.
 */
function readGoogle(url: URL): ParsedPoint | null {
	const href = url.href;

	const place = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
	if (place) {
		const lat = Number(place[1]);
		const lng = Number(place[2]);
		return point(lat, lng, chinaAware(lat, lng), 'google');
	}

	const camera = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
	if (camera) {
		const lat = Number(camera[1]);
		const lng = Number(camera[2]);
		return point(lat, lng, chinaAware(lat, lng), 'google');
	}

	const query = pair((url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').replace(/^loc:/, ''));
	if (query) return point(query[0], query[1], chinaAware(query[0], query[1]), 'google');

	return null;
}

/** Apple Maps: `?ll=lat,lng`, sometimes `coordinate=`. GCJ-02 in China, as Google. */
function readApple(url: URL): ParsedPoint | null {
	const q = url.searchParams;
	const latlng = pair(q.get('ll') ?? q.get('coordinate') ?? q.get('sll') ?? q.get('daddr'));
	if (!latlng) return null;
	return point(latlng[0], latlng[1], chinaAware(latlng[0], latlng[1]), 'apple');
}

/** OpenStreetMap, and anything else honest enough to be WGS-84. */
function readOsm(url: URL): ParsedPoint | null {
	const q = url.searchParams;

	const mlat = numParam(q, 'mlat');
	const mlon = numParam(q, 'mlon');
	if (mlat !== null && mlon !== null) return point(mlat, mlon, 'wgs84', 'osm');

	// #map=15/30.2426/120.1444
	const hash = url.hash.match(/map=[\d.]+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
	if (hash) return point(Number(hash[1]), Number(hash[2]), 'wgs84', 'osm');

	return null;
}

/* ---- host routing ---- */

const HOSTS: ReadonlyArray<[RegExp, (url: URL) => ParsedPoint | null]> = [
	[/(^|\.)amap\.com$|(^|\.)autonavi\.com$|(^|\.)gaode\.com$/i, readAmap],
	[/(^|\.)map\.baidu\.com$|(^|\.)baidu\.com$/i, readBaidu],
	[/(^|\.)map\.qq\.com$|(^|\.)apis\.map\.qq\.com$|(^|\.)qq\.com$/i, readTencent],
	[/(^|\.)google\.[a-z.]+$|(^|\.)google\.com$/i, readGoogle],
	[/(^|\.)maps\.apple\.com$|(^|\.)apple\.com$/i, readApple],
	[/(^|\.)openstreetmap\.org$|(^|\.)osm\.org$/i, readOsm],
];

/** Links whose coordinate only exists on the far end of a redirect. */
const SHORTENERS: ReadonlyArray<[RegExp, Provider]> = [
	[/(^|\.)surl\.amap\.com$/i, 'amap'],
	[/(^|\.)j\.map\.baidu\.com$/i, 'baidu'],
	[/(^|\.)maps\.app\.goo\.gl$|(^|\.)goo\.gl$/i, 'google'],
	[/(^|\.)url\.cn$/i, 'tencent'],
];

/* ---- bare text ---- */

/**
 * Degrees-minutes-seconds, the shape Wikipedia and Google's own "copy
 * coordinates" produce: 30°14'33.4"N 120°08'40.0"E. The hemisphere letters are
 * what make it unambiguous, so they are required rather than assumed.
 */
const DMS =
	/(\d+)\s*[°:\s]\s*(\d+(?:\.\d+)?)\s*['′:\s]?\s*(\d+(?:\.\d+)?)?\s*["″]?\s*([NSns])[\s,]+(\d+)\s*[°:\s]\s*(\d+(?:\.\d+)?)\s*['′:\s]?\s*(\d+(?:\.\d+)?)?\s*["″]?\s*([EWew])/;

function readDms(text: string): ParsedPoint | null {
	const m = text.match(DMS);
	if (!m) return null;
	const dms = (d: string, min: string, sec: string | undefined, hemi: string): number => {
		const value = Number(d) + Number(min) / 60 + Number(sec ?? 0) / 3600;
		return /[SsWw]/.test(hemi) ? -value : value;
	};
	return point(dms(m[1], m[2], m[3], m[4]), dms(m[5], m[6], m[7], m[8]), 'wgs84', 'dms');
}

/**
 * Two bare numbers. Assumed WGS-84 and lat-first, because that is what the
 * vault stores and what this plugin itself writes — a guess, but the only one
 * that round-trips its own output. The caller offers a way to say otherwise.
 */
function readPlain(text: string): ParsedPoint | null {
	const m = text.match(/(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)/);
	if (!m) return null;
	return point(Number(m[1]), Number(m[2]), 'wgs84', 'plain');
}

/** `geo:30.24,120.14` — WGS-84 by RFC 5870, unless it names another CRS. */
function readGeoUri(text: string): ParsedPoint | null {
	const m = text.match(/geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
	if (!m) return null;
	const crs = text.match(/crs=([\w-]+)/i)?.[1]?.toLowerCase();
	if (crs && !crs.startsWith('wgs84')) return null;
	return point(Number(m[1]), Number(m[2]), 'wgs84', 'geo');
}

/* ---- the door ---- */

/** The first URL in the text, if there is one we can make a `URL` of. */
function firstUrl(text: string): URL | null {
	const match = text.match(/https?:\/\/[^\s<>"')\]]+/i);
	if (!match) return null;
	try {
		return new URL(match[0]);
	} catch {
		return null;
	}
}

/**
 * A short link we recognise but cannot resolve offline, or null. Checked before
 * parsing so the caller can explain the one thing that would fix it.
 */
export function shortLink(text: string): ShortLink | null {
	const url = firstUrl(text);
	if (!url) return null;
	for (const [host, provider] of SHORTENERS) {
		if (host.test(url.hostname)) return { provider, url: url.href };
	}
	return null;
}

/**
 * Whatever coordinate the text holds, still in the datum it was written in.
 *
 * Providers are tried by host first, so a Baidu link is never read with Google's
 * rules, and only then the datum-free shapes — a `geo:` URI, degrees-minutes-
 * seconds, two bare numbers. Returns null rather than guessing.
 */
export function parseGeoLink(text: string): ParsedPoint | null {
	const trimmed = text.trim();
	if (!trimmed) return null;

	const url = firstUrl(trimmed);
	if (url) {
		for (const [host, read] of HOSTS) {
			if (!host.test(url.hostname)) continue;
			const found = read(url);
			if (found) return found;
		}
	}

	// A geo: URI names its own CRS, so it answers for itself. Falling through to
	// the bare-number reader would relabel some other datum as WGS-84 — the two
	// numbers are right there and would parse perfectly.
	if (/\bgeo:/i.test(trimmed)) return readGeoUri(trimmed);

	return readDms(trimmed) ?? readPlain(trimmed);
}

/**
 * The same point in WGS-84, which is the only datum this plugin writes to disk.
 * Outside China every conversion here is the identity, so this is safe to call
 * unconditionally.
 */
export function toWgs(p: ParsedPoint): { lat: number; lng: number } {
	const [lng, lat] = toWgs84(p.system, p.lng, p.lat);
	return { lat, lng };
}
