/* Pure forward/reverse request builders and response parsers; callers own network I/O. */

import { wgs2gcj, type CoordSystem } from './coords';

export const GEOCODE_PROVIDERS = ['nominatim', 'amap'] as const;
export type GeocodeProvider = (typeof GEOCODE_PROVIDERS)[number];

/** SecretStorage stays device-local; plugin settings may sync in plain text. */
export const KEY_STORES = ['secret', 'plugin'] as const;
export type KeyStore = (typeof KEY_STORES)[number];

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
 * Identifies the plugin to Nominatim, as its usage policy asks. Named out here
 * rather than written twice: the forward and reverse builders both need it, and
 * two copies are exactly the kind of drift this file otherwise has no seam for.
 */
const NOMINATIM_USER_AGENT = 'obsidian-advanced-maps (https://github.com/Jin1c-3/obsidian-advanced-maps)';

/** Identify Nominatim requests with User-Agent only; Electron blocks an explicit Referer. */
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
		headers: { 'User-Agent': NOMINATIM_USER_AGENT },
	};
}

/**
 * The reverse of `nominatimRequest`: a coordinate in, an address out. Same
 * host, same headers — the usage policy does not distinguish the two
 * endpoints — so the only thing that changes is which one is asked.
 */
export function nominatimReverseRequest(lat: number, lng: number, language: string): GeocodeRequest {
	const params = new URLSearchParams({
		lat: String(lat),
		lon: String(lng),
		format: 'jsonv2',
		addressdetails: '1',
		'accept-language': language,
	});
	return {
		url: `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
		headers: { 'User-Agent': NOMINATIM_USER_AGENT },
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

interface NominatimReverseBody {
	display_name?: string;
	error?: string;
}

/** Nominatim reverse returns one object and may encode failure in an HTTP-200 `error`. */
export function parseNominatimReverse(body: unknown): string {
	const data = (body ?? {}) as NominatimReverseBody;
	if (typeof data.error === 'string' && data.error !== '') throw new GeocodeError(data.error);
	if (typeof data.display_name === 'string' && data.display_name.trim() !== '') return data.display_name.trim();
	throw new GeocodeError('NOMINATIM_NO_ADDRESS');
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

/**
 * `/v3/geocode/regeo` — 高德's reverse geocoder. **Takes GCJ-02 input**, unlike
 * every other seam in this plugin, which hands 高德 a coordinate and lets it
 * answer in GCJ-02; here the note's own WGS-84 value has to be shifted onto the
 * way *in*. So the caller always hands WGS-84 — the datum every coordinate this
 * plugin reads out of a note is already in — and the shift happens inside this
 * function, mirroring `maplinks.ts`'s `externalMapUrl`, which does its own
 * provider-specific shift rather than trusting the caller to have done it.
 * Getting this backwards is invisible on screen: 高德 answers with a
 * well-formed address for a street ~500 m from the one that was actually
 * clicked.
 */
export function amapReverseRequest(lat: number, lng: number, key: string): GeocodeRequest {
	const [gLng, gLat] = wgs2gcj(lng, lat);
	const params = new URLSearchParams({
		location: `${gLng},${gLat}`,
		key,
		extensions: 'base',
	});
	return { url: `https://restapi.amap.com/v3/geocode/regeo?${params.toString()}`, headers: {} };
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

interface AmapReverseBody {
	status?: string;
	info?: string;
	regeocode?: { formatted_address?: unknown };
}

/** Apply Amap's HTTP-200 status gate before trusting the reverse address. */
export function parseAmapReverse(body: unknown): string {
	const data = (body ?? {}) as AmapReverseBody;
	if (data.status !== '1') throw new GeocodeError(data.info || 'AMAP_REQUEST_FAILED');
	const address = data.regeocode?.formatted_address;
	if (typeof address === 'string' && address.trim() !== '') return address.trim();
	throw new GeocodeError('AMAP_NO_ADDRESS');
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

/** The reverse request for whichever provider is configured. Always WGS-84 in. */
export function reverseRequest(
	provider: GeocodeProvider,
	lat: number,
	lng: number,
	options: { key: string; language: string }
): GeocodeRequest {
	return provider === 'amap'
		? amapReverseRequest(lat, lng, options.key)
		: nominatimReverseRequest(lat, lng, options.language);
}

export function parseReverse(provider: GeocodeProvider, body: unknown): string {
	return provider === 'amap' ? parseAmapReverse(body) : parseNominatimReverse(body);
}

/** 高德 is the one provider that cannot be used until something is configured. */
export function needsKey(provider: GeocodeProvider, key: string): boolean {
	return provider === 'amap' && key.trim() === '';
}
