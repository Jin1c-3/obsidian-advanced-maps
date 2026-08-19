import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import {
	MEASURE_DRAFT_LAYER,
	MEASURE_LINE_LAYER,
	MEASURE_POINT_LAYER,
	MEASURE_SRC,
	MEASURING_CLASS,
} from '../src/constants';
import { toTileSpace, type CoordSystem } from '../src/coords';
import { MeasureTool } from '../src/measure-tool';
import type { MapControl, MapLibreMap, MapMouseEvent } from '../src/types/obsidian-internals';

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
		return this.layers.includes(id) ? { id } : undefined;
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
let tool: MeasureTool;

beforeEach(() => {
	map = new FakeMap();
	system = 'wgs84';
	told = [];
	tool = new MeasureTool(
		map.asMap(),
		() => system,
		(on) => told.push(on)
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
		tool.toggle();
		expect(tool.isActive()).toBe(true);
		expect(told).toEqual([true]);
		expect(map.layers).toEqual([MEASURE_LINE_LAYER, MEASURE_DRAFT_LAYER, MEASURE_POINT_LAYER]);
		expect(map.canvasEl.classList.contains(MEASURING_CLASS)).toBe(true);
		expect(map.doubleClickZoomOn).toBe(false);
		expect(map.controls).toHaveLength(1);
		expect(readout()).not.toBe('');
	});

	it('hands everything back on the way out', () => {
		tool.toggle();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		expect(map.bound()).toBeGreaterThan(0);

		tool.toggle();
		expect(tool.isActive()).toBe(false);
		expect(told).toEqual([true, false]);
		// Every `on` paired with its `off`, or a put-away tape wakes up on the
		// next click of a map that is still very much alive.
		expect(map.bound()).toBe(0);
		expect(map.layers).toEqual([]);
		expect(map.getSource(MEASURE_SRC)).toBeUndefined();
		expect(map.canvasEl.classList.contains(MEASURING_CLASS)).toBe(false);
		expect(map.doubleClickZoomOn).toBe(true);
		expect(map.controls).toEqual([]);
		expect(labels()).toEqual([]);
	});

	it('leaves a double-click zoom the reader had already turned off alone', () => {
		map.doubleClickZoomOn = false;
		tool.toggle();
		expect(map.doubleClickZoomOn).toBe(false);
		tool.toggle();
		// Turned back *on* would be this plugin changing a native setting behind them.
		expect(map.doubleClickZoomOn).toBe(false);
	});

	it('forgets the measurement between one use and the next', () => {
		tool.toggle();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		tool.toggle();
		tool.toggle();
		expect(labels()).toEqual([]);
		expect(map.data?.features).toEqual([]);
	});

	it('is disposed of by putting it away', () => {
		tool.toggle();
		tool.dispose();
		expect(tool.isActive()).toBe(false);
		expect(map.bound()).toBe(0);
		expect(map.layers).toEqual([]);
	});
});

describe('measuring', () => {
	it('says what to do until there are two points to measure between', () => {
		tool.toggle();
		const hint = readout();
		clickAt(map, system, ...A);
		expect(readout()).toBe(hint);
		expect(labels()).toEqual([]);

		clickAt(map, system, ...B);
		expect(readout()).toBe('807 m');
		expect(labels()).toEqual(['807 m']);
	});

	it('previews the leg under the pointer without counting it', () => {
		tool.toggle();
		clickAt(map, system, ...A);
		// The preview is coalesced into a frame; draw it by hand rather than wait.
		map.fire('mousemove', { lngLat: { lng: B[0], lat: B[1] } });
		tool.redraw();
		expect(labels()).toEqual(['807 m']);
		expect(map.containerEl.querySelector('.advanced-maps-measure-label.is-draft')).not.toBeNull();
		// Nothing has been placed but the first point, so nothing is measured yet.
		expect(readout()).not.toBe('807 m');
	});

	it('ignores the pointer before the first point is placed', () => {
		tool.toggle();
		map.fire('mousemove', { lngLat: { lng: B[0], lat: B[1] } });
		tool.redraw();
		expect(labels()).toEqual([]);
	});

	it('takes back the last point, and stops at an empty tape', () => {
		tool.toggle();
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
		tool.toggle();
		map.fire('click', { lngLat: { lng: Number.NaN, lat: 31 } });
		map.fire('click', {});
		expect(map.data?.features).toEqual([]);
	});

	it('puts the tape away on Escape and takes a point back on Backspace', () => {
		tool.toggle();
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
		tool.toggle();
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
		tool.toggle();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		// The same two places, so the same answer as on a WGS-84 background —
		// measuring the offset copies would answer for a pair nobody clicked.
		expect(readout()).toBe('807 m');
	});

	it('redraws the same places where the new tiles put them', () => {
		system = 'gcj02';
		tool.toggle();
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
		tool.toggle();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		const label = map.containerEl.querySelector('.advanced-maps-measure-label') as HTMLElement;
		const at = map.project([B[0], B[1]]);
		expect(label.style.left).toBe(`${at.x}px`);
		expect(label.style.top).toBe(`${at.y}px`);
		expect(label.classList.contains('is-below')).toBe(false);
	});

	it('moves them with the camera', () => {
		tool.toggle();
		clickAt(map, system, ...A);
		clickAt(map, system, ...B);
		const label = map.containerEl.querySelector('.advanced-maps-measure-label') as HTMLElement;
		const before = label.style.left;
		map.panX = 50;
		map.fire('move');
		expect(label.style.left).toBe(`${Number.parseFloat(before) + 50}px`);
	});

	it('goes quiet when the pointer leaves the map', () => {
		tool.toggle();
		clickAt(map, system, ...A);
		map.fire('mousemove', { lngLat: { lng: B[0], lat: B[1] } });
		tool.redraw();
		expect(labels()).toHaveLength(1);
		map.fire('mouseout');
		tool.redraw();
		expect(labels()).toEqual([]);
	});
});
