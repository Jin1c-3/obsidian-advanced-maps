import { describe, expect, it } from 'vitest';
import {
	amapRequest,
	geocodeRequest,
	GeocodeError,
	needsKey,
	nominatimRequest,
	parseAmap,
	parseGeocode,
	parseNominatim,
} from '../src/geocode';
import { toWgs84 } from '../src/coords';

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
