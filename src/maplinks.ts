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

import { gcj2bd, outOfChina, wgs2gcj } from './coords';

export const EXTERNAL_MAPS = ['amap', 'baidu', 'tencent', 'google', 'apple', 'osm'] as const;
export type ExternalMap = (typeof EXTERNAL_MAPS)[number];

/** Six decimals: what every other coordinate this plugin writes is rounded to (see locate.ts). */
const DIGITS = 6;
const fmt = (n: number): string => n.toFixed(DIGITS);

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
 * revoked. `label` is optional and, when present, is the only thing that gets
 * `encodeURIComponent`-ed — a note title with a space, an ampersand or Chinese
 * characters has to survive as one opaque query value, not be re-parsed as
 * syntax. When it is absent the corresponding parameter is left out entirely
 * rather than sent empty, which several of these providers treat as an unnamed
 * pin *labelled* "undefined" instead of a plain, unlabelled one.
 */
export function externalMapUrl(app: ExternalMap, lat: number, lng: number, label?: string): string {
	const name = label === undefined ? undefined : encodeURIComponent(label);

	switch (app) {
		case 'amap': {
			// position is longitude-first, matching what readAmap() expects to find
			// on the way back in.
			const [gLng, gLat] = wgs2gcj(lng, lat);
			const namePart = name === undefined ? '' : `&name=${name}`;
			return `https://uri.amap.com/marker?position=${fmt(gLng)},${fmt(gLat)}${namePart}&src=obsidian&coordinate=gaode`;
		}

		case 'baidu': {
			// location is latitude-first, matching readBaidu(). title and content
			// are both set from the same label — Baidu's own marker page renders
			// content in the popup and title as the tab title.
			const [bLng, bLat] = wgs2bd(lng, lat);
			const labelPart = name === undefined ? '' : `&title=${name}&content=${name}`;
			return `https://api.map.baidu.com/marker?location=${fmt(bLat)},${fmt(bLng)}${labelPart}&output=html&coord_type=bd09ll`;
		}

		case 'tencent': {
			// coord: is latitude-first, matching readTencent(). The semicolon
			// separating coord: from title: is part of 腾讯's own marker syntax, not
			// something to percent-encode away.
			const [tLng, tLat] = wgs2gcj(lng, lat);
			const titlePart = name === undefined ? '' : `;title:${name}`;
			return `https://apis.map.qq.com/uri/v1/marker?marker=coord:${fmt(tLat)},${fmt(tLng)}${titlePart}`;
		}

		case 'google': {
			// The search endpoint's query parameter takes a coordinate only — there
			// is no separate label field to carry a note title into.
			const [oLng, oLat] = chinaAwareOut(lat, lng);
			return `https://www.google.com/maps/search/?api=1&query=${fmt(oLat)},${fmt(oLng)}`;
		}

		case 'apple': {
			const [oLng, oLat] = chinaAwareOut(lat, lng);
			const qPart = name === undefined ? '' : `&q=${name}`;
			return `https://maps.apple.com/?ll=${fmt(oLat)},${fmt(oLng)}${qPart}`;
		}

		case 'osm': {
			// WGS-84, untouched — OpenStreetMap is the one provider here that never
			// needed a conversion. The coordinate appears twice: mlat/mlon drop the
			// pin, and the #map hash centres and zooms the camera on it.
			return `https://www.openstreetmap.org/?mlat=${fmt(lat)}&mlon=${fmt(lng)}#map=16/${fmt(lat)}/${fmt(lng)}`;
		}
	}
}
