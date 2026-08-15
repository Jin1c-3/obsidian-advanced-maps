import {
	parseYaml,
	PluginSettingTab,
	SecretComponent,
	type App,
	type Setting,
	type SettingDefinition,
	type SettingDefinitionItem,
} from 'obsidian';
import { SPREAD, TRACK_KNOBS, type TrackKnob } from './constants';
import { COORD_MODES, knownMode, type CoordMode } from './coords';
import type { PhotoDatum } from './exif';
import { GEOCODE_PROVIDERS, KEY_STORES, type GeocodeProvider, type KeyStore } from './geocode';
import { getLocale, t, type TranslationKey } from './i18n';
import { mapViewNames, type BaseSpec } from './map-block';
import {
	CUSTOM_DATUMS,
	customMaps,
	customUrlProblem,
	resolveBuiltins,
	type BuiltinMap,
	type CustomDatum,
	type CustomMap,
} from './maplinks';
import type AdvancedMapsPlugin from './main';

/** A tab has writable native config; an embedded modal's option changes are transient. */
export const OPEN_TARGETS = ['tab', 'modal'] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number];

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
	/** Start/end pins, direction arrows, and — inline only — a waypoint's name on hover. */
	trackMarkers: boolean;
	/** A linked photo's own EXIF coordinate, drawn the same way a one-point track is. */
	showPhotos: boolean;
	/** Its own embedded thumbnail as the map icon, in place of a plain dot. */
	photoThumbnails: boolean;
	/** Which datum a photo's raw EXIF coordinate is trusted to be in. */
	photoDatum: PhotoDatum;
	/** Whether pins that land on the same spot fan apart once there is room. */
	spreadMarkers: boolean;
	/** "Open in map" — the map launched from a note's ⋮ menu. */
	basePath: string;
	viewName: string;
	coordsProperty: string;
	/** Where "fill place name from coordinates" writes its result — never coordsProperty. */
	placeProperty: string;
	openZoom: number;
	menuLabel: string;
	/** Whether that map is the base file itself, or a pop-up embedding it. */
	openIn: OpenTarget;
	/** Initial follow state for each newly opened map. */
	followActiveNote: boolean;
	/** The view added to the base for "a map of the notes around this one". */
	aroundViewName: string;
	/* "Open in external map", on the map's own right-click menu. Both start
	 * empty, and empty means something in each: no arrangement of the built-ins
	 * is the locale's own order with all six on, and no custom entries is the
	 * ordinary case. See `resolveBuiltins` for why the six are not written out. */
	externalMaps: BuiltinMap[];
	customMaps: CustomMap[];
	/** Place search — the one feature that leaves the vault. */
	geocodeProvider: GeocodeProvider;
	/** Which of the two below is the one that counts. */
	amapKeyStore: KeyStore;
	/** The key itself, when it is kept here. Plain text, and synced. */
	amapKey: string;
	/** The *name* of a secret, when it is kept in SecretStorage. Never the key. */
	amapSecretId: string;
	/** Location — filling `coordsProperty` from the device. */
	locate: boolean;
	autoFillCoords: boolean;
	autoFillExclude: string;
}

/* Blank labels use localized fallbacks; blank viewName selects the first map.
 * Device location starts disabled because it prompts and writes physical position. */
