/*
 * Fanning apart the pins that land on the same spot.
 *
 * A base of places written by hand collects notes that share a coordinate
 * exactly: one address typed into twenty notes, one geocoded place picked
 * twenty times. Measured on a real 292-pin base, 30 coordinates carried more
 * than one note and the busiest carried nine — and nine pins on one pixel is
 * one clickable note and eight that cannot be reached at all, because the
 * native click handler takes `features[0]` and there is no second pixel to aim
 * at.
 *
 * So the pins are pushed apart on screen once the map is zoomed in far enough
 * for the room to exist. Everything in here is pure arithmetic over positions:
 * where each pin goes, in CSS pixels, and how far the fan has opened at a given
 * zoom. Nothing here touches MapLibre, a map, or a note — see `track-layer.ts`
 * for the seam that stamps the answer onto the features, and CLAUDE.md for why
 * this is drawn with `icon-offset` instead of by moving the coordinates.
 */

import { SPREAD } from './constants';

/**
 * MapLibre's Mercator world is `512 * 2^zoom` pixels across, whatever tile size
 * the source happens to use.
 *
 * Measured rather than taken from the docs: two coordinates 0.01° apart at
 * zoom 14 projected 233.0169 px apart on a live map, against a normalized
 * Mercator separation of 2.777778e-5 — a world of 8388608.000003 px, where
 * `512 * 2^14` is 8388608 exactly.
 */
const WORLD_TILE_PX = 512;

/** Web Mercator's own latitude limit, past which `tan` runs away. */
const MAX_LAT = 85.051129;

/** One pin, in whatever space the map is drawn in — see `coords.ts`; a fan is
 *  screen geometry, so it neither knows nor cares which datum that is. */
export interface SpreadPin {
	/** Stable identity — the note's own path. Sorting on it is what keeps one
	 *  note in the same place in its fan however the base is sorted today. */
	key: string;
	lng: number;
	lat: number;
}

/** Where one fanned pin goes, and which table entry says so. */
export interface SpreadSlot {
	/** 1-based, into `SpreadPlan.table`. Zero is "not moved" and is never stored. */
	slot: number;
	/** The same offset in CSS px, for whoever has to follow a pin rather than draw it. */
	offset: [number, number];
}

export interface SpreadPlan {
	/** Only the pins that share their spot with another. Empty is the common case. */
	pins: Map<string, SpreadSlot>;
	/**
	 * What each slot id means, in CSS px at full open, with `[0, 0]` at index 0
	 * so `table[slot]` is always the right answer.
	 *
	 * Distinct offsets rather than one entry per pin: a hundred two-note fans
	 * are two offsets, not two hundred, and this table is written out into a
	 * MapLibre `match` expression where every entry costs something.
	 */
	table: Array<[number, number]>;
}

/** Normalized Web Mercator, both axes in `[0, 1]` — the space MapLibre's own
 *  `project()` scales by `WORLD_TILE_PX * 2^zoom`. */
export function mercator(lng: number, lat: number): [number, number] {
	const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
	const x = (lng + 180) / 360;
	const y = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360))) / 360;
	return [x, y];
}

/**
 * Where `count` pins go, in CSS px around the spot they share.
 *
 * One ring, sized to hold them all `ringStepPx` apart, so the ordinary case —
 * two notes at one address, or nine — is a single readable circle rather than
 * a pattern to decode. A ring only grows to `ringMaxPx`; past that a second
 * ring opens one step outside the first, which bounds how far across the screen
 * a pathological group can reach without ever leaving a pin stacked and
 * unclickable.
 *
 * Each ring is turned half a slot on from the one it encloses, so a pin on the
 * outer ring never sits directly behind one on the inner.
 */
