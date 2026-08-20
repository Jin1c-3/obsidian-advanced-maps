// @ts-check
import { readFileSync } from 'node:fs';
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLlmsTxt from 'starlight-llms-txt';

const repository = 'https://github.com/Jin1c-3/obsidian-advanced-maps';
const store = 'https://community.obsidian.md/plugins/advanced-maps';
// Obsidian's own URL scheme. It opens the plugin's card in a running vault, and
// does nothing at all without one, so the store page stays the offered path.
const inObsidian = 'obsidian://show-plugin?id=advanced-maps';
const site = 'https://jin1c-3.github.io';
const base = '/obsidian-advanced-maps';

// A link preview is fetched by a crawler that never runs the page, so the card
// is a committed file named by an absolute URL. See scripts/make-social-card.mjs.
const socialCard = `${site}${base}/social-card.png`;

// Inlined rather than fetched: it is smaller than the request that would get it,
// and it keeps the page to one origin. See src/scripts/image-zoom.js.
const imageZoom = readFileSync(new URL('./src/scripts/image-zoom.js', import.meta.url), 'utf8');

export default defineConfig({
	site,
	base,
	trailingSlash: 'always',
	// Redirect targets are written verbatim, so this one carries the base itself.
	redirects: { '/': `${base}/en/` },
	// Screenshots are most of this site's bytes. The two small breakpoints matter:
	// Astro's defaults start at 640 px, wider than both a phone screen and the two
	// 540 px mobile captures, so those figures otherwise keep only their original.
	image: {
		layout: 'constrained',
		responsiveStyles: true,
		breakpoints: [320, 480, 640, 750, 828, 1080, 1280, 1668, 2048, 2560],
	},
	integrations: [
		starlight({
			plugins: [
				// The English guide, also served as plain text a reader can hand to
				// an assistant. It reads the built pages; nothing is fetched.
				starlightLlmsTxt({
					projectName: 'Advanced Maps',
					description:
						"An Obsidian plugin that extends Obsidian's first-party Maps view for Bases with geotagged photo albums, GPX/GeoJSON/KML/TCX routes, Around views, offline basemaps, and GCJ-02/BD-09 alignment.",
					optionalLinks: [
						{ label: 'Community plugin store', url: store },
						{ label: 'Source repository', url: repository },
					],
				}),
			],
			title: 'Advanced Maps',
			customCss: ['./src/styles/obsidian.css'],
			favicon: '/favicon.svg',
			description: "A photo atlas and route viewer built on top of Obsidian's native Maps view.",
			head: [
				{ tag: 'meta', attrs: { property: 'og:image', content: socialCard } },
				{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
				{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
				{
					tag: 'meta',
					attrs: {
						property: 'og:image:alt',
						content: "Advanced Maps: a photo atlas and route viewer built on Obsidian's native Maps view",
					},
				},
				{ tag: 'meta', attrs: { name: 'twitter:image', content: socialCard } },
				{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}/apple-touch-icon.png` } },
				// The browser chrome follows the theme the page is drawn in.
				{
					tag: 'meta',
					attrs: { name: 'theme-color', content: '#1e1e1e', media: '(prefers-color-scheme: dark)' },
				},
				{
					tag: 'meta',
					attrs: { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
				},
				{ tag: 'script', content: imageZoom },
			],
			defaultLocale: 'en',
			locales: {
				en: { label: 'English', lang: 'en' },
				'zh-cn': { label: '简体中文', lang: 'zh-CN' },
			},
			social: [
				{ icon: 'download', label: 'Install Advanced Maps', href: store },
				{ icon: 'github', label: 'GitHub', href: repository },
			],
			// Sidebar labels come from each locale's own page title, so the two
			// locales cannot drift into different orders or stale labels. Only the
			// group headings are written here, and each carries its translation.
			sidebar: [
				{
					label: 'Get started',
					translations: { 'zh-CN': '开始使用' },
					items: [{ slug: 'getting-started' }, { slug: 'marker-icons-and-colors' }],
				},
				{
					label: 'Make a map',
					translations: { 'zh-CN': '做一张地图' },
					items: [
						{ slug: 'photo-maps' },
						{ slug: 'tracks-and-areas' },
						{ slug: 'places-in-and-out' },
						{ slug: 'around-and-navigation' },
					],
				},
				{
					label: 'Basemap and coordinates',
					translations: { 'zh-CN': '底图与坐标' },
					items: [{ slug: 'offline-basemap' }, { slug: 'coordinates-and-services' }],
				},
				{
					label: 'Reference',
					translations: { 'zh-CN': '参考' },
					items: [{ slug: 'reference-and-privacy' }, { slug: 'common-questions' }],
				},
				{
					label: 'Install',
					translations: { 'zh-CN': '安装' },
					items: [
						{ label: 'In Obsidian', translations: { 'zh-CN': '在 Obsidian 中打开' }, link: inObsidian },
						{ label: 'Community store', translations: { 'zh-CN': '社区插件页' }, link: store },
						{ label: 'Releases', translations: { 'zh-CN': '版本更新' }, link: `${repository}/releases` },
					],
				},
			],
		}),
		// The landing page is the one page written as MDX, for its card grid.
		mdx(),
	],
});
