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

/**
 * Replace one method on an *instance*; the returned function puts it back.
 *
 * An own property shadows the prototype, so the wrapper dies with the object
 * and `delete` restores the untouched method. Where the native code assigned
 * the method as an own property itself, the saved value goes back instead —
 * deleting that one would take the host's own implementation with it and leave
 * the object permanently broken, including after this plugin is uninstalled.
 *
 * Beside the listener bindings above because it answers the same question for
 * the other kind of borrowed thing: what exactly is handed back, and when.
 */
export function override<T extends object, K extends keyof T>(obj: T, key: K, make: (orig: T[K]) => T[K]): () => void {
	const orig = obj[key];
	const hadOwn = Object.prototype.hasOwnProperty.call(obj, key);
	obj[key] = make(orig);
	return () => {
		if (hadOwn) obj[key] = orig;
		else delete (obj as unknown as Record<string, unknown>)[key as string];
	};
}