export function spreadSlots(count: number): Array<[number, number]> {
	const slots: Array<[number, number]> = [];
	if (!isFinite(count) || count < 2) return slots;
	const { ringMinPx, ringStepPx, ringMaxPx } = SPREAD;
	let radius = 0;
	let ring = 0;
	while (slots.length < count) {
		const left = count - slots.length;
		const fitted = Math.max(ringMinPx, (left * ringStepPx) / (2 * Math.PI));
		radius = radius === 0 ? Math.min(ringMaxPx, fitted) : radius + ringStepPx;
		// At least one, so a ring narrower than one step still takes a pin and the
		// loop cannot spin forever.
		const capacity = Math.max(1, Math.floor((2 * Math.PI * radius) / ringStepPx));
		const here = Math.min(capacity, left);
		const turn = (ring * Math.PI) / here;
		for (let i = 0; i < here; i++) {
			const angle = turn + (2 * Math.PI * i) / here;
			slots.push([round(radius * Math.cos(angle)), round(radius * Math.sin(angle))]);
		}
		ring++;
	}
	return slots;
}

/**
 * Which pins share a spot, and where each of them goes.
 *
 * Grouping is by rendered distance at `SPREAD.toZoom` — the zoom the fan is
 * fully open at — because that is the question being asked: would these two
 * pins still be on top of each other once there is room for them not to be? A
 * ground distance would answer it differently at every latitude, and Mercator
 * already carries that difference.
 *
 * Leader clustering, over pins sorted by key: each pin joins the first group
 * whose *first* member is within reach, or starts one of its own. A leader
 * rather than single linkage, so a line of pins each just inside the threshold
 * of the next cannot chain into one enormous group; sorted, so the answer does
 * not depend on the order the base handed the rows over.
 */
export function spreadPins(pins: readonly SpreadPin[]): SpreadPlan {
	const plan: SpreadPlan = { pins: new Map(), table: [[0, 0]] };
	if (pins.length < 2) return plan;
	const reach = SPREAD.groupPx / (WORLD_TILE_PX * Math.pow(2, SPREAD.toZoom));
	if (!(reach > 0)) return plan;

	const sorted = [...pins].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	/** Grid of cell → the groups whose leader sits in it, cell being one reach
	 *  across so a neighbour can only ever be in the eight cells around this one. */
	const cells = new Map<string, number[]>();
	const leaders: Array<[number, number]> = [];
	const groups: SpreadPin[][] = [];

	for (const pin of sorted) {
		const [x, y] = mercator(pin.lng, pin.lat);
		if (!isFinite(x) || !isFinite(y)) continue;
		const cx = Math.floor(x / reach);
		const cy = Math.floor(y / reach);
		let found = -1;
		for (let dx = -1; dx <= 1 && found < 0; dx++) {
			for (let dy = -1; dy <= 1 && found < 0; dy++) {
				for (const index of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
					const [lx, ly] = leaders[index];
					if ((lx - x) * (lx - x) + (ly - y) * (ly - y) <= reach * reach) {
						found = index;
						break;
					}
				}
			}
		}
		if (found < 0) {
			found = groups.length;
			groups.push([]);
			leaders.push([x, y]);
			const cell = `${cx},${cy}`;
			const list = cells.get(cell);
			if (list) list.push(found);
			else cells.set(cell, [found]);
		}
		groups[found].push(pin);
	}

	const ids = new Map<string, number>();
	for (const group of groups) {
		if (group.length < 2) continue;
		const slots = spreadSlots(group.length);
		group.forEach((pin, i) => {
			const offset = slots[i];
			if (!offset) return;
			const id = `${offset[0]},${offset[1]}`;
			let slot = ids.get(id);
			if (slot === undefined) {
				slot = plan.table.length;
				plan.table.push(offset);
				ids.set(id, slot);
			}
			plan.pins.set(pin.key, { slot, offset });
		});
	}
	return plan;
}

/**
 * How far open the fan is at this zoom, from 0 (closed, every pin exactly where
 * its note says) to 1 (full).
 *
 * The one statement of the ramp `iconOffsetExpression` writes into the style,
 * so whoever has to place something *at* a fanned pin — the hover card — cannot
 * drift away from where the pin itself was drawn.
 */
