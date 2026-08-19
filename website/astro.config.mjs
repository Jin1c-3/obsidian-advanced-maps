// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

const repository = 'https://github.com/Jin1c-3/obsidian-advanced-maps';
const base = '/obsidian-advanced-maps';

// Both locales keep a URL prefix so that `en/` and `zh-cn/` pages sit at the
// same depth: the guide's `../../images/…` references then resolve identically
// in the repository and in this project's synced copy.
export default defineConfig({
	site: 'https://jin1c-3.github.io',
	base,
	trailingSlash: 'always',
	// Redirect targets are written verbatim, so this one carries the base itself.
	redirects: { '/': `${base}/en/` },
	integrations: [
		starlight({
			title: 'Advanced Maps',
			customCss: ['./src/styles/obsidian.css'],
			favicon: '/favicon.svg',
			description: 'A photo atlas and route viewer built on top of Obsidian native Maps view.',
			defaultLocale: 'en',
			locales: {
				en: { label: 'English', lang: 'en' },
				'zh-cn': { label: '简体中文', lang: 'zh-CN' },
			},
			social: [{ icon: 'github', label: 'GitHub', href: repository }],
			// Sidebar labels come from each locale's own page title, so the two
			// locales cannot drift into different orders or stale labels.
			sidebar: [
				{ slug: 'getting-started' },
				{ slug: 'marker-icons-and-colors' },
				{ slug: 'photo-maps' },
				{ slug: 'tracks-and-areas' },
				{ slug: 'around-and-navigation' },
				{ slug: 'places-in-and-out' },
				{ slug: 'offline-basemap' },
				{ slug: 'coordinates-and-services' },
				{ slug: 'reference-and-privacy' },
			],
		}),
	],
});
