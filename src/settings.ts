import {
	PluginSettingTab,
	SecretComponent,
	type App,
	type Setting,
	type SettingDefinition,
	type SettingDefinitionItem,
} from 'obsidian';
import { TRACK_KNOBS, type TrackKnob } from './constants';
import { COORD_MODES, knownMode, type CoordMode } from './coords';
import { GEOCODE_PROVIDERS, KEY_STORES, type GeocodeProvider, type KeyStore } from './geocode';
import { getLocale, t, type TranslationKey } from './i18n';
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

/**
 * Where "open in map" opens.
 *
 * `tab` is the base file itself — its toolbar, its other views, and a config
 * that writes back to disk when something on the map is changed. `modal` is a
 * pop-up that embeds the same view: it disturbs nothing, and nothing changed
 * inside it is kept, because neither an embedded base nor a code block has
 * anywhere to write a view option back to. Measured, not assumed — see the
 * settings text, which says so rather than letting it be found out.
 */
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
	/** "Open in map" — the map launched from a note's ⋮ menu. */
	basePath: string;
	viewName: string;
	coordsProperty: string;
	openZoom: number;
	menuLabel: string;
	/** Whether that map is the base file itself, or a pop-up embedding it. */
	openIn: OpenTarget;
	/** Whether a map open in a sidebar keeps up with the note being edited. */
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
	trackWeight: TRACK_KNOBS.trackWeight.def,
	trackOpacity: TRACK_KNOBS.trackOpacity.def,
	fitMaxZoom: TRACK_KNOBS.fitMaxZoom.def,
	embedHeight: 320,
	trackStats: true,
	elevationProfile: true,
	basePath: '',
	viewName: '',
	coordsProperty: 'coords',
	openZoom: 15,
	menuLabel: '',
	// The base itself, because it is the only one of the two whose edits are
	// kept. A reader who would rather not have a tab appear can say so.
	openIn: 'tab',
	// Off: a camera that moves on its own is a surprise, and this one moves
	// because of something happening in another pane entirely.
	followActiveNote: false,
	aroundViewName: '',
	externalMaps: [],
	customMaps: [],
	geocodeProvider: 'nominatim',
	// The safer of the two is the one nobody had to choose. A key already on
	// disk from before this setting existed keeps the other one — `loadSettings`
	// derives that once, because an update does not get to quietly move somebody's
	// key into a store their other devices cannot read.
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

/** Every settings key, so a definition cannot name one that does not exist. */
type Key = keyof AdvancedMapsSettings;

/**
 * A row inside one of the two lists names its entry by index —
 * `customMaps.2.url` rather than a settings key of its own.
 *
 * That is what keeps a list declarative like everything else in this tab: the
 * framework reads and writes through `getControlValue`/`setControlValue`, and
 * those two are where the path is understood. Drawing the rows by hand instead
 * would take them out of the settings search and put a second write path beside
 * the one seam.
 */
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
	private group(
		key: 'coord' | 'open' | 'external' | 'search' | 'locate' | 'tracks',
		items: SettingDefinition<ControlKey>[]
	) {
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

	/**
	 * One custom entry: its name, its URL and the datum that URL expects, on one
	 * row. The ✕ and the drag handle beside them are the list's own, added to
	 * every row that is not a page.
	 *
	 * Drawn rather than declared, which is the one place in this tab that is true
	 * and is not a preference: three fields have to share a row so that one row
	 * means one entry, and `onDelete(index)`/`onReorder(from, to)` count rows.
	 * Three declared rows per entry would trade a working delete for a tidier
	 * definition.
	 *
	 * Every write still goes through `setControlValue`, so the trimming, the datum
	 * check and the one write seam all still apply.
	 */
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
		const coordModes: Record<string, string> = {};
		for (const mode of COORD_MODES) coordModes[mode] = t(`coord.${mode}`);
		const providers: Record<string, string> = {};
		for (const provider of GEOCODE_PROVIDERS) providers[provider] = t(`search.provider.${provider}`);
		const keyStores: Record<string, string> = {};
		for (const store of KEY_STORES) keyStores[store] = t(`search.keyStore.${store}`);
		const openTargets: Record<string, string> = {};
		for (const target of OPEN_TARGETS) openTargets[target] = t(`open.target.${target}`);

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
				{
					name: t('settings.open.openIn.name'),
					desc: t('settings.open.openIn.desc'),
					control: { type: 'dropdown', key: 'openIn', options: openTargets },
				},
				this.text('settings.open.coordsProperty.name', 'settings.open.coordsProperty.desc', 'coordsProperty', {
					placeholder: DEFAULT_SETTINGS.coordsProperty,
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
					// Nameless on purpose: the three boxes say what they are, and the row
					// has to stay an *ordinary* setting row. A `type: 'page'` row is the
					// one shape a list gives no delete button and no drag handle to —
					// `n6` returns at `setNavigable` before either is added, and the
					// keyboard delete looks the row up in `group.settings`, which a page
					// never joins. Measured against a real pane, not read off the types.
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
					// SecretComponent is not one of the declarative control types —
					// `SettingControl` has no `secret` — and it needs the `App` its
					// siblings never see, so this row is drawn rather than declared.
					// Which also means `setControlValue` is not reached for it unless
					// this handler goes through it; it does, so the trimming and the
					// one seam for side effects still apply.
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
		if (key === 'amapKeyStore' && !(KEY_STORES as readonly unknown[]).includes(next)) {
			next = DEFAULT_SETTINGS.amapKeyStore;
		}
		if (key === 'openIn' && !(OPEN_TARGETS as readonly unknown[]).includes(next)) {
			next = DEFAULT_SETTINGS.openIn;
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
			case 'trackStats':
			case 'elevationProfile':
				// The point of a toggle you can see the result of is seeing the result.
				this.plugin.refreshTracks();
				break;
		}
	}
}
