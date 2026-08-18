import { describe, expect, it } from 'vitest';
import { decode, decodeCenter, findPlusCode, isFull, isShort, isValid, plusCodeIssue } from '../src/pluscode';

/* The hand-written cases from Google's own `test_data/decoding.csv`, which are
 * the ones chosen to pin an implementation down: the poles, both meridians, the
 * shortest and longest codes, and a grid refinement past the tenth digit.
 * Columns are the file's own — code, digits, latLo, lngLo, latHi, lngHi. */
const DECODING: Array<[string, number, number, number, number, number]> = [
	['7FG49Q00+', 6, 20.35, 2.75, 20.4, 2.8],
	['7FG49QCJ+2V', 10, 20.37, 2.782125, 20.370125, 2.78225],
	['7FG49QCJ+2VX', 11, 20.3701, 2.78221875, 20.370125, 2.78225],
	['7FG49QCJ+2VXGJ', 13, 20.370113, 2.782234375, 20.370114, 2.78223632813],
	['8FVC2222+22', 10, 47.0, 8.0, 47.000125, 8.000125],
	['4VCPPQGP+Q9', 10, -41.273125, 174.785875, -41.273, 174.786],
	['62G20000+', 4, 0.0, -180.0, 1, -179],
	['22220000+', 4, -90, -180, -89, -179],
	['7FG40000+', 4, 20.0, 2.0, 21.0, 3.0],
	['22222222+22', 10, -90.0, -180.0, -89.999875, -179.999875],
	['6VGX0000+', 4, 0, 179, 1, 180],
	['6FH32222+222', 11, 1, 1, 1.000025, 1.00003125],
	['CFX30000+', 4, 89, 1, 90, 2],
	['62H20000+', 4, 1, -180, 2, -179],
	['62H30000+', 4, 1, -179, 2, -178],
	['CFX3X2X2+X2', 10, 89.999875, 1, 90, 1.000125],
	['84000000+', 2, 30, -140, 50, -120],
];

/* `test_data/validityTests.csv`, whole. Columns: code, isValid, isShort, isFull. */
const VALIDITY: Array<[string, boolean, boolean, boolean]> = [
	['8FWC2345+G6', true, false, true],
	['8FWC2345+G6G', true, false, true],
	['8fwc2345+', true, false, true],
	['8FWCX400+', true, false, true],
	['84000000+', true, false, true],
	['WC2345+G6g', true, true, false],
	['2345+G6', true, true, false],
	['45+G6', true, true, false],
	['+G6', true, true, false],
	['G+', false, false, false],
	['+', false, false, false],
	['8FWC2345+G', false, false, false],
	['8FWC2_45+G6', false, false, false],
	['8FWC2η45+G6', false, false, false],
	['8FWC2345+G6+', false, false, false],
	['8FWC2345G6+', false, false, false],
	['8FWC2300+G6', false, false, false],
	['WC2300+G6g', false, false, false],
	['WC2345+G', false, false, false],
	['WC2300+', false, false, false],
	['84900000+', false, false, false],
	['849VGJQF+VX7QR3J', true, false, true],
	['849VGJQF+VX7QR3U', false, false, false],
	['849VGJQF+VX7QR3JW', true, false, true],
	['849VGJQF+VX7QR3JU', false, false, false],
];

describe('decode: Google’s own vectors', () => {
	for (const [code, digits, latLo, lngLo, latHi, lngHi] of DECODING) {
		it(code, () => {
			const area = decode(code);
			expect(area).not.toBeNull();
			expect(area!.digits).toBe(digits);
			// Within a nanodegree — this is integer arithmetic, not an approximation.
			expect(Math.abs(area!.latLo - latLo)).toBeLessThan(1e-9);
			expect(Math.abs(area!.lngLo - lngLo)).toBeLessThan(1e-9);
			expect(Math.abs(area!.latHi - latHi)).toBeLessThan(1e-9);
			expect(Math.abs(area!.lngHi - lngHi)).toBeLessThan(1e-9);
		});
	}
});

describe('isValid / isShort / isFull: Google’s own vectors', () => {
	for (const [code, valid, short, full] of VALIDITY) {
		it(`${code} → ${valid ? 'valid' : 'invalid'}`, () => {
			expect(isValid(code)).toBe(valid);
			expect(isShort(code)).toBe(short);
			expect(isFull(code)).toBe(full);
		});
	}
});

describe('decodeCenter', () => {
	it('is the middle of the box, not a corner', () => {
		// 8FVC9G8F+6W — Zurich, the code the reference documentation uses.
		const centre = decodeCenter('8FVC9G8F+6W')!;
		const area = decode('8FVC9G8F+6W')!;
		expect(centre.lat).toBeCloseTo((area.latLo + area.latHi) / 2, 12);
		expect(centre.lng).toBeCloseTo((area.lngLo + area.lngHi) / 2, 12);
	});

	it('stays inside the world at the north pole', () => {
		const centre = decodeCenter('CFX3X2X2+X2')!;
		expect(centre.lat).toBeGreaterThan(89.99);
		expect(centre.lat).toBeLessThan(90);
	});

	it('refuses a code that is well formed and off the map', () => {
		// 'F' is index 9 in the code alphabet, so the first pair alone reaches 90°
		// and everything after it walks past the pole. Shape says yes, place says no.
		expect(isValid('FFX30000+')).toBe(true);
		expect(decode('FFX30000+')).toBeNull();
		expect(decodeCenter('FFX30000+')).toBeNull();
	});

	it('refuses a short code rather than guessing where it is', () => {
		expect(isValid('+G6')).toBe(true);
		expect(decodeCenter('+G6')).toBeNull();
		expect(decodeCenter('9QCJ+2VX')).toBeNull();
	});
});

describe('findPlusCode', () => {
	it('picks the code out of a sentence', () => {
		expect(findPlusCode('Plus Code: 8FVC9G8F+6W, Zurich')).toBe('8FVC9G8F+6W');
	});

	it('uppercases, because a code is case-insensitive', () => {
		expect(findPlusCode('8fvc9g8f+6w')).toBe('8FVC9G8F+6W');
	});

	it('drops the full stop a pasted sentence leaves on the end', () => {
		expect(findPlusCode('We are at 8FVC9G8F+6W.')).toBe('8FVC9G8F+6W');
		expect(findPlusCode('地址是 8FVC9G8F+6W。')).toBe('8FVC9G8F+6W');
	});

	it('finds nothing in text that only looks like one', () => {
		expect(findPlusCode('30.26,120.14')).toBeNull();
		expect(findPlusCode('a + b')).toBeNull();
		expect(findPlusCode('8FWC2345+G')).toBeNull();
	});
});

describe('plusCodeIssue: the failures worth explaining', () => {
	it('names a short code', () => {
		expect(plusCodeIssue('9QCJ+2VX')).toBe('short');
		expect(plusCodeIssue('+G6')).toBe('short');
	});

	it('names a padded one', () => {
		// 8FVC0000+ is 5.5 km across and 84000000+ is 2200 km. Both are legal
		// codes and neither is a place, so neither becomes a note's coordinate.
		expect(plusCodeIssue('8FVC0000+')).toBe('imprecise');
		expect(plusCodeIssue('84000000+')).toBe('imprecise');
	});

	it('is silent about a code that works, and about text with none', () => {
		expect(plusCodeIssue('8FVC9G8F+6W')).toBeNull();
		expect(plusCodeIssue('30.26,120.14')).toBeNull();
		expect(plusCodeIssue('')).toBeNull();
	});
});
