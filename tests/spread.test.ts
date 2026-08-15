import { describe, expect, it } from 'vitest';
import { SPREAD } from '../src/constants';
import {
	iconOffsetExpression,
	markerIconScale,
	mercator,
	spreadFactor,
	spreadPins,
	spreadSlots,
	type SpreadPin,
} from '../src/spread';

/** How far apart two coordinates render at a zoom, in CSS px — the same
 *  `512 * 2^zoom` world the module works in, restated here rather than imported
 *  so a change to that constant has to be argued with a failing test. */
function pixelsApart(a: SpreadPin, b: SpreadPin, zoom: number): number {
	const [ax, ay] = mercator(a.lng, a.lat);
	const [bx, by] = mercator(b.lng, b.lat);
	return Math.hypot(ax - bx, ay - by) * 512 * Math.pow(2, zoom);
}

/** A pin at the same place as another, `metres` north of it. */
function north(pin: SpreadPin, key: string, metres: number): SpreadPin {
	return { key, lng: pin.lng, lat: pin.lat + metres / 111320 };
}

describe('mercator', () => {
	it('puts the origin in the middle and the prime meridian at a half', () => {
		const [x, y] = mercator(0, 0);
		expect(x).toBeCloseTo(0.5, 12);
		expect(y).toBeCloseTo(0.5, 12);
	});

	it('runs west to east and north to south', () => {
		expect(mercator(-180, 0)[0]).toBeCloseTo(0, 12);
		expect(mercator(180, 0)[0]).toBeCloseTo(1, 12);
		expect(mercator(0, 60)[1]).toBeLessThan(0.5);
		expect(mercator(0, -60)[1]).toBeGreaterThan(0.5);
	});

	it('clamps past the Mercator limit rather than running away', () => {
		expect(mercator(0, 90)[1]).toBeCloseTo(mercator(0, 85.051129)[1], 9);
		expect(mercator(0, -90)[1]).toBeCloseTo(mercator(0, -85.051129)[1], 9);
		expect(isFinite(mercator(0, 90)[1])).toBe(true);
	});

	it('agrees with MapLibre on how wide the world is', () => {
		// Measured on a live map: 0.01° of longitude at zoom 14 projected
		// 233.0169 px apart, which is this multiplied by 512 * 2^14.
		const apart = pixelsApart({ key: 'a', lng: 116, lat: 30 }, { key: 'b', lng: 116.01, lat: 30 }, 14);
		expect(apart).toBeCloseTo(233.017, 2);
	});
});

describe('spreadSlots', () => {
	it('has nothing to say about a pin that shares its spot with nobody', () => {
		expect(spreadSlots(1)).toEqual([]);
		expect(spreadSlots(0)).toEqual([]);
		expect(spreadSlots(Number.NaN)).toEqual([]);
	});

	it('puts two pins on opposite sides of the tightest ring', () => {
		const slots = spreadSlots(2);
		expect(slots).toHaveLength(2);
		for (const [x, y] of slots) expect(Math.hypot(x, y)).toBeCloseTo(SPREAD.ringMinPx, 1);
		expect(Math.hypot(slots[0][0] - slots[1][0], slots[0][1] - slots[1][1])).toBeCloseTo(2 * SPREAD.ringMinPx, 1);
	});

	it('widens the ring so neighbours stay a step apart', () => {
		const slots = spreadSlots(9);
		expect(slots).toHaveLength(9);
		for (let i = 0; i < slots.length; i++) {
			const [x, y] = slots[i];
			const [nx, ny] = slots[(i + 1) % slots.length];
			expect(Math.hypot(x - nx, y - ny)).toBeGreaterThanOrEqual(SPREAD.ringStepPx - 1);
		}
	});

	it('never leaves two pins on the same pixel, however many there are', () => {
		for (const count of [2, 3, 5, 9, 12, 30, 64]) {
			const slots = spreadSlots(count);
			expect(slots).toHaveLength(count);
			const seen = new Set(slots.map(([x, y]) => `${x},${y}`));
			expect(seen.size).toBe(count);
		}
	});

	it('opens a second ring rather than growing one without limit', () => {
		const slots = spreadSlots(64);
		const radii = slots.map(([x, y]) => Math.hypot(x, y));
		expect(Math.max(...radii)).toBeGreaterThan(SPREAD.ringMaxPx);
		// …but only by whole steps, not by however far 64 pins would need.
		expect(Math.max(...radii)).toBeLessThan((64 * SPREAD.ringStepPx) / (2 * Math.PI));
	});
});

