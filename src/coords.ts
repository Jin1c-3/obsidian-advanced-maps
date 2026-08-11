/*
 * Coordinate systems.
 *
 * Chinese tile providers do not serve WGS-84. Amap and Tencent serve GCJ-02 and
 * Baidu serves BD-09; both are deliberate, non-linear offsets that land
 * 300–600 m away from the true position. Raster tiles cannot be nudged back, so
 * the data moves instead: every coordinate is shifted on its way onto the map,
 * and shifted back on its way out. MapLibre never learns the difference — it
 * draws the numbers it is handed on top of the numbers the tile server used.
 *
 * Nothing on disk is touched. Notes and .gpx files stay WGS-84; switching the
 * option back to WGS-84 restores the original positions exactly.
 */

import type { Geometry } from 'geojson';
import type { MapConfig } from './types/obsidian-internals';

export type CoordSystem = 'wgs84' | 'gcj02' | 'bd09';

/** What the dropdowns offer. "auto" is a way of deciding, not a system. */
export const COORD_MODES = ['auto', 'wgs84', 'gcj02', 'bd09'] as const;
export type CoordMode = (typeof COORD_MODES)[number];

/**
 * The coordinate system belongs to the tile source, not to the view — one note
 * can hold an OpenStreetMap embed and an Amap base view at the same time, and
 * the background switcher swaps tile sets under a live map. So "auto" reads the
 * answer off the tile URL, which is the thing that actually decides it.
 */
const TILE_SYSTEM_HINTS: Array<[CoordSystem, string[]]> = [
	['gcj02', ['autonavi.com', 'amap.com', 'qq.com', 'gtimg.cn', 'gtimg.com', 'google.cn']],
	['bd09', ['bdimg.com', 'bdstatic.com', 'baidu.com']],
];

export function systemFromTiles(tiles: string | string[] | undefined | null): CoordSystem {
	for (const url of ([] as unknown[]).concat(tiles ?? [])) {
		if (typeof url !== 'string') continue;
		const lower = url.toLowerCase();
		for (const [system, hosts] of TILE_SYSTEM_HINTS) {
			if (hosts.some((host) => lower.includes(host))) return system;
		}
	}
	// Tianditu serves CGCS2000, whose difference from WGS-84 is centimetres.
	return 'wgs84';
}

const KRASOVSKY_A = 6378245; // Krasovsky 1940 semi-major axis, the ellipsoid GCJ-02 is defined on
// First eccentricity squared. Published as 0.00669342162296594323; written out
// to the digits a double actually keeps, which is the same number at runtime.
const KRASOVSKY_EE = 0.006693421622965943;
const BD_OFFSET = (Math.PI * 3000) / 180;

/** The GCJ-02 offset is only defined over China; outside it the transform is the identity. */
export function outOfChina(lng: number, lat: number): boolean {
	return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function offsetLat(x: number, y: number): number {
	let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
	ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
	ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
	ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
	return ret;
}

function offsetLng(x: number, y: number): number {
	let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
	ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
	ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
	ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
	return ret;
}

export function wgs2gcj(lng: number, lat: number): [number, number] {
	if (outOfChina(lng, lat)) return [lng, lat];
	const dLat = offsetLat(lng - 105, lat - 35);
	const dLng = offsetLng(lng - 105, lat - 35);
	const radLat = (lat / 180) * Math.PI;
	let magic = Math.sin(radLat);
	magic = 1 - KRASOVSKY_EE * magic * magic;
	const sqrtMagic = Math.sqrt(magic);
	return [
		lng + (dLng * 180) / ((KRASOVSKY_A / sqrtMagic) * Math.cos(radLat) * Math.PI),
		lat + (dLat * 180) / (((KRASOVSKY_A * (1 - KRASOVSKY_EE)) / (magic * sqrtMagic)) * Math.PI),
	];
}

/**
 * The inverse has no closed form, so solve it: guess, measure how far the
 * forward transform lands from the target, subtract the miss. Three passes put
 * the residual well under a centimetre — far below GPS noise.
 */
export function gcj2wgs(lng: number, lat: number): [number, number] {
	if (outOfChina(lng, lat)) return [lng, lat];
	let wLng = lng;
	let wLat = lat;
	for (let i = 0; i < 3; i++) {
		const guess = wgs2gcj(wLng, wLat);
		wLng += lng - guess[0];
		wLat += lat - guess[1];
	}
	return [wLng, wLat];
}

/* BD-09 sits on top of GCJ-02 and, unlike it, is exactly invertible. */

export function gcj2bd(lng: number, lat: number): [number, number] {
	const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * BD_OFFSET);
	const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * BD_OFFSET);
	return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

export function bd2gcj(lng: number, lat: number): [number, number] {
	const x = lng - 0.0065;
	const y = lat - 0.006;
	const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * BD_OFFSET);
	const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * BD_OFFSET);
	return [z * Math.cos(theta), z * Math.sin(theta)];
}

/** Vault coordinates — always WGS-84 — into whatever space the tiles are drawn in. */
export function toTileSpace(system: CoordSystem, lng: number, lat: number): [number, number] {
	if (system === 'gcj02') return wgs2gcj(lng, lat);
	if (system === 'bd09') {
		const gcj = wgs2gcj(lng, lat);
		return gcj2bd(gcj[0], gcj[1]);
	}
	return [lng, lat];
}

