/* Open Location Code (Plus Code) validation and decoding; pure arithmetic, no datum opinion. */

/** The 20 code characters. No vowels, so a decoded code cannot spell a word. */
const ALPHABET = '23456789CFGHJMPQRVWX';
const BASE = ALPHABET.length;
const SEPARATOR = '+';
/** The separator always follows the eighth digit — that is what makes a code "full". */
const SEPARATOR_POSITION = 8;
const PADDING = '0';

/** Digits past the fifteenth refine nothing; the spec says to ignore them. */
const MAX_DIGITS = 15;
/** The first ten digits are lat/lng pairs; the rest subdivide a 4×5 grid. */
const PAIR_DIGITS = 10;
const GRID_COLUMNS = 4;
const GRID_ROWS = 5;

/**
 * Integer units per degree at the finest resolution, so the whole decode is
 * integer arithmetic and the boundary cases in Google's own test vectors land
 * exactly rather than a float epsilon away.
 *
 * Latitude: five pairs take 20° down to 0.000125°, then five grid rows divide by
 * 5 each — 0.000125 / 5^5. Longitude divides by 4 each instead, so the two
 * multipliers differ.
 */
const LAT_UNITS = 8000 * 3125;
const LNG_UNITS = 8000 * 1024;

/** A decoded code is a box, not a point — its size is the code's precision. */
export interface CodeArea {
	latLo: number;
	lngLo: number;
	latHi: number;
	lngHi: number;
	/** Significant digits, ignoring padding and the separator. */
	digits: number;
}

/** Why a code this plugin recognises still cannot become a coordinate. */
export type PlusCodeIssue =
	/** Missing its leading area digits — `+2VX` needs somewhere to be near. */
	| 'short'
	/** Padded, so it names a region kilometres across rather than a place. */
	| 'imprecise';

/**
 * Is this a well-formed Open Location Code?
 *
 * Transcribed from the reference implementation's own rules rather than
 * loosened: padding may appear only as one even-length run immediately before
 * the separator, a short code may not be padded at all, and a single digit
 * after the separator is not a legal refinement.
 */
export function isValid(code: string): boolean {
	const separator = code.indexOf(SEPARATOR);
	if (separator === -1 || separator !== code.lastIndexOf(SEPARATOR)) return false;
	// A lone separator passes every rule below it, having no digits to break one.
	if (code.length === 1) return false;
	if (separator > SEPARATOR_POSITION || separator % 2 === 1) return false;

	if (code.indexOf(PADDING) > -1) {
		// A short code has already dropped the digits padding would stand for.
		if (separator < SEPARATOR_POSITION) return false;
		if (code.indexOf(PADDING) === 0) return false;
		// Joined rather than indexed: more than one run already fails on the next
		// line, so when the length tests matter the join is exactly that one run.
		const runs = code.match(/0+/g) ?? [];
		const padding = runs.join('');
		if (runs.length > 1 || padding.length % 2 === 1 || padding.length > SEPARATOR_POSITION - 2) return false;
		// Padding means the code stops at the separator, so nothing may follow it.
		if (!code.endsWith(SEPARATOR)) return false;
	}

	// One character after the separator would be half a pair.
	if (code.length - separator - 1 === 1) return false;

	for (const character of code) {
		if (character === SEPARATOR || character === PADDING) continue;
		if (!ALPHABET.includes(character.toUpperCase())) return false;
	}
	return true;
}

/** A full code carries its own area digits; a short one is relative to somewhere else. */
export function isFull(code: string): boolean {
	return isValid(code) && code.indexOf(SEPARATOR) === SEPARATOR_POSITION;
}

export function isShort(code: string): boolean {
	return isValid(code) && code.indexOf(SEPARATOR) < SEPARATOR_POSITION;
}

/**
 * The box a full code names, or null if the code is not one.
 *
 * Short codes are refused here rather than resolved against a guess: recovering
 * one needs a reference location, and the nearest match to the wrong reference
 * is a different place on Earth, not a less precise one.
 */
