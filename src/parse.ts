/*
 * Parsing — everything becomes plain GeoJSON features.
 *
 * GPX, KML and TCX all go through the browser's own XML parser rather than a
 * library: the subset that matters out of each format is a handful of tag
 * names, and a plugin that ships no dependencies is a plugin that cannot ship
 * a vulnerable one.
 */

import type { Feature, Geometry, Position } from 'geojson';

export interface ParsedTrack {
	features: Array<Feature<Geometry, Record<string, unknown> | null>>;
	waypoints?: number;
}

/**
 * Fold what a reader managed to pick up beyond bare geometry into `properties`
 * — or `null` when there was nothing, which every existing reader (and every
 * caller downstream) already depends on: a feature with nothing extra to say
 * keeps `properties: null` rather than an empty object nobody asked for.
 *
 * Two keys go in, and there is nowhere else for either to ride:
 *
 * - `name`, a `<Placemark>`'s (or similar) own, when the source states one.
 * - `times`, epoch milliseconds one per coordinate, aligned 1:1 with the
 *   geometry's position array. `null` marks a point whose source gave no
 *   timestamp, or one that did not parse — a hole rather than a dropped point,
 *   because dropping it would desync this array from the coordinates it
 *   describes.
 *
 * The return type is the wider `Record<string, unknown>` rather than an
 * interface naming those two: `ParsedTrack.features` is typed against the
 * `Record`, and an interface with named properties has no index signature for
 * TypeScript to match against it.
 */
function buildProperties(
	name: string | undefined,
	times: (number | null)[] | undefined
): Record<string, unknown> | null {
	const props: Record<string, unknown> = {};
	if (name) props.name = name;
	// An all-null times array carries no information a reader could use, so it
	// is left off entirely — the key's mere presence is the signal that at
	// least one point in this feature has a real timestamp.
	if (times && times.some((time) => time !== null)) props.times = times;
	return Object.keys(props).length > 0 ? props : null;
}

interface CollectedPoints {
	positions: Position[];
	times: (number | null)[];
	/** Only meaningful for `<wpt>` — a `<trkpt>`/`<rtept>` almost never names
	 *  one, and `addLine()` ignores this array either way. */
	names: (string | undefined)[];
}

/**
 * `<trkpt>` / `<rtept>` / `<wpt>` all share this shape: lat/lon as attributes,
 * elevation, time and name as optional children. All three of `positions`,
 * `times` and `names` are always returned at the same length — callers that
 * don't need one of them (a track segment has no use for `names`) just don't
 * look — so there is one place that keeps the three arrays in step rather than
 * each call site re-deriving that.
 */
function collectPoints(parent: Document | Element, tag: string): CollectedPoints {
	const positions: Position[] = [];
	const times: (number | null)[] = [];
	const names: (string | undefined)[] = [];
	const nodes = parent.getElementsByTagName(tag);
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const lat = parseFloat(node.getAttribute('lat') ?? '');
		const lon = parseFloat(node.getAttribute('lon') ?? '');
		// GeoJSON is longitude-first; GPX is not.
		if (!isFinite(lat) || !isFinite(lon)) continue;
		const eleText = node.getElementsByTagName('ele')[0]?.textContent;
		const ele = eleText != null ? parseFloat(eleText) : NaN;
		positions.push(isFinite(ele) ? [lon, lat, ele] : [lon, lat]);
		const timeText = node.getElementsByTagName('time')[0]?.textContent;
		const ms = timeText ? Date.parse(timeText) : NaN;
		times.push(isFinite(ms) ? ms : null);
		names.push(node.getElementsByTagName('name')[0]?.textContent?.trim() || undefined);
	}
	return { positions, times, names };
}

/** Minimal GPX reader: track segments, routes and waypoints. */
export function parseGpx(text: string): ParsedTrack {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('not valid XML');
	}

	const features: ParsedTrack['features'] = [];
	const addLine = (collected: CollectedPoints) => {
		if (collected.positions.length > 1) {
			features.push({
				type: 'Feature',
				properties: buildProperties(undefined, collected.times),
				geometry: { type: 'LineString', coordinates: collected.positions },
			});
		}
	};

	const segs = doc.getElementsByTagName('trkseg');
	for (let i = 0; i < segs.length; i++) addLine(collectPoints(segs[i], 'trkpt'));

	const routes = doc.getElementsByTagName('rte');
	for (let i = 0; i < routes.length; i++) addLine(collectPoints(routes[i], 'rtept'));

	let waypoints = 0;
	const wpts = collectPoints(doc, 'wpt');
	for (let i = 0; i < wpts.positions.length; i++) {
		features.push({
			type: 'Feature',
			properties: buildProperties(wpts.names[i], undefined),
			geometry: { type: 'Point', coordinates: wpts.positions[i] },
		});
		waypoints++;
	}

	if (features.length === 0) throw new Error('no track, route or waypoint found');
	return { features, waypoints };
}

