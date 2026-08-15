import { describe, expect, it } from 'vitest';
import { nativeBehind, ownedBy, stamp, type RegistrationOwner, type Stamped } from '../src/registration';

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
		dead.alive = false;

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
		gone.alive = false; // the instance unloaded but could not restore the slot

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
		mine.alive = false;
		expect(slot.factory('map')).toEqual(['map', 'other']);
	});
});
