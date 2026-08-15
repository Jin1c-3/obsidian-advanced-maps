import type { Feature, Geometry, Position } from 'geojson';
import { TRACK_KNOBS, type TrackKnob } from './constants';
import type { LngLatBounds, MapLibreMap } from './types/obsidian-internals';

export function walkCoords(coords: unknown, fn: (lng: number, lat: number) => void): void {
	if (!Array.isArray(coords) || coords.length === 0) return;
	if (typeof coords[0] === 'number') {
		const [lng, lat] = coords as number[];
		if (isFinite(lng) && isFinite(lat)) fn(lng, lat);
		return;
	}
	for (const child of coords) walkCoords(child, fn);
}

/** An empty bounds of the map's own kind — MapLibre exports no constructor to import. */
export function emptyBounds(map: MapLibreMap): LngLatBounds {
	const Ctor = map.getBounds().constructor as new () => LngLatBounds;
	return new Ctor();
}

/** Grow a MapLibre LngLatBounds to cover a GeoJSON geometry. Returns a count. */
export function extendBounds(bounds: LngLatBounds, geometry: Geometry | null | undefined): number {
	let n = 0;
	if (!geometry) return n;
	if (geometry.type === 'GeometryCollection') {
		for (const g of geometry.geometries ?? []) n += extendBounds(bounds, g);
		return n;
	}
	walkCoords(geometry.coordinates, (lng, lat) => {
		bounds.extend([lng, lat]);
		n++;
	});
	return n;
}

/** Bounds over finite geometry, optionally seeded with native marker bounds; null when empty. */
export function boundsOf(
	map: MapLibreMap,
	geometries: Iterable<Geometry | null | undefined>,
	seed?: LngLatBounds | null
): LngLatBounds | null {
	const bounds = emptyBounds(map);
	let points = 0;
	if (seed && !seed.isEmpty()) {
		bounds.extend(seed);
		points++;
	}
	for (const geometry of geometries) points += extendBounds(bounds, geometry);
	return points > 0 && !bounds.isEmpty() ? bounds : null;
}

export function clamp(value: unknown, min: number, max: number, fallback: number): number {
	const n = Number(value);
	if (!isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/** Resolve one configured track knob against its shared hard bounds and default. */
export function trackKnob(key: TrackKnob, value: unknown): number {
	const { hardMin, hardMax, def } = TRACK_KNOBS[key];
	// Absent is not zero. `Number(null)` and `Number('')` are both 0 rather than
	// NaN — the same trap `numParam()` in geolink.ts exists to dodge — so without
	// this a missing value would clamp to the knob's *minimum* and read as a
	// deliberate setting, instead of falling back to its default.
	if (value === null || value === undefined || value === '') return def;
	return clamp(value, hardMin, hardMax, def);
}

/** Gate on MapLibre's internal style flag; `isStyleLoaded` also waits for tiles. */
export function styleUsable(map: MapLibreMap): boolean {
	const style = map.style;
	if (style && typeof style._loaded === 'boolean') return style._loaded;
	return !!(map.isStyleLoaded && map.isStyleLoaded());
}

/** The timeout is a backstop: a style that never loads should not wedge a caller. */
export function styleReady(map: MapLibreMap, timeout = 5000): Promise<void> {
	if (styleUsable(map)) return Promise.resolve();
	return new Promise<void>((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			try {
				map.off('styledata', check);
				map.off('style.load', check);
				map.off('load', check);
			} catch {
				/* map already removed */
			}
			resolve();
		};
		const check = () => {
			if (styleUsable(map)) finish();
		};
		const timer = window.setTimeout(finish, timeout);
		map.on('styledata', check);
		map.on('style.load', check);
		map.on('load', check);
	});
}

/** True line endpoints, skipping empty MultiLineString members; null when absent. */
export function lineEndpoints(geometry: Geometry): [Position, Position] | null {
	if (geometry.type === 'LineString') {
		const coords = geometry.coordinates;
		return coords.length > 0 ? [coords[0], coords[coords.length - 1]] : null;
	}
	if (geometry.type === 'MultiLineString') {
		let first: Position | null = null;
		let last: Position | null = null;
		for (const line of geometry.coordinates) {
			if (line.length === 0) continue;
			first ??= line[0];
			last = line[line.length - 1];
		}
		return first && last ? [first, last] : null;
	}
	return null;
}

/** What a drawn track feature carries beyond its geometry. */
export interface TrackFeatureProps extends Record<string, unknown> {
	/** Which note's colour this belongs to. */
	amColor: string;
	/** Which note this belongs to — an index into the draw list, not a file path. */
	amIndex: number;
	/** A waypoint's own name, on Point geometries only. */
	amName?: string;
	/** Synthetic line endpoint or incoming photo role. */
	amRole?: 'start' | 'end' | 'photo';
	/** MapLibre image id for a photo thumbnail. */
	amPhoto?: string;
	/** Vault path opened from a photo marker. */
	amPath?: string;
}

/**
 * Shared map-feature builder: add note identity, carry Point-only metadata,
 * and synthesize start/end Points for each line.
 */
export function trackFeatures(
	features: Array<Feature<Geometry, Record<string, unknown> | null>>,
	color: string,
	index: number
): Array<Feature<Geometry, TrackFeatureProps>> {
	const out: Array<Feature<Geometry, TrackFeatureProps>> = [];
	for (const feature of features) {
		const props: TrackFeatureProps = { amColor: color, amIndex: index };
		if (feature.geometry.type === 'Point') {
			const name = feature.properties?.name;
			if (typeof name === 'string' && name !== '') props.amName = name;
			// Only photo roles arrive from parsers; endpoint roles are minted below.
			if (feature.properties?.amRole === 'photo') props.amRole = 'photo';
			const photo = feature.properties?.amPhoto;
			if (typeof photo === 'string' && photo !== '') props.amPhoto = photo;
			const path = feature.properties?.amPath;
			if (typeof path === 'string' && path !== '') props.amPath = path;
		}
		out.push({ type: 'Feature', geometry: feature.geometry, properties: props });

		const endpoints = lineEndpoints(feature.geometry);
		if (!endpoints) continue;
		const [start, end] = endpoints;
		out.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: start },
			properties: { amColor: color, amIndex: index, amRole: 'start' },
		});
		out.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: end },
			properties: { amColor: color, amIndex: index, amRole: 'end' },
		});
	}
	return out;
}