export const DEFAULT_SETTINGS: AdvancedMapsSettings = {
	coordSystem: 'auto',
	trackColor: 'var(--bases-map-marker-background)',
	trackWeight: TRACK_KNOBS.trackWeight.def,
	trackOpacity: TRACK_KNOBS.trackOpacity.def,
	fitMaxZoom: TRACK_KNOBS.fitMaxZoom.def,
	embedHeight: 320,
	trackStats: true,
	elevationProfile: true,
	trackMarkers: true,
	showPhotos: true,
	photoThumbnails: true,
	photoDatum: 'auto',
	spreadMarkers: true,
	basePath: '',
	viewName: '',
	coordsProperty: 'coords',
	placeProperty: 'location',
	openZoom: 15,
	menuLabel: '',
	// Default to the only target whose view-option edits persist.
	openIn: 'tab',
	// Off: a camera that moves on its own is a surprise, and this one moves
	// because of something happening in another pane entirely.
	followActiveNote: false,
	aroundViewName: '',
	externalMaps: [],
	customMaps: [],
	geocodeProvider: 'nominatim',
	// Fresh installs default to device-local SecretStorage.
	amapKeyStore: 'secret',
	amapKey: '',
	amapSecretId: '',
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

/**
 * The secret minted when a key is moved out of the settings file.
 *
 * `setSecret` throws on anything but lowercase alphanumerics and dashes, and
 * the name is the reader's to change afterwards — this is only what an
 * unattended move has to call it.
 */
export const AMAP_SECRET_ID = 'advanced-maps-amap';

/** The three literals `photoDatum` may hold. `exif.ts` exports the type but
 *  not this array — it has no reason of its own to iterate its options — so
 *  it is restated here, the same way `CUSTOM_DATUMS` lives in `maplinks.ts`
 *  rather than being re-derived from `CustomDatum`. */
const PHOTO_DATUMS: readonly PhotoDatum[] = ['auto', 'wgs84', 'gcj02'];

/** Every settings key, so a definition cannot name one that does not exist. */
type Key = keyof AdvancedMapsSettings;

/**
 * Settings whose visible result is owned by TrackLayer/TrackEmbed rather than
 * by the settings pane itself. Kept as one typed list so a newly-added visual
 * setting cannot be wired into one map path and forgotten in the other.
 */
const TRACK_REFRESH_KEYS: ReadonlySet<string> = new Set([
	'trackColor',
	'trackWeight',
	'trackOpacity',
	'fitMaxZoom',
	'embedHeight',
	'trackStats',
	'elevationProfile',
	'trackMarkers',
	'showPhotos',
	'photoThumbnails',
	'photoDatum',
] satisfies readonly Key[]);

export function refreshesTracks(key: string): boolean {
	return TRACK_REFRESH_KEYS.has(key);
}

/** Cleared placeholder-backed fields restore defaults; exclusion stays privacy-safe. */
const PLACEHOLDER_DEFAULT_KEYS = ['coordsProperty', 'placeProperty', 'trackColor', 'autoFillExclude'] as const;

type PlaceholderDefaultKey = (typeof PLACEHOLDER_DEFAULT_KEYS)[number];

export function fallsBackToDefault(key: string): key is PlaceholderDefaultKey {
	return (PLACEHOLDER_DEFAULT_KEYS as readonly string[]).includes(key);
}

/** Indexed entry keys keep list rows on the declarative settings read/write seam. */
type EntryKey = `externalMaps.${number}.on` | `customMaps.${number}.${'name' | 'url' | 'datum'}`;
type ControlKey = Key | EntryKey;

type EntryPath =
	| { list: 'externalMaps'; index: number; field: 'on' }
	| { list: 'customMaps'; index: number; field: 'name' | 'url' | 'datum' };

const ENTRY_KEY = /^(externalMaps|customMaps)\.(\d+)\.(on|name|url|datum)$/;

/** The reverse of an `EntryKey`, and null for every ordinary settings key. */
function entryPath(key: string): EntryPath | null {
	const parts = ENTRY_KEY.exec(key);
	if (!parts) return null;
	const index = Number(parts[2]);
	if (parts[1] === 'externalMaps') {
		return parts[3] === 'on' ? { list: 'externalMaps', index, field: 'on' } : null;
	}
	if (parts[3] === 'on') return null;
	return { list: 'customMaps', index, field: parts[3] as 'name' | 'url' | 'datum' };
}

/** One entry picked up and put down at another index. */
function moved<T>(list: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || from >= list.length) return list;
	const next = list.slice();
	const [item] = next.splice(from, 1);
	next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
	return next;
}

/** A datum a stored entry names, checked against the ones this version has. */
function knownDatum(value: unknown): CustomDatum {
	return (CUSTOM_DATUMS as readonly unknown[]).includes(value) ? (value as CustomDatum) : 'wgs84';
}

