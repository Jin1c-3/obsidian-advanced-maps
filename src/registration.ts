/* Ownership of the wrappers this plugin installs over the native Bases map registration. */

import type { BasesMapView, BasesViewFactory, BasesViewOptionsFn } from './types/obsidian-internals';
import { appendTrackOptions, type BackgroundPicker } from './view-options';

/**
 * Which plugin instance a wrapper belongs to.
 *
 * A cell rather than the instance itself: the wrapper closes over this object,
 * so retiring it releases the plugin callbacks even when another plugin keeps
 * a wrapper in its call chain. The retained wrapper then only calls the host.
 */
export interface RegistrationOwner {
	alive: boolean;
	enhance?: (view: BasesMapView) => void;
	backgroundPicker?: () => BackgroundPicker | null;
}

export function retire(owner: RegistrationOwner): void {
	owner.alive = false;
	owner.enhance = undefined;
	owner.backgroundPicker = undefined;
}

/** These closures retain only the native function and the revocable owner cell. */
export function wrapFactory(native: BasesViewFactory, owner: RegistrationOwner): BasesViewFactory {
	const wrapper: BasesViewFactory = (controller, containerEl) => {
		const view = native(controller, containerEl);
		if (owner.alive) owner.enhance?.(view);
		return view;
	};
	return stamp(wrapper, native, owner);
}

export function wrapOptions(native: BasesViewOptionsFn, owner: RegistrationOwner): BasesViewOptionsFn {
	const wrapper: BasesViewOptionsFn = () =>
		owner.alive ? appendTrackOptions(native(), owner.backgroundPicker?.() ?? null) : native();
	return stamp(wrapper, native, owner);
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
		retire(stamp.owner);
		current = stamp.native as Stamped<T>;
	}
}

/** Mark a wrapper as this instance's, over the function it replaced. */
export function stamp<T>(wrapper: T, native: T, owner: RegistrationOwner): T {
	(wrapper as { __advancedMaps?: RegistrationStamp<T> }).__advancedMaps = { native, owner };
	return wrapper;
}
