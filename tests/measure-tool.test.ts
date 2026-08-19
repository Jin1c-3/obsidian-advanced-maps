import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureCollection, Point } from 'geojson';
import {
	ENDPOINT_LAYER,
	MARKER_LAYER,
	MEASURE_DRAFT_LAYER,
	MEASURE_LINE_LAYER,
	MEASURE_POINT_LAYER,
	MEASURE_SNAP_LAYER,
	MEASURE_SRC,
	MEASURING_CLASS,
} from '../src/constants';
import { toTileSpace, toWgs84, type CoordSystem } from '../src/coords';
import type { MeasureProps } from '../src/measure';
import { MeasureTool } from '../src/measure-tool';
import type { MapControl, MapLibreMap, MapMouseEvent } from '../src/types/obsidian-internals';

/* The tape coalesces pointer work into an animation frame. Hold the frames
 * rather than wait for them, so a test can say when one happens. */
const frames = new Map<number, () => void>();
let nextFrame = 1;

/** Run everything the tape has put off until the next frame. */
function frame(): void {
	const due = [...frames.values()];
	frames.clear();
	for (const run of due) run();
}

/* Obsidian's own DOM helpers, which happy-dom does not carry. */
beforeAll(() => {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.createEl = function (
		this: HTMLElement,
		tag: string,
		opts?: { text?: string; cls?: string; attr?: Record<string, string> }
	) {
		const el = document.createElement(tag);
		if (opts?.text) el.textContent = opts.text;
		if (opts?.cls) el.className = opts.cls;
		for (const [name, value] of Object.entries(opts?.attr ?? {})) el.setAttribute(name, value);
		this.append(el);
		return el;
	};
	proto.createDiv = function (this: HTMLElement, opts?: { text?: string; cls?: string } | string) {
		const o = typeof opts === 'string' ? { cls: opts } : opts;
		return (proto.createEl as (tag: string, o?: unknown) => HTMLElement).call(this, 'div', o);
	};
	proto.addClass = function (this: HTMLElement, ...cls: string[]) {
		this.classList.add(...cls);
	};
	proto.removeClass = function (this: HTMLElement, ...cls: string[]) {
		this.classList.remove(...cls);
	};
	proto.toggleClass = function (this: HTMLElement, cls: string, on: boolean) {
		this.classList.toggle(cls, on);
	};
	proto.setText = function (this: HTMLElement, text: string) {
		this.textContent = text;
	};
	proto.setCssStyles = function (this: HTMLElement, styles: Record<string, string>) {
		Object.assign(this.style, styles);
	};
	proto.detach = function (this: HTMLElement) {
		this.remove();
	};
	proto.empty = function (this: HTMLElement) {
		this.replaceChildren();
	};
	proto.hasClass = function (this: HTMLElement, cls: string) {
		return this.classList.contains(cls);
	};
	vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
		const id = nextFrame++;
		frames.set(id, cb);
		return id;
	});
	vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
	vi.stubGlobal('createDiv', (cls?: string) => {
		const el = document.createElement('div');
		if (cls) el.className = cls;
		return el;
	});
});

/**
 * Enough MapLibre to take a measurement: a canvas in a container, a style that
 * remembers what was added to it, and events that can be fired by hand.
 */
class FakeMap {
	readonly containerEl = document.createElement('div');
	readonly canvasEl = document.createElement('canvas');
	readonly layers: string[] = [];
	readonly controls: MapControl[] = [];
	source: { setData(data: FeatureCollection): void } | undefined;
	data: FeatureCollection | null = null;
	doubleClickZoomOn = true;
	/** Pixels the camera has been panned by, so a move can actually move something. */
	panX = 0;
	private readonly listeners = new Map<string, Set<(ev: unknown) => void>>();

	readonly doubleClickZoom = {
		disable: () => {
			this.doubleClickZoomOn = false;
		},
		enable: () => {
			this.doubleClickZoomOn = true;
		},
		isEnabled: () => this.doubleClickZoomOn,
	};

	constructor() {
		this.containerEl.append(this.canvasEl);
	}

	getCanvas(): HTMLCanvasElement {
		return this.canvasEl;
	}

	getStyle(): unknown {
		return {};
	}

	getSource(id: string): unknown {
		return id === MEASURE_SRC ? this.source : undefined;
	}

	addSource(id: string, spec: { data: FeatureCollection }): void {
		if (id !== MEASURE_SRC) return;
		this.data = spec.data;
		this.source = {
			setData: (data: FeatureCollection) => {
				this.data = data;
			},
		};
	}

	removeSource(id: string): void {
		if (id === MEASURE_SRC) this.source = undefined;
	}

