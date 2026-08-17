/* Saved places: reading them out of parsed geometry, and writing them back out as files. */

import type { Feature, Geometry } from 'geojson';
import { COORD_DIGITS } from './coords';

/** Longest note name an imported place is given, before the collision suffix. */
const MAX_NAME = 80;

/**
 * One saved place, in WGS-84, as both directions of the interchange see it.
 *
 * The coordinate is a pair of numbers rather than the `"lat,lng"` string notes
 * hold, because two of the three writers need the halves apart and every one of
 * them writes them in a different order.
 */
export interface Place {
	name: string;
	/** Plain text; empty when the source carried none. */
	description: string;
	lat: number;
	lng: number;
	/** The note this place came out of, on the way out. Empty on the way in,
	 *  where the note does not exist yet. */
	path?: string;
}

export type PlaceFormat = 'gpx' | 'kml' | 'csv';

export const PLACE_FORMATS: readonly PlaceFormat[] = ['gpx', 'kml', 'csv'];

/**
 * The point features of a parsed file, as places.
 *
 * Lines and areas are skipped rather than reduced to a representative point: a
 * route is already a file this vault can hold, and a note standing for its first
 * coordinate would be a place that is not one.
 *
 * `fallback` names the places the file left nameless — the source file's own
 * name, numbered by position among the points, so two unnamed placemarks in one
 * file stay distinguishable.
 */
export function placesFrom(
	features: Array<Feature<Geometry, Record<string, unknown> | null>>,
	fallback: string
): Place[] {
	const out: Place[] = [];
	for (const feature of features) {
		const geometry = feature.geometry;
		if (!geometry || geometry.type !== 'Point') continue;
		const [lng, lat] = geometry.coordinates;
		// A file that parsed is not a file whose every number is usable.
		if (!isFinite(lat) || !isFinite(lng)) continue;
		const props = feature.properties;
		const named = typeof props?.name === 'string' ? props.name.trim() : '';
		const described = typeof props?.description === 'string' ? props.description : '';
		out.push({
			name: named || `${fallback} ${out.length + 1}`,
			description: descriptionText(described),
			lat,
			lng,
		});
	}
	return out;
}

/** A break inside a paragraph, and the end of one. Markdown tells them apart by
 *  how many newlines are there, so the reduction has to as well. */
const LINE_BREAK = /<\s*(br\s*\/?|\/\s*li|\/\s*tr)\s*>/gi;
const BLOCK_END = /<\s*\/\s*(p|div|h[1-6]|blockquote)\s*>/gi;

/**
 * A description as the text it renders as.
 *
 * Map apps write HTML into a KML `<description>`, and a note's body is markdown
 * that Obsidian renders inline HTML inside — so pasting one in verbatim would
 * let a downloaded file decide how a note looks, and would carry whatever else
 * that file happens to hold into the vault. What survives here is the sentence
 * somebody wrote about the place: breaks become newlines, tags are dropped, and
 * entities are decoded exactly once.
 */
