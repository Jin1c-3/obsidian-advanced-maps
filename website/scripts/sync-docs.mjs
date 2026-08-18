// Copies the guide out of `docs/` and into this project's content collection.
// The guide stays the single source: nothing here is edited by hand, and the
// transforms below exist only because a repository file browser and a static
// site want the same prose shaped slightly differently.
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
	if (!title) throw new Error('page has no title');
	return {
		body: text.slice(match[0].length),
		title: scalar(title[1]),
		description: description ? scalar(description[1]) : '',
	};
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

const transform = (text, { locale, name }) => {
	const isIndex = name === INDEX_SOURCE;
	const up = isIndex ? '' : '../';
	const { body, title, description } = frontmatterOf(text);

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

	const frontmatter = [
		'---',
		`title: ${JSON.stringify(title)}`,
		`description: ${JSON.stringify(description)}`,
		`editUrl: ${JSON.stringify(`${REPO}/edit/main/docs/guide/${locale}/${name}`)}`,
		'---',
	];
	return `${frontmatter.join('\n')}\n\n${out.trimStart()}`;
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
		const target = name === INDEX_SOURCE ? 'index.md' : name;
		try {
			await writeFile(join(DOCS_OUT, locale, target), transform(text, { locale, name }));
		} catch (error) {
			throw new Error(`docs/guide/${locale}/${name}: ${error.message}`);
		}
		pages += 1;
	}
}

console.log(`synced ${pages} guide pages and the figures into src/content/`);