export function decode(code: string): CodeArea | null {
	if (!isFull(code)) return null;
	const digits = code.toUpperCase().replace(SEPARATOR, '').replace(/0+$/, '');

	// Integer units, counted up from the south-west corner of the world.
	let lat = -90 * LAT_UNITS;
	let lng = -180 * LNG_UNITS;
	let latPlace = LAT_UNITS * BASE * BASE;
	let lngPlace = LNG_UNITS * BASE * BASE;

	const used = Math.min(digits.length, MAX_DIGITS);
	for (let i = 0; i < Math.min(used, PAIR_DIGITS); i += 2) {
		latPlace /= BASE;
		lngPlace /= BASE;
		lat += ALPHABET.indexOf(digits[i]) * latPlace;
		lng += ALPHABET.indexOf(digits[i + 1]) * lngPlace;
	}
	for (let i = PAIR_DIGITS; i < used; i++) {
		latPlace /= GRID_ROWS;
		lngPlace /= GRID_COLUMNS;
		const digit = ALPHABET.indexOf(digits[i]);
		lat += Math.floor(digit / GRID_COLUMNS) * latPlace;
		lng += (digit % GRID_COLUMNS) * lngPlace;
	}

	const area: CodeArea = {
		latLo: lat / LAT_UNITS,
		lngLo: lng / LNG_UNITS,
		latHi: (lat + latPlace) / LAT_UNITS,
		lngHi: (lng + lngPlace) / LNG_UNITS,
		digits: used,
	};
	// `isValid` checks shape, not range: the alphabet can spell a first pair that
	// walks off the top of the world, and `FFX30000+` is well formed and nowhere.
	// A real code's box touches 90° or 180° at most as its far edge.
	if (area.latLo < -90 || area.latHi > 90 || area.lngLo < -180 || area.lngHi > 180) return null;
	return area;
}

/** The centre of the box a full code names — the point a code stands for. */
export function decodeCenter(code: string): { lat: number; lng: number } | null {
	const area = decode(code);
	if (!area) return null;
	return { lat: (area.latLo + area.latHi) / 2, lng: (area.lngLo + area.lngHi) / 2 };
}

/** Splitting rather than one regex: a code is a token, and tokens are what these separate. */
const TOKENS = /[\s,;、，；:："'()（）【】[\]]+/;

/**
 * The first thing in the text that is a well-formed code, uppercased.
 *
 * Trailing sentence punctuation is trimmed because a code pasted mid-sentence
 * keeps it, and `8FVC9G8F+6W.` is the same code.
 */
export function findPlusCode(text: string): string | null {
	for (const token of text.split(TOKENS)) {
		const cleaned = token.replace(/[.。!！?？]+$/, '');
		if (cleaned.includes(SEPARATOR) && isValid(cleaned)) return cleaned.toUpperCase();
	}
	return null;
}

/**
 * What keeps this code from standing for a place, or null if nothing does.
 *
 * This is the one policy in the module, and it is deliberately stricter than
 * the format: `decode` will answer for a padded code because a padded code is
 * legal, and this refuses it anyway. `8FVC0000+` is a box 5.5 km across and
 * `84000000+` is 2200 km; writing the centre of either into a note's coordinate
 * property would record a place nobody chose.
 */
export function codeIssue(code: string): PlusCodeIssue | null {
	if (isShort(code)) return 'short';
	return code.includes(PADDING) ? 'imprecise' : null;
}

/**
 * The same question asked of free text, for a caller that would rather say what
 * is wrong than report "no coordinate here".
 *
 * Null both when the text holds no code at all and when the code it holds is
 * usable.
 */
export function plusCodeIssue(text: string): PlusCodeIssue | null {
	const code = findPlusCode(text);
	return code === null ? null : codeIssue(code);
}
