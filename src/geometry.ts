import type { Geometry } from 'geojson';
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

export function clamp(value: unknown, min: number, max: number, fallback: number): number {
	const n = Number(value);
	if (!isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
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
			} catch (e) {
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