	getLayer(id: string): unknown {
		return this.layers.includes(id) || this.drawn.some((f) => f.layer === id) ? { id } : undefined;
	}

	/** Points other layers have drawn, in the datum the map draws in. */
	readonly drawn: Array<{ layer: string; at: [number, number] }> = [];
	/** How many times the tape has asked what is under the pointer. */
	queries = 0;
	/** A style torn down between the pointer sample and the query. */
	queryThrows = false;

	queryRenderedFeatures(box: unknown, opts?: { layers?: string[] }): unknown[] {
		this.queries++;
		if (this.queryThrows) throw new Error('style is gone');
		const [[left, top], [right, bottom]] = box as [[number, number], [number, number]];
		const wanted = new Set(opts?.layers ?? []);
		return this.drawn
			.filter((f) => wanted.has(f.layer))
			.filter((f) => {
				// Hit-tested where it is drawn, which is what MapLibre answers about.
				const at = this.project(f.at);
				return at.x >= left && at.x <= right && at.y >= top && at.y <= bottom;
			})
			.map((f) => ({ geometry: { type: 'Point', coordinates: f.at } }));
	}

	addLayer(spec: { id: string }): void {
		this.layers.push(spec.id);
	}

	removeLayer(id: string): void {
		const at = this.layers.indexOf(id);
		if (at >= 0) this.layers.splice(at, 1);
	}

	addControl(control: MapControl): void {
		this.controls.push(control);
		this.containerEl.append(control.onAdd());
	}

	removeControl(control: MapControl): void {
		const at = this.controls.indexOf(control);
		if (at >= 0) this.controls.splice(at, 1);
		control.onRemove();
	}

	on(type: string, listener: (ev: unknown) => void): void {
		const set = this.listeners.get(type) ?? new Set();
		set.add(listener);
		this.listeners.set(type, set);
	}

