import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorKey, formatFix, isBlank, Locator, shouldGiveUp, type Fix } from '../src/locate';
import { excludedFragments, isExcluded } from '../src/settings';

const fix = (lat: number, lng: number): Fix => ({ lat, lng, accuracy: 5, timestamp: 0 });

/** Codes are the constants the Web API defines; the class itself is not in scope. */
const DENIED = { code: 1 };
const UNAVAILABLE = { code: 2 };
const TIMEOUT = { code: 3 };

/**
 * A stand-in for the platform. `getCurrentPosition` is the only member this
 * plugin touches, so the other two are present to satisfy the type and nothing
 * more.
 */
function fakeGeolocation(impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) {
	const getCurrentPosition = vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) =>
		impl(ok, fail as PositionErrorCallback)
	);
	return {
		geolocation: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() } as unknown as Geolocation,
		getCurrentPosition,
	};
}

const position = (lat: number, lng: number, accuracy = 12): GeolocationPosition =>
	({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp: 1700000000000 }) as GeolocationPosition;

const succeeds = (lat = 28.624415, lng = 115.788091) =>
	fakeGeolocation((ok) => {
		ok(position(lat, lng));
	});

const failsWith = (error: { code: number }) =>
	fakeGeolocation((_ok, fail) => {
		fail(error as GeolocationPositionError);
	});

describe('formatFix', () => {
	it('writes the shape the vault already holds', () => {
		expect(formatFix(fix(28.624415, 115.788091))).toBe('28.624415,115.788091');
	});

	it('pads to a fixed width, so a re-stamp is comparable to the last one', () => {
		expect(formatFix(fix(28.6, -0.5))).toBe('28.600000,-0.500000');
	});

	it('rounds to six decimals — past any GPS, and short of making a re-stamp look like a move', () => {
		expect(formatFix(fix(28.62441531, 115.78809142))).toBe('28.624415,115.788091');
	});
});

describe('isBlank', () => {
	it('treats an unfilled template property as blank', () => {
		// `coords:` with nothing after it is what the metadata cache reports as null
		expect(isBlank(null)).toBe(true);
		expect(isBlank(undefined)).toBe(true);
		expect(isBlank('')).toBe(true);
		expect(isBlank('   ')).toBe(true);
		expect(isBlank([])).toBe(true);
		expect(isBlank([null, ''])).toBe(true);
	});

	it('leaves anything that carries a value alone', () => {
		expect(isBlank('28.624415,115.788091')).toBe(false);
		expect(isBlank(['28.624415', '115.788091'])).toBe(false);
		expect(isBlank(0)).toBe(false);
		expect(isBlank(false)).toBe(false);
	});
});

describe('errorKey', () => {
	it('names each of the four failures', () => {
		expect(errorKey(DENIED as GeolocationPositionError)).toBe('notice.locate.denied');
		expect(errorKey(UNAVAILABLE as GeolocationPositionError)).toBe('notice.locate.unavailable');
		expect(errorKey(TIMEOUT as GeolocationPositionError)).toBe('notice.locate.timeout');
		expect(errorKey({ code: 99 })).toBe('notice.locate.failed');
	});
});

describe('shouldGiveUp', () => {
	it('gives up on a denied permission even after a success', () => {
		expect(shouldGiveUp(DENIED as GeolocationPositionError, true)).toBe(true);
	});

	it('gives up on any failure from a platform that has never answered', () => {
		expect(shouldGiveUp(TIMEOUT as GeolocationPositionError, false)).toBe(true);
		expect(shouldGiveUp(UNAVAILABLE as GeolocationPositionError, false)).toBe(true);
	});

	it('forgives a transient failure once the platform has proved it can answer', () => {
		expect(shouldGiveUp(TIMEOUT as GeolocationPositionError, true)).toBe(false);
		expect(shouldGiveUp(UNAVAILABLE as GeolocationPositionError, true)).toBe(false);
	});
});

