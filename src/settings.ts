import {
	debounce,
	parseYaml,
	PluginSettingTab,
	SecretComponent,
	type App,
	type Setting,
	type SettingDefinition,
	type SettingDefinitionItem,
} from 'obsidian';
import { TILE_ZOOM_MAX, packProblem, packRows, tilePacks, type TilePack } from './basemap';
import { GUIDE_URL, REPO_URL, SPREAD, TRACK_KNOBS, type TrackKnob } from './constants';
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
import { STATS_FIGURES, statsPropertyName, type StatsFigure } from './stats';
import type AdvancedMapsPlugin from './main';

/** A tab has writable native config; an embedded modal's option changes are transient. */
export const OPEN_TARGETS = ['tab', 'modal'] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number];

export interface AdvancedMapsSettings {
	/** Default coordinate mode; a view option can override it. */
	coordSystem: CoordMode;
	/** Basemaps already on disk, each a named pack: the filesystem path its tiles
	 *  are addressed by, holding `{z}`, `{x}` and `{y}`, and the shallowest and
	 *  deepest levels it holds, which is what keeps a map from asking for tiles
	 *  outside it. Stored as paths and never as URLs — the `app://` prefix a URL
	 *  needs is rebuilt at every launch, so a stored one would rot overnight. */
	tilePacks: TilePack[];
	/** Which of them every map draws unless it says otherwise, by name. Empty is
	 *  no default: the packs stay configured and stay pickable, and a map that
	 *  names none of them keeps the background the native view resolves. */
	defaultBasemap: string;
	trackColor: string;
	trackWeight: number;
	trackOpacity: number;
	fitMaxZoom: number;
	embedHeight: number;
	/** The numbers under an inline map, and the chart under those. */
	trackStats: boolean;
	elevationProfile: boolean;
	/** What the command that writes those numbers into a note names its
	 *  properties — `track` gives `track-distance-km` and its siblings. Every
	 *  property the command reads, writes or removes is under this prefix. */
	statsPrefix: string;
	/** A property name per figure, overriding the prefixed default. An empty
	 *  string is "no answer", not a nameless property: the figure keeps
	 *  `prefix-suffix`, which is what every figure is called by default. */
	statsNames: Record<StatsFigure, string>;
	/** Whether that command writes each figure at all. A figure switched off is
	 *  not written and not removed either: the command stops reaching the name
	 *  entirely, which is the same thing renaming a figure does to its old name. */
	statsWrite: Record<StatsFigure, boolean>;
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
	/** Whether a map offers the follow-the-active-note button and the measuring
	 *  tape at all. Off takes the button off every map and nothing else with it;
	 *  zoom-to-fit has no switch, being the only way back to the whole
	 *  collection. */
	follow: boolean;
	measure: boolean;
	/** Initial follow state for each newly opened map, once following is on. */
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

/**
 * The three keys this plugin stored when a vault could hold one pack and a pack
 * had no name. Read once on load and written never again — see `migratedPack`
 * and `dropLegacyBasemap`.
 */
export interface LegacyBasemap {
	offlineTiles?: unknown;
	offlineTilesMinZoom?: unknown;
	offlineTilesMaxZoom?: unknown;
}

const LEGACY_BASEMAP_KEYS = ['offlineTiles', 'offlineTilesMinZoom', 'offlineTilesMaxZoom'] as const;

/**
 * A name for the one pack that had none, from the last directory above its
 * placeholders — `/home/you/tiles/{z}/{x}/{y}.png` is "tiles".
 *
 * The placeholders are where the path stops being a place: the segments after
 * them name a tile rather than a pack, and `{y}.png` is nobody's idea of a name.
 * A template that is nothing but placeholders leaves nothing to read, so it gets
 * the feature's own word for itself and the reader renames it if they care.
 */
export function packNameFromPath(path: string): string {
	const segments = path.replace(/\\/g, '/').split('/');
	const placeholder = segments.findIndex((segment) => segment.includes('{'));
	const above = placeholder === -1 ? segments : segments.slice(0, placeholder);
	for (let at = above.length - 1; at >= 0; at--) {
		const segment = above[at].trim();
		if (segment !== '' && segment !== '.' && segment !== '..') return segment;
	}
	return t('settings.tiles.pack.unnamed');
}

/**
 * The single configured pack as the first entry of the list that replaced it,
 * or null when there was none — an empty path was "no pack", and stays nothing.
 */
export function migratedPack(saved: LegacyBasemap | null | undefined): TilePack | null {
	const path = typeof saved?.offlineTiles === 'string' ? saved.offlineTiles.trim() : '';
	if (path === '') return null;
	const [pack] = tilePacks([
		{
			name: packNameFromPath(path),
			path,
			minZoom: saved?.offlineTilesMinZoom,
			maxZoom: saved?.offlineTilesMaxZoom,
		},
	]);
	return pack ?? null;
}

/**
 * Take the old keys off the live settings, so the next write drops them from
 * `data.json`. Answers whether anything was there to drop, which is what decides
 * whether that write happens at all: a reader who never configured a pack must
 * not have their settings file rewritten on every launch.
 */
export function dropLegacyBasemap(settings: AdvancedMapsSettings & LegacyBasemap): boolean {
	let dropped = false;
	for (const key of LEGACY_BASEMAP_KEYS) {
		if (!(key in settings)) continue;
		delete settings[key];
		dropped = true;
	}
	return dropped;
}

/* Blank labels use localized fallbacks; blank viewName selects the first map.
 * Device location starts disabled because it prompts and writes physical position. */
export const DEFAULT_SETTINGS: AdvancedMapsSettings = {
	coordSystem: 'auto',
	tilePacks: [],
	defaultBasemap: '',
	trackColor: 'var(--bases-map-marker-background)',
	trackWeight: TRACK_KNOBS.trackWeight.def,
	trackOpacity: TRACK_KNOBS.trackOpacity.def,
	fitMaxZoom: TRACK_KNOBS.fitMaxZoom.def,
	embedHeight: 320,
	trackStats: true,
	elevationProfile: true,
	statsPrefix: 'track',
	// Nine empty strings: every figure keeps its prefixed default, so a vault
	// that never opens the page is named exactly as it was before this existed.
	statsNames: Object.fromEntries(STATS_FIGURES.map((figure) => [figure, ''])) as Record<StatsFigure, string>,
	// …and nine trues: the command wrote every figure before it could be told
	// not to, so that is what a vault which never opens the page keeps doing.
	statsWrite: Object.fromEntries(STATS_FIGURES.map((figure) => [figure, true])) as Record<StatsFigure, boolean>,
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
	follow: true,
	measure: true,
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

/**
 * A zoom level as the reader has typed it, or the one the pack already had.
 *
 * The two boxes are numbers typed by hand, and an emptied one is not a level:
 * `Number('')` is 0, so reading it as one would silently drop a pack's deepest
 * level to "the whole world in a single tile" the moment the box was cleared to
 * type a new number into it.
 */
export function typedLevel(value: unknown, current: number): number {
	const typed = typeof value === 'string' ? value.trim() : value;
	if (typed === '' || typed === null || typed === undefined) return current;
	const level = Number(typed);
	if (!isFinite(level)) return current;
	return Math.min(TILE_ZOOM_MAX, Math.max(0, Math.round(level)));
}

/**
 * The skip list as the reader has it on screen, blanks included.
 *
 * A row just added is empty until it is typed in, so unlike `excludedFragments`
 * this keeps one. The two differ only there: what matches a path is never a
 * blank, and what the pane draws is every row the reader has.
 */
export function exclusionRows(setting: string): string[] {
	return setting === '' ? [] : setting.split(',').map((part) => part.trim());
}

/**
 * Those rows back as the one string that is stored.
 *
 * One blank row is the case the join cannot state on its own: `['']` joins to
 * `''`, and `''` is no rows at all — which is what left the add button under an
 * emptied list adding a row that was gone before it could be drawn. A lone space
 * is the one value that reads back as exactly one blank row, and it is not a
 * path fragment: `excludedFragments` drops it, so nothing is excluded by it.
 */
export function storedExclusions(rows: string[]): string {
	if (rows.length === 1 && rows[0].trim() === '') return ' ';
	return rows.join(', ');
}

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

/** The shape of a tile template rather than a path anyone actually has. */
const OFFLINE_TILES_PLACEHOLDER = '/path/to/tiles/{z}/{x}/{y}.png';

/**
 * What a pack row starts as. A common depth for a hand-unpacked pack, and safe
 * either way: too low costs sharpness at the deepest levels, never correctness.
 */
const NEW_PACK: TilePack = { name: '', path: '', minZoom: 0, maxZoom: 16 };

/** Marks a rendered description's mention of the coordinate property, so a
 *  rename can find it without re-rendering the pane; see `propertyDesc`. */
const PROPERTY_MENTION = 'advanced-maps-property-name';

/**
 * The secret minted when a key is moved out of the settings file.
 *
 * `setSecret` throws on anything but lowercase alphanumerics and dashes, and
 * the name is the reader's to change afterwards — this is only what an
 * unattended move has to call it.
 */
const AMAP_SECRET_ID = 'advanced-maps-amap';

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

/**
 * Cleared placeholder-backed fields restore their default.
 *
 * `autoFillExclude` is deliberately not among them any more. It was, back when
 * it was one box: an emptied box could not be told from a box nobody had filled
 * in, and storing the empty one would have stamped every template note with the
 * device's position. It is a list now, and deleting its last row is an answer
 * rather than an accident — restoring `templates` under a reader who has just
 * removed it would be the pane refusing what it offered.
 */
const PLACEHOLDER_DEFAULT_KEYS = ['coordsProperty', 'placeProperty', 'statsPrefix', 'trackColor'] as const;

type PlaceholderDefaultKey = (typeof PLACEHOLDER_DEFAULT_KEYS)[number];

export function fallsBackToDefault(key: string): key is PlaceholderDefaultKey {
	return (PLACEHOLDER_DEFAULT_KEYS as readonly string[]).includes(key);
}

/** The pane's topics, each a page reached from its root; `trackProps` nests inside `tracks`. */
type PageKey =
	| 'coord'
	| 'tiles'
	| 'open'
	| 'controls'
	| 'external'
	| 'search'
	| 'locate'
	| 'pins'
	| 'tracks'
	| 'photos'
	| 'trackProps';

/** Indexed entry keys keep list rows on the declarative settings read/write seam. */
type EntryKey =
	| `externalMaps.${number}.on`
	| `customMaps.${number}.${'name' | 'url' | 'datum'}`
	| `tilePacks.${number}.${PackField}`
	| `autoFillExclude.${number}`;
/** The same seam for a fixed key set rather than an index: one row per figure,
 *  in each of the two records a figure has an entry in. */
type FigureRecord = 'statsNames' | 'statsWrite';
type FigureKey = `${FigureRecord}.${StatsFigure}`;
type ControlKey = Key | EntryKey | FigureKey;

/** The record and figure a `statsNames.<figure>` or `statsWrite.<figure>`
 *  control names, and null for anything else. */
function figureKey(key: string): { record: FigureRecord; figure: StatsFigure } | null {
	const dot = key.indexOf('.');
	const record = key.slice(0, dot);
	if (record !== 'statsNames' && record !== 'statsWrite') return null;
	const figure = key.slice(dot + 1);
	return (STATS_FIGURES as readonly string[]).includes(figure) ? { record, figure: figure as StatsFigure } : null;
}

/** Every figure's name as the reader has them, defaulting one a stored file predates. */
function storedNames(value: unknown): Record<StatsFigure, string> {
	const stored = (value ?? {}) as Record<string, unknown>;
	const names = {} as Record<StatsFigure, string>;
	for (const figure of STATS_FIGURES) {
		const name = stored[figure];
		names[figure] = typeof name === 'string' ? name.trim() : '';
	}
	return names;
}

/** The same, for the switches — where the value a stored file predates is `true`. */
function storedWrite(value: unknown): Record<StatsFigure, boolean> {
	const stored = (value ?? {}) as Record<string, unknown>;
	const written = {} as Record<StatsFigure, boolean>;
	for (const figure of STATS_FIGURES) written[figure] = stored[figure] !== false;
	return written;
}

const EXCLUDE_KEY = /^autoFillExclude\.(\d+)$/;

/** The row an `autoFillExclude.<n>` control names, and null for every other key. */
function excludeIndex(key: string): number | null {
	const parts = EXCLUDE_KEY.exec(key);
	return parts ? Number(parts[1]) : null;
}

/** The four boxes one pack row holds. */
type PackField = 'name' | 'path' | 'minZoom' | 'maxZoom';

type EntryPath =
	| { list: 'externalMaps'; index: number; field: 'on' }
	| { list: 'customMaps'; index: number; field: 'name' | 'url' | 'datum' }
	| { list: 'tilePacks'; index: number; field: PackField };

const ENTRY_KEY = /^(externalMaps|customMaps|tilePacks)\.(\d+)\.(on|name|url|datum|path|minZoom|maxZoom)$/;

/** The reverse of an `EntryKey`, and null for every ordinary settings key. */
function entryPath(key: string): EntryPath | null {
	const parts = ENTRY_KEY.exec(key);
	if (!parts) return null;
	const index = Number(parts[2]);
	const field = parts[3];
	if (parts[1] === 'externalMaps') {
		return field === 'on' ? { list: 'externalMaps', index, field: 'on' } : null;
	}
	if (parts[1] === 'tilePacks') {
		const packFields: readonly string[] = ['name', 'path', 'minZoom', 'maxZoom'];
		return packFields.includes(field) ? { list: 'tilePacks', index, field: field as PackField } : null;
	}
	const customFields: readonly string[] = ['name', 'url', 'datum'];
	return customFields.includes(field)
		? { list: 'customMaps', index, field: field as 'name' | 'url' | 'datum' }
		: null;
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
 * The settings whose value must be one of a fixed list, and the list.
 *
 * A table rather than a clause per key for the same reason `TRACK_REFRESH_KEYS`
 * is one: a newly added dropdown that is missed here is not a compile error,
 * it is a setting that silently accepts anything a stored file happens to hold.
 * `coordSystem` is absent on purpose — `knownMode` trims before matching, which
 * a plain `includes` would not.
 */
const ENUM_VALUES: Partial<Record<keyof AdvancedMapsSettings, readonly unknown[]>> = {
	geocodeProvider: GEOCODE_PROVIDERS,
	amapKeyStore: KEY_STORES,
	openIn: OPEN_TARGETS,
	photoDatum: PHOTO_DATUMS,
};

/** Declarative Obsidian 1.13 settings, indexed by settings search. */
export class AdvancedMapsSettingTab extends PluginSettingTab {
	/**
	 * Async map-view options: null means unavailable/pending, [] means read with no maps.
	 * Claim `viewsPath` before I/O so duplicate or stale reads can stand down.
	 */
	private views: string[] | null = null;
	private viewsPath: string | null = null;

	/**
	 * Restyling every open map is expensive, and the box that names the pack
	 * writes on every keystroke — as does a slider being dragged. Waits for the
	 * typing to stop rather than rebuilding a style per character.
	 */
	private readonly refreshBasemaps = debounce(() => this.plugin.refreshBasemaps(), 500, true);

	/**
	 * Debounced for the same reason, and it matters more: four of the keys on the
	 * track-refresh list are sliders, and each call redraws every open base map
	 * *and* re-tiles the whole collection in every open inline embed. Undebounced,
	 * one drag of the line-width slider paid for that per step.
	 */
	private readonly refreshTracks = debounce(() => this.plugin.refreshTracks(), 250, true);

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

	/**
	 * The pane's first row: where the guide is, and the one thing this plugin
	 * asks for in return.
	 *
	 * Not searchable, because it is not a setting — a row that changes nothing
	 * has no business among the results for one that does. Both addresses are
	 * links the reader may follow; neither is opened or fetched from here.
	 */
	private aboutItem(): SettingDefinition<ControlKey> {
		return {
			name: '',
			searchable: false,
			render: (setting: Setting) => {
				setting.settingEl.empty();
				setting.settingEl.addClass('advanced-maps-about');
				this.badgeLine(
					setting.settingEl,
					'settings.about.guide.link',
					'settings.about.guide',
					GUIDE_URL[getLocale()]
				);
				this.badgeLine(setting.settingEl, 'settings.about.star.link', 'settings.about.star', REPO_URL);
			},
		};
	}

	/**
	 * A badge and the line it heads: the badge carries the emoji and is the link,
	 * the sentence beside it says what is behind it.
	 *
	 * The emoji lives in the label rather than in the markup, so a locale is free
	 * to move or replace it along with the words.
	 */
	private badgeLine(parent: HTMLElement, label: TranslationKey, desc: TranslationKey, href: string): void {
		const line = parent.createEl('p', { cls: 'advanced-maps-about-line' });
		line.createEl('a', { cls: 'advanced-maps-about-badge', href, text: t(label) });
		line.createSpan({ cls: 'setting-item-description', text: t(desc) });
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

	/**
	 * A row that is nothing but its own label: what the list under it holds.
	 *
	 * A control-less declarative row is dropped, so this renders — but it renders
	 * nothing of its own, since the name and description the framework has
	 * already drawn are the whole row. Searchable, unlike `introItem`: this one
	 * is how a reader finds the list it stands over.
	 */
	private labelItem(name: TranslationKey, desc: TranslationKey): SettingDefinition<ControlKey> {
		return { name: t(name), desc: t(desc), render: () => undefined };
	}

	/**
	 * One topic as a page reached from the pane's root, its intro leading the
	 * rows it introduces.
	 *
	 * `displayValue` states on the entry what the page is set to, so the root
	 * answers "which coordinate system", "which base" without being opened. It
	 * is only ever given for a value behind a dropdown, a toggle, a file picker
	 * or a list — `update()` re-renders the pane, and a text row would lose its
	 * caret mid-word to the refresh that keeps this current.
	 */
	private page(
		key: PageKey,
		items: SettingDefinitionItem<ControlKey>[],
		displayValue?: () => string
	): SettingDefinitionItem<ControlKey> {
		return {
			type: 'page' as const,
			name: t(`settings.${key}.heading`),
			displayValue,
			items: [this.introItem(t(`settings.${key}.intro`)), ...items],
		};
	}

	/** A toggle's state as an entry can state it, since a page shows no control of its own. */
	private state(on: boolean): string {
		return t(on ? 'settings.state.on' : 'settings.state.off');
	}

	/**
	 * The prefix, the nine figures it is the default name for, and the switch
	 * that decides whether each one is written at all — together on one page
	 * inside Tracks.
	 *
	 * Each name's placeholder is the default that figure would be written under,
	 * so an empty box states what leaving it empty means. It is read at render:
	 * typing in the prefix box above does not restate the nine placeholders until
	 * the page is drawn again, because the re-render that would restate them
	 * takes the caret out of the box being typed in — the same reason
	 * `coordsProperty` patches its mentions in place instead.
	 *
	 * A figure that is not written has no name to give, so its box goes with its
	 * switch. That is a `visible` re-evaluated on each render, which is why
	 * flipping one of these re-renders the pane — a switch, not a box, so there
	 * is no caret for the refresh to take.
	 */
	private trackPropertiesPage(): SettingDefinitionItem<ControlKey> {
		const { statsPrefix, statsNames, statsWrite } = this.plugin.settings;
		const written = storedWrite(statsWrite);
		return this.page(
			'trackProps',
			[
				this.text('settings.tracks.statsPrefix.name', 'settings.tracks.statsPrefix.desc', 'statsPrefix', {
					placeholder: DEFAULT_SETTINGS.statsPrefix,
				}),
				{
					type: 'group' as const,
					heading: t('settings.trackProps.figures.heading'),
					items: STATS_FIGURES.map((figure) => ({
						name: t(`settings.trackProps.${figure}.name`),
						render: (setting: Setting) => this.figureRow(setting, figure, statsPrefix),
					})),
				},
			],
			// The prefix, which is what the page is set to for anyone who has not
			// renamed a figure — and the answer to "what are my columns called".
			// Once figures are switched off that is the wrong summary, and how many
			// are left is the right one: distance itself may be one of the ones off.
			() => {
				const on = STATS_FIGURES.filter((figure) => written[figure]).length;
				if (on === STATS_FIGURES.length) return statsPropertyName('distance', statsPrefix, statsNames);
				return t('settings.trackProps.count', { on: String(on), total: String(STATS_FIGURES.length) });
			}
		);
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
	 * A description that names the coordinate property, as a fragment whose
	 * mention of it carries a class the pane can be searched for later.
	 *
	 * `desc` is read once per render, and the pane is not re-rendered while the
	 * property is being typed in — a re-render would take the focus out of the
	 * box mid-word, which is the same reason the list fields above avoid it. So
	 * the text is patched in place instead: see `setControlValue`.
	 *
	 * Found through the rendered DOM rather than by holding the nodes this
	 * built: `getSettingDefinitions()` is also called to index the pane for
	 * search, and nodes from a call that rendered nothing are not the ones the
	 * reader is looking at.
	 */
	private propertyDesc(desc: TranslationKey): DocumentFragment {
		const frag = createFragment();
		const parts = t(desc).split('{property}');
		parts.forEach((part, index) => {
			if (index > 0) {
				frag.createSpan({ cls: PROPERTY_MENTION, text: this.plugin.settings.coordsProperty });
			}
			frag.appendText(part);
		});
		return frag;
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
	 * Every pack row as the reader has them on screen, blanks included; the list
	 * draws this, and a write starts from it.
	 *
	 * Deliberately not `tilePacks`: that one answers "which packs can a map be
	 * pointed at", and a row added a keystroke ago is not one of them yet. Storing
	 * its answer instead is what made the add button do nothing at all — the row
	 * was dropped on its way into `data.json`, before it could be named.
	 */
	private packRows(): TilePack[] {
		return packRows(this.plugin.settings.tilePacks);
	}

	/** "No default", then one entry per named pack. A row still being filled in
	 *  has no name yet and nothing to be chosen by, so it is not offered. */
	private defaultChoices(): Record<string, string> {
		const choices: Record<string, string> = { '': t('settings.tiles.default.none') };
		for (const pack of tilePacks(this.plugin.settings.tilePacks)) choices[pack.name] = pack.name;
		return choices;
	}

	/**
	 * A pack row removed — and the default setting with it, when that row was the
	 * only one answering to the name it holds.
	 *
	 * The same reason a rename carries the default along: the name is the whole
	 * reference, so a delete would otherwise leave the setting naming a pack that
	 * is gone. Cleared before the list is written, so the one re-render shows
	 * both.
	 */
	private async deletePack(index: number): Promise<void> {
		const rows = this.packRows();
		const gone = rows[index];
		const rest = rows.filter((_, at) => at !== index);
		if (gone && this.plugin.settings.defaultBasemap === gone.name && !rest.some((row) => row.name === gone.name)) {
			await this.setControlValue('defaultBasemap', '');
		}
		await this.writeList('tilePacks', rest);
	}

	/**
	 * A whole list replaced — an entry added, deleted or moved.
	 *
	 * These three change how many rows there are, or which row is which, so the
	 * pane has to be re-asked. Editing a *field* deliberately does not: a text
	 * control writes on every keystroke, and a re-render mid-word would take the
	 * focus with it.
	 */
	private async writeList(
		key: 'externalMaps' | 'customMaps' | 'tilePacks',
		next: BuiltinMap[] | CustomMap[] | TilePack[]
	): Promise<void> {
		await this.setControlValue(key, next);
		this.update();
	}

	/**
	 * The skip list as one stored string.
	 *
	 * `rerender` for the two that change how many rows there are; editing a row
	 * deliberately does not, for the same reason `writeList` does not.
	 */
	private async writeExclusions(rows: string[], rerender = true): Promise<void> {
		await super.setControlValue('autoFillExclude', storedExclusions(rows));
		if (rerender) this.update();
	}

	/**
	 * One pack on one row: what it is called, where its tiles are, and the two
	 * levels it holds — saying what is wrong with the path as it is typed.
	 *
	 * The path check is structural only: whether the three placeholders are there.
	 * Whether anything is at that path cannot be asked without enumerating a
	 * directory outside the vault, and a pack whose path is wrong draws nothing,
	 * which is visible at once. The name is checked too, and for the same reason
	 * the path is — an unnamed or clashing row is left out of every menu, so
	 * without this it would be a row the reader has filled in that quietly is not
	 * one of their packs.
	 *
	 * Four boxes on one row because the list counts rows, and one row has to be
	 * one pack for its ✕ and its drag handle to mean what they say.
	 */
	private packRow(setting: Setting, rows: readonly TilePack[], index: number): void {
		setting.settingEl.addClass('advanced-maps-pack-entry');
		const entry = rows[index];
		// Asked of the row as it now reads rather than as it was drawn, since
		// neither box re-renders the pane while it is being typed in.
		const say = (edit: Partial<TilePack>) => {
			const next = rows.slice();
			next[index] = { ...entry, ...edit };
			const problem = packProblem(next, index);
			setting.setErrorMessage(problem === null ? null : t(`settings.tiles.error.${problem}`));
		};

		setting.addText((text) => {
			text.setPlaceholder(t('settings.tiles.pack.name'))
				.setValue(entry.name)
				.onChange((value) => {
					say({ name: value });
					void this.setControlValue(`tilePacks.${index}.name`, value);
				});
			text.inputEl.setAttribute('aria-label', t('settings.tiles.pack.name'));
		});
		setting.addText((text) => {
			text.setPlaceholder(OFFLINE_TILES_PLACEHOLDER)
				.setValue(entry.path)
				.onChange((value) => {
					// Said while the reader is still looking at the box: a template
					// missing a placeholder resolves to nothing, and a map that draws
					// nothing cannot explain why.
					say({ path: value });
					void this.setControlValue(`tilePacks.${index}.path`, value);
				});
			text.inputEl.addClass('advanced-maps-tiles-path');
			text.inputEl.setAttribute('aria-label', t('settings.tiles.path.name'));
		});
		this.levelBox(setting, entry.minZoom, index, 'minZoom', 'settings.tiles.minZoom.name');
		this.levelBox(setting, entry.maxZoom, index, 'maxZoom', 'settings.tiles.maxZoom.name');
		// A row saved half-written states itself on arrival rather than waiting to
		// be typed in again.
		say({});
	}

	/** One of a pack row's two zoom levels: a number box, not a slider — a slider
	 *  would take the width the path box needs, four controls to a row. */
	private levelBox(
		setting: Setting,
		value: number,
		index: number,
		field: 'minZoom' | 'maxZoom',
		label: TranslationKey
	): void {
		setting.addText((text) => {
			text.setValue(String(value)).onChange(
				(next) => void this.setControlValue(`tilePacks.${index}.${field}`, next)
			);
			text.inputEl.type = 'number';
			text.inputEl.min = '0';
			text.inputEl.max = String(TILE_ZOOM_MAX);
			text.inputEl.addClass('advanced-maps-tiles-level');
			text.inputEl.setAttribute('aria-label', t(label));
		});
	}

	/**
	 * One figure on one row: the name it is written under, and the switch that
	 * decides whether it is written at all.
	 *
	 * Two rows apiece was eighteen rows for nine figures, and a switch that
	 * showed and hid the box beside it. Together, the box is disabled rather
	 * than taken away — there is still something to read there, which is what
	 * the figure would be called if it were switched back on.
	 *
	 * The placeholder is the prefixed default, read at render: typing in the
	 * prefix box above does not restate the nine placeholders until the page is
	 * drawn again, because the re-render that would restate them takes the caret
	 * out of the box being typed in.
	 */
	private figureRow(setting: Setting, figure: StatsFigure, prefix: string): void {
		setting.settingEl.addClass('advanced-maps-figure-row');
		const on = storedWrite(this.plugin.settings.statsWrite)[figure];
		setting.addText((text) => {
			text.setPlaceholder(statsPropertyName(figure, prefix))
				.setValue(storedNames(this.plugin.settings.statsNames)[figure])
				.onChange((value) => void this.setControlValue(`statsNames.${figure}`, value));
			text.setDisabled(!on);
			text.inputEl.setAttribute('aria-label', t(`settings.trackProps.${figure}.name`));
		});
		setting.addToggle((toggle) => {
			toggle.setValue(on).onChange((value) => void this.setControlValue(`statsWrite.${figure}`, value));
			toggle.toggleEl.setAttribute('aria-label', t('settings.trackProps.write'));
		});
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
		// One snapshot for the whole render: each row is drawn from it, and a row
		// reports a clashing name by looking at the others in it.
		const packRowsNow = this.packRows();
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
			this.aboutItem(),

			this.page(
				'coord',
				[
					{
						name: t('settings.coord.default.name'),
						desc: t('settings.coord.default.desc'),
						control: { type: 'dropdown', key: 'coordSystem', options: coordModes },
					},
				],
				() => t(`coord.${this.plugin.settings.coordSystem}`)
			),

			this.page(
				'tiles',
				[
					// A list rather than a fixed row apiece: a pack is regional, so a
					// reader who has one usually has two — the city they live in and the
					// trail they walk — and each carries its own levels because each was
					// unpacked to its own depth.
					{
						type: 'list',
						heading: t('settings.tiles.packs.heading'),
						emptyState: t('settings.tiles.packs.empty'),
						items: packRowsNow.map((_, index) => ({
							// Ordinary nameless rows retain the list's drag/delete affordances.
							name: '',
							searchable: false,
							render: (setting: Setting) => this.packRow(setting, packRowsNow, index),
						})),
						addItem: {
							name: t('settings.tiles.packs.add'),
							action: () => {
								void this.writeList('tilePacks', [...this.packRows(), { ...NEW_PACK }]);
							},
						},
						onDelete: (index: number) => {
							void this.deletePack(index);
						},
						onReorder: (from: number, to: number) => {
							void this.writeList('tilePacks', moved(this.packRows(), from, to));
						},
					},
					{
						name: t('settings.tiles.default.name'),
						desc: t('settings.tiles.default.desc'),
						// Only ever the packs configured right now, so this cannot name one
						// that is gone; a stored name that no longer matches falls back to
						// the native background, which is what an empty value means anyway.
						control: {
							type: 'dropdown',
							key: 'defaultBasemap',
							options: this.defaultChoices(),
						},
					},
				],
				// What every map draws unless it says otherwise — the one thing on this
				// page that changes what a reader sees without opening a map view.
				() => this.plugin.settings.defaultBasemap || t('settings.tiles.default.none')
			),

			this.page(
				'open',
				[
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
					this.text(
						'settings.open.coordsProperty.name',
						'settings.open.coordsProperty.desc',
						'coordsProperty',
						{
							placeholder: DEFAULT_SETTINGS.coordsProperty,
						}
					),
					this.text('settings.open.placeProperty.name', 'settings.open.placeProperty.desc', 'placeProperty', {
						placeholder: DEFAULT_SETTINGS.placeProperty,
					}),
					this.slider('settings.open.zoom.name', 'settings.open.zoom.desc', 'openZoom', 1, 18, 1),
					this.text('settings.open.aroundView.name', 'settings.open.aroundView.desc', 'aroundViewName', {
						placeholder: t('view.around'),
					}),
					// The only cosmetic field in the group, so it comes last.
					this.text('settings.open.label.name', 'settings.open.label.desc', 'menuLabel', {
						placeholder: t('command.openInMap'),
					}),
				],
				// The base everything on this page hangs off, named rather than
				// summarized: what the row stores is the path, extension and all.
				() => this.plugin.settings.basePath || t('settings.state.unset')
			),

			// The buttons this plugin puts in the map's own corner, and the one piece
			// of state that only means anything while one of them is there.
			this.page(
				'controls',
				[
					this.toggle('settings.controls.follow.name', 'settings.controls.follow.desc', 'follow'),
					{
						...this.toggle(
							'settings.controls.followStart.name',
							'settings.controls.followStart.desc',
							'followActiveNote'
						),
						// Nothing to start when there is no button to press.
						visible: () => this.plugin.settings.follow,
					},
					this.toggle('settings.controls.measure.name', 'settings.controls.measure.desc', 'measure'),
				],
				() =>
					t('settings.controls.count', {
						on: String([this.plugin.settings.follow, this.plugin.settings.measure].filter(Boolean).length),
						total: '2',
					})
			),

			this.page(
				'external',
				[
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
								void this.writeList('customMaps', [
									...this.customs(),
									{ name: '', url: '', datum: 'wgs84' },
								]);
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
				],
				// Both lists' switched-on entries: what the right-click menu will offer.
				() =>
					t('settings.external.enabled', {
						count: String(this.builtins().filter((entry) => entry.on).length + this.customs().length),
					})
			),

			this.page(
				'search',
				[
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
				],
				// The short name, not the dropdown's label: the option carries a
				// "needs a key" hint that reads as a warning on an entry.
				() => t(`search.providerShort.${this.plugin.settings.geocodeProvider}`)
			),

			this.page(
				'locate',
				[
					this.toggle('settings.locate.enable.name', 'settings.locate.enable.desc', 'locate'),
					{
						name: t('settings.locate.auto.name'),
						desc: this.propertyDesc('settings.locate.auto.desc'),
						control: { type: 'toggle', key: 'autoFillCoords' },
					},
					// Its own label above the list, because a list's heading is not a
					// row that settings search can find.
					this.labelItem('settings.locate.exclude.name', 'settings.locate.exclude.desc'),
					{
						type: 'list',
						emptyState: t('settings.locate.exclude.empty'),
						items: exclusionRows(this.plugin.settings.autoFillExclude).map((_, index) => ({
							// Nameless, the way the custom-map rows are: a repeated label
							// beside three identical boxes says nothing the box does not.
							name: '',
							searchable: false,
							control: {
								type: 'folder' as const,
								key: `autoFillExclude.${index}` as ControlKey,
								placeholder: DEFAULT_SETTINGS.autoFillExclude,
							},
						})),
						addItem: {
							name: t('settings.locate.exclude.add'),
							action: () => {
								void this.writeExclusions([...exclusionRows(this.plugin.settings.autoFillExclude), '']);
							},
						},
						onDelete: (index: number) => {
							void this.writeExclusions(
								exclusionRows(this.plugin.settings.autoFillExclude).filter((_, at) => at !== index)
							);
						},
					},
				],
				() => this.state(this.plugin.settings.locate)
			),

			// The notes' own pins, which are the native view's rather than this
			// plugin's — hence a page of their own rather than a row among the
			// track knobs, which are about files a note points at.
			this.page(
				'pins',
				[
					this.toggle('settings.pins.spread.name', 'settings.pins.spread.desc', 'spreadMarkers', {
						zoom: String(SPREAD.fromZoom),
					}),
				],
				() => this.state(this.plugin.settings.spreadMarkers)
			),

			// No `displayValue`: nine knobs and toggles, and no one of them is what
			// the page is set to.
			this.page('tracks', [
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
				// A page of its own inside this one, and the only rows about tracks
				// that change nothing already drawn: they name what a command
				// writes, which is why none of them is on TRACK_REFRESH_KEYS above.
				this.trackPropertiesPage(),
			]),

			// Photos have distinct privacy/context text from deliberate track attachments.
			this.page(
				'photos',
				[
					this.toggle('setting.showPhotos', 'setting.showPhotos.desc', 'showPhotos'),
					this.toggle('setting.photoThumbnails', 'setting.photoThumbnails.desc', 'photoThumbnails'),
					{
						name: t('setting.photoDatum'),
						desc: t('setting.photoDatum.desc'),
						control: { type: 'dropdown', key: 'photoDatum', options: photoDatums },
					},
					// An action rather than a setting: there is no state to store, and
					// what it does is always safe — the index is derived from the
					// photos, so discarding it costs a re-read and nothing else.
					{
						name: t('setting.photoIndex'),
						desc: t('setting.photoIndex.desc'),
						action: () => void this.plugin.clearPhotoIndex(),
					},
				],
				() => this.state(this.plugin.settings.showPhotos)
			),
		];
	}

	/** A list row reads its value out of the entry its key names. */
	override getControlValue(key: string): unknown {
		const excluded = excludeIndex(key);
		if (excluded !== null) return exclusionRows(this.plugin.settings.autoFillExclude)[excluded] ?? '';
		const named = figureKey(key);
		if (named) {
			const { record, figure } = named;
			if (record === 'statsWrite') return storedWrite(this.plugin.settings.statsWrite)[figure];
			return this.plugin.settings.statsNames[figure] ?? '';
		}
		const path = entryPath(key);
		if (!path) return super.getControlValue(key);
		if (path.list === 'externalMaps') return this.builtins()[path.index]?.on ?? true;
		if (path.list === 'tilePacks') {
			const pack = this.packRows()[path.index];
			return pack ? pack[path.field] : '';
		}
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
		if (path.list === 'tilePacks') {
			const list = this.packRows();
			const entry = list[path.index];
			if (!entry) return;
			const updated = { ...entry };
			if (path.field === 'minZoom' || path.field === 'maxZoom') {
				updated[path.field] = typedLevel(value, entry[path.field]);
			} else {
				updated[path.field] = typeof value === 'string' ? value.trim() : '';
			}
			list[path.index] = updated;
			await this.setControlValue('tilePacks', list);
			// A pack is referred to by name, so renaming the default one would
			// otherwise leave the setting pointing at a pack that no longer exists —
			// silently no default at all, on the keystroke that removed the last
			// character of the old name.
			if (path.field === 'name' && this.plugin.settings.defaultBasemap === entry.name) {
				await this.setControlValue('defaultBasemap', updated.name);
			}
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
		const excluded = excludeIndex(key);
		if (excluded !== null) {
			const rows = exclusionRows(this.plugin.settings.autoFillExclude);
			if (excluded >= rows.length) return;
			rows[excluded] = typeof value === 'string' ? value.trim() : '';
			await this.writeExclusions(rows, false);
			return;
		}
		const named = figureKey(key);
		if (named) {
			const { record, figure } = named;
			// One figure's control writes back a copy of the whole record, the way
			// a list row writes back a copy of its whole list.
			if (record === 'statsWrite') {
				const written = storedWrite(this.plugin.settings.statsWrite);
				written[figure] = value === true;
				await super.setControlValue('statsWrite', written);
				// The name box beside this switch is enabled and disabled with it,
				// and the page's own entry counts how many are on. A switch has no
				// caret for the re-render to take.
				this.update();
				return;
			}
			// An emptied box stores an empty string, which is what restores the
			// prefixed default name.
			const names = storedNames(this.plugin.settings.statsNames);
			names[figure] = typeof value === 'string' ? value.trim() : '';
			await super.setControlValue('statsNames', names);
			return;
		}
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
		// `key` arrives as a bare string from the host; the table is what decides
		// whether it names a settings key with a fixed list behind it.
		const enumKey = key as keyof AdvancedMapsSettings;
		const allowed = ENUM_VALUES[enumKey];
		if (allowed && !allowed.includes(next)) next = DEFAULT_SETTINGS[enumKey];
		// Both lists go back through the same readers that made them whole on the
		// way out, so what lands in data.json is what the next version will read —
		// an unknown provider or datum cannot be stored by going through here.
		if (key === 'externalMaps') next = resolveBuiltins(next, getLocale());
		if (key === 'customMaps') next = customMaps(next);
		// Rows, not packs: an unnamed one is a row the reader is still filling in,
		// and dropping it here is what left the add button doing nothing at all.
		if (key === 'tilePacks') next = packRows(next);
		await super.setControlValue(key, next);

		switch (key) {
			case 'coordSystem':
				this.plugin.reprojectAll();
				break;
			case 'tilePacks':
			case 'defaultBasemap':
				// Not on the track-refresh list below: this replaces the ground under
				// the tracks rather than the tracks, and the redraw the new style
				// triggers puts them back by itself.
				this.refreshBasemaps();
				break;
			case 'coordsProperty':
				// Rewritten rather than re-rendered: this fires on every keystroke
				// in the box, and `update()` would take the caret with it.
				for (const span of this.containerEl.querySelectorAll(`.${PROPERTY_MENTION}`)) {
					span.textContent = String(next);
				}
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
			case 'follow':
			case 'measure':
				// The button appears on, or leaves, every map already open. The
				// re-render is for the follow page's own second row, which is there
				// only while the first is on.
				this.plugin.refreshControls();
				this.update();
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
		if (refreshesTracks(key)) this.refreshTracks();
	}
}
