import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	amapRequest,
	awaitRateLimit,
	NOMINATIM_INTERVAL_MS,
	amapReverseRequest,
	geocodeRequest,
	GeocodeError,
	needsKey,
	nominatimRequest,
	nominatimReverseRequest,
	parseAmap,
	parseAmapReverse,
	parseGeocode,
	parseNominatim,
	parseNominatimReverse,
	parseReverse,
	reverseRequest,
} from '../src/geocode';
import { toWgs84, wgs2gcj } from '../src/coords';

describe('nominatimRequest', () => {
	it('asks for names in the reader’s language', () => {
		const { url } = nominatimRequest('西湖', 'zh');
		const params = new URL(url).searchParams;
		expect(params.get('q')).toBe('西湖');
		expect(params.get('accept-language')).toBe('zh');
		expect(params.get('format')).toBe('jsonv2');
	});

	it('identifies itself, as the usage policy asks', () => {
		const { headers } = nominatimRequest('x', 'en');
		expect(headers['User-Agent']).toMatch(/obsidian-advanced-maps/);
	});

	it('sends no Referer — Electron blocks the request outright when it is set', () => {
		expect(nominatimRequest('x', 'en').headers).not.toHaveProperty('Referer');
	});

	it('escapes a query that would otherwise break the URL', () => {
		const { url } = nominatimRequest('a&b=c d', 'en');
		expect(new URL(url).searchParams.get('q')).toBe('a&b=c d');
	});
});

describe('parseNominatim', () => {
	const rows = [
		{
			lat: '30.2426',
			lon: '120.1444',
			name: '西湖',
			display_name: '西湖, 北山街道, 西湖区, 杭州市, 浙江省, 中国',
		},
		{ lat: 'nonsense', lon: '120.1', name: 'broken' },
		{ lat: '51.5033', lon: '-0.1196', display_name: 'Big Ben, London, England' },
	];

	it('keeps the name and puts the rest of the address in the detail line', () => {
		const [first] = parseNominatim(rows);
		expect(first).toMatchObject({ name: '西湖', lat: 30.2426, lng: 120.1444, system: 'wgs84' });
		expect(first.detail).toBe('北山街道, 西湖区, 杭州市, 浙江省, 中国');
	});

	it('skips a row whose coordinate will not parse', () => {
		expect(parseNominatim(rows).map((p) => p.name)).not.toContain('broken');
	});

	it('falls back to the first part of the address when there is no name', () => {
		const last = parseNominatim(rows).at(-1);
		expect(last).toMatchObject({ name: 'Big Ben', detail: 'London, England' });
	});

	it('answers with an empty list rather than throwing on a shape it did not expect', () => {
		expect(parseNominatim(null)).toEqual([]);
		expect(parseNominatim({ error: 'nope' })).toEqual([]);
	});

	it('marks results WGS-84, so converting them is a no-op', () => {
		const [first] = parseNominatim(rows);
		expect(toWgs84(first.system, first.lng, first.lat)).toEqual([120.1444, 30.2426]);
	});
});

describe('nominatimReverseRequest', () => {
	it('asks /reverse for lat/lon/format/accept-language', () => {
		const { url } = nominatimReverseRequest(30.2426, 120.1444, 'zh');
		const parsed = new URL(url);
		expect(parsed.pathname).toBe('/reverse');
		const params = parsed.searchParams;
		expect(params.get('lat')).toBe('30.2426');
		expect(params.get('lon')).toBe('120.1444');
		expect(params.get('format')).toBe('jsonv2');
		expect(params.get('accept-language')).toBe('zh');
	});

	it('identifies itself, the same as the forward request', () => {
		const { headers } = nominatimReverseRequest(1, 2, 'en');
		expect(headers['User-Agent']).toMatch(/obsidian-advanced-maps/);
	});

	it('sends no Referer — Electron blocks the request outright when it is set', () => {
		expect(nominatimReverseRequest(1, 2, 'en').headers).not.toHaveProperty('Referer');
	});
});

describe('parseNominatimReverse', () => {
	it('reads display_name off a single object, not an array', () => {
		expect(parseNominatimReverse({ display_name: '西湖, 杭州市, 浙江省, 中国' })).toBe(
			'西湖, 杭州市, 浙江省, 中国'
		);
	});

	it('throws with the provider’s own words when it answers with an error field', () => {
		expect(() => parseNominatimReverse({ error: 'Unable to geocode' })).toThrow(GeocodeError);
		expect(() => parseNominatimReverse({ error: 'Unable to geocode' })).toThrow('Unable to geocode');
	});

	it('fails loudly on null and on a body with neither field', () => {
		expect(() => parseNominatimReverse(null)).toThrow(GeocodeError);
		expect(() => parseNominatimReverse({})).toThrow(GeocodeError);
	});
});

