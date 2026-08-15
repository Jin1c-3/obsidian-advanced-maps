import { describe, expect, it } from 'vitest';
import { parseGeoLink, shortLink, type ParsedPoint } from '../src/geolink';
import { wgs2gcj, gcj2bd, toWgs84 } from '../src/coords';

/** The same point in WGS-84 — what the modal writes after the reader has run. */
const toWgs = (p: ParsedPoint): { lat: number; lng: number } => {
	const [lng, lat] = toWgs84(p.system, p.lng, p.lat);
	return { lat, lng };
};

/* 西湖, 断桥. The vault value is WGS-84; the provider links below are what each
 * service would hand out for the same spot, so the parsers can be held to
 * returning the datum they claim rather than merely "a number near Hangzhou". */
const WGS: [number, number] = [30.260901, 120.14703]; // lat, lng
const GCJ = wgs2gcj(WGS[1], WGS[0]); // [lng, lat]
const BD = gcj2bd(GCJ[0], GCJ[1]);

/** Within a millimetre — these are round-trips, not approximations. */
const near = (actual: number, expected: number, tolerance = 1e-6): void => {
	expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
};

describe('parseGeoLink: 高德', () => {
	it('reads uri.amap.com, which writes longitude first', () => {
		const p = parseGeoLink(`https://uri.amap.com/marker?position=${GCJ[0]},${GCJ[1]}&name=断桥`);
		expect(p?.provider).toBe('amap');
		expect(p?.system).toBe('gcj02');
		near(p!.lat, GCJ[1]);
		near(p!.lng, GCJ[0]);
	});

	it('converts back to the WGS-84 the vault stores', () => {
		const p = parseGeoLink(`https://uri.amap.com/marker?position=${GCJ[0]},${GCJ[1]}`);
		const w = toWgs(p!);
		near(w.lat, WGS[0], 1e-5);
		near(w.lng, WGS[1], 1e-5);
	});

	it('reads lat/lng query parameters', () => {
		const p = parseGeoLink('https://www.amap.com/regeo?lng=120.1517&lat=30.2586');
		expect(p).toMatchObject({ provider: 'amap', system: 'gcj02', lat: 30.2586, lng: 120.1517 });
	});

	it('falls back to the camera in the fragment', () => {
		const p = parseGeoLink('https://www.amap.com/#/map?center=120.1517,30.2586&zoom=15');
		expect(p).toMatchObject({ provider: 'amap', lat: 30.2586, lng: 120.1517 });
	});
});

describe('parseGeoLink: 百度', () => {
	it('reads a marker link as BD-09 by default', () => {
		const p = parseGeoLink(`https://api.map.baidu.com/marker?location=${BD[1]},${BD[0]}&title=断桥&output=html`);
		expect(p?.provider).toBe('baidu');
		expect(p?.system).toBe('bd09');
		const w = toWgs(p!);
		near(w.lat, WGS[0], 1e-4);
		near(w.lng, WGS[1], 1e-4);
	});

	it('believes coord_type when it is stated', () => {
		const p = parseGeoLink('https://api.map.baidu.com/marker?location=30.2609,120.1470&coord_type=wgs84ll');
		expect(p).toMatchObject({ system: 'wgs84', lat: 30.2609, lng: 120.147 });
	});

	it('reads gcj02 from coord_type too', () => {
		const p = parseGeoLink('https://api.map.baidu.com/marker?location=30.2586,120.1517&coord_type=gcj02ll');
		expect(p?.system).toBe('gcj02');
	});

	it('strips the latlng: prefix and the trailing name', () => {
		const p = parseGeoLink('https://api.map.baidu.com/direction?destination=latlng:30.2609,120.1470|name:断桥');
		expect(p).toMatchObject({ lat: 30.2609, lng: 120.147 });
	});
});

