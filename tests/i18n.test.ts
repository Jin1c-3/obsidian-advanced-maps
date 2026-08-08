import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
