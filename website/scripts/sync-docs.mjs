// Copies the guide out of `docs/` and into this project's content collection.
// The guide stays the single source: nothing here is edited by hand, and the
// transforms below exist only because a repository file browser and a static
// site want the same prose shaped slightly differently.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(site, '..');

const GUIDE = join(repo, 'docs', 'guide');
const IMAGES = join(repo, 'docs', 'images');
const DOCS_OUT = join(site, 'src', 'content', 'docs');
const IMAGES_OUT = join(site, 'src', 'content', 'images');

const LOCALES = ['en', 'zh-cn'];
const REPO = 'https://github.com/Jin1c-3/obsidian-advanced-maps';
const STORE = 'https://community.obsidian.md/plugins/advanced-maps';
const OBSIDIAN = 'obsidian://show-plugin?id=advanced-maps';
const INDEX_SOURCE = 'README.md';

/** A link that climbs out of `docs/guide/<locale>/` points at a repository file. */
const ESCAPES_GUIDE = /^\.\.\/\.\.\/\.\.\//;

/** Reads a single-line YAML scalar, quoted either way or bare. */
const scalar = (raw) => {
	const value = raw.trim();
	const quote = value[0];
	if (quote !== "'" && quote !== '"') return value;
	return value.slice(1, -1).replaceAll(quote + quote, quote);
};

const frontmatterOf = (text) => {
	const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
	if (!match) throw new Error('page has no frontmatter');
	const title = /^title:\s*(.*)$/m.exec(match[1]);
	const description = /^description:\s*(.*)$/m.exec(match[1]);
	// A page title carries the words someone would search for; the sidebar wants
	// the short name. `sidebarLabel` lets one page have both.
	const sidebarLabel = /^sidebarLabel:\s*(.*)$/m.exec(match[1]);
	// The index page's own sentence about the plugin, which the site shows as the
	// landing page's tagline and a file browser shows as one more frontmatter row.
	const tagline = /^tagline:\s*(.*)$/m.exec(match[1]);
	if (!title) throw new Error('page has no title');
	return {
		body: text.slice(match[0].length),
		title: scalar(title[1]),
		description: description ? scalar(description[1]) : '',
		sidebarLabel: sidebarLabel ? scalar(sidebarLabel[1]) : '',
		tagline: tagline ? scalar(tagline[1]) : '',
	};
};

/**
 * When the prose itself last changed. The copy this script writes is not in
 * version control, so Starlight can read no date from it; the guide page it was
 * made from carries the history worth showing. A shallow clone would date every
 * page from the tip commit, so the site's workflow fetches the full history.
 */
const lastUpdatedOf = (locale, name) => {
	try {
		const path = `docs/guide/${locale}/${name}`;
		return execFileSync('git', ['log', '-1', '--format=%cI', '--', path], {
			cwd: repo,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		// No git, no history, or a page that has never been committed: the page
		// simply publishes without a date.
		return '';
	}
};

const repoUrl = (target) => {
	const path = target.replace(ESCAPES_GUIDE, '');
	const kind = /\.[a-z]+$/i.test(path.split('#')[0]) ? 'blob' : 'tree';
	return `${REPO}/${kind}/main/${path}`;
};

/**
 * Rewrites a link between guide pages into a site-relative URL. With
 * `trailingSlash: 'always'` a page is served from its own directory, so a
 * sibling page is one level further up than the file layout suggests. The index
 * page is the exception: it is served at the locale root already.
 */
const pageUrl = (target, up) => {
	const [path, anchor = ''] = target.split('#');
	const hash = anchor ? `#${anchor}` : '';
	const name = path.replace(/\.md$/, '');
	if (name === 'README') return `${up || './'}${hash}`;
	if (name.endsWith(`/${'README'}`)) return `${up}${name.slice(0, -'README'.length)}${hash}`;
	return `${up}${name}/${hash}`;
};

/**
 * GitHub's alert syntax reads as a callout in GitHub and in Obsidian, and as a
 * plain blockquote anywhere else, so the guide can carry one without losing a
 * reader. Starlight draws the same thing from an aside instead. Only these five
 * kinds convert; an ordinary blockquote stays a blockquote.
 *
 * Two alert kinds share `caution`, and Starlight titles each aside in the
 * locale being read, so no title is written here.
 */
const ASIDES = { NOTE: 'note', TIP: 'tip', IMPORTANT: 'caution', WARNING: 'caution', CAUTION: 'danger' };

const asides = (body) =>
	body.replace(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n((?:>.*\n)+)/gm, (_match, kind, quoted) => {
		const lines = quoted
			.trimEnd()
			.split('\n')
			.map((line) => line.replace(/^>[ \t]?/, ''));
		return `:::${ASIDES[kind]}\n${lines.join('\n')}\n:::\n`;
	});

/**
 * The landing page's buttons. Unlike the prose around them these are site
 * chrome — the same three actions in both locales — so they live here beside
 * the other locale-dependent plumbing rather than in the guide's own text.
 */
const HERO_ACTIONS = {
	en: [
		{ text: 'Read the guide', link: './getting-started/', icon: 'right-arrow', variant: 'primary' },
		{ text: 'Open in Obsidian', link: OBSIDIAN, icon: 'download', variant: 'secondary' },
		{ text: 'Community store', link: STORE, icon: 'external', variant: 'minimal' },
	],
	'zh-cn': [
		{ text: '阅读指南', link: './getting-started/', icon: 'right-arrow', variant: 'primary' },
		{ text: '在 Obsidian 中打开', link: OBSIDIAN, icon: 'download', variant: 'secondary' },
		{ text: '社区插件页', link: STORE, icon: 'external', variant: 'minimal' },
	],
};

const yamlString = (value) => JSON.stringify(value);

const heroOf = (locale, tagline) =>
	[
		'template: splash',
		'hero:',
		`  title: ${yamlString('Advanced Maps')}`,
		`  tagline: ${yamlString(tagline)}`,
		'  actions:',
		...HERO_ACTIONS[locale].flatMap((action) => [
			`    - text: ${yamlString(action.text)}`,
			`      link: ${yamlString(action.link)}`,
			`      icon: ${yamlString(action.icon)}`,
			`      variant: ${yamlString(action.variant)}`,
		]),
	].join('\n');

const attribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('{', '&#123;');

/**
 * The index page's "choose a workflow" table is a list of links wearing a
 * table's clothes: two columns, and every second cell a single link. On the
 * landing page those rows read better as cards. A table of any other shape is
 * left exactly as it is, so this cannot quietly mangle a real table.
 */
const cardGrid = (body) => {
	const table = /^\|(?<head>[^\n]*)\|\n\|[-\s:|]+\|\n(?<rows>(?:\|[^\n]*\|\n)+)/m.exec(body);
	if (!table) return { body, cards: false };

	const cards = [];
	for (const row of table.groups.rows.trimEnd().split('\n')) {
		const cells = row.slice(1, -1).split('|');
		if (cells.length !== 2) return { body, cards: false };
		const link = /^\[(?<label>[^\]]+)\]\((?<href>[^)\s]+)\)$/.exec(cells[1].trim());
		if (!link) return { body, cards: false };
		cards.push(
			`\t<LinkCard title="${attribute(link.groups.label)}" href="${attribute(link.groups.href)}" ` +
				`description="${attribute(cells[0].trim())}" />`
		);
	}

	return { body: body.replace(table[0], `<CardGrid>\n${cards.join('\n')}\n</CardGrid>\n`), cards: true };
};

