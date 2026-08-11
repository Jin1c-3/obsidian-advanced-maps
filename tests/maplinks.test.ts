import { describe, expect, it } from 'vitest';
import {
	customMapLabel,
	customMaps,
	customMapUrl,
	customUrlProblem,
	enabledBuiltins,
	EXTERNAL_MAPS,
	externalMapUrl,
	mapOrder,
	resolveBuiltins,
	type CustomMap,
	type ExternalMap,
} from '../src/maplinks';
import { gcj2bd, wgs2gcj } from '../src/coords';

/* 天安门, Beijing. Round-tripped through the same conversions maplinks.ts uses
 * internally, so a test failure here means the *provider's* URL disagrees with
 * the converter — not that the two disagree with each other by construction. */
const WGS: [number, number] = [39.9042, 116.4074]; // lat, lng
const GCJ = wgs2gcj(WGS[1], WGS[0]); // [lng, lat]
const BD = gcj2bd(GCJ[0], GCJ[1]); // [lng, lat]

/* Big Ben, London — outside China, where every conversion here is the identity. */
const LONDON: [number, number] = [51.5033, -0.1196]; // lat, lng

/** Within a millimetre — accounts for the 6-decimal rounding, not sloppiness. */
const near = (actual: number, expected: number, tolerance = 1e-6): void => {
	expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
};

/** Pulls the two comma-separated numbers out of a "a,b" query/hash value. */
function pair(value: string | null): [number, number] {
	const parts = (value ?? '').split(',').map(Number);
	expect(parts).toHaveLength(2);
	return [parts[0], parts[1]];
}

describe('externalMapUrl: 高德, Beijing', () => {
	it('shifts to GCJ-02 and writes longitude first, as readAmap() expects back', () => {
		const url = new URL(externalMapUrl('amap', WGS[0], WGS[1]));
		expect(url.hostname).toBe('uri.amap.com');
		expect(url.pathname).toBe('/marker');
		const [lng, lat] = pair(url.searchParams.get('position'));
		near(lng, GCJ[0]);
		near(lat, GCJ[1]);
	});

	it('states the coordinate system and where the link came from', () => {
		const url = new URL(externalMapUrl('amap', WGS[0], WGS[1]));
		expect(url.searchParams.get('coordinate')).toBe('gaode');
		expect(url.searchParams.get('src')).toBe('obsidian');
	});
});

describe('externalMapUrl: 百度, Beijing', () => {
	it('shifts to BD-09 (WGS → GCJ → BD) and writes latitude first, as readBaidu() expects back', () => {
		const url = new URL(externalMapUrl('baidu', WGS[0], WGS[1]));
		expect(url.hostname).toBe('api.map.baidu.com');
		const [lat, lng] = pair(url.searchParams.get('location'));
		near(lat, BD[1]);
		near(lng, BD[0]);
		expect(url.searchParams.get('coord_type')).toBe('bd09ll');
	});
});

describe('externalMapUrl: 腾讯, Beijing', () => {
	it('shifts to GCJ-02 and writes coord:lat,lng, as readTencent() expects back', () => {
		const url = new URL(externalMapUrl('tencent', WGS[0], WGS[1]));
		expect(url.hostname).toBe('apis.map.qq.com');
		const marker = url.searchParams.get('marker') ?? '';
		const coord = marker.match(/coord:([-\d.]+),([-\d.]+)/);
		expect(coord).not.toBeNull();
		near(Number(coord![1]), GCJ[1]); // lat
		near(Number(coord![2]), GCJ[0]); // lng
	});
});

describe('externalMapUrl: Google', () => {
	it('shifts a Beijing point to GCJ-02', () => {
		const url = new URL(externalMapUrl('google', WGS[0], WGS[1]));
		expect(url.hostname).toBe('www.google.com');
		const [lat, lng] = pair(url.searchParams.get('query'));
		near(lat, GCJ[1]);
		near(lng, GCJ[0]);
	});

	it('leaves a London point as plain WGS-84 — the identity, not merely "close"', () => {
		const url = new URL(externalMapUrl('google', LONDON[0], LONDON[1]));
		const [lat, lng] = pair(url.searchParams.get('query'));
		near(lat, LONDON[0]);
		near(lng, LONDON[1]);
	});
});