describe('Locator', () => {
	// Every failure path logs, which is wanted in Obsidian and only noise here.
	let warn: ReturnType<typeof vi.spyOn>;
	beforeAll(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterAll(() => warn.mockRestore());

	it('hands back the fix the platform reported', async () => {
		const { geolocation } = succeeds();
		const locator = new Locator({ geolocation });
		expect(await locator.locate()).toEqual({
			lat: 28.624415,
			lng: 115.788091,
			accuracy: 12,
			timestamp: 1700000000000,
		});
		expect(locator.available()).toBe(true);
		expect(locator.lastFailure()).toBeNull();
	});

	it('shares one request between concurrent callers', async () => {
		// file-open and metadataCache.changed both fire for the same note, and
		// racing the platform for one answer is how you get two permission prompts.
		let settle: (() => void) | null = null;
		const { geolocation, getCurrentPosition } = fakeGeolocation((ok) => {
			settle = () => ok(position(1, 2));
		});
		const locator = new Locator({ geolocation });

		const both = Promise.all([locator.locate(), locator.locate()]);
		settle!();
		const [first, second] = await both;

		expect(getCurrentPosition).toHaveBeenCalledTimes(1);
		expect(first).toEqual(second);
	});

	it('asks again once an earlier request has settled', async () => {
		const { geolocation, getCurrentPosition } = succeeds();
		const locator = new Locator({ geolocation });
		await locator.locate();
		await locator.locate();
		expect(getCurrentPosition).toHaveBeenCalledTimes(2);
	});

	it('stops asking a platform that has no geolocation at all', async () => {
		const onGiveUp = vi.fn();
		const locator = new Locator({ geolocation: null, onGiveUp });
		expect(await locator.locate()).toBeNull();
		expect(locator.available()).toBe(false);
		expect(locator.lastFailure()).toBe('notice.locate.noProvider');
		expect(onGiveUp).toHaveBeenCalledTimes(1);
	});

	it('stops asking after a denied permission, and says so once', async () => {
		const onGiveUp = vi.fn();
		const { geolocation } = failsWith(DENIED);
		const locator = new Locator({ geolocation, onGiveUp });

		expect(await locator.locate()).toBeNull();
		expect(locator.available()).toBe(false);
		expect(locator.lastFailure()).toBe('notice.locate.denied');

		await locator.locate();
		expect(onGiveUp).toHaveBeenCalledTimes(1);
	});

	it('stops asking a platform whose first answer was a timeout', async () => {
		const { geolocation } = failsWith(TIMEOUT);
		const locator = new Locator({ geolocation });
		await locator.locate();
		expect(locator.available()).toBe(false);
	});

	it('keeps asking after a timeout that follows a success', async () => {
		let outcome: (ok: PositionCallback, fail: PositionErrorCallback) => void = (ok) => ok(position(1, 2));
		const { geolocation } = fakeGeolocation((ok, fail) => outcome(ok, fail));
		const locator = new Locator({ geolocation });

		await locator.locate();
		outcome = (_ok, fail) => fail(TIMEOUT as GeolocationPositionError);
		expect(await locator.locate()).toBeNull();

		// A lost fix indoors is not a reason to write the platform off
		expect(locator.available()).toBe(true);
		expect(locator.lastFailure()).toBe('notice.locate.timeout');
	});

	it('forgives a refusal when asked to reset', async () => {
		const { geolocation } = failsWith(DENIED);
		const locator = new Locator({ geolocation });
		await locator.locate();
		expect(locator.available()).toBe(false);
		locator.reset();
		expect(locator.available()).toBe(true);
	});
});

describe('isExcluded', () => {
	it('matches a fragment anywhere in the path, ignoring case', () => {
		expect(isExcluded('templates/moment.md', 'templates')).toBe(true);
		expect(isExcluded('Templates/Moment.md', 'templates')).toBe(true);
		expect(isExcluded('moments/20260412191024.md', 'templates')).toBe(false);
	});

	it('takes a comma-separated list', () => {
		expect(isExcluded('archive/old.md', 'templates, archive')).toBe(true);
	});

	it('excludes nothing when the setting is blank', () => {
		expect(isExcluded('moments/note.md', '')).toBe(false);
		expect(isExcluded('moments/note.md', ' , ')).toBe(false);
	});

	it('drops blank fragments rather than matching every path on ""', () => {
		expect(excludedFragments('templates, ,archive,')).toEqual(['templates', 'archive']);
	});
});
