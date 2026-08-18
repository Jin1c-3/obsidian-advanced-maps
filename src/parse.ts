/* Dependency-free GPX/KML/TCX/GeoJSON parsing into plain GeoJSON features. */

import type { Feature, Geometry, Position } from 'geojson';

export interface ParsedTrack {
	features: Array<Feature<Geometry, Record<string, unknown> | null>>;
}

/** Preserve optional name, description and position-aligned timestamps; return null when empty. */
function buildProperties(
	name: string | undefined,
	times: (number | null)[] | undefined,
	description?: string
): Record<string, unknown> | null {
	const props: Record<string, unknown> = {};
	if (name) props.name = name;
	// The sentence a reader wrote about a place, kept because importing places as
	// notes reads it. Nothing on the drawing path looks at it.
	if (description) props.description = description;
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
	/** Same: a waypoint's `<desc>`, which is where a saved place keeps the reason
	 *  it was saved. */
	descriptions: (string | undefined)[];
}

/**
 * An XML document, or the same error for all three readers.
 *
 * DOMParser reports a malformed document by *returning* one describing the
 * failure rather than throwing, so the `<parsererror>` it injects is the only
 * signal there is.
 */
function parseXml(text: string): Document {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('not valid XML');
	}
	return doc;
}

/**
 * Every descendant whose *local* name matches, regardless of namespace prefix.
 * `getElementsByTagName('gx:coord')` only matches that exact literal string,
 * but the alias a document declares for the gx extension namespace is not
 * fixed — `xmlns:ext="…kml/ext/2.2"` and `<ext:coord>` is exactly as valid as
 * `gx:coord`, and a document embedded inside another XML file might prefix
 * every element, `kml:` or `gpx:` included. Matching on `localName` is what
 * survives either case; a literal tag-name lookup silently finds nothing.
 *
 * Used by all three XML readers rather than by KML alone. A namespace-prefixed
 * GPX or TCX is exactly as legal, and is what falls out of extracting one from
 * an enclosing document — read literally it parses to no features at all, and
 * the reader is told their valid file could not be read.
 */
function byLocalName(parent: Document | Element, name: string): Element[] {
	const all = parent.getElementsByTagName('*');
	const out: Element[] = [];
	for (let i = 0; i < all.length; i++) {
		if (all[i].localName === name) out.push(all[i]);
	}
	return out;
}

function firstByLocalName(parent: Document | Element, name: string): Element | undefined {
	return byLocalName(parent, name)[0];
}

/** The text of the first matching descendant, whatever namespace it carries. */
function textByLocalName(parent: Document | Element, name: string): string | null | undefined {
	return firstByLocalName(parent, name)?.textContent;
}

/**
 * `<trkpt>` / `<rtept>` / `<wpt>` all share this shape: lat/lon as attributes,
 * elevation, time, name and description as optional children. Every one of
 * `positions`, `times`, `names` and `descriptions` is always returned at the
 * same length — callers that don't need one of them (a track segment has no use
 * for `names`) just don't look — so there is one place that keeps the arrays in
 * step rather than each call site re-deriving that.
 */
function collectPoints(parent: Document | Element, tag: string): CollectedPoints {
	const positions: Position[] = [];
	const times: (number | null)[] = [];
	const names: (string | undefined)[] = [];
	const descriptions: (string | undefined)[] = [];
	const nodes = byLocalName(parent, tag);
	for (const node of nodes) {
		const lat = parseFloat(node.getAttribute('lat') ?? '');
		const lon = parseFloat(node.getAttribute('lon') ?? '');
		// GeoJSON is longitude-first; GPX is not.
		if (!isFinite(lat) || !isFinite(lon)) continue;
		const eleText = textByLocalName(node, 'ele');
		const ele = eleText != null ? parseFloat(eleText) : NaN;
		positions.push(isFinite(ele) ? [lon, lat, ele] : [lon, lat]);
		const timeText = textByLocalName(node, 'time');
		const ms = timeText ? Date.parse(timeText) : NaN;
		times.push(isFinite(ms) ? ms : null);
		names.push(textByLocalName(node, 'name')?.trim() || undefined);
		descriptions.push(textByLocalName(node, 'desc')?.trim() || undefined);
	}
	return { positions, times, names, descriptions };
}

