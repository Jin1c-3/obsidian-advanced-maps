import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Obsidian from 'obsidian';
import type { App, Setting, SettingGroup } from 'obsidian';
import type AdvancedMapsPlugin from '../src/main';
import { setLocale, type Locale } from '../src/i18n';
import { releaseSummaries, releaseText } from '../src/releases';
import { AdvancedMapsSettingTab, DEFAULT_SETTINGS } from '../src/settings';
import { installDomHelpers } from './obsidian-stub';

vi.mock('obsidian', async (importOriginal) => ({
	...(await importOriginal<typeof Obsidian>()),
	debounce: (callback: () => void) => callback,
}));

beforeAll(() => {
	installDomHelpers(['createEl', 'empty', 'addClass', 'appendText']);
	vi.stubGlobal('createFragment', () => {
		const fragment = document.createDocumentFragment();
		fragment.createSpan = (options) => {
			const span = document.createElement('span');
			if (typeof options === 'string') span.className = options;
			else {
				span.className = typeof options?.cls === 'string' ? options.cls : '';
				if (typeof options?.text === 'string') span.textContent = options.text;
			}
			fragment.append(span);
			return span;
		};
		fragment.appendText = (text) => fragment.append(document.createTextNode(text));
		return fragment;
	});
});
afterEach(() => setLocale(null));

function render(version: string, locale: Locale = 'en') {
	setLocale(locale);
	const saveSettings = vi.fn();
	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		manifest: { version },
		saveSettings,
	} as unknown as AdvancedMapsPlugin;
	const app = { workspace: { onLayoutReady: () => undefined } } as unknown as App;
	const tab = new AdvancedMapsSettingTab(app, plugin);
	const definitions = tab.getSettingDefinitions();
	const first = definitions[0];
	if (!('render' in first) || typeof first.render !== 'function')
		throw new Error('expected release information first');
	const settingEl = document.createElement('div');
	first.render({ settingEl } as unknown as Setting, {} as SettingGroup);
	return { first, definitions, settingEl, saveSettings, plugin };
}

describe('release information on the settings home', () => {
	it('shows the installed summary first without becoming a setting or writing data', () => {
		const version = '1.19.0';
		const { first, definitions, settingEl, saveSettings, plugin } = render(version);
		expect(first.searchable).toBe(false);
		expect(first).not.toHaveProperty('control');
		expect(definitions[1]).toHaveProperty('render');
		expect(settingEl.classList.contains('advanced-maps-release')).toBe(true);
		expect(settingEl.querySelector('strong')?.textContent).toBe(`What’s new · ${version}`);
		expect(settingEl.querySelector('p')?.textContent).toBe(releaseText(releaseSummaries(version).current!, 'en'));
		expect(settingEl.querySelector('a')?.getAttribute('href')).toBe(
			'https://github.com/Jin1c-3/obsidian-advanced-maps/blob/main/CHANGELOG.md'
		);
		expect(saveSettings).not.toHaveBeenCalled();
		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps the history folded and excludes the current and later versions', () => {
		const { settingEl } = render('1.18.6');
		const details = settingEl.querySelector('details');
		expect(details?.open).toBe(false);
		expect(details?.querySelector('summary')?.textContent).toBe('Previous updates');
		const versions = [...settingEl.querySelectorAll('li strong')].map((el) => el.textContent);
		expect(versions).toEqual(releaseSummaries('1.18.6').history.map((release) => release.version));
		expect(versions).not.toContain('1.19.0');
		expect(versions).not.toContain('1.18.6');
	});

	it('shows the Chinese summary and labels together', () => {
		const { settingEl } = render('1.19.0', 'zh');
		expect(settingEl.querySelector('strong')?.textContent).toBe('最近更新 · 1.19.0');
		expect(settingEl.querySelector('p')?.textContent).toBe(releaseText(releaseSummaries('1.19.0').current!, 'zh'));
		expect(settingEl.querySelector('summary')?.textContent).toBe('历史更新');
		expect(settingEl.querySelector('a')?.textContent).toBe('完整更新记录');
	});

	it('shows only the installed version and log link when no matching release exists', () => {
		const { settingEl } = render('development');
		expect(settingEl.querySelector('strong')?.textContent).toBe('What’s new · development');
		expect(settingEl.querySelector('p')).toBeNull();
		expect(settingEl.querySelector('details')).toBeNull();
		expect(settingEl.querySelector('a')).not.toBeNull();
	});

	it('omits an empty history before the first recorded release', () => {
		const { settingEl } = render('1.0.0');
		expect(settingEl.querySelector('details')).toBeNull();
	});
});
