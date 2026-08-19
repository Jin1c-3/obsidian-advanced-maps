/*
 * The measuring tape's own arithmetic: the places clicked, what they add up to,
 * and what has to be drawn to say so.
 *
 * Pure — no MapLibre and no DOM. Points are held in WGS-84 like every other
 * coordinate this plugin owns, and projected into the tile datum only to be
 * drawn. Ground distance is a question about the world rather than about the
 * background: measuring the GCJ-02 copy of two places answers for a pair of
 * points that are each a few hundred metres from where the reader clicked.
 */

import type { Feature, FeatureCollection, Geometry, LineString, Position } from 'geojson';
import { unwrapGeometry } from './geometry';
import { formatDistance, haversine } from './stats';

/** One place the reader clicked, in vault space. */
export interface MeasurePoint {
	lng: number;
	lat: number;
}

/** A tape as it stands: the points committed, and the one the pointer is over. */
export interface Measurement {
	points: readonly MeasurePoint[];
	/** Null before the first click, right after one, and on a device with no pointer. */
	draft: MeasurePoint | null;
	/** Whether the draft is a point already on the map — a pin, a waypoint, a
	 *  photo, an earlier vertex — rather than the bare pixel under the pointer.
	 *  What it changes is the ring: the coordinate is already in `draft`. */
	snapped?: boolean;
}

/** One point already on the map, offered to a pointer that has come near it. */
export interface SnapCandidate {
	/** Vault space — exactly what a click takes if this one wins. */
	point: MeasurePoint;
	/** Where that coordinate is drawn, in the map container's own pixels. */
	at: { x: number; y: number };
}

/**
 * The candidate a pointer is taken to be aiming at, or null when none is close
 * enough.
 *
 * Screen distance rather than ground distance, because this is a question about
 * aim: two places a metre apart on a city map are one pixel apart on a country
 * one, and the reader can only point at what they can see. Ties go to whichever
 * candidate was offered first, which is how a caller states priority.
 */
export function nearestSnap(
	pointer: { x: number; y: number },
	candidates: readonly SnapCandidate[],
	radiusPx: number
): SnapCandidate | null {
	let best: SnapCandidate | null = null;
	// Compared squared, so the loop needs no square root to rank by.
	let bestSq = radiusPx * radiusPx;
	for (const candidate of candidates) {
		const dx = candidate.at.x - pointer.x;
		const dy = candidate.at.y - pointer.y;
		if (!isFinite(dx) || !isFinite(dy)) continue;
		const sq = dx * dx + dy * dy;
		// Strictly nearer, so an equal candidate does not displace the earlier one.
		if (sq < bestSq) {
			bestSq = sq;
			best = candidate;
		}
	}
	return best;
}

/** WGS-84 into the datum the map draws in — `toTileSpace` bound to one system. */
export type Project = (lng: number, lat: number) => [number, number];

/** What a drawn tape feature carries; `amMeasure` is what the four layers filter on. */
export interface MeasureProps extends Record<string, unknown> {
	/** The committed line, the segment under the pointer, one clicked point, or
	 *  the point a click would take instead of the pixel under the pointer. */
	amMeasure: 'path' | 'draft' | 'vertex' | 'snap';
}

/** One distance shown on the map, pinned to the vertex it is the distance to. */
export interface MeasureLabel {
	/** Tile space, off the same unwrapped path the line is drawn from. */
	at: [number, number];
	text: string;
	/** The one that follows the pointer rather than naming a committed point. */
	draft: boolean;
}

export interface MeasureDrawing {
	data: FeatureCollection<Geometry, MeasureProps>;
	labels: MeasureLabel[];
}

/**
 * Metres from the first point to each point, so entry `i` is what vertex `i` is
 * labelled with.
 *
 * Entry 0 is always 0 and is never drawn: a label saying the start is where the
 * measurement starts tells the reader nothing they did not just do themselves.
 */
export function cumulativeDistances(points: readonly MeasurePoint[]): number[] {
	const out: number[] = [];
	let total = 0;
	for (let i = 0; i < points.length; i++) {
		if (i > 0) total += haversine([points[i - 1].lng, points[i - 1].lat], [points[i].lng, points[i].lat]);
		out.push(total);
	}
	return out;
}

/** What the readout says: the committed points only, never the pointer's leg. */
export function measuredDistance(points: readonly MeasurePoint[]): number {
	const cumulative = cumulativeDistances(points);
	return cumulative.length === 0 ? 0 : cumulative[cumulative.length - 1];
}

function line(coordinates: Position[], role: 'path' | 'draft'): Feature<Geometry, MeasureProps> {
	return { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { amMeasure: role } };
}

/**
 * Everything one tape needs on screen: the features for its four layers, and
 * the labels to hang beside them.
 *
 * Both halves come off one projected, unwrapped path so they cannot disagree
 * about which turn round the world a click east of the 180th meridian is on.
 * Unwrapping the line and placing the labels separately would put a label a
 * whole world away from the segment it belongs to.
 */
export function measureDrawing(measurement: Measurement, project: Project): MeasureDrawing {
	const { points, draft } = measurement;
	const committed = points.length;
	const all = draft ? [...points, draft] : [...points];

	const projected: Position[] = all.map((point) => project(point.lng, point.lat));
	const path =
		projected.length > 1
			? unwrapGeometry<LineString>({ type: 'LineString', coordinates: projected }).coordinates
			: projected;

	const features: Array<Feature<Geometry, MeasureProps>> = [];
	if (committed > 1) features.push(line(path.slice(0, committed), 'path'));
	// One segment, from the last committed point to the pointer, drawn apart
	// because it is a preview and not yet part of the measurement.
	if (draft && committed > 0) features.push(line(path.slice(committed - 1), 'draft'));
	for (let i = 0; i < committed; i++) {
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: path[i] },
			properties: { amMeasure: 'vertex' },
		});
	}

	// The ring, off the same path as everything else so a point taken east of the
	// 180th meridian is ringed on the segment it belongs to rather than a world
	// away from it. Drawn from `draft` alone, which is what makes it visible
	// before the first point of a measurement has been placed.
	if (draft && measurement.snapped) {
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: path[committed] },
			properties: { amMeasure: 'snap' },
		});
	}

	const cumulative = cumulativeDistances(points);
	const labels: MeasureLabel[] = [];
	for (let i = 1; i < committed; i++) {
		labels.push({ at: [path[i][0], path[i][1]], text: formatDistance(cumulative[i]), draft: false });
	}
	if (draft && committed > 0) {
		const last = points[committed - 1];
		const total = cumulative[committed - 1] + haversine([last.lng, last.lat], [draft.lng, draft.lat]);
		labels.push({ at: [path[committed][0], path[committed][1]], text: formatDistance(total), draft: true });
	}

	return { data: { type: 'FeatureCollection', features }, labels };
}