/**
 * Garmin's TCX: the richest of the four formats, since every field GPX might
 * omit — time, altitude — a TCX export states on every trackpoint that has it.
 * One `<Track>` (nested under `<Lap>`) becomes one LineString.
 */
export function parseTcx(text: string): ParsedTrack {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('not valid XML');
	}

	const features: ParsedTrack['features'] = [];
	const tracks = doc.getElementsByTagName('Track');
	for (let t = 0; t < tracks.length; t++) {
		const points = tracks[t].getElementsByTagName('Trackpoint');
		const positions: Position[] = [];
		const times: (number | null)[] = [];
		for (let i = 0; i < points.length; i++) {
			const pt = points[i];
			const posEl = pt.getElementsByTagName('Position')[0];
			// A heart-rate-only sample carries no <Position> at all; reading it as
			// 0,0 would draw a spike through Null Island instead of skipping it.
			if (!posEl) continue;
			const lat = parseFloat(posEl.getElementsByTagName('LatitudeDegrees')[0]?.textContent ?? '');
			const lon = parseFloat(posEl.getElementsByTagName('LongitudeDegrees')[0]?.textContent ?? '');
			if (!isFinite(lat) || !isFinite(lon)) continue;
			const altText = pt.getElementsByTagName('AltitudeMeters')[0]?.textContent;
			const alt = altText != null ? parseFloat(altText) : NaN;
			positions.push(isFinite(alt) ? [lon, lat, alt] : [lon, lat]);
			const timeText = pt.getElementsByTagName('Time')[0]?.textContent;
			const ms = timeText ? Date.parse(timeText) : NaN;
			times.push(isFinite(ms) ? ms : null);
		}
		if (positions.length > 1) {
			features.push({
				type: 'Feature',
				properties: buildProperties(undefined, times),
				geometry: { type: 'LineString', coordinates: positions },
			});
		}
	}

	if (features.length === 0) throw new Error('no track found');
	return { features };
}

/**
 * Every descendant whose *local* name matches, regardless of namespace prefix.
 * `getElementsByTagName('gx:coord')` only matches that exact literal string,
 * but the alias a document declares for the gx extension namespace is not
 * fixed — `xmlns:ext="…kml/ext/2.2"` and `<ext:coord>` is exactly as valid as
 * `gx:coord`, and a document embedded inside another XML file might prefix
 * every KML element, `kml:` included. Matching on `localName` is what survives
 * either case; a literal tag-name lookup silently finds nothing.
 */
function byLocalName(parent: Document | Element, name: string): Element[] {
	const all = parent.getElementsByTagName('*');
	const out: Element[] = [];
	for (let i = 0; i < all.length; i++) {
		if (all[i].localName === name) out.push(all[i]);
	}
	return out;
}

function firstByLocalName(parent: Element, name: string): Element | undefined {
	return byLocalName(parent, name)[0];
}

/** `lon,lat[,ele]` tuples, whitespace-separated — including the newlines most
 *  real KML wraps a long `<coordinates>` block in for readability. */
function parseKmlCoordinates(raw: string): Position[] {
	const out: Position[] = [];
	for (const tuple of raw.trim().split(/\s+/)) {
		if (!tuple) continue;
		const parts = tuple.split(',').map((p) => parseFloat(p));
		if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) continue;
		out.push(parts.length > 2 && isFinite(parts[2]) ? [parts[0], parts[1], parts[2]] : [parts[0], parts[1]]);
	}
	return out;
}

/**
 * KML: `<LineString>`, `<LinearRing>` (a `<Polygon>`'s boundary), `<Point>`,
 * and `<gx:Track>` — the only KML form that carries a timestamp. A geometry's
 * enclosing `<Placemark>` name, when it has one, rides along as `properties.name`.
 */