describe('externalMapUrl: Apple', () => {
	it('shifts a Beijing point to GCJ-02, latitude first', () => {
		const url = new URL(externalMapUrl('apple', WGS[0], WGS[1]));
		expect(url.hostname).toBe('maps.apple.com');
		const [lat, lng] = pair(url.searchParams.get('ll'));
		near(lat, GCJ[1]);
		near(lng, GCJ[0]);
	});

	it('leaves a London point as plain WGS-84', () => {
		const url = new URL(externalMapUrl('apple', LONDON[0], LONDON[1]));
		const [lat, lng] = pair(url.searchParams.get('ll'));
		near(lat, LONDON[0]);
		near(lng, LONDON[1]);
	});
});

describe('externalMapUrl: OpenStreetMap', () => {
	it('never shifts — Beijing round-trips to the identity', () => {
		const url = new URL(externalMapUrl('osm', WGS[0], WGS[1]));
		expect(url.hostname).toBe('www.openstreetmap.org');
		near(Number(url.searchParams.get('mlat')), WGS[0]);
		near(Number(url.searchParams.get('mlon')), WGS[1]);
		const hash = url.hash.match(/map=16\/(-?[\d.]+)\/(-?[\d.]+)/);
		expect(hash).not.toBeNull();
		near(Number(hash![1]), WGS[0]);
		near(Number(hash![2]), WGS[1]);
	});
});

describe('externalMapUrl: 高德 outside China is the identity', () => {
	it('does not invent an offset for a London point', () => {
		// wgs2gcj is the identity outside China, so a London pin should come back
		// out exactly as it went in — asserted against the real conversion, not
		// merely "some number near London".
		const [gLng, gLat] = wgs2gcj(LONDON[1], LONDON[0]);
		expect(gLng).toBe(LONDON[1]);
		expect(gLat).toBe(LONDON[0]);
		const url = new URL(externalMapUrl('amap', LONDON[0], LONDON[1]));
		const [lng, lat] = pair(url.searchParams.get('position'));
		near(lng, LONDON[1]);
		near(lat, LONDON[0]);
	});
});

describe('mapOrder', () => {
	const sameSix = (order: ExternalMap[]): void => {
		expect(order).toHaveLength(EXTERNAL_MAPS.length);
		expect(new Set(order)).toEqual(new Set(EXTERNAL_MAPS));
	};

	it('returns all six providers for zh, 高德/百度/腾讯 first', () => {
		const order = mapOrder('zh');
		sameSix(order);
		expect(order.slice(0, 3)).toEqual(['amap', 'baidu', 'tencent']);
	});

	it('returns all six providers for en, Google/Apple/OSM first', () => {
		const order = mapOrder('en');
		sameSix(order);
		expect(order.slice(0, 3)).toEqual(['google', 'apple', 'osm']);
	});
});

describe('resolveBuiltins', () => {
	it('reads nothing saved as the locale order, every provider on', () => {
		for (const locale of ['en', 'zh'] as const) {
			const list = resolveBuiltins(undefined, locale);
			expect(list.map((entry) => entry.id)).toEqual(mapOrder(locale));
			expect(list.every((entry) => entry.on)).toBe(true);
		}
	});

	it('keeps the saved order and the saved flags', () => {
		const saved = [
			{ id: 'osm', on: false },
			{ id: 'amap', on: true },
		];
		const list = resolveBuiltins(saved, 'en');
		expect(list.slice(0, 2)).toEqual(saved);
		expect(enabledBuiltins(list)).not.toContain('osm');
	});

	it('appends every provider the saved list does not name, so a later one is not lost', () => {
		const list = resolveBuiltins([{ id: 'baidu', on: true }], 'zh');
		expect(list).toHaveLength(EXTERNAL_MAPS.length);
		expect(list[0].id).toBe('baidu');
		expect(new Set(list.map((entry) => entry.id))).toEqual(new Set(EXTERNAL_MAPS));
		// The appended ones arrive on: a provider this version knows about should
		// be reachable without the reader having to find and enable it.
		expect(list.slice(1).every((entry) => entry.on)).toBe(true);
	});

	it('drops an id this version does not know, and takes a duplicate once', () => {
		const list = resolveBuiltins(
			[{ id: 'here-maps', on: true }, { id: 'amap', on: false }, { id: 'amap', on: true }, null, 'amap', 7],
			'en'
		);
		expect(list).toHaveLength(EXTERNAL_MAPS.length);
		expect(list.filter((entry) => entry.id === 'amap')).toHaveLength(1);
		// The first of the two duplicates is the one that counts.
		expect(list[0]).toEqual({ id: 'amap', on: false });
	});

	it('reads a half-written entry as on rather than as off', () => {
		expect(resolveBuiltins([{ id: 'google' }], 'en')[0]).toEqual({ id: 'google', on: true });
	});

	it('can leave nothing at all enabled', () => {
		const off = EXTERNAL_MAPS.map((id) => ({ id, on: false }));
		expect(enabledBuiltins(resolveBuiltins(off, 'en'))).toEqual([]);
	});
});