describe('spreadPins', () => {
	const here: SpreadPin = { key: 'notes/a.md', lng: 120.1, lat: 30.2 };

	it('leaves a lone pin alone', () => {
		expect(spreadPins([here]).pins.size).toBe(0);
		expect(spreadPins([]).table).toEqual([[0, 0]]);
	});

	it('fans notes that share a coordinate exactly', () => {
		const pins = [here, { ...here, key: 'notes/b.md' }, { ...here, key: 'notes/c.md' }];
		const plan = spreadPins(pins);
		expect(plan.pins.size).toBe(3);
		const placed = pins.map((pin) => plan.pins.get(pin.key)!);
		expect(new Set(placed.map((p) => p.slot)).size).toBe(3);
		// The slot and the offset are two readings of one answer, so they have to
		// agree: `table[slot]` is what the style will draw, `offset` is what the
		// hover card will follow.
		for (const { slot, offset } of placed) expect(plan.table[slot]).toEqual(offset);
		for (const { offset } of placed) expect(Math.hypot(...offset)).toBeCloseTo(SPREAD.ringMinPx, 1);
	});

	it('leaves pins that are already far enough apart where they are', () => {
		// One `groupPx` at `toZoom` is the whole of the rule; well past it is not
		// a group, whatever the ground distance happens to be at this latitude.
		const far = north(here, 'notes/b.md', 200);
		expect(pixelsApart(here, far, SPREAD.toZoom)).toBeGreaterThan(SPREAD.groupPx);
		expect(spreadPins([here, far]).pins.size).toBe(0);
	});

	it('fans pins that are merely close, not only identical ones', () => {
		const near = north(here, 'notes/b.md', 4);
		expect(pixelsApart(here, near, SPREAD.toZoom)).toBeLessThan(SPREAD.groupPx);
		expect(spreadPins([here, near]).pins.size).toBe(2);
	});

	it('keeps groups apart from each other', () => {
		const other: SpreadPin = { key: 'notes/c.md', lng: 121.5, lat: 31.2 };
		const plan = spreadPins([here, { ...here, key: 'notes/b.md' }, other, { ...other, key: 'notes/d.md' }]);
		expect(plan.pins.size).toBe(4);
		// Two pins each, so both fans use the tightest ring — and the same two
		// offsets, which is the whole point of a table of distinct offsets.
		expect(plan.table).toHaveLength(3);
	});

	it('gives one note the same slot however the base is sorted', () => {
		const pins = ['a', 'b', 'c', 'd'].map((name) => ({ ...here, key: `notes/${name}.md` }));
		const forwards = spreadPins(pins);
		const backwards = spreadPins([...pins].reverse());
		for (const pin of pins) {
			expect(backwards.pins.get(pin.key)).toEqual(forwards.pins.get(pin.key));
		}
	});

	it('does not chain a line of pins into one enormous group', () => {
		// Each one just inside reach of the last, the whole way along: single
		// linkage would answer one group of twelve, leader clustering does not.
		const line: SpreadPin[] = [];
		for (let i = 0; i < 12; i++) line.push(north(here, `notes/${String(i).padStart(2, '0')}.md`, i * 4));
		expect(pixelsApart(line[0], line[1], SPREAD.toZoom)).toBeLessThan(SPREAD.groupPx);
		const plan = spreadPins(line);
		expect(plan.pins.size).toBe(12);
		// Six pairs, so the only offsets in play are the two ends of the tightest
		// ring — where one group of twelve would have needed a ring three times
		// as wide and would have moved the far ends of the line onto each other.
		expect(plan.table).toHaveLength(3);
		for (const [x, y] of plan.table.slice(1)) expect(Math.hypot(x, y)).toBeCloseTo(SPREAD.ringMinPx, 1);
	});

	it('steps over a pin with no usable coordinate', () => {
		const broken: SpreadPin = { key: 'notes/z.md', lng: Number.NaN, lat: 30.2 };
		const plan = spreadPins([here, { ...here, key: 'notes/b.md' }, broken]);
		expect(plan.pins.size).toBe(2);
		expect(plan.pins.has('notes/z.md')).toBe(false);
	});
});