/** Declarative Obsidian 1.13 settings, indexed by settings search. */
export class AdvancedMapsSettingTab extends PluginSettingTab {
	/**
	 * Async map-view options: null means unavailable/pending, [] means read with no maps.
	 * Claim `viewsPath` before I/O so duplicate or stale reads can stand down.
	 */
	private views: string[] | null = null;
	private viewsPath: string | null = null;

	constructor(
		app: App,
		private readonly plugin: AdvancedMapsPlugin
	) {
		super(app, plugin);
	}

	/** Invalidate and reload view choices while the declarative pane is hidden. */
	override hide(): void {
		this.viewsPath = null;
		void this.loadViews();
		super.hide();
	}

	/** Read map views, returning null for missing/unreadable rather than a misleading empty list. */
	private async readViews(path: string): Promise<string[] | null> {
		const file = path === '' ? null : this.app.vault.getFileByPath(path);
		if (!file) return null;
		try {
			return mapViewNames((parseYaml(await this.app.vault.cachedRead(file)) as BaseSpec) ?? {});
		} catch {
			return null;
		}
	}

	/**
	 * Read the configured base's views, and re-render once they are in.
	 *
	 * Returns at once whenever the list already belongs to the configured base,
	 * which is what keeps the `update()` below from re-entering itself — the
	 * render it causes calls this again, and that call is the one that returns.
	 */
	private async loadViews(): Promise<void> {
		const path = this.plugin.settings.basePath;
		if (path === this.viewsPath) return;
		// What is on screen right now, which is what the answer is worth comparing
		// against — the options themselves rather than the names, since a name can
		// stay and its label change.
		const before = JSON.stringify(this.viewOptions());
		this.viewsPath = path;
		this.views = null;
		// Wait until the vault file list is populated before resolving the base path.
		await new Promise<void>((resolve) => {
			this.app.workspace.onLayoutReady(resolve);
		});
		const views = await this.readViews(path);
		// Hidden, or pointed at another base, while the read was in the air.
		if (this.viewsPath !== path) return;
		this.views = views;
		// No answer is not an answer to keep: forgetting which base it was for is
		// what makes the next `update()` or `hide()` ask again.
		if (views === null) this.viewsPath = null;
		// Nothing on screen would change, and a re-render mid-keystroke elsewhere
		// in the pane would take the focus with it.
		if (JSON.stringify(this.viewOptions()) === before) return;
		this.update();
	}

	/** Keep a stored stale view name visible; label it missing only after a successful base read. */
	private viewOptions(): Record<string, string> {
		const options: Record<string, string> = { '': t('open.view.first') };
		for (const name of this.views ?? []) options[name] = name;
		const chosen = this.plugin.settings.viewName;
		if (chosen !== '' && !(chosen in options)) {
			options[chosen] = this.views === null ? chosen : t('open.view.missing', { view: chosen });
		}
		return options;
	}

	/** Render non-searchable group prose; a control-less declarative row is otherwise dropped. */
	private introItem(intro: string): SettingDefinition<ControlKey> {
		return {
			name: '',
			searchable: false,
			render: (setting: Setting) => {
				setting.settingEl.empty();
				setting.settingEl.addClass('advanced-maps-intro');
				setting.settingEl.createEl('p', { cls: 'setting-item-description', text: intro });
			},
		};
	}

	private group(
		key: 'coord' | 'open' | 'external' | 'search' | 'locate' | 'pins' | 'tracks',
		items: SettingDefinition<ControlKey>[]
	) {
		return {
			type: 'group' as const,
			heading: t(`settings.${key}.heading`),
			items: [this.introItem(t(`settings.${key}.intro`)), ...items],
		};
	}

