import { describe, expect, it } from 'vitest';
import { MapEventBindings } from '../src/map-events';
import type { MapLibreMap } from '../src/types/obsidian-internals';

type Listener = (event: unknown) => void;

class EventMap {
	private readonly unscoped = new Map<string, Set<Listener>>();
	private readonly layered = new Map<string, Set<Listener>>();
	throwOnOff = false;

	on(type: string, listener: Listener): void;
	on(type: string, layerId: string, listener: Listener): void;
	on(type: string, layerOrListener: string | Listener, maybeListener?: Listener): void {
		if (typeof layerOrListener === 'function') {
			const listeners = this.unscoped.get(type) ?? new Set<Listener>();
			listeners.add(layerOrListener);
			this.unscoped.set(type, listeners);
			return;
		}
		const key = `${type}\0${layerOrListener}`;
		const listeners = this.layered.get(key) ?? new Set<Listener>();
		listeners.add(maybeListener!);
		this.layered.set(key, listeners);
	}

	off(type: string, listener: Listener): void;
	off(type: string, layerId: string, listener: Listener): void;
	off(type: string, layerOrListener: string | Listener, maybeListener?: Listener): void {
		if (this.throwOnOff) {
			this.throwOnOff = false;
			throw new Error('map already removed');
		}
		if (typeof layerOrListener === 'function') {
			this.unscoped.get(type)?.delete(layerOrListener);
			return;
		}
		this.layered.get(`${type}\0${layerOrListener}`)?.delete(maybeListener!);
	}

	fire(type: string, event: unknown): void {
		for (const listener of this.unscoped.get(type) ?? []) listener(event);
	}

	fireLayer(type: string, layerId: string, event: unknown): void {
		for (const listener of this.layered.get(`${type}\0${layerId}`) ?? []) listener(event);
	}
}

function asMap(map: EventMap): MapLibreMap {
	return map as unknown as MapLibreMap;
}

describe('MapEventBindings', () => {
	it('removes global and layer-scoped listeners with the same callback identity', () => {
		const map = new EventMap();
		const bindings = new MapEventBindings();
		let globalCalls = 0;
		let layerCalls = 0;
		bindings.on(asMap(map), 'load', () => globalCalls++);
		bindings.onLayer(asMap(map), 'click', 'track-lines', () => layerCalls++);

		map.fire('load', {});
		map.fireLayer('click', 'track-lines', {});
		expect([globalCalls, layerCalls]).toEqual([1, 1]);

		bindings.clear();
		map.fire('load', {});
		map.fireLayer('click', 'track-lines', {});
		expect([globalCalls, layerCalls]).toEqual([1, 1]);
	});

	it('is idempotent and keeps cleaning when a map is already partly torn down', () => {
		const map = new EventMap();
		const bindings = new MapEventBindings();
		let first = 0;
		let second = 0;
		bindings.on(asMap(map), 'load', () => first++);
		bindings.on(asMap(map), 'style.load', () => second++);
		map.throwOnOff = true;

		expect(() => bindings.clear()).not.toThrow();
		expect(() => bindings.clear()).not.toThrow();
		map.fire('load', {});
		map.fire('style.load', {});
		// Cleanup runs in reverse registration order: the simulated failure leaves
		// only that one listener behind, while the other is still removed.
		expect([first, second]).toEqual([0, 1]);
	});
});