/** …and back again, for anything read off the map and shown or stored as a real place. */
export function toWgs84(system: CoordSystem, lng: number, lat: number): [number, number] {
	if (system === 'gcj02') return gcj2wgs(lng, lat);
	if (system === 'bd09') {
		const gcj = bd2gcj(lng, lat);
		return gcj2wgs(gcj[0], gcj[1]);
	}
	return [lng, lat];
}

export function knownMode(value: unknown): CoordMode | null {
	const key = typeof value === 'string' ? value.trim() : '';
	return (COORD_MODES as readonly string[]).includes(key) ? (key as CoordMode) : null;
}

/** Turn a mode — possibly "auto" — into a real system, given the map's config. */
export function resolveSystem(mode: unknown, mapConfig: MapConfig | undefined | null): CoordSystem {
	const known = knownMode(mode) ?? 'auto';
	if (known !== 'auto') return known;
	if (!mapConfig) return 'wgs84';
	return systemFromTiles(
		([] as string[]).concat((mapConfig.mapTiles ?? []) as string[], (mapConfig.mapTilesDark ?? []) as string[])
	);
}

type Coordinates = number[] | number[][] | number[][][] | number[][][][];

/** Deep-copy a geometry with every coordinate pair moved into tile space. */
export function projectGeometry<T extends Geometry>(geometry: T, system: CoordSystem): T;
export function projectGeometry(geometry: Geometry | undefined, system: CoordSystem): Geometry | undefined;
export function projectGeometry(geometry: Geometry | undefined, system: CoordSystem): Geometry | undefined {
	if (!geometry || system === 'wgs84') return geometry;
	if (geometry.type === 'GeometryCollection') {
		return {
			...geometry,
			geometries: (geometry.geometries ?? []).map((g) => projectGeometry(g, system)),
		};
	}
	const walk = (coords: Coordinates): Coordinates => {
		if (!Array.isArray(coords) || coords.length === 0) return coords;
		if (typeof coords[0] === 'number') {
			const pair = coords as number[];
			const moved = toTileSpace(system, pair[0], pair[1]);
			// Keep elevation and any other trailing members intact.
			return pair.length > 2 ? (moved as number[]).concat(pair.slice(2)) : moved;
		}
		return (coords as Coordinates[]).map(walk) as Coordinates;
	};
	// One cast, on the way out rather than on the way in: `walk` gives back the
	// same nesting depth it was handed, but says so only as the whole
	// `Coordinates` union, which no single geometry's own type accepts.
	return { ...geometry, coordinates: walk(geometry.coordinates) } as Geometry;
}

/**
 * A base file's `center` is whatever YAML put there, so read the number out
 * rather than stringifying first: `String({})` is `"[object Object]"`, which
 * `parseFloat` turns into `NaN` only by luck rather than by having checked.
 */
function numberish(value: unknown): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') return parseFloat(value);
	return NaN;
}

/**
 * Six decimals is about 11 cm — well past what any GPS delivers, but it is what
 * the vault already holds, and rounding harder would make every re-stamp of the
 * same spot look like the note had moved.
 */
export const COORD_DIGITS = 6;

/**
 * The shape a coordinate takes whenever this plugin writes one down: "lat,lng",
 * no space. Stated here, beside `projectCenter` which reads the same shape back,
 * because four places used to write it out themselves — and a drift in any one
 * of them shows up as a note that appears to have moved.
 */
export function formatLatLng(lat: number, lng: number): string {
	return `${lat.toFixed(COORD_DIGITS)},${lng.toFixed(COORD_DIGITS)}`;
}

/**
 * The two numbers behind a coordinate, whichever of its shapes it arrived in:
 * `"30.28,120.11"`, `"[30.28, 120.11]"` or `[30.28, 120.11]`. Latitude first,
 * as everything that writes one here does.
 *
 * Null for anything that is not a pair of finite numbers — an empty property, a
 * place name somebody typed in by hand, a one-element list. Stated once because
 * two callers read the same shape for opposite reasons: `projectCenter` moves a
 * base file's centre into tile space, and `focus()` points a camera at a note.
 */
export function parseLatLng(value: unknown): [number, number] | null {
	let lat: number;
	let lng: number;
	if (Array.isArray(value)) {
		lat = numberish(value[0]);
		lng = numberish(value[1]);
	} else {
		if (typeof value !== 'string' && typeof value !== 'number') return null;
		const parts = String(value).replace(/[[\]]/g, '').split(',');
		if (parts.length < 2) return null;
		lat = parseFloat(parts[0]);
		lng = parseFloat(parts[1]);
	}
	return isFinite(lat) && isFinite(lng) ? [lat, lng] : null;
}

/**
 * A "lat,lng" string or [lat, lng] pair moved into tile space, given back in
 * the shape it arrived in — the built-in view accepts either and we must not
 * change which one a base file is using.
 */
export function projectCenter(value: unknown, system: CoordSystem): unknown {
	if (system === 'wgs84' || value === null || value === undefined) return value;
	const pair = parseLatLng(value);
	if (!pair) return value;
	const moved = toTileSpace(system, pair[1], pair[0]);
	return Array.isArray(value) ? [moved[1], moved[0]] : `${moved[1]},${moved[0]}`;
}