describe('parseGeoLink: 腾讯', () => {
	it('reads coord: out of the marker parameter', () => {
		const p = parseGeoLink(
			'https://apis.map.qq.com/uri/v1/marker?marker=coord:30.2586,120.1517;title:断桥;addr:西湖'
		);
		expect(p).toMatchObject({ provider: 'tencent', system: 'gcj02', lat: 30.2586, lng: 120.1517 });
	});

	it('reads a bare coord parameter', () => {
		const p = parseGeoLink('https://apis.map.qq.com/uri/v1/geocoder?coord=30.2586,120.1517');
		expect(p).toMatchObject({ provider: 'tencent', lat: 30.2586, lng: 120.1517 });
	});
});

describe('parseGeoLink: Google', () => {
	it('prefers the place in the data blob over the camera', () => {
		const p = parseGeoLink(
			'https://www.google.com/maps/place/West+Lake/@30.2000,120.1000,14z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d30.2586!4d120.1517'
		);
		expect(p).toMatchObject({ provider: 'google', lat: 30.2586, lng: 120.1517 });
	});

	it('falls back to the camera', () => {
		const p = parseGeoLink('https://www.google.com/maps/@30.2586,120.1517,15z');
		expect(p).toMatchObject({ lat: 30.2586, lng: 120.1517 });
	});

	it('treats a point inside China as GCJ-02', () => {
		expect(parseGeoLink('https://www.google.com/maps/@30.2586,120.1517,15z')?.system).toBe('gcj02');
	});

	it('treats a point outside China as WGS-84, and converting is then a no-op', () => {
		const p = parseGeoLink('https://www.google.com/maps/@51.5033,-0.1196,15z');
		expect(p?.system).toBe('wgs84');
		expect(toWgs(p!)).toEqual({ lat: 51.5033, lng: -0.1196 });
	});

	it('reads q=loc:', () => {
		const p = parseGeoLink('https://maps.google.com/?q=loc:51.5033,-0.1196');
		expect(p).toMatchObject({ lat: 51.5033, lng: -0.1196 });
	});

	it('recognizes the country and regional domains Google actually maps on', () => {
		for (const host of ['www.google.de', 'maps.google.co.uk', 'www.google.com.hk', 'google.cn']) {
			expect(parseGeoLink(`https://${host}/maps/@51.5033,-0.1196,15z`)?.provider).toBe('google');
		}
	});

	it('does not hand a look-alike host to Google', () => {
		// Whoever owns evil.example can put "google" anywhere in the name; only
		// the shape of the domain says whether Google's axis order and datum are
		// the right ones to read it with.
		for (const host of [
			'google.evil.example',
			'maps.google.com.evil.example',
			'www.google.co.uk.evil.example',
			'notgoogle.com',
		]) {
			expect(parseGeoLink(`https://${host}/maps/@30.2586,120.1517,15z`)).toBeNull();
		}
	});
});

describe('parseGeoLink: Apple and OpenStreetMap', () => {
	it('reads ?ll= from Apple Maps', () => {
		const p = parseGeoLink('https://maps.apple.com/?ll=51.5033,-0.1196&q=Big%20Ben');
		expect(p).toMatchObject({ provider: 'apple', system: 'wgs84', lat: 51.5033 });
	});

	it('reads the OpenStreetMap fragment', () => {
		const p = parseGeoLink('https://www.openstreetmap.org/#map=15/30.2609/120.1470');
		expect(p).toMatchObject({ provider: 'osm', system: 'wgs84', lat: 30.2609, lng: 120.147 });
	});

	it('reads mlat/mlon', () => {
		const p = parseGeoLink('https://www.openstreetmap.org/?mlat=30.2609&mlon=120.1470#map=17/30.26/120.14');
		expect(p).toMatchObject({ lat: 30.2609, lng: 120.147 });
	});

	it('never shifts an OpenStreetMap coordinate, China or not', () => {
		const p = parseGeoLink('https://www.openstreetmap.org/#map=15/30.2609/120.1470');
		expect(toWgs(p!)).toEqual({ lat: 30.2609, lng: 120.147 });
	});
});