const transform = (text, { locale, name }) => {
	const isIndex = name === INDEX_SOURCE;
	// A page is served from its own directory, and the index from the locale root
	// itself, so both write their sibling links from where they are served.
	const up = isIndex ? './' : '../';
	const { body, title, description, sidebarLabel, tagline } = frontmatterOf(text);
	const lastUpdated = lastUpdatedOf(locale, name);

	let out = body
		// The hand-written locale/index line is what the sidebar and the locale
		// switcher already do here.
		.replace(/<!-- nav:start -->\n*[\s\S]*?<!-- nav:end -->\n*/g, '')
		// Starlight renders the frontmatter title as the page heading itself.
		.replace(new RegExp(`^\\n*# ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n+`), '');

	out = out.replace(/\]\(([^)\s]+)\)/g, (match, target) => {
		if (/^(https?:|mailto:|#)/.test(target)) return match;
		if (ESCAPES_GUIDE.test(target)) return `](${repoUrl(target)})`;
		if (!/\.md(#|$)/.test(target)) return match; // an image, resolved by Astro
		return `](${pageUrl(target, up)})`;
	});

	out = asides(out);

	// Only the landing page becomes MDX, and only for its cards. Every other page
	// stays Markdown, which is what the guide is written in.
	const grid = isIndex ? cardGrid(out) : { body: out, cards: false };
	out = grid.cards
		? `import { CardGrid, LinkCard } from '@astrojs/starlight/components';\n\n${grid.body}`
		: grid.body;

	const frontmatter = [
		'---',
		`title: ${JSON.stringify(title)}`,
		`description: ${JSON.stringify(description)}`,
		`editUrl: ${JSON.stringify(`${REPO}/edit/main/docs/guide/${locale}/${name}`)}`,
		// Unquoted, so the frontmatter parser reads a timestamp rather than a
		// string: Starlight's schema wants a date here.
		...(lastUpdated ? [`lastUpdated: ${lastUpdated}`] : []),
		...(sidebarLabel ? ['sidebar:', `  label: ${JSON.stringify(sidebarLabel)}`] : []),
		// A reader arriving from the store meets the plugin, not a table of
		// contents: the index page is drawn as a hero over the same prose.
		...(isIndex && tagline ? [heroOf(locale, tagline)] : []),
		'---',
	];
	return {
		text: `${frontmatter.join('\n')}\n\n${out.trimStart()}`,
		extension: grid.cards ? 'mdx' : 'md',
	};
};

await rm(DOCS_OUT, { recursive: true, force: true });
await rm(IMAGES_OUT, { recursive: true, force: true });
await cp(IMAGES, IMAGES_OUT, { recursive: true });

let pages = 0;
for (const locale of LOCALES) {
	await mkdir(join(DOCS_OUT, locale), { recursive: true });
	for (const name of await readdir(join(GUIDE, locale))) {
		if (!name.endsWith('.md')) continue;
		const text = await readFile(join(GUIDE, locale, name), 'utf8');
		try {
			const page = transform(text, { locale, name });
			const target = name === INDEX_SOURCE ? `index.${page.extension}` : name;
			await writeFile(join(DOCS_OUT, locale, target), page.text);
		} catch (error) {
			throw new Error(`docs/guide/${locale}/${name}: ${error.message}`);
		}
		pages += 1;
	}
}

console.log(`synced ${pages} guide pages and the figures into src/content/`);
