import { describe, expect, it, vi } from 'vitest';
import {
	nativeBehind,
	ownedBy,
	retire,
	stamp,
	wrapFactory,
	wrapOptions,
	type RegistrationOwner,
	type Stamped,
} from '../src/registration';
import type { BasesMapView, BasesViewFactory, BasesViewOptionsFn } from '../src/types/obsidian-internals';

/** The registration Bases keeps: one mutable slot holding a factory. */
type Factory = (label: string) => string[];

/**
 * What `main.ts` installs, in miniature: a wrapper that adds one enhancement,
 * calls through the owner cell, and remembers the function it replaced. The
 * point of the harness is that the ownership rules can be exercised without a
 * running Bases, because they are the same object graph either way.
 */
function install(slot: { factory: Stamped<Factory> }, owner: RegistrationOwner, mark: string): Stamped<Factory> {
	const native = nativeBehind(slot.factory);
	const wrapper: Factory = (label) => {
		const view = native(label);
		if (owner.alive) view.push(mark);
		return view;
	};
	stamp(wrapper, native, owner);
	slot.factory = wrapper;
	return wrapper;
}

const host: Stamped<Factory> = (label: string) => [label];

function registration() {
	const view = { markerManager: {} } as BasesMapView;
	const factory = vi.fn<BasesViewFactory>(() => view);
	const groups = [
		{
			displayName: 'Background',
			type: 'group' as const,
			items: [{ key: 'mapTiles', displayName: 'Tiles', type: 'text' }],
		},
	];
	const options = vi.fn<BasesViewOptionsFn>(() => groups);
	const enhance = vi.fn();
	const backgroundPicker = vi.fn(() => ({ backgrounds: [{ id: 'pack:trail', name: 'Trail' }], missing: [] }));
	const owner: RegistrationOwner = { alive: true, enhance, backgroundPicker };
	return { view, factory, groups, options, enhance, backgroundPicker, owner };
}

describe('registration wrappers', () => {
	it('enhances the native view and reads the current background picker while active', () => {
		const r = registration();
		const factory = wrapFactory(r.factory, r.owner);
		const options = wrapOptions(r.options, r.owner);
		const controller = {};
		const container = document.createElement('div');

		expect(factory(controller, container)).toBe(r.view);
		expect(r.factory).toHaveBeenCalledWith(controller, container);
		expect(r.enhance).toHaveBeenCalledExactlyOnceWith(r.view);
		const groups = options();
		expect(groups.flatMap((group) => group.items).map((item) => item.key)).toContain('offlineTiles');
		expect(r.backgroundPicker).toHaveBeenCalledTimes(1);
		r.backgroundPicker.mockReturnValue({ backgrounds: [], missing: [] });
		options();
		expect(r.backgroundPicker).toHaveBeenCalledTimes(2);
		expect(r.groups).toHaveLength(1);
	});

	it('releases both callbacks on retirement and returns native results unchanged', () => {
		const r = registration();
		const factory = wrapFactory(r.factory, r.owner);
		const options = wrapOptions(r.options, r.owner);

		retire(r.owner);
		retire(r.owner);
		expect(r.owner).toEqual({ alive: false, enhance: undefined, backgroundPicker: undefined });
		expect(factory({}, document.createElement('div'))).toBe(r.view);
		expect(options()).toBe(r.groups);
		expect(r.enhance).not.toHaveBeenCalled();
		expect(r.backgroundPicker).not.toHaveBeenCalled();
	});

	it('releases callbacks when peeling either registration function', () => {
		for (const peelFactory of [true, false]) {
			const r = registration();
			const factory = wrapFactory(r.factory, r.owner);
			const options = wrapOptions(r.options, r.owner);
			if (peelFactory) expect(nativeBehind(factory)).toBe(r.factory);
			else expect(nativeBehind(options)).toBe(r.options);

			expect(r.owner.enhance).toBeUndefined();
			expect(r.owner.backgroundPicker).toBeUndefined();
			expect(factory({}, document.createElement('div'))).toBe(r.view);
			expect(options()).toBe(r.groups);
			expect(r.enhance).not.toHaveBeenCalled();
			expect(r.backgroundPicker).not.toHaveBeenCalled();
		}
	});

	it('preserves foreign wrappers around retired factory and options functions', () => {
		const r = registration();
		const factory = wrapFactory(r.factory, r.owner);
		const options = wrapOptions(r.options, r.owner);
		const foreignFactory = vi.fn<BasesViewFactory>((controller, container) => factory(controller, container));
		const extra = { displayName: 'Other', type: 'group' as const, items: [] };
		const foreignOptions: BasesViewOptionsFn = () => [...options(), extra];

		expect(nativeBehind(foreignFactory)).toBe(foreignFactory);
		expect(nativeBehind(foreignOptions)).toBe(foreignOptions);
		retire(r.owner);
		expect(foreignFactory({}, document.createElement('div'))).toBe(r.view);
		expect(foreignOptions()).toEqual([...r.groups, extra]);
		expect(foreignFactory).toHaveBeenCalledTimes(1);
		expect(r.enhance).not.toHaveBeenCalled();
		expect(r.backgroundPicker).not.toHaveBeenCalled();
	});
});

