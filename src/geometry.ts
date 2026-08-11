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

/**
 * A bounds covering every finite position in `geometries`, or null when there
 * was nothing to cover — which is what tells a caller "nothing to frame" apart
 * from "framed on a single point".
 *
 * `seed` is an existing bounds to start from, for the one caller that has to
 * merge the native marker bounds in rather than the features behind them.
 */
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

/**
 * One track knob's effective value: whatever was configured, held inside the
 * knob's own bounds and falling back to its own default. The bounds and the
 * default both come from `TRACK_KNOBS`, so neither is re-typed at a call site.
 */
export function trackKnob(key: TrackKnob, value: unknown): number {
	const { hardMin, hardMax, def } = TRACK_KNOBS[key];
	// Absent is not zero. `Number(null)` and `Number('')` are both 0 rather than
	// NaN — the same trap `numParam()` in geolink.ts exists to dodge — so without
	// this a missing value would clamp to the knob's *minimum* and read as a
	// deliberate setting, instead of falling back to its default.
	if (value === null || value === undefined || value === '') return def;
	return clamp(value, hardMin, hardMax, def);
}

/**
 * MapLibre refuses addSource/addLayer until the style has loaded, and setStyle()
 * — theme change, background switch — drops it back to unloaded.
 *
 * Gate on the flag addSource itself checks rather than on isStyleLoaded(), whose
 * answer stays false until every *tile* has arrived as well: waiting for that
 * costs seconds on a busy map, and the source can go in long before.
 */
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

/**
 * A LineString's or MultiLineString's true first and last coordinate — walking
 * past any empty sub-line a MultiLineString may carry, rather than trusting its
 * first and last *entries*. `null` for anything else, including a LineString
 * with no coordinates at all: there is no "start" to a line that never began.
 *
 * A single-point LineString is not treated specially — `coords[0]` and
 * `coords[coords.length - 1]` are already the same position, which is exactly
 * "both markers land on top of each other", the correct answer for a track
 * that is one point long.
 */
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
	/** A waypoint's own name, Point geometries only. See `trackFeatures` for why. */
	amName?: string;
	/** Set on the two synthetic points `trackFeatures` adds per line; absent on
	 *  everything real, which is what `layers.ts`'s point-layer filter tells apart. */
	amRole?: 'start' | 'end';
}

/**
 * The one shared step between a parsed (or projected) track and what actually
 * reaches the map: every feature carries its note's colour and index, a
 * waypoint keeps its own name, and every line gains two synthetic start/end
 * points for `layers.ts`'s endpoint layer to draw.
 *
 * `amName` is deliberately Point-only. A KML `<Placemark>` can name a
 * LineString too — `tests/parse.test.ts` proves it with 'Trail A' — but nothing
 * downstream reads a name off a line, and carrying it through here would only
 * invite a future hover handler to bind it to the wrong thing: a name that
 * describes the whole track, attached to whichever point the cursor happens to
 * be nearest.
 *
 * Both `TrackLayer.build()` (base views) and `TrackEmbed.draw()` (inline
 * embeds) call this rather than building their own feature list, which is what
 * keeps the two draw paths from drifting apart on what a feature carries.
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