export function descriptionText(raw: string): string {
	if (!raw) return '';
	// A description holding neither a tag nor an entity has nothing to decode,
	// and running it through a parser could only change it.
	const text = /[<&]/.test(raw) ? stripMarkup(raw) : raw;
	const lines = text.split(/\r\n|\r|\n/).map((line) => line.trim());
	// At most one blank line between paragraphs: a description built out of
	// `<p>`s arrives with a break after every one of them, empty ones included.
	return lines
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function stripMarkup(raw: string): string {
	// The breaks go first, while they are still elements: after `textContent`
	// there is nothing left to tell a paragraph boundary from a space.
	const spaced = raw.replace(LINE_BREAK, '\n').replace(BLOCK_END, '\n\n');
	// `text/html`, not the `application/xml` the file readers use: a description
	// is HTML, and real ones carry unclosed tags that an XML parse rejects
	// outright — which would lose the whole description rather than its markup.
	const doc = new DOMParser().parseFromString(spaced, 'text/html');
	return doc.body?.textContent ?? '';
}

/** Characters a vault file name cannot hold, that break a wikilink to it, or
 *  that are invisible — a description pasted into a name field brings all three. */
// eslint-disable-next-line no-control-regex -- matching invisible characters is the point of this one
const ILLEGAL_NAME = /[\\/:*?"<>|#^[\]\u0000-\u001f\u007f]/g;

/**
 * The name an imported place's note gets: legal, bounded, and free of every name
 * already taken.
 *
 * `taken` holds lower-cased names — the vault's, on a case-insensitive file
 * system, plus every name claimed earlier in this same import. A file with two
 * `Home` placemarks is the ordinary case rather than a rare one. The chosen name
 * is added to it, so one pass over a file's places needs one set and no second
 * look at the folder.
 */
export function noteName(raw: string, fallback: string, taken: Set<string>): string {
	const base = sanitizeName(raw) || sanitizeName(fallback) || 'place';
	let name = base;
	for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
	taken.add(name.toLowerCase());
	return name;
}

/**
 * Illegal characters become a space rather than nothing, so `Café: Sud` stays
 * two words. The length bound is this plugin's own: a name is not a path, and a
 * placemark description pasted into a name field should not decide how close a
 * vault gets to its file system's limit.
 */
function sanitizeName(raw: string): string {
	const cleaned = raw.replace(ILLEGAL_NAME, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
	// A leading dot hides the file from Obsidian. Trailing dots and spaces are
	// dropped by Windows itself, which would make two names that the vault had
	// already accepted as distinct collide on one of the devices syncing it.
	return cleaned.replace(/^\.+/, '').replace(/[. ]+$/, '');
}

/**
 * A Bases property value as the text a place can be named with, or empty.
 *
 * `String(value)` is what works: measured across a live base it answers usefully
 * for every shape one displays — a string, a list joined, a number, a date as
 * `2025-04-05T16:27:00` — while rendering the value into a detached element
 * comes back empty for several of them. `isTruthy()` is what separates a value
 * from an absent one, because an empty value stringifies to `""` and a null one
 * to the literal `"null"`; both are checked, since not every value class carries
 * the method.
 */
export function valueText(value: unknown): string {
	if (value === null || value === undefined) return '';
	// Narrowed to the two members read, rather than left `unknown` and stringified:
	// every Bases value class declares its own `toString`, and saying so is what
	// separates this from stringifying an object that has none.
	const held = value as { isTruthy?: () => boolean; toString(): string };
	if (typeof held.isTruthy === 'function' && !held.isTruthy()) return '';
	const text = held.toString().trim();
	return text === 'null' || text === 'undefined' ? '' : text;
}

const fmt = (n: number): string => n.toFixed(COORD_DIGITS);

/** `&` first, or the entities this introduces get escaped a second time. */
function xml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function writePlaces(places: Place[], format: PlaceFormat): string {
	switch (format) {
		case 'gpx':
			return writeGpx(places);
		case 'kml':
			return writeKml(places);
		default:
			return writeCsv(places);
	}
}

/** GPX 1.1 waypoints — what a watch or a trail app reads. */
export function writeGpx(places: Place[]): string {
	const lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<gpx version="1.1" creator="Advanced Maps for Obsidian" xmlns="http://www.topografix.com/GPX/1/1">',
	];
	for (const place of places) {
		lines.push(`\t<wpt lat="${fmt(place.lat)}" lon="${fmt(place.lng)}">`);
		lines.push(`\t\t<name>${xml(place.name)}</name>`);
		if (place.description) lines.push(`\t\t<desc>${xml(place.description)}</desc>`);
		lines.push('\t</wpt>');
	}
	lines.push('</gpx>');
	return `${lines.join('\n')}\n`;
}

/** KML 2.2 placemarks — what My Maps and Earth read. */
export function writeKml(places: Place[]): string {
	const lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<kml xmlns="http://www.opengis.net/kml/2.2">',
		'\t<Document>',
	];
	for (const place of places) {
		lines.push('\t\t<Placemark>');
		lines.push(`\t\t\t<name>${xml(place.name)}</name>`);
		if (place.description) lines.push(`\t\t\t<description>${xml(place.description)}</description>`);
		// Longitude first here, unlike the GPX attributes above.
		lines.push(`\t\t\t<Point><coordinates>${fmt(place.lng)},${fmt(place.lat)}</coordinates></Point>`);
		lines.push('\t\t</Placemark>');
	}
	lines.push('\t</Document>', '</kml>');
	return `${lines.join('\n')}\n`;
}

const CSV_HEADER = ['name', 'latitude', 'longitude', 'note'];

/** RFC 4180: quote a field holding a separator, a quote or a break; double the quotes inside. */
function csvField(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A header row and one row per place, the only writer that says which note a place came from. */
export function writeCsv(places: Place[]): string {
	const rows = [CSV_HEADER];
	for (const place of places) rows.push([place.name, fmt(place.lat), fmt(place.lng), place.path ?? '']);
	// CRLF, which is what RFC 4180 states and what spreadsheet software opening a
	// file rather than importing it expects.
	return `${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}
