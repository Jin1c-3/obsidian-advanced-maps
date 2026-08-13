import type { MapLibreMap } from './types/obsidian-internals';

/**
 * Event listeners attached directly to one or more MapLibre map instances.
 *
 * A track layer can outlive a particular map (the native view destroys and
 * recreates it), while a native map can outlive a particular plugin instance
 * (disable/re-enable against an already-open Bases view). MapLibre owns these
 * listeners, so restoring wrapped Obsidian methods is not enough: every `on`
 * needs its exact matching `off` or a detached layer wakes up again when a new
 * plugin instance recreates the same layer ids.
 *
 * Keeping the two registration shapes here makes cleanup one operation and
 * prevents the event name, layer id or callback identity from being restated at
 * teardown time.
 */
export class MapEventBindings {
	private readonly remove: Array<() => void> = [];

	on<E>(map: MapLibreMap, type: string, listener: (event: E) => void): void {
		map.on(type, listener);
		this.remove.push(() => map.off(type, listener));
	}

	onLayer<E>(map: MapLibreMap, type: string, layerId: string, listener: (event: E) => void): void {
		map.on(type, layerId, listener);
		this.remove.push(() => map.off(type, layerId, listener));
	}

	/** Remove every listener once, continuing if a map is already torn down. */
	clear(): void {
		for (const remove of this.remove.splice(0).reverse()) {
			try {
				remove();
			} catch {
				/* the native map was already removed */
			}
		}
	}
}