	off(type: string, listener: (ev: unknown) => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	project(coordinate: [number, number]): { x: number; y: number } {
		// Enough to be a projection: monotonic in both axes and never negative.
		return { x: (coordinate[0] + 180) * 10 + this.panX, y: (90 - coordinate[1]) * 10 };
	}

	/** How many listeners are outstanding, which is what teardown has to zero. */
	bound(): number {
		let total = 0;
		for (const set of this.listeners.values()) total += set.size;
		return total;
	}

	fire(type: string, ev: unknown = {}): void {
		for (const listener of [...(this.listeners.get(type) ?? [])]) listener(ev);
	}

	asMap(): MapLibreMap {
		return this as unknown as MapLibreMap;
	}
}

/** A click at a place, as MapLibre reports it — in the datum the tiles are in. */
function clickAt(map: FakeMap, system: CoordSystem, lng: number, lat: number): void {
	const [tileLng, tileLat] = toTileSpace(system, lng, lat);
	map.fire('click', { lngLat: { lng: tileLng, lat: tileLat } } satisfies MapMouseEvent);
}

/** Shanghai, and a place a shade over 800 m from it. */
const A: [number, number] = [121.4901, 31.2397];
const B: [number, number] = [121.4952, 31.2455];

let map: FakeMap;
let system: CoordSystem;
let told: boolean[];
/** The second half of what the button is told: whether the readout is showing. */
let opened: boolean[];
let tool: MeasureTool;
/** Stands in for the drawer the measuring button opens beside itself. */
let drawerEl: HTMLElement;

beforeEach(() => {
	frames.clear();
	map = new FakeMap();
	system = 'wgs84';
	told = [];
	opened = [];
	drawerEl = map.containerEl.createDiv('advanced-maps-measure-drawer');
	tool = new MeasureTool(
		map.asMap(),
		() => system,
		(active, open) => {
			told.push(active);
			opened.push(open);
		},
		() => drawerEl
	);
});

function labels(): string[] {
	return [...map.containerEl.querySelectorAll('.advanced-maps-measure-label')].map((el) => el.textContent ?? '');
}

function readout(): string {
	return map.containerEl.querySelector('.advanced-maps-measure-value')?.textContent ?? '';
}

describe('taking the tape out and putting it away', () => {
	it('draws nothing until it is asked for', () => {
		expect(tool.isActive()).toBe(false);
		tool.redraw();
		expect(map.layers).toEqual([]);
		expect(map.getSource(MEASURE_SRC)).toBeUndefined();
	});

	it('claims the map, and says so to the button', () => {
		tool.press();
		expect(tool.isActive()).toBe(true);
		expect(told).toEqual([true]);
		expect(map.layers).toEqual([MEASURE_LINE_LAYER, MEASURE_DRAFT_LAYER, MEASURE_POINT_LAYER, MEASURE_SNAP_LAYER]);
		expect(map.canvasEl.classList.contains(MEASURING_CLASS)).toBe(true);
		expect(map.doubleClickZoomOn).toBe(false);
		// The readout is in the button's drawer rather than in a corner of its own.
		expect(map.controls).toEqual([]);
		expect(drawerEl.hasClass('is-open')).toBe(true);
		expect(readout()).not.toBe('');
	});

	it('hands everything back on the way out', () => {
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		expect(map.bound()).toBeGreaterThan(0);

		tool.stop();
		expect(tool.isActive()).toBe(false);
		expect(told).toEqual([true, false]);
		// Every `on` paired with its `off`, or a put-away tape wakes up on the
		// next click of a map that is still very much alive.
		expect(map.bound()).toBe(0);
		expect(map.layers).toEqual([]);
		expect(map.getSource(MEASURE_SRC)).toBeUndefined();
		expect(map.canvasEl.classList.contains(MEASURING_CLASS)).toBe(false);
		expect(map.doubleClickZoomOn).toBe(true);
		// The drawer is emptied and closed; the element itself belongs to the
		// button, which the tape never owned and must leave standing.
		expect(drawerEl.parentElement).toBe(map.containerEl);
		expect(drawerEl.hasClass('is-open')).toBe(false);
		expect(drawerEl.childElementCount).toBe(0);
		expect(labels()).toEqual([]);
	});

	it('folds the readout away and back without ending the measurement', () => {
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		const measured = readout();
		expect(measured).not.toBe('');

		// The button no longer ends a measurement, so a drawer that is open can be
		// closed — which is the whole difference between a drawer and a panel.
		tool.press();
		expect(tool.isActive()).toBe(true);
		expect(drawerEl.hasClass('is-open')).toBe(false);
		expect(readout()).toBe('');
		// Everything the measurement is remains on the map.
		expect(labels()).toHaveLength(1);
		expect(map.layers).toEqual([MEASURE_LINE_LAYER, MEASURE_DRAFT_LAYER, MEASURE_POINT_LAYER, MEASURE_SNAP_LAYER]);
		expect(told).toEqual([true, true]);
		expect(opened).toEqual([true, false]);

		// Opened again on what is measured now, not on the zero it started at.
		tool.press();
		expect(drawerEl.hasClass('is-open')).toBe(true);
		expect(readout()).toBe(measured);
		expect(opened).toEqual([true, false, true]);
	});

	it('keeps measuring while its readout is folded away', () => {
		tool.press();
		clickAt(map, system, ...A);
		tool.press();
		// A click with the drawer closed is still a point, and the label beside it
		// is where the figure is until the drawer comes back.
		clickAt(map, system, ...B);
		expect(labels()).toHaveLength(1);
		tool.press();
		expect(readout()).toBe(labels()[0]);
	});

	it('ends the measurement from the readout rather than from the button', () => {
		tool.press();
		clickAt(map, system, ...A);
		const done = [...map.containerEl.querySelectorAll('.advanced-maps-measure-action')].at(-1);
		done?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(tool.isActive()).toBe(false);
		expect(map.layers).toEqual([]);
		expect(drawerEl.hasClass('is-open')).toBe(false);
	});

	it('measures on with no drawer to draw a readout into', () => {
		// The button can be taken off the map — its setting switched off — while
		// this tool is still being disposed, and a tape with no readout still has
		// its labels.
		const orphan = new MeasureTool(
			map.asMap(),
			() => system,
			(active, open) => {
				told.push(active);
				opened.push(open);
			},
			() => null
		);
		orphan.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		expect(labels()).toHaveLength(1);
		expect(() => orphan.dispose()).not.toThrow();
		expect(map.bound()).toBe(0);
	});

	it('leaves a double-click zoom the reader had already turned off alone', () => {
		map.doubleClickZoomOn = false;
		tool.press();
		expect(map.doubleClickZoomOn).toBe(false);
		tool.stop();
		// Turned back *on* would be this plugin changing a native setting behind them.
		expect(map.doubleClickZoomOn).toBe(false);
	});

	it('forgets the measurement between one use and the next', () => {
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		tool.stop();
		tool.press();
		expect(labels()).toEqual([]);
		expect(map.data?.features).toEqual([]);
	});

	it('is disposed of by putting it away', () => {
		tool.press();
		tool.dispose();
		expect(tool.isActive()).toBe(false);
		expect(map.bound()).toBe(0);
		expect(map.layers).toEqual([]);
	});
});

describe('measuring', () => {
	it('says what to do until there are two points to measure between', () => {
		tool.press();
		const hint = readout();
		clickAt(map, system, ...A);
		expect(readout()).toBe(hint);
		expect(labels()).toEqual([]);

		clickAt(map, system, ...B);
		expect(readout()).toBe('807 m');
		expect(labels()).toEqual(['807 m']);
	});

	it('previews the leg under the pointer without counting it', () => {
		tool.press();
		clickAt(map, system, ...A);
		// The preview is coalesced into a frame; run it rather than wait for it.
		map.fire('mousemove', { lngLat: { lng: B[0], lat: B[1] } });
		frame();
		expect(labels()).toEqual(['807 m']);
		expect(map.containerEl.querySelector('.advanced-maps-measure-label.is-draft')).not.toBeNull();
		// Nothing has been placed but the first point, so nothing is measured yet.
		expect(readout()).not.toBe('807 m');
	});

	it('draws nothing for a pointer over open ground before the first point', () => {
		tool.press();
		map.fire('mousemove', { lngLat: { lng: B[0], lat: B[1] } });
		frame();
		expect(labels()).toEqual([]);
		expect(map.data?.features).toEqual([]);
	});

	it('takes back the last point, and stops at an empty tape', () => {
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		tool.undo();
		expect(labels()).toEqual([]);
		tool.undo();
		tool.undo();
		expect(tool.isActive()).toBe(true);
		expect(map.data?.features).toEqual([]);
	});

	it('refuses a click the map could not place', () => {
		tool.press();
		map.fire('click', { lngLat: { lng: Number.NaN, lat: 31 } });
		map.fire('click', {});
		expect(map.data?.features).toEqual([]);
	});

	it('puts the tape away on Escape and takes a point back on Backspace', () => {
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);

		map.containerEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
		expect(labels()).toEqual([]);
		expect(tool.isActive()).toBe(true);

		map.containerEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(tool.isActive()).toBe(false);
		expect(told).toEqual([true, false]);
	});

	it('leaves every other key to the map and to Obsidian', () => {
		tool.press();
		clickAt(map, system, ...A);
		const ev = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
		map.containerEl.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(false);
		expect(tool.isActive()).toBe(true);
	});
});

