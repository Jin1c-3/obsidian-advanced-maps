/*
 * Turning a place name into a coordinate, and back again.
 *
 * This is the first thing in the plugin that talks to anybody. It happens only
 * while the search box is open and only with what was typed into it — or, for
 * the reverse direction, only when the "fill place name from coordinates"
 * command is run by hand — and the provider is a setting rather than a default
 * nobody chose, because a vault is private and "which places did you look up"
 * is exactly the kind of thing that should not leak by accident.
 *
 * Two providers, because one is not enough for the case this plugin exists for:
 *
 *   · Nominatim (OpenStreetMap) needs no key, covers the world, answers in
 *     WGS-84, and is thin on Chinese POIs — it will find 西湖 but not 楼外楼.
 *   · 高德 needs a free web-service key, knows every restaurant in the country,
 *     and answers in GCJ-02. Which is fine: this file states the datum and
 *     coords.ts does the conversion, exactly as with a pasted link.
 *
 * The reverse direction reuses both — one dropdown and one key cover asking
 * "where is 楼外楼" and "what is at 30.25,120.14" alike, so there is no second
 * provider concept to configure.
 *
 * Request building and response reading are pure and live here; the one line
 * that actually goes to the network is in the caller (the search modal, or
 * main.ts's reverse-geocode handler). That is what lets the provider quirks —
 * 高德 signalling failure with `status: "1"`/`"0"` and an empty array meaning
 * "no matches", Nominatim putting the whole address in one string — be tested
 * without a network at all.
 */

import { wgs2gcj, type CoordSystem } from './coords';

export const GEOCODE_PROVIDERS = ['nominatim', 'amap'] as const;
export type GeocodeProvider = (typeof GEOCODE_PROVIDERS)[number];

/**
 * The two places 高德's key can live, which is a real choice and not a default
 * anyone can make for somebody else.
 *
 * `secret` is Obsidian's own SecretStorage: the key never enters `data.json`,
 * so it is never synced, backed up or committed — and never leaves the device,
 * so each one needs its own copy. `plugin` is the settings file, which travels
 * with everything else in plain text. Privacy or convenience; the settings pane
 * states both and lets the reader pick.
 */
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

/**
 * The usage policy asks for an identifying User-Agent and no more than one
 * request a second. This covers the identification; the rate is held by the
 * one caller that can produce a burst — `search-modal.ts`, whose module-wide
 * clock spaces request *starts* a second apart on top of its quiet period.
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

/**
 * `/reverse` answers **one** object, not an array like `/search` — there is
 * only ever one address for a point. Failure still arrives as HTTP 200:
 * verified live, an out-of-range point (`lat=99,lon=200`) and a mid-ocean one
 * (`0,-140`) both come back `{"error":"Unable to geocode"}` rather than a 4xx,
 * so `error` is checked before `display_name` is trusted.
 */
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

/**
 * Same `status`/`info` gate as `parseAmap` — verified live against a real
 * invalid key: HTTP 200, `{"status":"0","info":"INVALID_USER_KEY",
 * "infocode":"10001"}`, a well-formed failure exactly like the forward case.
 * `formatted_address` is typed `unknown` before it is trusted, the same
 * caution `parseAmap` already applies to `address`.
 */
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