describe('spreadFactor', () => {
	it('is shut below the opening zoom and open from it', () => {
		expect(spreadFactor(SPREAD.fromZoom - 3)).toBe(0);
		expect(spreadFactor(SPREAD.fromZoom - 0.1)).toBe(0);
		// The zoom the setting names is the zoom something happens at.
		expect(spreadFactor(SPREAD.fromZoom)).toBeGreaterThan(0);
		expect(spreadFactor(SPREAD.toZoom)).toBe(1);
		expect(spreadFactor(SPREAD.toZoom + 4)).toBe(1);
		expect(spreadFactor(Number.NaN)).toBe(0);
	});

	it('opens by one even step per whole zoom level', () => {
		const levels = [];
		for (let level = SPREAD.fromZoom; level <= SPREAD.toZoom; level++) levels.push(spreadFactor(level));
		const steps = SPREAD.toZoom - SPREAD.fromZoom + 1;
		expect(levels).toEqual(levels.map((_, i) => (i + 1) / steps));
	});

	it('holds one value across a whole zoom level, because that is all the renderer bakes', () => {
		// `icon-offset` is a layout property, evaluated once per tile at that
		// tile's whole zoom — a factor that drifted with the fraction would be
		// placing hover cards where no pin was ever drawn.
		expect(spreadFactor(SPREAD.fromZoom + 0.9)).toBe(spreadFactor(SPREAD.fromZoom));
		expect(spreadFactor(SPREAD.fromZoom + 1)).not.toBe(spreadFactor(SPREAD.fromZoom));
	});
});

describe('markerIconScale', () => {
	// The native marker layer's own value, read off a running Obsidian.
	const native = ['interpolate', ['linear'], ['zoom'], 0, 0.12, 4, 0.18, 14, 0.22, 18, 0.24];

	it('reads the native curve at a zoom', () => {
		expect(markerIconScale(native, 18)).toBeCloseTo(0.24, 12);
		expect(markerIconScale(native, 20)).toBeCloseTo(0.24, 12);
		expect(markerIconScale(native, 0)).toBeCloseTo(0.12, 12);
		expect(markerIconScale(native, -1)).toBeCloseTo(0.12, 12);
		// The measured case: an offset of 200 landed 47 px away at zoom 17.
		expect(markerIconScale(native, 17)).toBeCloseTo(0.235, 12);
	});

	it('takes a plain number as it stands', () => {
		expect(markerIconScale(0.5, 18)).toBe(0.5);
	});

	it('falls back rather than guessing at a shape it does not know', () => {
		expect(markerIconScale(undefined, 18)).toBe(SPREAD.iconScale);
		expect(markerIconScale(0, 18)).toBe(SPREAD.iconScale);
		expect(markerIconScale(-2, 18)).toBe(SPREAD.iconScale);
		expect(markerIconScale(['get', 'size'], 18)).toBe(SPREAD.iconScale);
		// An exponential curve is not read as a linear one.
		expect(markerIconScale(['interpolate', ['exponential', 2], ['zoom'], 0, 1, 18, 2], 9)).toBe(SPREAD.iconScale);
		// …nor is one keyed on anything but the zoom.
		expect(markerIconScale(['interpolate', ['linear'], ['get', 'n'], 0, 1, 18, 2], 9)).toBe(SPREAD.iconScale);
		expect(markerIconScale(['interpolate', ['linear'], ['zoom']], 9)).toBe(SPREAD.iconScale);
		expect(markerIconScale(['interpolate', ['linear'], ['zoom'], 4, 0, 18, 0], 9)).toBe(SPREAD.iconScale);
	});

	it('answers a stop it lands exactly on', () => {
		expect(markerIconScale(['interpolate', ['linear'], ['zoom'], 4, 0.2, 4, 0.4], 4)).toBeCloseTo(0.2, 12);
	});
});

/** The slot table one `['step', ['zoom'], shut, level, match, …]` branch carries. */
function branchAt(expr: unknown, level: number): unknown[] {
	const parts = expr as unknown[];
	return parts[parts.indexOf(level) + 1] as unknown[];
}

