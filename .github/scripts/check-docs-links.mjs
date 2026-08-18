/*
 * Keeps the documentation's own references honest.
 *
 * The guide is read in three places — a repository file browser, the project
 * README, and the published site — and each of them resolves a relative path
 * differently. A page renamed in one locale, an image moved out of `docs/`, or a
 * page missing from the site's sidebar all fail silently: the file browser shows
 * a 404 only when someone clicks, and the site build is happy to publish a link
 * to nothing.
 *
 * External URLs are deliberately not fetched. A documentation check that fails
 * because a third party is briefly down is a check people learn to ignore.
 *
 * Usage: node .github/scripts/check-docs-links.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const repo = resolve(import.meta.dirname, '..', '..');
const GUIDE = join(repo, 'docs', 'guide');
const LOCALES = ['en', 'zh-cn'];
const ENTRY_DOCUMENTS = ['README.md', 'README.zh-CN.md', 'CLAUDE.md', 'CONTRIBUTING.md'];
const SITE_CONFIG = join(repo, 'website', 'astro.config.mjs');
const SITE_OUTPUT = join(repo, 'website', 'dist');
const INDEX_SOURCE = 'README.md';

const problems = [];
const report = (file, message) => problems.push(`${relative(repo, file)}: ${message}`);

const markdownIn = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return markdownIn(path);
		return entry.name.endsWith('.md') ? [path] : [];
	});

/** Link and image targets, minus the ones no local check can resolve. */
function* referencesOf(text) {
	for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
		const target = match[1];
		if (/^(https?:|mailto:|#|\/)/.test(target)) continue;
		yield target;
	}
}

// 1. Every relative reference resolves to a file that exists.
const documents = [
	...markdownIn(GUIDE),
	...ENTRY_DOCUMENTS.map((name) => join(repo, name)),
	...markdownIn(join(repo, 'docs')).filter((path) => !path.startsWith(GUIDE)),
];

let checked = 0;
for (const file of new Set(documents)) {
	const text = readFileSync(file, 'utf8');
	for (const target of referencesOf(text)) {
		checked += 1;
		const [path] = target.split('#');
		if (!path) continue;
		if (!existsSync(resolve(dirname(file), path))) report(file, `link to a missing target: ${target}`);
	}
}

// 2. The two locales hold the same pages, so no locale switch leads nowhere.
const pagesOf = (locale) =>
	readdirSync(join(GUIDE, locale))
		.filter((name) => name.endsWith('.md'))
		.sort();
const [english, chinese] = LOCALES.map(pagesOf);
for (const name of english) {
	if (!chinese.includes(name)) problems.push(`docs/guide/zh-cn/${name} is missing, but the English guide has it`);
}
for (const name of chinese) {
	if (!english.includes(name)) problems.push(`docs/guide/en/${name} is missing, but the Chinese guide has it`);
}
if (!english.includes(INDEX_SOURCE)) problems.push(`docs/guide/en/${INDEX_SOURCE} is missing`);

// 3. Every page is in the site's sidebar, and every sidebar entry is a page.
const config = readFileSync(SITE_CONFIG, 'utf8');
const sidebar = [...config.matchAll(/\{\s*slug:\s*'([^']+)'\s*\}/g)].map((match) => match[1]);
const expected = english.filter((name) => name !== INDEX_SOURCE).map((name) => name.replace(/\.md$/, ''));
for (const slug of expected) {
	if (!sidebar.includes(slug)) problems.push(`website/astro.config.mjs: the sidebar is missing ${slug}`);
}
for (const slug of sidebar) {
	if (!expected.includes(slug))
		problems.push(`website/astro.config.mjs: the sidebar names ${slug}, which is not a guide page`);
}

// 4. When the site has been built, no page it publishes links to one it does not.
if (existsSync(SITE_OUTPUT)) {
	const htmlIn = (dir) =>
		readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return htmlIn(path);
			return entry.name.endsWith('.html') ? [path] : [];
		});
	const base = /const base = '([^']+)'/.exec(config)?.[1];
	if (!base) throw new Error('website/astro.config.mjs no longer declares a base path');
	for (const file of htmlIn(SITE_OUTPUT)) {
		const text = readFileSync(file, 'utf8');
		for (const match of text.matchAll(/href="([^"]+)"/g)) {
			const href = match[1];
			if (!href.startsWith(base + '/') || /\.[a-z0-9]+$/i.test(href.split('#')[0])) continue;
			const [path] = href.split('#');
			const target = join(SITE_OUTPUT, path.slice(base.length), 'index.html');
			if (!existsSync(target)) report(file, `published link to a page that was not built: ${href}`);
		}
		for (const match of text.matchAll(/(?:src|href)="((?:\.\.?\/)[^"]+)"/g)) {
			const [path] = match[1].split('#');
			const candidate = resolve(dirname(file), path);
			const built = statSync(candidate, { throwIfNoEntry: false });
			if (!built) report(file, `published reference to a missing file: ${match[1]}`);
			else if (built.isDirectory() && !existsSync(join(candidate, 'index.html')))
				report(file, `published link to a directory with no page: ${match[1]}`);
		}
	}
}

if (problems.length > 0) {
	for (const problem of problems) console.error(problem);
	console.error(`\n${problems.length} documentation reference problem(s).`);
	process.exit(1);
}

console.log(`${checked} documentation references resolve; both locales carry ${english.length} pages.`);
