import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GUIDE_URL } from '../src/constants';
import { detectLocale, getLocale, setLocale, t, translations } from '../src/i18n';

/* Obsidian runs in Electron, where localStorage is always there. The test DOM
 * makes no such promise, so supply one rather than depend on the environment. */
const store = new Map<string, string>();

beforeAll(() => {
	Object.defineProperty(window, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => store.set(key, String(value)),
			removeItem: (key: string) => store.delete(key),
		},
	});
});

afterEach(() => {
	setLocale(null);
	store.clear();
});

describe('translation tables', () => {
	it('stay in step', () => {
		expect(Object.keys(translations.zh).sort()).toEqual(Object.keys(translations.en).sort());
	});

	it('have no blank entries', () => {
		for (const [locale, table] of Object.entries(translations)) {
			for (const [key, value] of Object.entries(table)) {
				expect(value.trim(), `${locale}.${key}`).not.toBe('');
			}
		}
	});

	it('keep the same placeholders in both languages', () => {
		const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
		for (const key of Object.keys(translations.en) as Array<keyof typeof translations.en>) {
			expect(placeholders(translations.zh[key]), key).toEqual(placeholders(translations.en[key]));
		}
	});
});

describe('t', () => {
	it('answers in the active locale', () => {
		setLocale('en');
		expect(t('options.tracks')).toBe('Tracks');
		setLocale('zh');
		expect(t('options.tracks')).toBe('轨迹');
	});

	it('substitutes placeholders', () => {
		setLocale('en');
		expect(t('notice.noCoords', { file: 'Trip', property: 'coords' })).toBe('"Trip" has no coords');
		setLocale('zh');
		expect(t('notice.noCoords', { file: 'Trip', property: 'coords' })).toBe('「Trip」没有 coords');
	});

	it('leaves a placeholder it was given no value for', () => {
		setLocale('en');
		expect(t('notice.baseNotFound', {})).toBe('Could not find {path}');
	});
});

describe('detectLocale', () => {
	it('follows the language Obsidian stored', () => {
		window.localStorage.setItem('language', 'zh');
		expect(detectLocale()).toBe('zh');
		window.localStorage.setItem('language', 'zh-TW');
		expect(detectLocale()).toBe('zh');
		window.localStorage.setItem('language', 'de');
		expect(detectLocale()).toBe('en');
	});

	it('is resolved once and then cached', () => {
		window.localStorage.setItem('language', 'zh');
		expect(getLocale()).toBe('zh');
		window.localStorage.setItem('language', 'en');
		expect(getLocale()).toBe('zh');
	});
});

describe("the settings pane's first row", () => {
	// The badge is the whole affordance: its emoji and its words are the link, so
	// a locale that drops the emoji quietly changes what the row looks like.
	// Nothing else would notice — the row is not searchable and has no control to
	// read back.
	it('leads each badge with an emoji', () => {
		for (const [locale, table] of Object.entries(translations)) {
			for (const key of ['settings.about.guide.link', 'settings.about.star.link'] as const) {
				expect(table[key], `${locale}.${key}`).toMatch(/^\p{Extended_Pictographic}\s/u);
			}
		}
	});

	it('sends each locale to its own guide', () => {
		const locales = Object.keys(translations) as Array<keyof typeof translations>;
		expect(Object.keys(GUIDE_URL).sort()).toEqual(locales.sort());
		// Trailing slash included: the published site is built with
		// `trailingSlash: 'always'`, and the address without one is a redirect.
		for (const [locale, url] of Object.entries(GUIDE_URL)) {
			expect(url, locale).toMatch(/^https:\/\/jin1c-3\.github\.io\/obsidian-advanced-maps\/[a-z-]+\/$/);
		}
		expect(new Set(Object.values(GUIDE_URL)).size).toBe(locales.length);
	});
});
