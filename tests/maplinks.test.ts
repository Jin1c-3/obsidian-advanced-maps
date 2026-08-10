import { describe, expect, it } from 'vitest';
import { EXTERNAL_MAPS, externalMapUrl, mapOrder, type ExternalMap } from '../src/maplinks';
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
