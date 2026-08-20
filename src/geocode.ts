/* Forward/reverse request builders, response parsers, and provider rate policy;
 * callers own network I/O. */

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

/** Nominatim's public service asks clients to stay at or below one request/second. */
export const NOMINATIM_INTERVAL_MS = 1000;

/**
 * When each provider may next be asked.
 *
 * Module-wide rather than per caller: a rate limit is a property of the
 * provider, not of whichever feature happens to be asking, so closing and
 * reopening the search box does not reset it and the search box and the
 * reverse-geocode command draw on one budget instead of each keeping to a limit
 * the other is free to exceed.
 */
const nextAllowedAt = new Map<GeocodeProvider, number>();

/**
 * The turn the last caller took, for each provider.
 *
 * Callers wait for the provider's slot one after another rather than all at
 * once. Reading `nextAllowedAt` and writing it back straddles an `await`, so
 * two callers that overlap there both read the same free-at time, sleep to the
 * same instant, and send together — one budget kept twice over, which is the
 * burst the interval exists to prevent. It takes only two features asking at
 * once to reach: the search box has a query in flight when the
 * reverse-geocode command is pressed.
 */
const turns = new Map<GeocodeProvider, Promise<void>>();

/**
 * Wait out the provider's rate limit, and claim the slot that follows.
 *
 * `alive` is the caller's "is this request still wanted?" answer, asked after
 * the wait and before the slot is claimed — a superseded keystroke must not
 * consume a slot the request that replaced it is about to need. Answers whether
 * the caller may proceed; false only ever means `alive` said no.
 *
 * A caller that stands down advances nothing, so whoever is queued behind it
 * finds the slot still free and goes at once rather than waiting out an
 * interval nobody spent.
 */
export async function awaitRateLimit(provider: GeocodeProvider, alive?: () => boolean): Promise<boolean> {
	const interval = PROVIDERS[provider].minIntervalMs;
	if (interval <= 0) return true;
	let proceed = false;
	const turn = (turns.get(provider) ?? Promise.resolve()).then(async () => {
		const wait = Math.max(0, (nextAllowedAt.get(provider) ?? 0) - Date.now());
		if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
		if (alive && !alive()) return;
		nextAllowedAt.set(provider, Date.now() + interval);
		proceed = true;
	});
	// The queue is handed the settled turn rather than the turn itself: `alive`
	// belongs to the caller and may throw, and a rejection left in this map would
	// strand every request that queued behind it. The caller still sees its own.
	turns.set(
		provider,
		turn.catch(() => undefined)
	);
	await turn;
	return proceed;
}

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

/**
 * Everything one provider answers for, in one place.
 *
 * A table rather than a `provider === 'amap' ? … : …` per question. Those read
 * as a choice between two providers but are really "Gaode, or else whatever is
 * left", so a third entry in `GEOCODE_PROVIDERS` compiled clean and had its
 * queries sent to Nominatim's host and read by Nominatim's parser. Written this
 * way, the same addition is a type error naming exactly what is missing, and
 * everything a provider needs — including how fast it may be asked — is on one
 * screen instead of spread over five functions and another module.
 */
interface ProviderContract {
	request(query: string, options: RequestOptions): GeocodeRequest;
	parse(body: unknown): Place[];
	reverseRequest(lat: number, lng: number, options: RequestOptions): GeocodeRequest;
	parseReverse(body: unknown): string;
	/** Whether the provider cannot be used until something is configured. */
	needsKey: boolean;
	/**
	 * Least time between two requests, from the provider's own usage policy; 0
	 * where it publishes none. Counted across the plugin rather than per caller,
	 * so two features cannot each keep to it and together exceed it.
	 */
	minIntervalMs: number;
}

interface RequestOptions {
	key: string;
	language: string;
}

const PROVIDERS: Record<GeocodeProvider, ProviderContract> = {
	nominatim: {
		request: (query, options) => nominatimRequest(query, options.language),
		parse: parseNominatim,
		reverseRequest: (lat, lng, options) => nominatimReverseRequest(lat, lng, options.language),
		parseReverse: parseNominatimReverse,
		needsKey: false,
		minIntervalMs: NOMINATIM_INTERVAL_MS,
	},
	amap: {
		request: (query, options) => amapRequest(query, options.key),
		parse: parseAmap,
		reverseRequest: (lat, lng, options) => amapReverseRequest(lat, lng, options.key),
		parseReverse: parseAmapReverse,
		needsKey: true,
		minIntervalMs: 0,
	},
};

/** The request for whichever provider is configured. */
export function geocodeRequest(provider: GeocodeProvider, query: string, options: RequestOptions): GeocodeRequest {
	return PROVIDERS[provider].request(query, options);
}

export function parseGeocode(provider: GeocodeProvider, body: unknown): Place[] {
	return PROVIDERS[provider].parse(body);
}

/** The reverse request for whichever provider is configured. Always WGS-84 in. */
export function reverseRequest(
	provider: GeocodeProvider,
	lat: number,
	lng: number,
	options: RequestOptions
): GeocodeRequest {
	return PROVIDERS[provider].reverseRequest(lat, lng, options);
}

export function parseReverse(provider: GeocodeProvider, body: unknown): string {
	return PROVIDERS[provider].parseReverse(body);
}

/** Whether this provider cannot be used until something is configured. */
export function needsKey(provider: GeocodeProvider, key: string): boolean {
	return PROVIDERS[provider].needsKey && key.trim() === '';
}