export function parseKml(text: string): ParsedTrack {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('not valid XML');
	}

	const features: ParsedTrack['features'] = [];

	// Walk up to the nearest enclosing <Placemark> and read its own <name> —
	// not the first <name> anywhere below it, which could belong to a nested
	// <Style> or <ExtendedData> entry instead.
	const placemarkName = (el: Element): string | undefined => {
		let node: Element | null = el.parentElement;
		while (node) {
			if (node.localName === 'Placemark') {
				for (let i = 0; i < node.children.length; i++) {
					if (node.children[i].localName === 'name') return node.children[i].textContent?.trim() || undefined;
				}
				return undefined;
			}
			node = node.parentElement;
		}
		return undefined;
	};

	const addLineLike = (el: Element) => {
		const coordEl = firstByLocalName(el, 'coordinates');
		const positions = coordEl ? parseKmlCoordinates(coordEl.textContent ?? '') : [];
		if (positions.length > 1) {
			features.push({
				type: 'Feature',
				properties: buildProperties(placemarkName(el), undefined),
				geometry: { type: 'LineString', coordinates: positions },
			});
		}
	};

	for (const line of byLocalName(doc, 'LineString')) addLineLike(line);
	for (const ring of byLocalName(doc, 'LinearRing')) addLineLike(ring);

	for (const point of byLocalName(doc, 'Point')) {
		const coordEl = firstByLocalName(point, 'coordinates');
		const positions = coordEl ? parseKmlCoordinates(coordEl.textContent ?? '') : [];
		if (positions.length > 0) {
			features.push({
				type: 'Feature',
				properties: buildProperties(placemarkName(point), undefined),
				geometry: { type: 'Point', coordinates: positions[0] },
			});
		}
	}

	// <gx:Track> pairs <when>…</when> with <gx:coord>lon lat ele</gx:coord> —
	// space-separated, unlike <coordinates> — as siblings in document order
	// rather than nesting one inside the other, so the i-th <when> and the i-th
	// <gx:coord> are read as one point. A mismatched count (malformed input)
	// just truncates to the shorter of the two rather than throwing.
	for (const track of byLocalName(doc, 'Track')) {
		const whens = byLocalName(track, 'when');
		const coords = byLocalName(track, 'coord');
		const count = Math.min(whens.length, coords.length);
		const positions: Position[] = [];
		const times: (number | null)[] = [];
		for (let i = 0; i < count; i++) {
			const parts = (coords[i].textContent ?? '').trim().split(/\s+/).map(Number);
			if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) continue;
			positions.push(
				parts.length > 2 && isFinite(parts[2]) ? [parts[0], parts[1], parts[2]] : [parts[0], parts[1]]
			);
			const ms = Date.parse(whens[i].textContent ?? '');
			times.push(isFinite(ms) ? ms : null);
		}
		if (positions.length > 1) {
			features.push({
				type: 'Feature',
				properties: buildProperties(placemarkName(track), times),
				geometry: { type: 'LineString', coordinates: positions },
			});
		}
	}

	if (features.length === 0) throw new Error('no drawable geometry found');
	return { features };
}

/** What `JSON.parse` may hand back before anything has been checked about it. */
type LooseGeoJson = { type?: unknown; features?: unknown; geometry?: unknown };

export function parseGeoJson(text: string): ParsedTrack {
	// `unknown`, not the `any` JSON.parse is typed to return: this reads a file
	// off disk that nothing has validated, so every field is a claim until it has
	// been checked. `features` in particular arrives as whatever was in the file —
	// `.filter` on a string would throw where an empty list is the honest answer.
	const data: unknown = JSON.parse(text);
	if (!data || typeof data !== 'object') throw new Error('not a GeoJSON object');
	const doc = data as LooseGeoJson;
	if (doc.type === 'FeatureCollection') {
		const features = Array.isArray(doc.features) ? (doc.features as ParsedTrack['features']) : [];
		return { features: features.filter((f) => f && f.geometry) };
	}
	if (doc.type === 'Feature') {
		return { features: doc.geometry ? [data as ParsedTrack['features'][number]] : [] };
	}
	if (doc.type) return { features: [{ type: 'Feature', properties: null, geometry: data as Geometry }] };
	throw new Error('not a GeoJSON object');
}

export function parseTrack(text: string, extension: string): ParsedTrack {
	switch (extension) {
		case 'gpx':
			return parseGpx(text);
		case 'kml':
			return parseKml(text);
		case 'tcx':
			return parseTcx(text);
		default:
			return parseGeoJson(text);
	}
}
