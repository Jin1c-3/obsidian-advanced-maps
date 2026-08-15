/* Ownership of the wrappers this plugin installs over the native Bases map registration. */

/**
 * Which plugin instance a wrapper belongs to.
 *
 * A cell rather than the instance itself: the wrapper closes over this object,
 * so clearing `alive` on unload turns a wrapper that cannot be removed from the
 * registration — because another plugin has since wrapped it — into a plain
 * pass-through instead of one that keeps enhancing views for a dead instance.
 */
export interface RegistrationOwner {
	alive: boolean;
}

/**
 * What a wrapper says about itself: the function it replaced, and who installed
 * it. Written to the wrapper's `__advancedMaps` property, which older versions
 * of this plugin set to `true` — see `nativeBehind`.
 */
export interface RegistrationStamp<T> {
	native: T;
	owner: RegistrationOwner;
}

/** Anything callable the registration holds, carrying an optional stamp. */
export type Stamped<T> = T & { __advancedMaps?: RegistrationStamp<T> | boolean };

function stampOf<T>(fn: Stamped<T> | null | undefined): RegistrationStamp<T> | null {
	if (typeof fn !== 'function') return null;
	const stamp = (fn as { __advancedMaps?: unknown }).__advancedMaps;
	if (!stamp || typeof stamp !== 'object') return null;
	const record = stamp as RegistrationStamp<T>;
	if (typeof record.native !== 'function') return null;
	if (!record.owner || typeof record.owner !== 'object') return null;
	return record;
}

/** Is this the wrapper `owner` installed, still doing its job? */
export function ownedBy<T>(fn: Stamped<T> | null | undefined, owner: RegistrationOwner): boolean {
	const stamp = stampOf(fn);
	return stamp !== null && stamp.owner === owner && owner.alive;
}

/**
 * The host's own function behind whatever this plugin left in the registration,
 * retiring the instances that installed what it peels off.
 *
 * Peeling rather than wrapping is what makes a reload recoverable: a wrapper
 * left by an instance that has already unloaded closes over that dead instance,
 * so wrapping it again would keep the dead one in the call path — and, for the
 * options function, append the track option group a second time.
 *
 * A stamp written by a version that stored `true` carries no native function to
 * recover, so that wrapper is returned as-is: it is the best that can be done
 * without a reference the old version never kept, and the next time Maps
 * re-registers its view the chain starts clean again.
 */
export function nativeBehind<T>(fn: Stamped<T>): T {
	let current: Stamped<T> = fn;
	const seen = new Set<unknown>();
	for (;;) {
		const stamp = stampOf(current);
		if (!stamp || seen.has(current)) return current;
		seen.add(current);
		stamp.owner.alive = false;
		current = stamp.native as Stamped<T>;
	}
}

/** Mark a wrapper as this instance's, over the function it replaced. */
export function stamp<T>(wrapper: T, native: T, owner: RegistrationOwner): T {
	(wrapper as { __advancedMaps?: RegistrationStamp<T> }).__advancedMaps = { native, owner };
	return wrapper;
}