describe('customUrlProblem', () => {
	const usable = 'https://example.com/?q={lat},{lng}';

	it('accepts an ordinary https URL carrying both placeholders', () => {
		expect(customUrlProblem(usable)).toBeNull();
	});

	it('accepts an app scheme — the case custom entries exist for', () => {
		expect(customUrlProblem('iosamap://viewMap?lat={lat}&lon={lng}')).toBeNull();
		expect(customUrlProblem('waze://?ll={lat},{lng}&navigate=yes')).toBeNull();
		expect(customUrlProblem('geo:{lat},{lng}')).toBeNull();
	});

	it('refuses a URL with no scheme, which would resolve against Obsidian itself', () => {
		expect(customUrlProblem('example.com/?q={lat},{lng}')).toBe('scheme');
		expect(customUrlProblem('/maps?q={lat},{lng}')).toBe('scheme');
	});

	it('refuses a scheme that runs code or fakes a document, in any casing', () => {
		expect(customUrlProblem('javascript:alert({lat},{lng})')).toBe('unsafe');
		expect(customUrlProblem('JaVaScRiPt:alert({lat},{lng})')).toBe('unsafe');
		expect(customUrlProblem('data:text/html,{lat}{lng}')).toBe('unsafe');
		expect(customUrlProblem('file:///{lat}/{lng}')).toBe('unsafe');
	});

	it('refuses a URL missing either placeholder', () => {
		expect(customUrlProblem('https://example.com/?q={lat}')).toBe('placeholder');
		expect(customUrlProblem('https://example.com/?q={lng}')).toBe('placeholder');
		expect(customUrlProblem('https://example.com/')).toBe('placeholder');
	});
});