describe('amapRequest', () => {
	it('searches POIs, not addresses — a restaurant is not an address', () => {
		const { url } = amapRequest('楼外楼', 'KEY123');
		expect(url).toContain('/v3/place/text');
		const params = new URL(url).searchParams;
		expect(params.get('keywords')).toBe('楼外楼');
		expect(params.get('key')).toBe('KEY123');
	});
});

describe('parseAmap', () => {
	const ok = {
		status: '1',
		info: 'OK',
		pois: [
			{
				name: '楼外楼(孤山路店)',
				address: '孤山路30号',
				location: '120.140672,30.254963',
				pname: '浙江省',
				cityname: '杭州市',
				adname: '西湖区',
			},
			{ name: 'no location' },
		],
	};

	it('reads longitude-first location strings', () => {
		const [first] = parseAmap(ok);
		expect(first).toMatchObject({ lat: 30.254963, lng: 120.140672, system: 'gcj02' });
	});

	it('builds a detail line out of region and street', () => {
		expect(parseAmap(ok)[0].detail).toBe('浙江省杭州市西湖区 · 孤山路30号');
	});

	it('skips a POI with no usable location', () => {
		expect(parseAmap(ok)).toHaveLength(1);
	});

	it('survives the empty array Amap sends instead of a missing address', () => {
		const places = parseAmap({ status: '1', pois: [{ name: 'x', address: [], location: '120.1,30.2' }] });
		expect(places[0]).toMatchObject({ name: 'x', detail: '' });
	});

	it('treats status "0" as a failure even though the HTTP call succeeded', () => {
		expect(() => parseAmap({ status: '0', info: 'INVALID_USER_KEY' })).toThrow(GeocodeError);
		expect(() => parseAmap({ status: '0', info: 'INVALID_USER_KEY' })).toThrow('INVALID_USER_KEY');
	});

	it('fails loudly on a body it cannot make sense of', () => {
		expect(() => parseAmap(null)).toThrow(GeocodeError);
	});

	it('marks results GCJ-02, so they are shifted on the way to the note', () => {
		const [first] = parseAmap(ok);
		const [lng, lat] = toWgs84(first.system, first.lng, first.lat);
		expect(lng).not.toBe(first.lng);
		expect(Math.abs(lat - first.lat)).toBeGreaterThan(1e-4);
	});
});

describe('amapReverseRequest', () => {
	it('shifts the WGS-84 input to GCJ-02 before it goes in the location param — the seam that matters', () => {
		// 天安门, Beijing — well inside China, so the shift is not the identity.
		const lat = 39.9042;
		const lng = 116.4074;
		const { url } = amapReverseRequest(lat, lng, 'KEY123');
		const params = new URL(url).searchParams;
		const [sentLng, sentLat] = (params.get('location') ?? '').split(',').map(Number);
		const [expectedLng, expectedLat] = wgs2gcj(lng, lat);
		expect(sentLng).toBeCloseTo(expectedLng, 9);
		expect(sentLat).toBeCloseTo(expectedLat, 9);
		// Not the raw WGS-84 value: a missed conversion is invisible on screen and
		// ~500 m off, which is exactly what this assertion would catch.
		expect(sentLng).not.toBeCloseTo(lng, 3);
		expect(sentLat).not.toBeCloseTo(lat, 3);
	});

	it('hits the regeo endpoint with the key', () => {
		const { url } = amapReverseRequest(30, 120, 'KEY123');
		expect(url).toContain('/v3/geocode/regeo');
		expect(new URL(url).searchParams.get('key')).toBe('KEY123');
	});

	it('is the identity outside China, same as wgs2gcj itself', () => {
		const lat = 51.5033;
		const lng = -0.1196;
		const { url } = amapReverseRequest(lat, lng, 'K');
		const [sentLng, sentLat] = (new URL(url).searchParams.get('location') ?? '').split(',').map(Number);
		expect(sentLng).toBeCloseTo(lng, 6);
		expect(sentLat).toBeCloseTo(lat, 6);
	});
});

describe('parseAmapReverse', () => {
	it('reads regeocode.formatted_address on status "1"', () => {
		const body = { status: '1', regeocode: { formatted_address: '浙江省杭州市西湖区北山街道' } };
		expect(parseAmapReverse(body)).toBe('浙江省杭州市西湖区北山街道');
	});

	it('treats status "0" as a failure even though the HTTP call succeeded', () => {
		expect(() => parseAmapReverse({ status: '0', info: 'INVALID_USER_KEY' })).toThrow(GeocodeError);
		expect(() => parseAmapReverse({ status: '0', info: 'INVALID_USER_KEY' })).toThrow('INVALID_USER_KEY');
	});

	it('fails loudly when status is "1" but formatted_address is missing or empty', () => {
		expect(() => parseAmapReverse({ status: '1', regeocode: {} })).toThrow(GeocodeError);
		expect(() => parseAmapReverse({ status: '1', regeocode: { formatted_address: '' } })).toThrow(GeocodeError);
		expect(() => parseAmapReverse({ status: '1' })).toThrow(GeocodeError);
	});

	it('fails loudly on a body it cannot make sense of', () => {
		expect(() => parseAmapReverse(null)).toThrow(GeocodeError);
	});
});