describe('the datum the tape holds', () => {
	it('measures the world even where the tiles are offset from it', () => {
		system = 'gcj02';
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		// The same two places, so the same answer as on a WGS-84 background —
		// measuring the offset copies would answer for a pair nobody clicked.
		expect(readout()).toBe('807 m');
	});

	it('redraws the same places where the new tiles put them', () => {
		system = 'gcj02';
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		const before = JSON.parse(JSON.stringify(map.data)) as FeatureCollection;

		system = 'wgs84';
		tool.redraw();
		const after = map.data as FeatureCollection;
		// Drawn somewhere else…
		expect(after.features[0]).not.toEqual(before.features[0]);
		// …at the coordinates the reader clicked, which are what was kept.
		expect((after.features[0].geometry as { coordinates: number[][] }).coordinates[0][0]).toBeCloseTo(A[0], 9);
		// …and still the same distance apart.
		expect(readout()).toBe('807 m');
	});
});

describe('the labels over the canvas', () => {
	it('places each one at its own vertex, and flips one near the top edge', () => {
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		const label = map.containerEl.querySelector('.advanced-maps-measure-label') as HTMLElement;
		const at = map.project([B[0], B[1]]);
		expect(label.style.left).toBe(`${at.x}px`);
		expect(label.style.top).toBe(`${at.y}px`);
		expect(label.classList.contains('is-below')).toBe(false);
	});

	it('moves them with the camera', () => {
		tool.press();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		const label = map.containerEl.querySelector('.advanced-maps-measure-label') as HTMLElement;
		const before = label.style.left;
		map.panX = 50;
		map.fire('move');
		expect(label.style.left).toBe(`${Number.parseFloat(before) + 50}px`);
	});

	it('goes quiet when the pointer leaves the map', () => {
		tool.press();
		clickAt(map, system, ...A);
		map.fire('mousemove', { lngLat: { lng: B[0], lat: B[1] } });
		frame();
		expect(labels()).toHaveLength(1);
		map.fire('mouseout');
		frame();
		expect(labels()).toEqual([]);
	});
});

/* ---- taking a point already on the map ---- */

/** Far enough apart to be told apart: the fake projection is 10 px a degree. */
const P: [number, number] = [0, 0];
const Q: [number, number] = [3, 0];
const R: [number, number] = [0, 3];

/**
 * A pointer sample as MapLibre reports one: a coordinate in the datum the tiles
 * are drawn in, and the pixel it landed on.
 */