describe('customMapUrl', () => {
	const entry = (url: string, datum: CustomMap['datum'] = 'wgs84'): CustomMap => ({ name: '', url, datum });

	it('substitutes both placeholders, in whichever order the template puts them', () => {
		const url = customMapUrl(entry('https://x.test/?lng={lng}&lat={lat}'), WGS[0], WGS[1]);
		const parsed = new URL(url!);
		near(Number(parsed.searchParams.get('lat')), WGS[0]);
		near(Number(parsed.searchParams.get('lng')), WGS[1]);
	});

	it('substitutes every occurrence, not just the first', () => {
		const url = customMapUrl(entry('https://x.test/{lat}/{lng}#{lat},{lng}'), WGS[0], WGS[1]);
		expect(url).not.toContain('{lat}');
		expect(url).not.toContain('{lng}');
	});

	it('shifts to GCJ-02 when the entry says so — the exact conversion, not merely a different number', () => {
		const url = customMapUrl(entry('https://x.test/?p={lng},{lat}', 'gcj02'), WGS[0], WGS[1]);
		const [lng, lat] = pair(new URL(url!).searchParams.get('p'));
		near(lng, GCJ[0]);
		near(lat, GCJ[1]);
	});

	it('shifts to BD-09 when the entry says so', () => {
		const url = customMapUrl(entry('https://x.test/?p={lat},{lng}', 'bd09'), WGS[0], WGS[1]);
		const [lat, lng] = pair(new URL(url!).searchParams.get('p'));
		near(lat, BD[1]);
		near(lng, BD[0]);
	});

	it('leaves a London point alone under wgs84 and gcj02 — the identity, not merely close', () => {
		for (const datum of ['wgs84', 'gcj02'] as const) {
			const url = customMapUrl(entry('https://x.test/?p={lat},{lng}', datum), LONDON[0], LONDON[1]);
			const [lat, lng] = pair(new URL(url!).searchParams.get('p'));
			near(lat, LONDON[0]);
			near(lng, LONDON[1]);
		}
	});

	it('still shifts a London point under bd09, because BD-09 has no border', () => {
		// GCJ-02 is the identity outside China and BD-09 is not: Baidu applies its
		// offset wherever it draws, so the built-in 百度 item and a custom bd09
		// entry agree on ~600 m in London rather than on nothing.
		const url = customMapUrl(entry('https://x.test/?p={lat},{lng}', 'bd09'), LONDON[0], LONDON[1]);
		const [lat, lng] = pair(new URL(url!).searchParams.get('p'));
		const expected = gcj2bd(...wgs2gcj(LONDON[1], LONDON[0]));
		near(lat, expected[1]);
		near(lng, expected[0]);
		expect(Math.abs(lat - LONDON[0])).toBeGreaterThan(0.001);
	});

	it('does not encode the braces away — the raw string is what gets substituted', () => {
		// { and } are in the WHATWG *path* encode set, so a template with the
		// placeholder in the path — not in a query — is the one a round trip
		// through new URL() would quietly break.
		expect(new URL('https://x.test/{lat}/{lng}').pathname).toContain('%7B');
		const url = customMapUrl(entry('https://x.test/{lat}/{lng}'), WGS[0], WGS[1]);
		expect(url).not.toContain('%7B');
		expect(url).toBe(`https://x.test/${WGS[0].toFixed(6)}/${WGS[1].toFixed(6)}`);
	});

	it('answers null for anything customUrlProblem refuses', () => {
		expect(customMapUrl(entry('javascript:alert({lat}{lng})'), WGS[0], WGS[1])).toBeNull();
		expect(customMapUrl(entry('https://x.test/?q={lat}'), WGS[0], WGS[1])).toBeNull();
		expect(customMapUrl(entry(''), WGS[0], WGS[1])).toBeNull();
	});

	it('tolerates a URL saved with whitespace around it', () => {
		expect(customMapUrl(entry('  https://x.test/?q={lat},{lng}  '), WGS[0], WGS[1])).toBe(
			`https://x.test/?q=${WGS[0].toFixed(6)},${WGS[1].toFixed(6)}`
		);
	});
});

describe('customMapLabel', () => {
	it('uses the name when there is one', () => {
		expect(customMapLabel({ name: ' Waze ', url: 'https://waze.com/{lat}{lng}', datum: 'wgs84' })).toBe('Waze');
	});

	it('falls back to the host, so a nameless entry is still recognisable', () => {
		expect(customMapLabel({ name: '', url: 'https://ul.waze.com/ul?ll={lat},{lng}', datum: 'wgs84' })).toBe(
			'ul.waze.com'
		);
	});

	it('falls back to the URL itself when there is no host to take', () => {
		expect(customMapLabel({ name: '', url: 'geo:{lat},{lng}', datum: 'wgs84' })).toBe('geo:{lat},{lng}');
	});
});

describe('customMaps', () => {
	it('reads a saved list back as three known fields', () => {
		expect(customMaps([{ name: 'Waze', url: 'waze://?ll={lat},{lng}', datum: 'gcj02' }])).toEqual([
			{ name: 'Waze', url: 'waze://?ll={lat},{lng}', datum: 'gcj02' },
		]);
	});

	it('falls back to WGS-84 for a datum this version does not offer', () => {
		expect(customMaps([{ name: 'x', url: 'https://x.test/{lat}{lng}', datum: 'cgcs2000' }])[0].datum).toBe('wgs84');
	});

	it('fills in a missing field rather than dropping the entry', () => {
		expect(customMaps([{ url: 'https://x.test/{lat}{lng}' }])).toEqual([
			{ name: '', url: 'https://x.test/{lat}{lng}', datum: 'wgs84' },
		]);
	});

	it('answers an empty list for anything that is not one', () => {
		expect(customMaps(undefined)).toEqual([]);
		expect(customMaps(null)).toEqual([]);
		expect(customMaps('waze')).toEqual([]);
		expect(customMaps([null, 'waze', 7])).toEqual([]);
	});
});