	private text(
		name: TranslationKey,
		desc: TranslationKey | undefined,
		key: ControlKey,
		opts: { placeholder?: string; vars?: Record<string, string> } = {}
	): SettingDefinition<ControlKey> {
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

	/** A track knob's slider, taking its range from the table that already states it. */
	private knob(name: TranslationKey, desc: TranslationKey | undefined, key: TrackKnob) {
		const { min, max, step } = TRACK_KNOBS[key];
		return this.slider(name, desc, key, min, max, step);
	}

	private toggle(
		name: TranslationKey,
		desc: TranslationKey,
		key: Key,
		vars?: Record<string, string>
	): SettingDefinition<Key> {
		return { name: t(name), desc: t(desc, vars), control: { type: 'toggle', key } };
	}

	/**
	 * Is this the key row that is currently in effect?
	 *
	 * Both are behind the provider that needs a key at all: an empty box under a
	 * provider that ignores it reads as something left unconfigured.
	 */
	private keyRow(store: KeyStore): boolean {
		const { geocodeProvider, amapKeyStore } = this.plugin.settings;
		return geocodeProvider === 'amap' && amapKeyStore === store;
	}

	/**
	 * Switching to secret storage takes the plain copy with it.
	 *
	 * Leaving it behind makes the setting a lie — the key the pane now says is in
	 * secret storage would still be sitting in `data.json`, syncing. Moving it
	 * rather than clearing it means nobody loses a key to a dropdown.
	 *
	 * Only when no secret is named yet: a reader who named one, switched away and
	 * switched back means that one, not the plain text left over.
	 *
	 * **The other direction is deliberately not the mirror of this.** Going back
	 * to the settings file does not copy the secret out — writing a key to disk in
	 * plain text is not something a dropdown should do on the way past. The secret
	 * is left untouched, so switching back again finds it.
	 */
	private async adoptPlainKey(): Promise<void> {
		const { amapKey, amapSecretId } = this.plugin.settings;
		if (amapKey === '' || amapSecretId !== '') return;
		this.app.secretStorage.setSecret(AMAP_SECRET_ID, amapKey);
		await super.setControlValue('amapSecretId', AMAP_SECRET_ID);
		await super.setControlValue('amapKey', '');
	}

	/** The six built-ins as the reader has them; the list draws this, and a write starts from it. */
	private builtins(): BuiltinMap[] {
		return resolveBuiltins(this.plugin.settings.externalMaps, getLocale());
	}

	private customs(): CustomMap[] {
		return customMaps(this.plugin.settings.customMaps);
	}

	/**
	 * A whole list replaced — an entry added, deleted or moved.
	 *
	 * These three change how many rows there are, or which row is which, so the
	 * pane has to be re-asked. Editing a *field* deliberately does not: a text
	 * control writes on every keystroke, and a re-render mid-word would take the
	 * focus with it.
	 */
	private async writeList(key: 'externalMaps' | 'customMaps', next: BuiltinMap[] | CustomMap[]): Promise<void> {
		await this.setControlValue(key, next);
		this.update();
	}

	/** Draw three fields in one list row so delete/reorder indexes stay entry-aligned. */
	private customRow(setting: Setting, entry: CustomMap, index: number): void {
		setting.settingEl.addClass('advanced-maps-map-entry');
		const say = (url: string) => {
			// Empty is a row still being filled in, not a wrong one.
			const problem = url.trim() === '' ? null : customUrlProblem(url);
			setting.setErrorMessage(problem === null ? null : t(`settings.external.error.${problem}`));
		};

		setting.addText((text) =>
			text
				.setPlaceholder(t('settings.external.custom.name.name'))
				.setValue(entry.name)
				.onChange((value) => void this.setControlValue(`customMaps.${index}.name`, value))
		);
		setting.addText((text) => {
			text.setPlaceholder(t('settings.external.custom.url.placeholder'))
				.setValue(entry.url)
				.onChange((value) => {
					// Said while the reader is still looking at the box: an unusable
					// entry is left out of the menu, and a menu cannot explain the item
					// it is not showing.
					say(value);
					void this.setControlValue(`customMaps.${index}.url`, value);
				});
			text.inputEl.addClass('advanced-maps-map-url');
			text.inputEl.setAttribute('aria-label', t('settings.external.custom.url.desc'));
		});
		setting.addDropdown((dropdown) => {
			for (const datum of CUSTOM_DATUMS) dropdown.addOption(datum, t(`datum.${datum}`));
			dropdown
				.setValue(entry.datum)
				.onChange((value) => void this.setControlValue(`customMaps.${index}.datum`, value));
			dropdown.selectEl.setAttribute('aria-label', t('settings.external.custom.datum.desc'));
		});
		// A URL saved by an older version, or left half-written, states itself on
		// arrival rather than waiting to be typed in again.
		say(entry.url);
	}

	override getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
		// Started here because this is the one thing called on every render of the
		// pane; it stands down at once unless the base has changed under it.
		void this.loadViews();
		const coordModes: Record<string, string> = {};
		for (const mode of COORD_MODES) coordModes[mode] = t(`coord.${mode}`);
		const providers: Record<string, string> = {};
		for (const provider of GEOCODE_PROVIDERS) providers[provider] = t(`search.provider.${provider}`);
		const keyStores: Record<string, string> = {};
		for (const store of KEY_STORES) keyStores[store] = t(`search.keyStore.${store}`);
		const openTargets: Record<string, string> = {};
		for (const target of OPEN_TARGETS) openTargets[target] = t(`open.target.${target}`);
		const photoDatums: Record<string, string> = {};
		for (const datum of PHOTO_DATUMS) photoDatums[datum] = t(`setting.photoDatum.${datum}`);

		return [
			this.group('coord', [
				{
					name: t('settings.coord.default.name'),
					desc: t('settings.coord.default.desc'),
					control: { type: 'dropdown', key: 'coordSystem', options: coordModes },
				},
			]),

			this.group('open', [
				{
					name: t('settings.open.basePath.name'),
					desc: t('settings.open.basePath.desc'),
					// Picked out of the vault rather than typed. The only file this can
					// name is a `.base`, and `filter` is what says so — a path typed by
					// hand is one misremembered folder away from `notice.baseNotFound`,
					// and nothing on screen would say which half was wrong. What is
					// stored is unchanged: the full path, extension and all, which is
					// what `getFileByPath` is handed.
					control: {
						type: 'file',
						key: 'basePath',
						placeholder: BASE_PATH_PLACEHOLDER,
						filter: (file) => file.extension === 'base',
					},
				},
				{
					name: t('settings.open.viewName.name'),
					desc: t('settings.open.viewName.desc'),
					control: {
						type: 'dropdown',
						key: 'viewName',
						options: this.viewOptions(),
						// Nothing to choose from, and a list of one blank line reads as
						// something broken rather than as something not set up yet.
						disabled: () => this.plugin.settings.basePath === '',
					},
				},
				{
					name: t('settings.open.openIn.name'),
					desc: t('settings.open.openIn.desc'),
					control: { type: 'dropdown', key: 'openIn', options: openTargets },
				},
				this.text('settings.open.coordsProperty.name', 'settings.open.coordsProperty.desc', 'coordsProperty', {
					placeholder: DEFAULT_SETTINGS.coordsProperty,
				}),
				this.text('settings.open.placeProperty.name', 'settings.open.placeProperty.desc', 'placeProperty', {
					placeholder: DEFAULT_SETTINGS.placeProperty,
				}),
				this.slider('settings.open.zoom.name', 'settings.open.zoom.desc', 'openZoom', 1, 18, 1),
				this.toggle('settings.open.follow.name', 'settings.open.follow.desc', 'followActiveNote'),
				this.text('settings.open.aroundView.name', 'settings.open.aroundView.desc', 'aroundViewName', {
					placeholder: t('view.around'),
				}),
				// The only cosmetic field in the group, so it comes last.
				this.text('settings.open.label.name', 'settings.open.label.desc', 'menuLabel', {
					placeholder: t('command.openInMap'),
				}),
			]),

			this.group('external', []),
			// Two lists rather than one: the built-ins are a fixed set to arrange,
			// the custom ones a collection to add to, and `type: 'list'` gives each
			// exactly the affordances it needs — drag handles for both, a delete and
			// an add for the second only. A built-in is switched off, never removed:
			// there would be no way back to it.
			{
				type: 'list',
				heading: t('settings.external.builtin.heading'),
				items: this.builtins().map((builtin, index) => ({
					name: t(`link.provider.${builtin.id}`),
					control: { type: 'toggle' as const, key: `externalMaps.${index}.on` as ControlKey },
				})),
				onReorder: (from: number, to: number) => {
					void this.writeList('externalMaps', moved(this.builtins(), from, to));
				},
			},
			{
				type: 'list',
				heading: t('settings.external.custom.heading'),
				emptyState: t('settings.external.custom.empty'),
				items: this.customs().map((entry, index) => ({
					// Ordinary nameless rows retain the list's drag/delete affordances.
					name: '',
					searchable: false,
					render: (setting: Setting) => this.customRow(setting, entry, index),
				})),
				addItem: {
					name: t('settings.external.custom.add'),
					action: () => {
						void this.writeList('customMaps', [...this.customs(), { name: '', url: '', datum: 'wgs84' }]);
					},
				},
				onDelete: (index: number) => {
					void this.writeList(
						'customMaps',
						this.customs().filter((_, at) => at !== index)
					);
				},
				onReorder: (from: number, to: number) => {
					void this.writeList('customMaps', moved(this.customs(), from, to));
				},
			},

			this.group('search', [
				{
					name: t('settings.search.provider.name'),
					desc: t('settings.search.provider.desc'),
					control: { type: 'dropdown', key: 'geocodeProvider', options: providers },
				},
				{
					name: t('settings.search.keyStore.name'),
					desc: t('settings.search.keyStore.desc'),
					visible: () => this.plugin.settings.geocodeProvider === 'amap',
					control: { type: 'dropdown', key: 'amapKeyStore', options: keyStores },
				},
				// One row per store, and only ever one of them on screen. Showing both
				// would leave the reader working out which of two filled boxes is the
				// one in effect, which is the question the dropdown just answered.
				{
					// Both rows say the same thing about the same key — only ever one
					// of them is on screen, and `visible` takes the other out of the
					// search index for that render cycle too.
					name: t('settings.search.amapKey.name'),
					desc: t('settings.search.amapKey.desc'),
					visible: () => this.keyRow('secret'),
					// SecretComponent is not declarative; route its change through the shared seam.
					render: (setting: Setting) => {
						setting.addComponent((el) =>
							new SecretComponent(this.app, el)
								.setValue(this.plugin.settings.amapSecretId)
								.onChange((id) => this.setControlValue('amapSecretId', id))
						);
					},
				},
				{
					name: t('settings.search.amapKey.name'),
					desc: t('settings.search.amapKey.desc'),
					visible: () => this.keyRow('plugin'),
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

			// The notes' own pins, which are the native view's rather than this
			// plugin's — hence a group of their own rather than a row among the
			// track knobs, which are about files a note points at.
			this.group('pins', [
				this.toggle('settings.pins.spread.name', 'settings.pins.spread.desc', 'spreadMarkers', {
					zoom: String(SPREAD.fromZoom),
				}),
			]),

			this.group('tracks', [
				this.text('settings.tracks.color.name', 'settings.tracks.color.desc', 'trackColor', {
					placeholder: DEFAULT_SETTINGS.trackColor,
				}),
				this.knob('settings.tracks.weight.name', undefined, 'trackWeight'),
				this.knob('settings.tracks.opacity.name', undefined, 'trackOpacity'),
				this.knob('settings.tracks.fitMaxZoom.name', 'settings.tracks.fitMaxZoom.desc', 'fitMaxZoom'),
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
				this.toggle('settings.tracks.markers.name', 'settings.tracks.markers.desc', 'trackMarkers'),
			]),

			// Photos have distinct privacy/context text from deliberate track attachments.
			{
				type: 'group' as const,
				heading: t('setting.photos'),
				items: [
					this.introItem(t('setting.photos.desc')),
					this.toggle('setting.showPhotos', 'setting.showPhotos.desc', 'showPhotos'),
					this.toggle('setting.photoThumbnails', 'setting.photoThumbnails.desc', 'photoThumbnails'),
					{
						name: t('setting.photoDatum'),
						desc: t('setting.photoDatum.desc'),
						control: { type: 'dropdown', key: 'photoDatum', options: photoDatums },
					},
				],
			},
		];
	}

	/** A list row reads its value out of the entry its key names. */
	override getControlValue(key: string): unknown {
		const path = entryPath(key);
		if (!path) return super.getControlValue(key);
		if (path.list === 'externalMaps') return this.builtins()[path.index]?.on ?? true;
		const entry = this.customs()[path.index];
		return entry ? entry[path.field] : '';
	}

	/** …and writes it back into a copy of the whole list, which is what is stored. */
	private async writeEntry(path: EntryPath, value: unknown): Promise<void> {
		if (path.list === 'externalMaps') {
			const list = this.builtins();
			const entry = list[path.index];
			if (!entry) return;
			list[path.index] = { ...entry, on: value === true };
			await this.setControlValue('externalMaps', list);
			return;
		}
		const list = this.customs();
		const entry = list[path.index];
		if (!entry) return;
		const updated = { ...entry };
		if (path.field === 'datum') updated.datum = knownDatum(value);
		else updated[path.field] = typeof value === 'string' ? value.trim() : '';
		list[path.index] = updated;
		await this.setControlValue('customMaps', list);
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		const path = entryPath(key);
		if (path) {
			await this.writeEntry(path, value);
			return;
		}
		let next = value;
		if (typeof next === 'string') {
			next = next.trim();
			if (next === '' && fallsBackToDefault(key)) {
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
		if (key === 'amapKeyStore' && !(KEY_STORES as readonly unknown[]).includes(next)) {
			next = DEFAULT_SETTINGS.amapKeyStore;
		}
		if (key === 'openIn' && !(OPEN_TARGETS as readonly unknown[]).includes(next)) {
			next = DEFAULT_SETTINGS.openIn;
		}
		if (key === 'photoDatum' && !(PHOTO_DATUMS as readonly unknown[]).includes(next)) {
			next = DEFAULT_SETTINGS.photoDatum;
		}
		// Both lists go back through the same readers that made them whole on the
		// way out, so what lands in data.json is what the next version will read —
		// an unknown provider or datum cannot be stored by going through here.
		if (key === 'externalMaps') next = resolveBuiltins(next, getLocale());
		if (key === 'customMaps') next = customMaps(next);
		await super.setControlValue(key, next);

		switch (key) {
			case 'coordSystem':
				this.plugin.reprojectAll();
				break;
			case 'basePath':
				// Another base has other views. This re-renders with what is known
				// now — the list itself is read after, and re-renders again.
				this.update();
				break;
			case 'geocodeProvider':
				// The Amap key rows state when they are visible; this is what re-asks.
				this.update();
				break;
			case 'amapKeyStore':
				// Move first, re-render second: the secret box is seeded from what it
				// reads at render, so a move after that one would not show until the
				// settings window was reopened.
				if (next === 'secret') await this.adoptPlainKey();
				this.update();
				break;
			case 'locate':
				// Turning it on is a fresh statement of intent; forget any refusal.
				this.plugin.resetLocator();
				break;
			case 'spreadMarkers':
				// Not on the track-refresh list below: the fan is stamped on the pins
				// as the *native* manager mints them, and only `updateMarkers` mints
				// them. `sync()` would redraw every track and change no pin at all.
				this.plugin.reprojectAll();
				break;
		}

		// Beside the switch rather than instead of it, so a key can be both: a
		// visual setting must reach maps that are already open, because Bases does
		// not necessarily sync after plugin data.json changes and an inline embed
		// has no Bases result set to prompt it at all.
		if (refreshesTracks(key)) this.plugin.refreshTracks();
	}
}
