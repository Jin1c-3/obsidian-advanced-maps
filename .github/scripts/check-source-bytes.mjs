/*
 * Rejects characters that make reviewed source differ from compiled source.
 *
 * A NUL byte reached src/track-layer.ts twice. Nothing else in `npm run check`
 * can see it: NUL is a legal character inside a TypeScript string, so Prettier,
 * ESLint, tsc, the tests and the smoke check all pass and it goes into the
 * bundle. It is invisible in an editor, and `grep` treats a file containing one
 * as binary and reports no matches at all — which is a way to lose an hour, not
 * a way to find a defect.
 *
 * Usage: node .github/scripts/check-source-bytes.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

/**
 * Skipped outright. Everything else must decode as UTF-8, so a binary file of a
 * type not listed here fails rather than being quietly exempted.
 */
const BINARY_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'pdf']);

/**
 * Ranges with no visible width, each with why it is here. Non-ASCII text is not
 * the target: this repository ships Chinese localization and em dashes in prose.
 *
 * Deliberately absent: U+200C/U+200D, because U+200D is how emoji sequences are
 * written, and U+200E/U+200F, which are ordinary marks in right-to-left text.
 */
const FORBIDDEN = [
	{ from: 0x00, to: 0x08, why: 'C0 control character' },
	// 0x09 tab and 0x0a newline are the only two this repository writes.
	{ from: 0x0b, to: 0x0c, why: 'C0 control character' },
	// 0x0d carriage return: Prettier writes LF, so a CR means a stray edit.
	{ from: 0x0d, to: 0x1f, why: 'C0 control character' },
	{ from: 0x7f, to: 0x7f, why: 'DEL' },
	{ from: 0x200b, to: 0x200b, why: 'zero-width space' },
	{ from: 0x202a, to: 0x202e, why: 'bidirectional formatting override' },
	{ from: 0x2066, to: 0x2069, why: 'bidirectional isolate' },
	{ from: 0xfeff, to: 0xfeff, why: 'byte-order mark' },
];

function forbidden(code) {
	for (const range of FORBIDDEN) if (code >= range.from && code <= range.to) return range.why;
	return null;
}

const extensionOf = (path) => {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);

const problems = [];
let checked = 0;

for (const path of tracked) {
	if (BINARY_EXTENSIONS.has(extensionOf(path))) continue;
	let bytes;
	try {
		bytes = readFileSync(path);
	} catch (e) {
		// `git ls-files` reports the index; the working tree is what has bytes to
		// check. A file deleted or moved but not yet staged, and a submodule's
		// gitlink, both appear here with nothing to read.
		if (e.code === 'ENOENT' || e.code === 'EISDIR') continue;
		throw e;
	}
	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		problems.push(`${path}: not valid UTF-8, and its type is not declared binary in this script`);
		continue;
	}
	checked++;
	let line = 1;
	for (const char of text) {
		const code = char.codePointAt(0);
		if (code === 0x0a) {
			line++;
			continue;
		}
		const why = forbidden(code);
		if (why) {
			const point = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
			problems.push(`${path}:${line}: ${point} (${why})`);
		}
	}
}

if (problems.length > 0) {
	console.error('Invisible or undecodable bytes in tracked source:');
	for (const problem of problems) console.error(`  · ${problem}`);
	console.error('\nThese do not show up in an editor and no other check sees them.');
	process.exit(1);
}

console.log(`${checked} tracked text files carry no invisible or undecodable bytes.`);
