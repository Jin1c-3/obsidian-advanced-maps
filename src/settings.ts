import { PluginSettingTab, type App, type Setting, type SettingDefinition, type SettingDefinitionItem } from 'obsidian';
import { COORD_MODES, knownMode, type CoordMode } from './coords';
import { GEOCODE_PROVIDERS, type GeocodeProvider } from './geocode';
import { t, type TranslationKey } from './i18n';
import type AdvancedMapsPlugin from './main';

export interface AdvancedMapsSettings {
	/** Default coordinate mode; a view option can override it. */
	coordSystem: CoordMode;
	trackColor: string;
	trackWeight: number;
	trackOpacity: number;
	fitMaxZoom: number;
	embedHeight: number;
	/** The numbers under an inline map, and the chart under those. */
	trackStats: boolean;
	elevationProfile: boolean;
	/** "Open in map" — the pop-up launched from a note's ⋮ menu. */
	basePath: string;
	viewName: string;
	coordsProperty: string;
	openZoom: number;
	menuLabel: string;
	/** The view added to the base for "a map of the notes around this one". */
	aroundViewName: string;
	/** Place search — the one feature that leaves the vault. */
	geocodeProvider: GeocodeProvider;
	amapKey: string;
	/** Location — filling `coordsProperty` from the device. */
	locate: boolean;
	autoFillCoords: boolean;
	autoFillExclude: string;
}

/* Blank is meaningful for four of these: `menuLabel` and `aroundViewName` blank
 * fall back to their localized names, and `viewName` blank takes the base's
 * first map view. `basePath` blank simply means "Open in map" is not configured
 * yet.
 *
 * `locate` starts off because the first request raises a permission prompt and
 * because recording where each note was written is a decision, not a default.
 * `autoFillCoords` starts on: it only matters once `locate` is on, and by then
 * filling in the blank is the thing that was asked for. */
export const DEFAULT_SETTINGS: AdvancedMapsSettings = {
	coordSystem: 'auto',
	trackColor: 'var(--bases-map-marker-background)',
	trackWeight: 4,
	trackOpacity: 85,
	fitMaxZoom: 16,
	embedHeight: 320,
	trackStats: true,
	elevationProfile: true,
	basePath: '',
	viewName: '',
	coordsProperty: 'coords',
	openZoom: 15,
	menuLabel: '',
	aroundViewName: '',
	geocodeProvider: 'nominatim',
	amapKey: '',
	locate: false,
	autoFillCoords: true,
	autoFillExclude: 'templates',
};

/** Path fragments that switch off the automatic fill, as a usable list. */
export function excludedFragments(setting: string): string[] {
	return setting
		.split(',')
		.map((part) => part.trim().toLowerCase())
		.filter((part) => part.length > 0);
}

/** Is this note one the automatic fill should keep its hands off? */
export function isExcluded(path: string, setting: string): boolean {
	const lower = path.toLowerCase();
	return excludedFragments(setting).some((fragment) => lower.includes(fragment));
}

const BASE_PATH_PLACEHOLDER = 'places.base';

/** Every settings key, so a definition cannot name one that does not exist. */
type Key = keyof AdvancedMapsSettings;

/**
 * Settings are **declared**, not drawn.
 *
 * Obsidian 1.13 renders a tab from `getSettingDefinitions()` and — the reason
 * this is worth the change — indexes what it renders, so every setting below is
 * reachable from the search box at the top of the settings window. A tab that
 * paints itself in `display()` is invisible to that search, and this plugin
 * already requires 1.13.1, so there is no older Obsidian to keep the old path
 * for.
 *
 * It also removes the one piece of manual bookkeeping the old tab had: showing
 * the Amap key only under the Amap provider used to mean re-running `display()`
 * from inside a dropdown's own handler. Now the row states when it is `visible`
 * and `update()` re-asks.
 */