describe('ownedBy', () => {
	it('recognizes only the wrapper this owner installed', () => {
		const mine: RegistrationOwner = { alive: true };
		const theirs: RegistrationOwner = { alive: true };
		const slot = { factory: host };
		install(slot, mine, 'mine');

		expect(ownedBy(slot.factory, mine)).toBe(true);
		expect(ownedBy(slot.factory, theirs)).toBe(false);
	});

	it('does not recognize a wrapper whose instance has unloaded', () => {
		const dead: RegistrationOwner = { alive: true };
		const slot = { factory: host };
		install(slot, dead, 'dead');
		retire(dead);

		expect(ownedBy(slot.factory, dead)).toBe(false);
	});

	it('claims nothing about the host itself or a stamp from before the record', () => {
		const owner: RegistrationOwner = { alive: true };
		const legacy = ((label: string) => [label, 'legacy']) as Stamped<Factory>;
		legacy.__advancedMaps = true;

		expect(ownedBy(host, owner)).toBe(false);
		expect(ownedBy(legacy, owner)).toBe(false);
		expect(ownedBy(null, owner)).toBe(false);
	});
});

describe('nativeBehind', () => {
	it('leaves a function nobody has wrapped alone', () => {
		expect(nativeBehind(host)).toBe(host);
	});

	it('peels one wrapper and retires the instance that installed it', () => {
		const dead: RegistrationOwner = { alive: true };
		const slot = { factory: host };
		install(slot, dead, 'dead');

		expect(nativeBehind(slot.factory)).toBe(host);
		expect(dead.alive).toBe(false);
	});

	it('peels a stack of them', () => {
		const first: RegistrationOwner = { alive: true };
		const second: RegistrationOwner = { alive: true };
		const slot = { factory: host };
		install(slot, first, 'first');
		install(slot, second, 'second');

		expect(nativeBehind(slot.factory)).toBe(host);
		expect(first.alive).toBe(false);
		expect(second.alive).toBe(false);
	});

	it('returns a pre-record wrapper as itself, having nothing to recover', () => {
		const legacy = ((label: string) => [label, 'legacy']) as Stamped<Factory>;
		legacy.__advancedMaps = true;

		expect(nativeBehind(legacy)).toBe(legacy);
	});

	it('ignores a stamp that is not the record this version writes', () => {
		// A future or hand-edited shape is not something to trust into a call
		// path; it is treated as an opaque function, the same as the host's own.
		const odd = ((label: string) => [label]) as Stamped<Factory>;
		(odd as { __advancedMaps?: unknown }).__advancedMaps = { native: 'not a function' };

		expect(nativeBehind(odd)).toBe(odd);
		expect(ownedBy(odd, { alive: true })).toBe(false);
	});

	it('terminates on a stamp that names itself', () => {
		const looped = ((label: string) => [label]) as Stamped<Factory>;
		looped.__advancedMaps = { native: looped, owner: { alive: true } };

		expect(nativeBehind(looped)).toBe(looped);
	});
});

describe('a registration handed from one instance to the next', () => {
	it('re-takes a wrapper an unloaded instance left in the slot', () => {
		const gone: RegistrationOwner = { alive: true };
		const slot = { factory: host };
		install(slot, gone, 'gone');
		retire(gone); // the instance unloaded but could not restore the slot

		const live: RegistrationOwner = { alive: true };
		expect(ownedBy(slot.factory, live)).toBe(false);
		install(slot, live, 'live');

		// One enhancement, from the instance that is actually loaded.
		expect(slot.factory('map')).toEqual(['map', 'live']);
	});

	it('stops enhancing when its instance unloads under a foreign wrapper', () => {
		const mine: RegistrationOwner = { alive: true };
		const slot = { factory: host };
		const wrapper = install(slot, mine, 'mine');
		// Another plugin wraps ours; the slot no longer holds our function, so
		// unload cannot restore it — all it can do is retire the owner.
		slot.factory = (label: string) => [...wrapper(label), 'other'];

		expect(slot.factory('map')).toEqual(['map', 'mine', 'other']);
		retire(mine);
		expect(slot.factory('map')).toEqual(['map', 'other']);
	});
});
