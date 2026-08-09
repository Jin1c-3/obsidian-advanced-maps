/*
 * Turning a place name into a coordinate.
 *
 * This is the first thing in the plugin that talks to anybody. It happens only
 * while the search box is open and only with what was typed into it, and the
 * provider is a setting rather than a default nobody chose — a vault is private
 * and "which places did you look up" is exactly the kind of thing that should
 * not leak by accident.
 *
 * Two providers, because one is not enough for the case this plugin exists for:
 *
 *   · Nominatim (OpenStreetMap) needs no key, covers the world, answers in
 *     WGS-84, and is thin on Chinese POIs — it will find 西湖 but not 楼外楼.
 *   · 高德 needs a free web-service key, knows every restaurant in the country,
 *     and answers in GCJ-02. Which is fine: this file states the datum and
 *     coords.ts does the conversion, exactly as with a pasted link.
 *
 * Request building and response reading are pure and live here; the one line
 * that actually goes to the network is in the modal. That is what lets the
 * provider quirks — 高德 signalling failure with `status: "1"`/`"0"` and an
 * empty array meaning "no matches", Nominatim putting the whole address in one
 * string — be tested without a network at all.
 */

import { type CoordSystem } from './coords';

export const GEOCODE_PROVIDERS = ['nominatim', 'amap'] as const;
export type GeocodeProvider = (typeof GEOCODE_PROVIDERS)[number];

/** One candidate, still in whatever datum its provider answers in. */
export interface Place {
	/** What to show first: a POI name, or the leading part of an address. */
	name: string;
	/** The rest, for telling two places of the same name apart. */
	detail: string;
	lat: number;
	lng: number;
	system: CoordSystem;
}

/** Everything needed to make the call, so the caller adds no policy of its own. */
export interface GeocodeRequest {
	url: string;
	headers: Record<string, string>;
}

/** A provider that said no, in its own words where it gave any. */
export class GeocodeError extends Error {}

const LIMIT = 10;

/* ---- Nominatim ---- */

/**
 * The usage policy asks for an identifying User-Agent and no more than one
 * request a second; the modal's quiet period covers the rate, and this covers
 * the identification.
 *
 * User-Agent only. Setting `Referer` as well looks harmless and is not:
 * Electron refuses the whole request with `net::ERR_BLOCKED_BY_CLIENT`, and
 * measured through `requestUrl` that arrives as a promise that never settles
 * rather than as an error — a search box that simply stays empty forever.
 */
export function nominatimRequest(query: string, language: string): GeocodeRequest {
	const params = new URLSearchParams({
		q: query,
		format: 'jsonv2',
		limit: String(LIMIT),
		addressdetails: '1',
		'accept-language': language,
	});
	return {
		url: `https://nominatim.openstreetmap.org/search?${params.toString()}`,
		headers: {
			'User-Agent': 'obsidian-advanced-maps (https://github.com/Jin1c-3/obsidian-advanced-maps)',
		},
	};
}

interface NominatimRow {
	lat?: string;
	lon?: string;
	name?: string;
	display_name?: string;
}

/**
 * `display_name` is the whole address in one comma-separated string, and its
 * first element is usually the thing that was searched for. `name` is there on
 * most rows and is better when it is, so it wins and the address becomes detail.
 */
export function parseNominatim(body: unknown): Place[] {
	if (!Array.isArray(body)) return [];
	const places: Place[] = [];
	for (const row of body as NominatimRow[]) {
		const lat = Number(row?.lat);
		const lng = Number(row?.lon);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		const full = typeof row.display_name === 'string' ? row.display_name : '';
		const parts = full.split(',').map((part) => part.trim());
		const name = row.name?.trim() || parts[0] || full;
		const detail = (full.startsWith(name) ? parts.slice(1).join(', ') : full).trim();
		places.push({ name, detail, lat, lng, system: 'wgs84' });
	}
	return places;
}

/* ---- 高德 ---- */

/**
 * POI search rather than the geocoder: "楼外楼" is a place, not an address, and
 * `/geocode/geo` only resolves the latter. It answers in GCJ-02, always.
 */
export function amapRequest(query: string, key: string): GeocodeRequest {
	const params = new URLSearchParams({
		keywords: query,
		key,
		offset: String(LIMIT),
		page: '1',
		extensions: 'base',
	});
	return { url: `https://restapi.amap.com/v3/place/text?${params.toString()}`, headers: {} };
}

interface AmapBody {
	status?: string;
	info?: string;
	infocode?: string;
	pois?: Array<{
		name?: string;
		address?: unknown;
		location?: string;
		pname?: string;
		cityname?: string;
		adname?: string;
	}>;
}

/**
 * `status` is `"1"` for success and `"0"` for failure, and a failed key comes
 * back as a perfectly well-formed 200 — so the status is checked before the
 * array, and its `info` is what the user is shown. `address` is documented as a
 * string but comes back as an empty array when 高德 has none, which is why it is
 * typed unknown here rather than trusted.
 */
export function parseAmap(body: unknown): Place[] {
	const data = (body ?? {}) as AmapBody;
	if (data.status !== '1') throw new GeocodeError(data.info || 'AMAP_REQUEST_FAILED');

	const places: Place[] = [];
	for (const poi of data.pois ?? []) {
		const [lngText, latText] = (poi.location ?? '').split(',');
		const lat = Number(latText);
		const lng = Number(lngText);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		const region = [poi.pname, poi.cityname, poi.adname]
			.filter((part) => typeof part === 'string' && part)
			.join('');
		const street = typeof poi.address === 'string' ? poi.address : '';
		places.push({
			name: poi.name?.trim() || street || region,
			detail: [region, street].filter(Boolean).join(' · '),
			lat,
			lng,
			system: 'gcj02',
		});
	}
	return places;
}

/* ---- routing ---- */

/** The request for whichever provider is configured. */
export function geocodeRequest(
	provider: GeocodeProvider,
	query: string,
	options: { key: string; language: string }
): GeocodeRequest {
	return provider === 'amap' ? amapRequest(query, options.key) : nominatimRequest(query, options.language);
}

export function parseGeocode(provider: GeocodeProvider, body: unknown): Place[] {
	return provider === 'amap' ? parseAmap(body) : parseNominatim(body);
}

/** 高德 is the one provider that cannot be used until something is configured. */
export function needsKey(provider: GeocodeProvider, key: string): boolean {
	return provider === 'amap' && key.trim() === '';
}