describe('routing', () => {
	it('sends each provider to its own reader', () => {
		expect(geocodeRequest('amap', 'x', { key: 'K', language: 'zh' }).url).toContain('amap.com');
		expect(geocodeRequest('nominatim', 'x', { key: '', language: 'zh' }).url).toContain('openstreetmap.org');
		expect(parseGeocode('nominatim', [{ lat: '1', lon: '2', name: 'a' }])).toHaveLength(1);
		expect(parseGeocode('amap', { status: '1', pois: [{ name: 'a', location: '2,1' }] })).toHaveLength(1);
	});

	it('knows which provider cannot run unconfigured', () => {
		expect(needsKey('amap', '')).toBe(true);
		expect(needsKey('amap', '   ')).toBe(true);
		expect(needsKey('amap', 'K')).toBe(false);
		expect(needsKey('nominatim', '')).toBe(false);
	});
});

describe('reverse routing', () => {
	it('sends each provider through its own builder', () => {
		expect(reverseRequest('amap', 30, 120, { key: 'K', language: 'zh' }).url).toContain('amap.com');
		expect(reverseRequest('nominatim', 30, 120, { key: '', language: 'zh' }).url).toContain(
			'openstreetmap.org/reverse'
		);
	});

	it('sends each provider’s body through its own reader', () => {
		expect(parseReverse('nominatim', { display_name: 'Big Ben, London' })).toBe('Big Ben, London');
		expect(parseReverse('amap', { status: '1', regeocode: { formatted_address: '浙江省杭州市' } })).toBe(
			'浙江省杭州市'
		);
	});
});

describe('Nominatim rate policy is the provider’s, not one feature’s', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		// The interval is module-wide and outlives any one caller — the point of
		// it — so it also outlives the test before this one. Drained however long
		// it had left, then advanced past the slot that drain claimed, so every
		// test below starts from "nothing owes anything".
		const drained = awaitRateLimit('nominatim');
		await vi.runAllTimersAsync();
		await drained;
		await vi.advanceTimersByTimeAsync(NOMINATIM_INTERVAL_MS);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('holds the next request for the interval, whichever feature asks', async () => {
		// The search box takes the free slot; the reverse-geocode command must then
		// wait on the same budget rather than keeping a limit of its own.
		await awaitRateLimit('nominatim');
		let done = false;
		void awaitRateLimit('nominatim').then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(NOMINATIM_INTERVAL_MS - 1);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(done).toBe(true);
	});

	it('does not throttle a provider the policy is not about', async () => {
		await awaitRateLimit('nominatim');
		let done = false;
		void awaitRateLimit('amap').then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(true);
	});

	it('spaces two features that ask at the same moment, not just one after the other', async () => {
		// Both ask while the slot is free. Reading the free-at time and writing it
		// back straddles the wait, so before the queue they read the same time,
		// slept to the same instant and sent together — one budget kept twice.
		// The slot has to be busy for both of them, because that is the only way
		// each one's read of the free-at time lands before the other's write.
		await awaitRateLimit('nominatim');
		const sent: number[] = [];
		const ask = (id: number) =>
			void awaitRateLimit('nominatim').then((ok) => {
				if (ok) sent.push(id);
			});
		ask(1);
		ask(2);
		await vi.advanceTimersByTimeAsync(NOMINATIM_INTERVAL_MS);
		expect(sent).toEqual([1]);
		await vi.advanceTimersByTimeAsync(NOMINATIM_INTERVAL_MS - 1);
		expect(sent).toEqual([1]);
		await vi.advanceTimersByTimeAsync(1);
		expect(sent).toEqual([1, 2]);
	});

	it('lets the request behind a superseded one go at once', async () => {
		// The queue must not make the survivor wait out an interval the caller in
		// front of it stood down from and never spent.
		let live = true;
		const results: string[] = [];
		void awaitRateLimit('nominatim', () => live).then((ok) => results.push(`first:${ok}`));
		void awaitRateLimit('nominatim').then((ok) => results.push(`second:${ok}`));
		live = false;
		await vi.advanceTimersByTimeAsync(0);
		expect(results).toEqual(['first:false', 'second:true']);
	});

	it('leaves the slot unclaimed when the caller has been superseded', async () => {
		// Superseded before it claimed anything: the request that replaced it must
		// not be made to wait out an interval this one never used.
		await expect(awaitRateLimit('nominatim', () => false)).resolves.toBe(false);
		let done = false;
		void awaitRateLimit('nominatim').then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(true);
	});
});