/** Minimal GPX reader: track segments, routes and waypoints. */
export function parseGpx(text: string): ParsedTrack {
	const doc = parseXml(text);

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

	for (const seg of byLocalName(doc, 'trkseg')) addLine(collectPoints(seg, 'trkpt'));

	for (const route of byLocalName(doc, 'rte')) addLine(collectPoints(route, 'rtept'));

	const wpts = collectPoints(doc, 'wpt');
	for (let i = 0; i < wpts.positions.length; i++) {
		features.push({
			type: 'Feature',
			properties: buildProperties(wpts.names[i], undefined, wpts.descriptions[i]),
			geometry: { type: 'Point', coordinates: wpts.positions[i] },
		});
	}

	if (features.length === 0) throw new Error('no track, route or waypoint found');
	return { features };
}

/** Garmin TCX: each positioned `<Track>` becomes one LineString. */
export function parseTcx(text: string): ParsedTrack {
	const doc = parseXml(text);

	const features: ParsedTrack['features'] = [];
	for (const track of byLocalName(doc, 'Track')) {
		const points = byLocalName(track, 'Trackpoint');
		const positions: Position[] = [];
		const times: (number | null)[] = [];
		for (let i = 0; i < points.length; i++) {
			const pt = points[i];
			const posEl = firstByLocalName(pt, 'Position');
			// A heart-rate-only sample carries no <Position> at all; reading it as
			// 0,0 would draw a spike through Null Island instead of skipping it.
			if (!posEl) continue;
			const lat = parseFloat(textByLocalName(posEl, 'LatitudeDegrees') ?? '');
			const lon = parseFloat(textByLocalName(posEl, 'LongitudeDegrees') ?? '');
			if (!isFinite(lat) || !isFinite(lon)) continue;
			const altText = textByLocalName(pt, 'AltitudeMeters');
			const alt = altText != null ? parseFloat(altText) : NaN;
			positions.push(isFinite(alt) ? [lon, lat, alt] : [lon, lat]);
			const timeText = textByLocalName(pt, 'Time');
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
 * Whitespace-separated KML `lon,lat[,ele]` tuples.
 *
 * The whitespace around a tuple's own commas goes first: KML permits it, real
 * exports write it, and splitting on whitespace before removing it would cut
 * `lon,` away from `lat` and leave the file with no drawable geometry at all.
 * A stray *trailing* comma therefore joins two tuples into one over-long one,
 * of which the first three numbers are read and the rest ignored — the same
 * answer this parser already gives any tuple carrying more than it should.
 * Where that break was meant to be cannot be recovered without guessing, so
 * the position is lost rather than invented, and a line left with too few
 * positions to draw is reported as such by the caller.
 */
function parseKmlCoordinates(raw: string): Position[] {
	const out: Position[] = [];
	for (const tuple of raw
		.trim()
		.replace(/\s*,\s*/g, ',')
		.split(/\s+/)) {
		if (!tuple) continue;
		const parts = tuple.split(',').map((p) => parseFloat(p));
		if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) continue;
		out.push(parts.length > 2 && isFinite(parts[2]) ? [parts[0], parts[1], parts[2]] : [parts[0], parts[1]]);
	}
	return out;
}

/**
 * KML: `<Polygon>`, `<LineString>`, a `<LinearRing>` no polygon claimed,
 * `<Point>`, and `<gx:Track>` — the only KML form that carries a timestamp. A
 * geometry's enclosing `<Placemark>` name, when it has one, rides along as
 * `properties.name`.
 */
export function parseKml(text: string): ParsedTrack {
	const doc = parseXml(text);

	const features: ParsedTrack['features'] = [];

	// Walk up to the nearest enclosing <Placemark> and read one of its own direct
	// children — not the first such element anywhere below it, which could belong
	// to a nested <Style> or <ExtendedData> entry instead. Both the name and the
	// description are read this way, since a <Style> is as likely to carry a
	// <description> of its own as a <name>.
	const placemarkChild = (el: Element, wanted: string): string | undefined => {
		let node: Element | null = el.parentElement;
		while (node) {
			if (node.localName === 'Placemark') {
				for (let i = 0; i < node.children.length; i++) {
					if (node.children[i].localName === wanted) return node.children[i].textContent?.trim() || undefined;
				}
				return undefined;
			}
			node = node.parentElement;
		}
		return undefined;
	};
	const placemarkName = (el: Element): string | undefined => placemarkChild(el, 'name');
	const placemarkDescription = (el: Element): string | undefined => placemarkChild(el, 'description');

	const addLineLike = (el: Element) => {
		const coordEl = firstByLocalName(el, 'coordinates');
		const positions = coordEl ? parseKmlCoordinates(coordEl.textContent ?? '') : [];
		if (positions.length > 1) {
			features.push({
				type: 'Feature',
				properties: buildProperties(placemarkName(el), undefined, placemarkDescription(el)),
				geometry: { type: 'LineString', coordinates: positions },
			});
		}
	};

	for (const line of byLocalName(doc, 'LineString')) addLineLike(line);

	// A polygon's rings are read through the polygon, not found loose: GeoJSON
	// wants the outer ring first and each hole after it, and only
	// <outerBoundaryIs>/<innerBoundaryIs> say which a ring is. Scanning for
	// <LinearRing> alone cannot tell a hole from a boundary, so it draws both as
	// lines. Rings claimed here are remembered so the loose-ring pass below
	// does not draw them a second time.
	const claimedRings = new Set<Element>();
	for (const polygon of byLocalName(doc, 'Polygon')) {
		const rings: Position[][] = [];
		for (const boundary of ['outerBoundaryIs', 'innerBoundaryIs']) {
			for (const holder of byLocalName(polygon, boundary)) {
				for (const ring of byLocalName(holder, 'LinearRing')) {
					claimedRings.add(ring);
					const coordEl = firstByLocalName(ring, 'coordinates');
					const positions = coordEl ? parseKmlCoordinates(coordEl.textContent ?? '') : [];
					// A ring needs three distinct corners to enclose anything, and
					// the closing position is a repeat rather than a corner — so
					// `A B A` is two corners, not three, and is dropped rather than
					// drawn as a degenerate area. A ring the file left open is
					// closed here, because GeoJSON requires that repeat and KML
					// writers omit it.
					const first = positions[0];
					const last = positions[positions.length - 1];
					const closed = positions.length > 1 && first[0] === last[0] && first[1] === last[1];
					if ((closed ? positions.length - 1 : positions.length) < 3) continue;
					if (!closed) positions.push(first.slice());
					rings.push(positions);
				}
			}
		}
		// A polygon whose outer boundary was unusable has no interior to fill,
		// whatever its holes claimed.
		if (rings.length === 0) continue;
		features.push({
			type: 'Feature',
			properties: buildProperties(placemarkName(polygon), undefined, placemarkDescription(polygon)),
			geometry: { type: 'Polygon', coordinates: rings },
		});
	}

	// A <LinearRing> is legal outside a <Polygon>, and one nothing declared as a
	// boundary has no interior to claim, so it stays a line.
	for (const ring of byLocalName(doc, 'LinearRing')) {
		if (!claimedRings.has(ring)) addLineLike(ring);
	}

	for (const point of byLocalName(doc, 'Point')) {
		const coordEl = firstByLocalName(point, 'coordinates');
		const positions = coordEl ? parseKmlCoordinates(coordEl.textContent ?? '') : [];
		if (positions.length > 0) {
			features.push({
				type: 'Feature',
				properties: buildProperties(placemarkName(point), undefined, placemarkDescription(point)),
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
				properties: buildProperties(placemarkName(track), times, placemarkDescription(track)),
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
