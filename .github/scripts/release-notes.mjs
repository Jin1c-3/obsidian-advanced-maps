/*
 * Cuts one version's section out of CHANGELOG.md, for the release body.
 *
 * The changelog is the curated source for release prose, so this hands the
 * matching section to GitHub instead of deriving notes from PR titles.
 *
 * A version with no section is a hard failure rather than an empty body, on
 * the same grounds as the manifest check next door: a release nobody can read
 * is easier to prevent than to fix once it is published and mirrored.
 *
 * Usage: node .github/scripts/release-notes.mjs <version> [> notes.md]
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const version = process.argv[2];
if (!version) {
	console.error('Usage: release-notes.mjs <version>');
	process.exit(1);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');

/* Headings are `## [1.6.0]`, and the section runs to the next `## ` at the
 * start of a line — which is the previous release, or the link definitions at
 * the foot of the file. Escaped because a version is full of dots. */
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const section = new RegExp(String.raw`^## \[${escaped}\][^\n]*\n(.*?)(?=^## |^\[)`, 'ms').exec(changelog);

if (!section) {
	console.error(`CHANGELOG.md has no "## [${version}]" section.`);
	console.error('Add one before tagging — the release body is cut from it.');
	process.exit(1);
}

const body = section[1].trim();
if (body === '') {
	console.error(`CHANGELOG.md's "## [${version}]" section is empty.`);
	process.exit(1);
}

process.stdout.write(`${body}\n`);
