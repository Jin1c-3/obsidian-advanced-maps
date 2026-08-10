/*
 * Turning a WGS-84 coordinate into a link that opens the same spot in an
 * external map app — the exact inverse of geolink.ts, which reads a coordinate
 * out of a pasted link. Every decision below already got made there, correctly,
 * with the reasoning written out, so this file mirrors it rather than
 * re-deciding it:
 *
 * - Axis order is per provider, not universal. 高德 writes longitude first;
 *   百度 writes latitude first. Get it backwards and the pin lands in another
 *   province with nothing on screen to say so — the exact trap readAmap() and
 *   readBaidu() exist to dodge on the way in, mirrored here on the way out.
 * - The datum is a property of the provider, not a setting. 高德 and 腾讯 both
 *   serve GCJ-02, 百度 serves BD-09, and Google/Apple serve GCJ-02 inside China
 *   and WGS-84 everywhere else — the same rule `chinaAware()` applies when
 *   *reading* one of their links applies unchanged when *writing* one.
 *
 * Pure and offline: no Obsidian import, no DOM, no network. The caller hands
 * this WGS-84 — that is what every other seam in this plugin un-shifts a
 * coordinate to before it leaves the map, so this file does no un-shifting of
 * its own, only the shift back onto each provider's native datum.
 */

import { COORD_DIGITS, gcj2bd, outOfChina, wgs2gcj } from './coords';

export const EXTERNAL_MAPS = ['amap', 'baidu', 'tencent', 'google', 'apple', 'osm'] as const;
export type ExternalMap = (typeof EXTERNAL_MAPS)[number];

/** The same rounding every other coordinate this plugin writes gets. */
const fmt = (n: number): string => n.toFixed(COORD_DIGITS);

/**
 * The order to list them in — most likely first for this locale.
 *
 * Ordered by *locale*, not by the view's own basemap. Which tiles a particular
 * map happens to be drawing is incidental to which app is actually installed on
 * the reader's phone: a reader in China with an OpenStreetMap embed still
 * reaches for 高德 or 百度 first, and a reader elsewhere with a 高德 base view
 * still reaches for Google or Apple first. All six are always present — the
 * point of asking is only which three lead.
 */
export function mapOrder(locale: 'en' | 'zh'): ExternalMap[] {
	if (locale === 'zh') return ['amap', 'baidu', 'tencent', 'google', 'apple', 'osm'];
	return ['google', 'apple', 'osm', 'amap', 'baidu', 'tencent'];
}

/**
 * GCJ-02 inside China, WGS-84 everywhere else — the write-side twin of
 * `chinaAware()` in geolink.ts. Google's and Apple's URI endpoints take
 * whatever datum the map itself draws in and offer no parameter to state one
 * over the other, so the coordinate has to answer for itself via `outOfChina`,
 * exactly as it does when one of their links is read instead of written.
 */
function chinaAwareOut(lat: number, lng: number): [number, number] {
	if (outOfChina(lng, lat)) return [lng, lat];
	return wgs2gcj(lng, lat);
}

/** WGS-84 → BD-09. There is no direct transform; BD-09 is defined on top of GCJ-02. */
function wgs2bd(lng: number, lat: number): [number, number] {
	const gcj = wgs2gcj(lng, lat);
	return gcj2bd(gcj[0], gcj[1]);
}

/**
 * A WGS-84 coordinate as a URL opening that spot in that provider's web map.
 *
 * Every shape below is a documented public URI endpoint and none takes an API
 * key, so none of these links can go dead because a key later expires or gets
 * revoked.
 *
 * Coordinate only, no label. The one caller is a right-click on empty map — see
 * `addExternalMapItems` — where there is no note and so no name to pass, and
 * inventing one would be worse than none. 高德, 百度 and Apple do each take a
 * label parameter; if the ROADMAP's "stamp an existing note from the map" ever
 * lands, that is the point at which to decide *which* name a pin contributes
 * and to add it back, rather than carrying a guess at the answer until then.
 */
export function externalMapUrl(app: ExternalMap, lat: number, lng: number): string {
	switch (app) {
		case 'amap': {
			// position is longitude-first, matching what readAmap() expects to find
			// on the way back in.
			const [gLng, gLat] = wgs2gcj(lng, lat);
			return `https://uri.amap.com/marker?position=${fmt(gLng)},${fmt(gLat)}&src=obsidian&coordinate=gaode`;
		}

		case 'baidu': {
			// location is latitude-first, matching readBaidu().
			const [bLng, bLat] = wgs2bd(lng, lat);
			return `https://api.map.baidu.com/marker?location=${fmt(bLat)},${fmt(bLng)}&output=html&coord_type=bd09ll`;
		}

		case 'tencent': {
			// coord: is latitude-first, matching readTencent().
			const [tLng, tLat] = wgs2gcj(lng, lat);
			return `https://apis.map.qq.com/uri/v1/marker?marker=coord:${fmt(tLat)},${fmt(tLng)}`;
		}

		case 'google': {
			const [oLng, oLat] = chinaAwareOut(lat, lng);
			return `https://www.google.com/maps/search/?api=1&query=${fmt(oLat)},${fmt(oLng)}`;
		}

		case 'apple': {
			const [oLng, oLat] = chinaAwareOut(lat, lng);
			return `https://maps.apple.com/?ll=${fmt(oLat)},${fmt(oLng)}`;
		}

		case 'osm': {
			// WGS-84, untouched — OpenStreetMap is the one provider here that never
			// needed a conversion. The coordinate appears twice: mlat/mlon drop the
			// pin, and the #map hash centres and zooms the camera on it.
			return `https://www.openstreetmap.org/?mlat=${fmt(lat)}&mlon=${fmt(lng)}#map=16/${fmt(lat)}/${fmt(lng)}`;
		}
	}
}