export function spreadFactor(zoom: number): number {
	const { fromZoom, toZoom } = SPREAD;
	if (!isFinite(zoom) || zoom <= fromZoom) return 0;
	if (zoom >= toZoom || toZoom <= fromZoom) return 1;
	return (zoom - fromZoom) / (toZoom - fromZoom);
}

/**
 * The native marker layer's own `icon-size`, evaluated at one zoom.
 *
 * `icon-offset` is documented as being **multiplied by `icon-size`** before it
 * becomes pixels, and measured that way: an offset of 200 landed a pin 47 px
 * from its anchor at zoom 17, where `icon-size` interpolates to 0.235. So the
 * table has to be divided by whatever the native layer is asking for, and this
 * reads that rather than assuming it — an Obsidian release that draws bigger
 * pins should get a wider fan, not a fan that silently shrinks relative to the
 * icons it is meant to separate.
 *
 * Only the two shapes Maps actually ships are understood — a bare number, and a
 * linear `interpolate` on `zoom` — and anything else falls back to the constant.
 * A misread here is a fan of the wrong size, which is visible; guessing at an
 * exponential base would be a fan of the wrong size that looks deliberate.
 */
export function markerIconScale(value: unknown, zoom: number): number {
	if (typeof value === 'number' && isFinite(value) && value > 0) return value;
	if (!Array.isArray(value) || value[0] !== 'interpolate') return SPREAD.iconScale;
	const [, curve, input] = value as unknown[];
	if (!Array.isArray(curve) || curve[0] !== 'linear') return SPREAD.iconScale;
	if (!Array.isArray(input) || input[0] !== 'zoom') return SPREAD.iconScale;
	const stops: Array<[number, number]> = [];
	for (let i = 3; i + 1 < value.length; i += 2) {
		const at = Number(value[i]);
		const size = Number(value[i + 1]);
		if (isFinite(at) && isFinite(size)) stops.push([at, size]);
	}
	if (stops.length === 0) return SPREAD.iconScale;
	if (zoom <= stops[0][0]) return positive(stops[0][1]);
	for (let i = 1; i < stops.length; i++) {
		const [z0, v0] = stops[i - 1];
		const [z1, v1] = stops[i];
		if (zoom > z1) continue;
		if (z1 === z0) return positive(v1);
		return positive(v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0));
	}
	return positive(stops[stops.length - 1][1]);
}

/**
 * The `icon-offset` the native marker layer is given: closed below
 * `SPREAD.fromZoom`, fully open at `SPREAD.toZoom`, and per-pin in between by
 * the slot each feature carries as `amSlot`.
 *
 * A `match` over integer slots rather than an array-valued feature property,
 * which also works and is a shorter expression. Measured on a live map: an
 * array property does reach the layout evaluation intact, but the *same*
 * property read back through `querySourceFeatures` comes out as the string
 * `"[200,0]"` — the tile is serialized for querying and vector tiles have no
 * array type. Rendering and querying disagreeing about what a property holds is
 * exactly the kind of thing that turns into a silent failure two versions
 * later; an integer means the same thing on both paths.
 *
 * `zoom` may only appear as the input of the outermost `interpolate` or `step`,
 * which is why the ramp wraps the match rather than the other way round. A
 * feature with no `amSlot` — every pin that shares its spot with nobody — falls
 * through to the match's own default and is not moved.
 */
export function iconOffsetExpression(table: ReadonlyArray<readonly [number, number]>, scale: number): unknown {
	if (table.length < 2 || !(scale > 0)) return [0, 0];
	const match: unknown[] = ['match', ['get', 'amSlot']];
	for (let slot = 1; slot < table.length; slot++) {
		const [x, y] = table[slot];
		match.push(slot, ['literal', [round(x / scale), round(y / scale)]]);
	}
	match.push(['literal', [0, 0]]);
	return ['interpolate', ['linear'], ['zoom'], SPREAD.fromZoom, ['literal', [0, 0]], SPREAD.toZoom, match];
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function positive(value: number): number {
	return isFinite(value) && value > 0 ? value : SPREAD.iconScale;
}
