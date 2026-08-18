/* Pure, offline provider-aware coordinate parsing; short redirects are identified but never followed. */

import { outOfChina, type CoordSystem } from './coords';
import { codeIssue, decodeCenter, findPlusCode } from './pluscode';

/** Who wrote the text, as far as we can tell. Names the UI can show. */
export type Provider = 'amap' | 'baidu' | 'tencent' | 'google' | 'apple' | 'osm' | 'geo' | 'dms' | 'plain' | 'pluscode';

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

/**
 * The first of `names` that is present and not blank, or null.
 *
 * The sibling of `numParam`, and for the same reason: `q.get` answers `''` for
 * `?location=` rather than null, so a plain `??` chain stops at the blank one
 * and never reaches the parameter that actually carries the coordinate.
 */
function firstParam(q: URLSearchParams, ...names: string[]): string | null {
	for (const name of names) {
		const raw = q.get(name);
		if (raw !== null && raw.trim() !== '') return raw;
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

	const position = pair(firstParam(q, 'position', 'to', 'from'));
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
	const raw = firstParam(q, 'location', 'latlng', 'center', 'destination', 'origin');
	const cleaned = raw?.replace(/^latlng:/, '').split('|')[0];
	const latlng = pair(cleaned);
	if (latlng) return point(latlng[0], latlng[1], system, 'baidu');

	return null;
}

/** 腾讯. `marker=coord:39.9,116.4;title:…` — lat first, GCJ-02. */
function readTencent(url: URL): ParsedPoint | null {
	const q = url.searchParams;

	const marker = firstParam(q, 'marker', 'to', 'from');
	const coord = marker?.match(/coord:\s*([-\d.]+\s*,\s*[-\d.]+)/i)?.[1];
	const fromMarker = pair(coord);
	if (fromMarker) return point(fromMarker[0], fromMarker[1], 'gcj02', 'tencent');

	const plain = pair(firstParam(q, 'coord', 'center', 'latlng'));
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
	const latlng = pair(firstParam(q, 'll', 'coordinate', 'sll', 'daddr'));
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

/**
 * `plus.codes/8FVC9G8F+6W` — the canonical share URL for a code, which is a
 * URL and so never reaches the bare-text readers below.
 *
 * The path is decoded first: a `+` written literally in a path stays a `+`, but
 * a share sheet that percent-encodes it hands over `%2B`.
 */
function readPlusCodeUrl(url: URL): ParsedPoint | null {
	let path: string;
	try {
		path = decodeURIComponent(url.pathname);
	} catch {
		// A stray percent that is not an escape; the raw path is still worth trying.
		path = url.pathname;
	}
	return readPlusCode(path.replace(/^\/+/, ''));
}

/* ---- host routing ---- */

/**
 * Google is the one provider without a single registrable domain — it maps on
 * `google.com`, `google.de`, `google.co.uk`, `google.com.hk` and the rest — so
 * the shape has to be spelled out: one country label, or `co`/`com` and a
 * two-letter country. `google\.[a-z.]+$` looked equivalent and was not: it
 * accepts any host whose remainder is letters and dots, so `google.evil.com`
 * and `maps.google.com.attacker.tld` were parsed with Google's axis order and
 * datum. Failing to recognize an unusual Google host is the safe direction —
 * the text falls through to the plain coordinate readers.
 */
const GOOGLE_HOST = /(^|\.)google\.(?:[a-z]{2,3}|(?:com|co)\.[a-z]{2})$/i;

/* One expression per registrable provider domain; `(^|\.)` covers subdomains. */
const HOSTS: ReadonlyArray<[RegExp, (url: URL) => ParsedPoint | null]> = [
	[/(^|\.)amap\.com$|(^|\.)autonavi\.com$|(^|\.)gaode\.com$/i, readAmap],
	[/(^|\.)baidu\.com$/i, readBaidu],
	[/(^|\.)qq\.com$/i, readTencent],
	[GOOGLE_HOST, readGoogle],
	[/(^|\.)apple\.com$/i, readApple],
	[/(^|\.)openstreetmap\.org$|(^|\.)osm\.org$/i, readOsm],
	[/(^|\.)plus\.codes$/i, readPlusCodeUrl],
];

/** Links whose coordinate only exists on the far end of a redirect. */
const SHORTENERS: ReadonlyArray<[RegExp, Provider]> = [
	[/(^|\.)surl\.amap\.com$/i, 'amap'],
	[/(^|\.)j\.map\.baidu\.com$/i, 'baidu'],
	[/(^|\.)goo\.gl$/i, 'google'],
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

/**
 * An Open Location Code — `8FVC9G8F+6W`, what Google Maps calls a Plus Code.
 *
 * WGS-84, and deliberately not passed through `chinaAware` the way the Google
 * and Apple link readers are. Those two are provider artifacts that declare no
 * datum, so the coordinate has to answer for itself; a Plus Code is a
 * specification, and its author states the datum. Google's own maintainer, on
 * whether the format accommodates GCJ-02: "No, no plans… our recommendation is
 * that a plus code should be based on WGS-84, since it is vastly more likely
 * that any system you use a plus code with is going to assume the decoded
 * values are WGS-84" (google/open-location-code#359). This is the same rule
 * `readGeoUri` below already follows for a `geo:` URI.
 *
 * A code read off a map that draws China shifted is the one case this gets
 * wrong, and the modal's datum override is where that is answered.
 */
function readPlusCode(text: string): ParsedPoint | null {
	const code = findPlusCode(text);
	// `codeIssue` rather than decoding whatever decodes: a padded code has an
	// answer and it is a region, and the modal explains that instead of writing
	// its middle down.
	if (!code || codeIssue(code)) return null;
	const centre = decodeCenter(code);
	return centre ? point(centre.lat, centre.lng, 'wgs84', 'pluscode') : null;
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
			if (host.test(url.hostname)) return read(url);
		}
		// A URL is provider-owned input. Do not reinterpret numbers in an
		// unsupported path — or on an unknown host — as datum-free WGS-84 text.
		// That is especially dangerous for Amap/Baidu, where a plausible pair can
		// be hundreds of metres from the same digits in WGS-84.
		return null;
	}

	// A geo: URI names its own CRS, so it answers for itself. Falling through to
	// the bare-number reader would relabel some other datum as WGS-84 — the two
	// numbers are right there and would parse perfectly.
	if (/\bgeo:/i.test(trimmed)) return readGeoUri(trimmed);

	// Ahead of the two number readers, though nothing they match can also be a
	// code: a Plus Code holds no decimal point and no comma-separated pair.
	return readPlusCode(trimmed) ?? readDms(trimmed) ?? readPlain(trimmed);
}