describe('parseGeoLink: bare text', () => {
	it('reads a geo: URI', () => {
		expect(parseGeoLink('geo:30.2609,120.1470')).toMatchObject({ provider: 'geo', system: 'wgs84', lat: 30.2609 });
	});

	it('declines a geo: URI in another CRS rather than guessing', () => {
		expect(parseGeoLink('geo:30.2609,120.1470;crs=moon')).toBeNull();
	});

	it('reads what this plugin itself writes', () => {
		expect(parseGeoLink('30.260901,120.147030')).toMatchObject({
			provider: 'plain',
			lat: 30.260901,
			lng: 120.14703,
		});
	});

	it('reads a full-width comma, as pasted from a Chinese input method', () => {
		expect(parseGeoLink('30.2609，120.1470')).toMatchObject({ lat: 30.2609, lng: 120.147 });
	});

	it('reads degrees-minutes-seconds with hemispheres', () => {
		const p = parseGeoLink(`30°15'39.2"N 120°08'49.3"E`);
		expect(p?.provider).toBe('dms');
		near(p!.lat, 30 + 15 / 60 + 39.2 / 3600, 1e-6);
		near(p!.lng, 120 + 8 / 60 + 49.3 / 3600, 1e-6);
	});

	it('honours southern and western hemispheres', () => {
		const p = parseGeoLink(`33°51'54.5"S 151°12'55.8"E`);
		expect(p!.lat).toBeLessThan(0);
		expect(p!.lng).toBeGreaterThan(0);
	});
});

describe('parseGeoLink: refusals', () => {
	it('returns null for text with no coordinate', () => {
		expect(parseGeoLink('https://example.com/a/b')).toBeNull();
		expect(parseGeoLink('just some words')).toBeNull();
		expect(parseGeoLink('')).toBeNull();
	});

	it('rejects out-of-range numbers rather than clamping', () => {
		expect(parseGeoLink('130.5,200.7')).toBeNull();
	});

	it('rejects null island, which is what a failed parse usually produces', () => {
		expect(parseGeoLink('0,0')).toBeNull();
	});

	it('gives up on a recognised host that carries no coordinate', () => {
		expect(parseGeoLink('https://www.openstreetmap.org/about')).toBeNull();
		expect(parseGeoLink('https://www.amap.com/search?query=%E8%A5%BF%E6%B9%96')).toBeNull();
		expect(parseGeoLink('https://apis.map.qq.com/uri/v1/marker?title=x')).toBeNull();
	});

	it('does not relabel numbers in an unsupported provider URL as WGS-84', () => {
		expect(parseGeoLink('https://www.amap.com/unsupported/30.2609,120.1470')).toBeNull();
		expect(parseGeoLink('https://example.com/place/30.2609,120.1470')).toBeNull();
	});

	it('survives a URL the platform will not parse', () => {
		expect(parseGeoLink('http://[not-a-host/maps')).toBeNull();
	});

	it('does not read a Baidu link with Google rules', () => {
		// Baidu writes lat,lng; Google's @ pattern would take these in the same
		// order but call them WGS-84. The host check is what keeps them apart.
		const p = parseGeoLink('https://map.baidu.com/?latlng=30.2609,120.1470');
		expect(p?.provider).toBe('baidu');
		expect(p?.system).toBe('bd09');
	});
});

describe('shortLink', () => {
	it('names a link that has to be opened once first', () => {
		expect(shortLink('https://surl.amap.com/abc123')).toMatchObject({ provider: 'amap' });
		expect(shortLink('https://maps.app.goo.gl/abc123')).toMatchObject({ provider: 'google' });
		expect(shortLink('https://j.map.baidu.com/abc')).toMatchObject({ provider: 'baidu' });
	});

	it('is silent about links that can be read offline', () => {
		expect(shortLink('https://uri.amap.com/marker?position=120,30')).toBeNull();
		expect(shortLink('30.26,120.14')).toBeNull();
	});

	it('does not pretend to have parsed a short link', () => {
		expect(parseGeoLink('https://surl.amap.com/abc123')).toBeNull();
	});
});