describe('iconOffsetExpression', () => {
	it('is the native default when there is nothing to fan', () => {
		expect(iconOffsetExpression([[0, 0]], 0.24)).toEqual([0, 0]);
		expect(iconOffsetExpression([], 0.24)).toEqual([0, 0]);
	});

	it('falls back to the assumed icon size rather than to no fan at all', () => {
		// An icon size that cannot be read is `markerIconScale`'s question, and it
		// answers it with SPREAD.iconScale — the same answer this layer has always
		// been drawn with when the native layout expression changed shape.
		const table: Array<[number, number]> = [
			[0, 0],
			[24, 0],
		];
		expect(iconOffsetExpression(table, 0)).toEqual(iconOffsetExpression(table, SPREAD.iconScale));
	});

	it('steps at whole zooms rather than pretending to interpolate', () => {
		const expr = iconOffsetExpression(
			[
				[0, 0],
				[24, 0],
			],
			0.24
		) as unknown[];
		expect(expr[0]).toBe('step');
		expect(expr[1]).toEqual(['zoom']);
		// Below the first stop nothing is moved at all.
		expect(expr[2]).toEqual(['literal', [0, 0]]);
		const levels = expr.filter((part) => typeof part === 'number');
		const whole = [];
		for (let level = SPREAD.fromZoom; level <= SPREAD.toZoom; level++) whole.push(level);
		expect(levels).toEqual(whole);
	});

	it('divides the table out by the icon size MapLibre will multiply it back by', () => {
		const expr = iconOffsetExpression(
			[
				[0, 0],
				[24, -12],
			],
			0.24
		);
		const match = branchAt(expr, SPREAD.toZoom);
		expect(match[0]).toBe('match');
		expect(match[1]).toEqual(['get', 'amSlot']);
		expect(match[2]).toBe(1);
		expect(match[3]).toEqual(['literal', [100, -50]]);
		// …and a slot nobody carries falls through to "do not move it".
		expect(match[match.length - 1]).toEqual(['literal', [0, 0]]);
	});

	it('writes one branch per distinct offset, in slot order', () => {
		const table: Array<[number, number]> = [
			[0, 0],
			[24, 0],
			[-24, 0],
			[0, 24],
		];
		const match = branchAt(iconOffsetExpression(table, 1), SPREAD.toZoom);
		expect(match.slice(2, -1)).toEqual([
			1,
			['literal', [24, 0]],
			2,
			['literal', [-24, 0]],
			3,
			['literal', [0, 24]],
		]);
	});

	it('opens the fan at the zoom the setting names, in steps to full', () => {
		const table: Array<[number, number]> = [
			[0, 0],
			[100, 0],
		];
		const expr = iconOffsetExpression(table, 1);
		const at = (level: number) => (branchAt(expr, level)[3] as [string, [number, number]])[1][0];
		expect(at(SPREAD.fromZoom)).toBeGreaterThan(0);
		expect(at(SPREAD.toZoom)).toBe(100);
		for (let level = SPREAD.fromZoom; level < SPREAD.toZoom; level++) {
			expect(at(level + 1)).toBeGreaterThan(at(level));
		}
	});
});

describe('the pin the renderer draws and the pin the hover card assumes', () => {
	// The native marker layer's own value, read off a running Obsidian: a curve,
	// so the icon size at the open end of the ramp is not the one at its start.
	const native = ['interpolate', ['linear'], ['zoom'], 0, 0.12, 4, 0.18, 14, 0.22, 18, 0.24];
	const offset: [number, number] = [24, -12];
	const table: Array<[number, number]> = [[0, 0], offset];

	/** Where MapLibre puts the icon, in CSS px: the baked offset for the tile's
	 *  whole zoom, times the icon size it evaluates at that same zoom. */
	function drawnAt(camera: number): [number, number] {
		// How `step` reads: the last stop at or below the tile's whole zoom, which
		// past `toZoom` is `toZoom` itself — as are the tiles, overscaled from it.
		const level = Math.min(Math.floor(camera), SPREAD.toZoom);
		const literal = branchAt(iconOffsetExpression(table, native), level)[3] as [string, [number, number]];
		const scale = markerIconScale(native, level);
		return [literal[1][0] * scale, literal[1][1] * scale];
	}

	/** Where `fanned()` puts the card, in CSS px, for the same camera. */
	function cardAt(camera: number): [number, number] {
		const factor = spreadFactor(camera);
		return [offset[0] * factor, offset[1] * factor];
	}

	it('agree at every camera zoom across the ramp, not only at its ends', () => {
		for (const camera of [15, 15.4, 15.99, 16, 16.5, 17, 17.5, 18, 19.25]) {
			const [dx, dy] = drawnAt(camera);
			const [cx, cy] = cardAt(camera);
			// Within the two decimals the slot literals are rounded to.
			expect(dx).toBeCloseTo(cx, 1);
			expect(dy).toBeCloseTo(cy, 1);
		}
	});
});