export class AdvancedMapsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: AdvancedMapsPlugin
	) {
		super(app, plugin);
	}

	/**
	 * A heading, and under it the one line saying what the group is for.
	 *
	 * The line is a nameless `render` item — the shape Obsidian's own settings
	 * use for prose, and the only one that works: a definition with neither a
	 * control nor a `render` is dropped before it reaches the DOM, so the same
	 * row written as `{ name: '', desc }` renders nothing at all. Measured, not
	 * assumed. `searchable: false` because it is context, not a setting to find.
	 */
	private group(key: 'coord' | 'open' | 'search' | 'locate' | 'tracks', items: SettingDefinition<Key>[]) {
		const intro = t(`settings.${key}.intro`);
		return {
			type: 'group' as const,
			heading: t(`settings.${key}.heading`),
			items: [
				{
					name: '',
					searchable: false,
					render: (setting: Setting) => {
						setting.settingEl.empty();
						setting.settingEl.addClass('advanced-maps-intro');
						setting.settingEl.createEl('p', { cls: 'setting-item-description', text: intro });
					},
				},
				...items,
			],
		};
	}

	private text(
		name: TranslationKey,
		desc: TranslationKey | undefined,
		key: Key,
		opts: { placeholder?: string; vars?: Record<string, string> } = {}
	): SettingDefinition<Key> {
		return {
			name: t(name),
			desc: desc ? t(desc, opts.vars) : undefined,
			control: { type: 'text', key, placeholder: opts.placeholder },
		};
	}

	private slider(
		name: TranslationKey,
		desc: TranslationKey | undefined,
		key: Key,
		min: number,
		max: number,
		step: number
	): SettingDefinition<Key> {
		return {
			name: t(name),
			desc: desc ? t(desc) : undefined,
			control: { type: 'slider', key, min, max, step },
		};
	}

	private toggle(
		name: TranslationKey,
		desc: TranslationKey,
		key: Key,
		vars?: Record<string, string>
	): SettingDefinition<Key> {
		return { name: t(name), desc: t(desc, vars), control: { type: 'toggle', key } };
	}

	override getSettingDefinitions(): SettingDefinitionItem<Key>[] {
		const coordModes: Record<string, string> = {};
		for (const mode of COORD_MODES) coordModes[mode] = t(`coord.${mode}`);
		const providers: Record<string, string> = {};
		for (const provider of GEOCODE_PROVIDERS) providers[provider] = t(`search.provider.${provider}`);

		return [
			this.group('coord', [
				{
					name: t('settings.coord.default.name'),
					desc: t('settings.coord.default.desc'),
					control: { type: 'dropdown', key: 'coordSystem', options: coordModes },
				},
			]),

			this.group('open', [
				this.text('settings.open.basePath.name', 'settings.open.basePath.desc', 'basePath', {
					placeholder: BASE_PATH_PLACEHOLDER,
				}),
				this.text('settings.open.viewName.name', 'settings.open.viewName.desc', 'viewName'),
				this.text('settings.open.coordsProperty.name', 'settings.open.coordsProperty.desc', 'coordsProperty', {
					placeholder: DEFAULT_SETTINGS.coordsProperty,
				}),
				this.slider('settings.open.zoom.name', undefined, 'openZoom', 1, 18, 1),
				this.text('settings.open.aroundView.name', 'settings.open.aroundView.desc', 'aroundViewName', {
					placeholder: t('view.around'),
				}),
				// The only cosmetic field in the group, so it comes last.
				this.text('settings.open.label.name', 'settings.open.label.desc', 'menuLabel', {
					placeholder: t('command.openInMap'),
				}),
			]),

			this.group('search', [
				{
					name: t('settings.search.provider.name'),
					desc: t('settings.search.provider.desc'),
					control: { type: 'dropdown', key: 'geocodeProvider', options: providers },
				},
				{
					name: t('settings.search.amapKey.name'),
					desc: t('settings.search.amapKey.desc'),
					// Only shown for the provider that needs it: an empty box under a
					// provider that ignores it reads as something left unconfigured.
					visible: () => this.plugin.settings.geocodeProvider === 'amap',
					control: { type: 'text', key: 'amapKey' },
				},
			]),

			this.group('locate', [
				this.toggle('settings.locate.enable.name', 'settings.locate.enable.desc', 'locate'),
				this.toggle('settings.locate.auto.name', 'settings.locate.auto.desc', 'autoFillCoords', {
					property: this.plugin.settings.coordsProperty,
				}),
				this.text('settings.locate.exclude.name', 'settings.locate.exclude.desc', 'autoFillExclude', {
					placeholder: DEFAULT_SETTINGS.autoFillExclude,
				}),
			]),

			this.group('tracks', [
				this.text('settings.tracks.color.name', 'settings.tracks.color.desc', 'trackColor', {
					placeholder: DEFAULT_SETTINGS.trackColor,
				}),
				this.slider('settings.tracks.weight.name', undefined, 'trackWeight', 1, 12, 1),
				this.slider('settings.tracks.opacity.name', undefined, 'trackOpacity', 10, 100, 5),
				this.slider(
					'settings.tracks.fitMaxZoom.name',
					'settings.tracks.fitMaxZoom.desc',
					'fitMaxZoom',
					1,
					20,
					1
				),
				this.slider(
					'settings.tracks.embedHeight.name',
					'settings.tracks.embedHeight.desc',
					'embedHeight',
					160,
					800,
					20
				),
				this.toggle('settings.tracks.stats.name', 'settings.tracks.stats.desc', 'trackStats'),
				this.toggle('settings.tracks.profile.name', 'settings.tracks.profile.desc', 'elevationProfile'),
			]),
		];
	}

	/**
	 * Where a cleared field lands, and what has to happen elsewhere once a value
	 * changes.
	 *
	 * Blank is meaningful for four keys and only two of them mean "the default":
	 * `menuLabel`, `aroundViewName` and `viewName` all use their own emptiness as
	 * an answer, so they are stored empty and resolved at the point of use.
	 */
	override async setControlValue(key: string, value: unknown): Promise<void> {
		let next = value;
		if (typeof next === 'string') {
			next = next.trim();
			if (next === '' && (key === 'coordsProperty' || key === 'trackColor')) {
				next = DEFAULT_SETTINGS[key];
			}
		}
		// The two dropdowns only ever offer valid options, but the value still
		// gets checked on its way in: what reaches here is a string, and a stored
		// setting outlives the version of the plugin that wrote it.
		if (key === 'coordSystem') next = knownMode(next) ?? DEFAULT_SETTINGS.coordSystem;
		if (key === 'geocodeProvider' && !(GEOCODE_PROVIDERS as readonly unknown[]).includes(next)) {
			next = DEFAULT_SETTINGS.geocodeProvider;
		}
		await super.setControlValue(key, next);

		switch (key) {
			case 'coordSystem':
				this.plugin.reprojectAll();
				break;
			case 'geocodeProvider':
				// The Amap key row states when it is visible; this is what re-asks.
				this.update();
				break;
			case 'locate':
				// Turning it on is a fresh statement of intent; forget any refusal.
				this.plugin.resetLocator();
				break;
			case 'trackStats':
			case 'elevationProfile':
				// The point of a toggle you can see the result of is seeing the result.
				this.plugin.refreshTracks();
				break;
		}
	}
}
