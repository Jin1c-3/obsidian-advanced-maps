import { PluginSettingTab, Setting, type App } from 'obsidian';
import { COORD_MODES, knownMode, type CoordMode } from './coords';
import { t } from './i18n';
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
}

/* Blank is meaningful for three of these: `menuLabel` blank falls back to the
 * localized command name, and `viewName` blank takes the base's first map view.
 * `basePath` blank simply means "Open in map" is not configured yet. */
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
};

const BASE_PATH_PLACEHOLDER = 'places.base';

export class AdvancedMapsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: AdvancedMapsPlugin
	) {
		super(app, plugin);
	}

	private intro(text: string): void {
		this.containerEl.createEl('p', { cls: 'setting-item-description', text });
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const save = () => this.plugin.saveSettings();

		/* ---- coordinate system ---- */

		new Setting(containerEl).setName(t('settings.coord.heading')).setHeading();
		this.intro(t('settings.coord.intro'));

		new Setting(containerEl)
			.setName(t('settings.coord.default.name'))
			.setDesc(t('settings.coord.default.desc'))
			.addDropdown((d) => {
				for (const mode of COORD_MODES) d.addOption(mode, t(`coord.${mode}`));
				d.setValue(knownMode(this.plugin.settings.coordSystem) ?? 'auto').onChange(async (value) => {
					this.plugin.settings.coordSystem = knownMode(value) ?? 'auto';
					await save();
					this.plugin.reprojectAll();
				});
			});

		/* ---- open in map ---- */

		new Setting(containerEl).setName(t('settings.open.heading')).setHeading();
		this.intro(t('settings.open.intro'));

		new Setting(containerEl)
			.setName(t('settings.open.label.name'))
			.setDesc(t('settings.open.label.desc'))
			.addText((text) =>
				text
					.setPlaceholder(t('command.openInMap'))
					.setValue(this.plugin.settings.menuLabel)
					.onChange(async (value) => {
						this.plugin.settings.menuLabel = value.trim();
						await save();
					})
			);

		new Setting(containerEl)
			.setName(t('settings.open.basePath.name'))
			.setDesc(t('settings.open.basePath.desc'))
			.addText((text) =>
				text
					.setPlaceholder(BASE_PATH_PLACEHOLDER)
					.setValue(this.plugin.settings.basePath)
					.onChange(async (value) => {
						this.plugin.settings.basePath = value.trim();
						await save();
					})
			);

		new Setting(containerEl)
			.setName(t('settings.open.viewName.name'))
			.setDesc(t('settings.open.viewName.desc'))
			.addText((text) =>
				text.setValue(this.plugin.settings.viewName).onChange(async (value) => {
					this.plugin.settings.viewName = value.trim();
					await save();
				})
			);

		new Setting(containerEl)
			.setName(t('settings.open.coordsProperty.name'))
			.setDesc(t('settings.open.coordsProperty.desc'))
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.coordsProperty)
					.setValue(this.plugin.settings.coordsProperty)
					.onChange(async (value) => {
						this.plugin.settings.coordsProperty = value.trim() || DEFAULT_SETTINGS.coordsProperty;
						await save();
					})
			);

		new Setting(containerEl).setName(t('settings.open.zoom.name')).addSlider((slider) =>
			slider
				.setLimits(1, 18, 1)
				.setValue(this.plugin.settings.openZoom)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.openZoom = value;
					await save();
				})
		);

		/* ---- tracks ---- */

		new Setting(containerEl).setName(t('settings.tracks.heading')).setHeading();
		this.intro(t('settings.tracks.intro'));

		new Setting(containerEl)
			.setName(t('settings.tracks.color.name'))
			.setDesc(t('settings.tracks.color.desc'))
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.trackColor)
					.setValue(this.plugin.settings.trackColor)
					.onChange(async (value) => {
						this.plugin.settings.trackColor = value.trim() || DEFAULT_SETTINGS.trackColor;
						await save();
					})
			);

		new Setting(containerEl).setName(t('settings.tracks.weight.name')).addSlider((slider) =>
			slider
				.setLimits(1, 12, 1)
				.setValue(this.plugin.settings.trackWeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.trackWeight = value;
					await save();
				})
		);

		new Setting(containerEl).setName(t('settings.tracks.opacity.name')).addSlider((slider) =>
			slider
				.setLimits(10, 100, 5)
				.setValue(this.plugin.settings.trackOpacity)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.trackOpacity = value;
					await save();
				})
		);

		new Setting(containerEl)
			.setName(t('settings.tracks.fitMaxZoom.name'))
			.setDesc(t('settings.tracks.fitMaxZoom.desc'))
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.fitMaxZoom)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.fitMaxZoom = value;
						await save();
					})
			);

		new Setting(containerEl)
			.setName(t('settings.tracks.embedHeight.name'))
			.setDesc(t('settings.tracks.embedHeight.desc'))
			.addSlider((slider) =>
				slider
					.setLimits(160, 800, 20)
					.setValue(this.plugin.settings.embedHeight)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.embedHeight = value;
						await save();
					})
			);
	}
}
