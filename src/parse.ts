/*
 * Parsing — everything becomes plain GeoJSON features.
 *
 * GPX goes through the browser's own XML parser rather than a library: the
 * subset that matters is three tag names, and a plugin that ships no
 * dependencies is a plugin that cannot ship a vulnerable one.
 */

import type { Feature, Geometry, Position } from 'geojson';

export interface ParsedTrack {
	features: Array<Feature<Geometry, Record<string, unknown> | null>>;
	waypoints?: number;
}

function collectPoints(parent: Document | Element, tag: string): Position[] {
	const pts: Position[] = [];
	const nodes = parent.getElementsByTagName(tag);
	for (let i = 0; i < nodes.length; i++) {
		const lat = parseFloat(nodes[i].getAttribute('lat') ?? '');
		const lon = parseFloat(nodes[i].getAttribute('lon') ?? '');
		// GeoJSON is longitude-first; GPX is not.
		if (isFinite(lat) && isFinite(lon)) pts.push([lon, lat]);
	}
	return pts;
}

/** Minimal GPX reader: track segments, routes and waypoints. */
export function parseGpx(text: string): ParsedTrack {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('not valid XML');
	}

	const features: ParsedTrack['features'] = [];
	const addLine = (pts: Position[]) => {
		if (pts.length > 1) {
			features.push({ type: 'Feature', properties: null, geometry: { type: 'LineString', coordinates: pts } });
		}
	};

	const segs = doc.getElementsByTagName('trkseg');
	for (let i = 0; i < segs.length; i++) addLine(collectPoints(segs[i], 'trkpt'));

	const routes = doc.getElementsByTagName('rte');
	for (let i = 0; i < routes.length; i++) addLine(collectPoints(routes[i], 'rtept'));

	let waypoints = 0;
	for (const pt of collectPoints(doc, 'wpt')) {
		features.push({ type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: pt } });
		waypoints++;
	}

	if (features.length === 0) throw new Error('no track, route or waypoint found');
	return { features, waypoints };
}

export function parseGeoJson(text: string): ParsedTrack {
	const data = JSON.parse(text);
	if (!data || typeof data !== 'object') throw new Error('not a GeoJSON object');
	if (data.type === 'FeatureCollection') {
		return { features: (data.features ?? []).filter((f: Feature | null) => f && f.geometry) };
	}
	if (data.type === 'Feature') return { features: data.geometry ? [data] : [] };
	if (data.type) return { features: [{ type: 'Feature', properties: null, geometry: data }] };
	throw new Error('not a GeoJSON object');
}

export function parseTrack(text: string, extension: string): ParsedTrack {
	return extension === 'gpx' ? parseGpx(text) : parseGeoJson(text);
}
