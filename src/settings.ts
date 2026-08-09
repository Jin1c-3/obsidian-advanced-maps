import { PluginSettingTab, Setting, type App } from 'obsidian';
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
	/** "Open in map" — the pop-up launched from a note's ⋮ menu. */
	basePath: string;
	viewName: string;
	coordsProperty: string;
	openZoom: number;
	menuLabel: string;
	/** Place search — the one feature that leaves the vault. */
	geocodeProvider: GeocodeProvider;
	amapKey: string;
	/** Location — filling `coordsProperty` from the device. */
	locate: boolean;
	autoFillCoords: boolean;
	autoFillExclude: string;
}

/* Blank is meaningful for three of these: `menuLabel` blank falls back to the
 * localized command name, and `viewName` blank takes the base's first map view.
 * `basePath` blank simply means "Open in map" is not configured yet.
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
	basePath: '',
	viewName: '',
	coordsProperty: 'coords',
	openZoom: 15,
	menuLabel: '',
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

export class AdvancedMapsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: AdvancedMapsPlugin
	) {
		super(app, plugin);
	}

	/** Heading, then the one line under it that says what the group is for. */
	private group(key: 'coord' | 'open' | 'search' | 'locate' | 'tracks'): void {
		new Setting(this.containerEl).setName(t(`settings.${key}.heading`)).setHeading();
		this.containerEl.createEl('p', { cls: 'setting-item-description', text: t(`settings.${key}.intro`) });
	}

	private row(name: TranslationKey, desc?: TranslationKey, vars?: Record<string, string>): Setting {
		const setting = new Setting(this.containerEl).setName(t(name));
		return desc ? setting.setDesc(t(desc, vars)) : setting;
	}

	/**
	 * A text setting. `fallback` is what a cleared field means: blank where the
	 * empty string is itself an answer, the default where it is not.
	 */
	private text(
		setting: Setting,
		key: 'menuLabel' | 'basePath' | 'viewName' | 'coordsProperty' | 'autoFillExclude' | 'trackColor' | 'amapKey',
		opts: { placeholder?: string; fallback?: string } = {}
	): void {
		setting.addText((text) =>
			text
				.setPlaceholder(opts.placeholder ?? '')
				.setValue(this.plugin.settings[key])
				.onChange(async (value) => {
					this.plugin.settings[key] = value.trim() || opts.fallback || '';
					await this.plugin.saveSettings();
				})
		);
	}

	private slider(
		setting: Setting,
		key: 'openZoom' | 'trackWeight' | 'trackOpacity' | 'fitMaxZoom' | 'embedHeight',
		min: number,
		max: number,
		step: number
	): void {
		setting.addSlider((slider) =>
			slider
				.setLimits(min, max, step)
				.setValue(this.plugin.settings[key])
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings[key] = value;
					await this.plugin.saveSettings();
				})
		);
	}

	private toggle(setting: Setting, key: 'locate' | 'autoFillCoords', after?: () => void): void {
		setting.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
				this.plugin.settings[key] = value;
				await this.plugin.saveSettings();
				after?.();
			})
		);
	}

	override display(): void {
		this.containerEl.empty();

		/* ---- coordinate system ---- */

		this.group('coord');
		this.row('settings.coord.default.name', 'settings.coord.default.desc').addDropdown((d) => {
			for (const mode of COORD_MODES) d.addOption(mode, t(`coord.${mode}`));
			d.setValue(knownMode(this.plugin.settings.coordSystem) ?? 'auto').onChange(async (value) => {
				this.plugin.settings.coordSystem = knownMode(value) ?? 'auto';
				await this.plugin.saveSettings();
				this.plugin.reprojectAll();
			});
		});

		/* ---- open in map ---- */

		this.group('open');
		this.text(this.row('settings.open.basePath.name', 'settings.open.basePath.desc'), 'basePath', {
			placeholder: BASE_PATH_PLACEHOLDER,
		});
		this.text(this.row('settings.open.viewName.name', 'settings.open.viewName.desc'), 'viewName');
		this.text(
			this.row('settings.open.coordsProperty.name', 'settings.open.coordsProperty.desc'),
			'coordsProperty',
			{ placeholder: DEFAULT_SETTINGS.coordsProperty, fallback: DEFAULT_SETTINGS.coordsProperty }
		);
		this.slider(this.row('settings.open.zoom.name'), 'openZoom', 1, 18, 1);
		// The only cosmetic field in the group, so it comes last.
		this.text(this.row('settings.open.label.name', 'settings.open.label.desc'), 'menuLabel', {
			placeholder: t('command.openInMap'),
		});

		/* ---- place search ---- */

		this.group('search');
		this.row('settings.search.provider.name', 'settings.search.provider.desc').addDropdown((d) => {
			for (const provider of GEOCODE_PROVIDERS) d.addOption(provider, t(`search.provider.${provider}`));
			d.setValue(this.plugin.settings.geocodeProvider).onChange(async (value) => {
				this.plugin.settings.geocodeProvider = (GEOCODE_PROVIDERS as readonly string[]).includes(value)
					? (value as GeocodeProvider)
					: 'nominatim';
				await this.plugin.saveSettings();
				this.display();
			});
		});
		// Only shown for the provider that needs it: an empty box under a provider
		// that ignores it reads as something left unconfigured.
		if (this.plugin.settings.geocodeProvider === 'amap') {
			this.text(this.row('settings.search.amapKey.name', 'settings.search.amapKey.desc'), 'amapKey');
		}

		/* ---- location ---- */

		this.group('locate');
		// The command is registered for good at load; turning this on mid-session
		// should not need a reload to take effect, and the checkCallback reads the
		// flag every time the palette opens.
		this.toggle(this.row('settings.locate.enable.name', 'settings.locate.enable.desc'), 'locate', () =>
			this.plugin.resetLocator()
		);
		this.toggle(
			this.row('settings.locate.auto.name', 'settings.locate.auto.desc', {
				property: this.plugin.settings.coordsProperty,
			}),
			'autoFillCoords'
		);
		this.text(this.row('settings.locate.exclude.name', 'settings.locate.exclude.desc'), 'autoFillExclude', {
			placeholder: DEFAULT_SETTINGS.autoFillExclude,
		});

		/* ---- tracks ---- */

		this.group('tracks');
		this.text(this.row('settings.tracks.color.name', 'settings.tracks.color.desc'), 'trackColor', {
			placeholder: DEFAULT_SETTINGS.trackColor,
			fallback: DEFAULT_SETTINGS.trackColor,
		});
		this.slider(this.row('settings.tracks.weight.name'), 'trackWeight', 1, 12, 1);
		this.slider(this.row('settings.tracks.opacity.name'), 'trackOpacity', 10, 100, 5);
		this.slider(
			this.row('settings.tracks.fitMaxZoom.name', 'settings.tracks.fitMaxZoom.desc'),
			'fitMaxZoom',
			1,
			20,
			1
		);
		this.slider(
			this.row('settings.tracks.embedHeight.name', 'settings.tracks.embedHeight.desc'),
			'embedHeight',
			160,
			800,
			20
		);
	}
}