function sampleAt(lng: number, lat: number, alt = false): MapMouseEvent {
	const tile = toTileSpace(system, lng, lat);
	return {
		lngLat: { lng: tile[0], lat: tile[1] },
		point: map.project(tile),
		originalEvent: { altKey: alt } as MouseEvent,
	};
}

/** Every point placed, back in vault space — which is what a reader measures in. */
function placed(): Array<[number, number]> {
	return (map.data?.features ?? [])
		.filter((f) => (f.properties as MeasureProps | null)?.amMeasure === 'vertex')
		.map((f) => {
			const [lng, lat] = (f.geometry as Point).coordinates;
			return toWgs84(system, lng, lat);
		});
}

/** Whether the map is offering a point to the pointer. */
function ringed(): boolean {
	return (map.data?.features ?? []).some((f) => (f.properties as MeasureProps | null)?.amMeasure === 'snap');
}

/** Stage a point on a layer of the map, where a query will find it. */
function draw(layer: string, lng: number, lat: number): void {
	map.drawn.push({ layer, at: toTileSpace(system, lng, lat) });
}

describe('taking a point already on the map', () => {
	it('takes a pin the pointer is near, rather than the pixel beside it', () => {
		draw(MARKER_LAYER, ...Q);
		tool.press();
		map.fire('click', sampleAt(...P));
		// A shade off the pin: 0.8 px in the fake projection, well inside the box.
		map.fire('click', sampleAt(3.08, 0));
		expect(placed()[1]).toEqual(Q);
	});

	it('takes the coordinate behind a pin drawn on a Chinese background', () => {
		system = 'gcj02';
		const beijing: [number, number] = [116.3975, 39.9087];
		draw(MARKER_LAYER, ...beijing);
		tool.press();
		map.fire('click', sampleAt(116.44, 39.9087));
		// The note's own WGS-84 coordinate, not the offset copy its pin is drawn at.
		expect(placed()[0][0]).toBeCloseTo(beijing[0], 9);
		expect(placed()[0][1]).toBeCloseTo(beijing[1], 9);
	});

	it('offers the point before the click that takes it, and stops offering it', () => {
		draw(ENDPOINT_LAYER, ...Q);
		tool.press();
		map.fire('mousemove', sampleAt(3.05, 0));
		frame();
		expect(ringed()).toBe(true);
		map.fire('mousemove', sampleAt(1.5, 0));
		frame();
		expect(ringed()).toBe(false);
	});

	it('offers the nearer of two points within range', () => {
		draw(MARKER_LAYER, 3.1, 0);
		draw(ENDPOINT_LAYER, ...Q);
		tool.press();
		map.fire('click', sampleAt(3.02, 0));
		expect(placed()[0]).toEqual(Q);
	});

	it('closes a measurement on the point it started at', () => {
		tool.press();
		map.fire('click', sampleAt(...P));
		map.fire('click', sampleAt(...Q));
		map.fire('click', sampleAt(...R));
		map.fire('click', sampleAt(0.4, 0));
		expect(placed()[3]).toEqual(P);
	});

	it('does not offer the point just placed', () => {
		tool.press();
		map.fire('click', sampleAt(...P));
		map.fire('click', sampleAt(...Q));
		map.fire('mousemove', sampleAt(3.02, 0));
		frame();
		// A leg from a point to itself is not a measurement.
		expect(ringed()).toBe(false);
	});

	it('takes the bare pixel while the bypass key is held', () => {
		draw(MARKER_LAYER, ...Q);
		tool.press();
		map.fire('click', sampleAt(3.08, 0, true));
		expect(placed()[0][0]).toBeCloseTo(3.08, 9);
		expect(map.queries).toBe(0);
	});

	it('asks nothing of a map that has drawn none of those layers', () => {
		tool.press();
		map.fire('click', sampleAt(...P));
		expect(map.queries).toBe(0);
		expect(placed()).toEqual([P]);
	});

	it('places the pixel when the style goes away under the query', () => {
		draw(MARKER_LAYER, ...Q);
		map.queryThrows = true;
		tool.press();
		map.fire('click', sampleAt(3.08, 0));
		expect(placed()[0][0]).toBeCloseTo(3.08, 9);
	});

	it('asks once a frame however often the pointer moves', () => {
		draw(MARKER_LAYER, ...Q);
		tool.press();
		map.fire('click', sampleAt(...P));
		const before = map.queries;
		for (let i = 0; i < 8; i++) map.fire('mousemove', sampleAt(1 + i / 100, 0));
		frame();
		expect(map.queries - before).toBe(1);
	});
});
