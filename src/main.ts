/* Plugin orchestration: wrap the native Maps registration and coordinate features. */

import {
	FileView,
	getLanguage,
	Notice,
	parseFrontMatterAliases,
	parseYaml,
	Platform,
	Plugin,
	requestUrl,
	stringifyYaml,
	TFile,
} from 'obsidian';
import type { CachedMetadata, Editor, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { localResourcePrefix, offlineTileUrl, offlineZoomBounds, vaultBasePath, type OfflineBasemap } from './basemap';
import { FOCUS_RETRY_MS, FOCUS_TRIES, PHOTO_EXTS, TRACK_EXTS } from './constants';
import { formatLatLng, parseLatLng } from './coords';
import { TrackEmbed } from './embed';
import { t } from './i18n';
import { GeocodeError, needsKey, parseReverse, reverseRequest } from './geocode';
import { LinkModal } from './link-modal';
import { formatFix, isBlank, Locator } from './locate';
import {
	aroundViewState,
	embedLink,
	pickMapView,
	pointerFilter,
	withAroundView,
	type BaseSpec,
	type BaseView,
} from './map-block';
import { MapModal } from './modal';
import { currentCoords, NotePickerModal, ReplaceCoordsModal } from './note-picker';
import { PhotoIndex, pluginIndexIO } from './photo-index';
import { noteName, placesFrom, type Place } from './places';
import { ImportPlacesModal } from './places-modal';
import { nativeBehind, ownedBy, stamp, type RegistrationOwner } from './registration';
import { PlaceSearchModal } from './search-modal';
import { AdvancedMapsSettingTab, DEFAULT_SETTINGS, isExcluded, type AdvancedMapsSettings } from './settings';
import { duplicateStatsName, formatDistance, hasStats, statsProperties, trackStats } from './stats';
import { TrackCache, type TrackRecord } from './track-cache';
import { TrackLayer, type FocusTarget } from './track-layer';
import { appendTrackOptions } from './view-options';
import type {
	BasesMapView,
	BasesViewFactory,
	BasesViewOptionsFn,
	BasesViewRegistration,
	ComponentNode,
} from './types/obsidian-internals';

export default class AdvancedMapsPlugin extends Plugin {
	/** Declared on Plugin as `unknown` since 1.13; narrowed here. */
	override settings!: AdvancedMapsSettings;
	tracks!: TrackCache;
	/** What reading a photo answered last session; derivable, never authoritative. */
	photoIndex!: PhotoIndex;
	locator!: Locator;
	readonly layers = new Set<TrackLayer>();
	readonly embeds = new Set<TrackEmbed>();
	/** Notes whose blank coordinate property is already being filled in. Keyed on
	 *  the file rather than its path: Obsidian renames a `TFile` in place, so a
	 *  move during the seconds a fix takes used to leave the entry stranded and
	 *  that note ineligible for the rest of the session. */
	private readonly filling = new WeakSet<TFile>();
	/** The pane the followed notes are opening in; see `followTarget`. */
	private followPane: WorkspaceLeaf | null = null;
	/** Which track files a note embeds, memoised against the metadata that answered. */
	private trackLinks = new WeakMap<CachedMetadata, TFile[]>();

	private nativeFactory: BasesViewFactory | null = null;
	/** This instance's identity on the wrappers it installs; see `registration.ts`. */
	private readonly owner: RegistrationOwner = { alive: true };
	private patched: {
		/** What this instance put in the registration, to restore only its own. */
		factory: BasesViewFactory;
		options?: BasesViewRegistration['options'];
		nativeFactory: BasesViewFactory;
		nativeOptions?: BasesViewRegistration['options'];
	} | null = null;
	private ownedExtensions: string[] = [];

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.photoIndex = new PhotoIndex(pluginIndexIO(this));
		// Started here rather than awaited: the read is what the first map waits
		// on, and every other part of loading has no business waiting with it.
		void this.photoIndex.ready();
		this.tracks = new TrackCache(this.app, this.photoIndex);
		this.locator = new Locator({
			geolocation: typeof navigator !== 'undefined' ? (navigator.geolocation ?? null) : null,
			// The locator names the reason; turning it into a sentence is this side's
			// job, which is what keeps locate.ts free of a runtime Obsidian import.
			onGiveUp: (reason) => new Notice(t('notice.locate.gaveUp', { reason: t(reason) })),
		});

		if (!this.patchMapsView()) {
			// Load order is not guaranteed, so try again once everything is up.
			this.app.workspace.onLayoutReady(() => {
				if (!this.patchMapsView()) {
					new Notice(t('notice.mapsRequired'));
					console.warn('Advanced Maps: the built-in Maps view is not registered.');
				}
			});
		}

		this.registerTrackEmbeds();
		this.registerOpenInMap();
		this.registerInsertMap();
		this.registerLinkPaste();
		this.registerPlaceSearch();
		this.registerLocate();
		this.registerReverseGeocode();
		this.registerFillFromPhoto();
		this.registerWriteStats();
		this.registerImportPlaces();
		// Its own listener rather than a line inside the one the locator already
		// has on `file-open`: that one is about writing to the note, this one is
		// about moving a camera, and neither should be able to break the other.
		this.registerEvent(this.app.workspace.on('file-open', (file) => this.followActiveNote(file)));
		this.addSettingTab(new AdvancedMapsSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on('modify', (file: TAbstractFile) => {
				if (!this.tracks.has(file.path)) return;
				this.tracks.invalidate(file.path);
				this.refreshTracks();
			})
		);

		// A note's own text changed. A base map re-queries by itself, but an inline
		// map's photos come from the links of the note it sits in, and the gate
		// above never fires for that note. This is the metadata event rather than
		// the vault one because the links are read out of the cache, and only this
		// one says the cache has caught up with the file.
		this.registerEvent(
			this.app.metadataCache.on('changed', (file: TFile) => {
				for (const embed of this.embeds) {
					if (embed.hostPath !== file.path || !embed.hostPhotosMoved()) continue;
					embed.refresh().catch((e) => console.error('Advanced Maps: could not redraw embed', e));
				}
			})
		);

		// File lifecycle invalidates parsed data and note-link resolution memos.
		this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => this.forgetTrack(file.path)));
		// The old path is the one the cache is keyed under; the new one cannot be
		// stale yet.
		this.registerEvent(
			this.app.vault.on('rename', (_file: TAbstractFile, oldPath: string) => this.forgetTrack(oldPath))
		);
		this.registerEvent(
			this.app.vault.on('create', () => {
				this.trackLinks = new WeakMap();
			})
		);

		// Maps may replace its registration; idempotently re-adopt after layout changes.
		this.registerEvent(this.app.workspace.on('layout-change', () => this.patchMapsView()));

		// Only once the vault file list is populated: asking a half-built index
		// which paths exist would answer "none" and discard the whole store.
		this.app.workspace.onLayoutReady(() => {
			void this.prunePhotoIndex();
		});
	}

	override onunload(): void {
		// Best-effort: onunload cannot await, and the debounced write already made
		// this session's work durable seconds ago.
		void this.photoIndex.flush();
		this.unpatchMapsView();
		// Explicitly release each embed's MapLibre/WebGL resources.
		for (const embed of [...this.embeds]) embed.unload();
		const registry = this.app.embedRegistry;
		if (registry && this.ownedExtensions.length > 0) {
			registry.unregisterExtensions(this.ownedExtensions);
		}
	}

	/* ---- patching the built-in view ---- */

	private mapRegistration(): BasesViewRegistration | null {
		const bases = this.app.internalPlugins?.getPluginById('bases');
		const registrations = bases?.instance?.registrations;
		return registrations?.map ?? null;
	}

	private patchMapsView(): boolean {
		const entry = this.mapRegistration();
		if (!entry || typeof entry.factory !== 'function') return false;
		// Only *this* instance's wrapper counts as already patched. A wrapper an
		// unloaded instance left behind looks identical from the outside and used
		// to end the method here, which left the registration owned by a dead
		// plugin and enhanced nothing at all until Obsidian restarted.
		if (ownedBy(entry.factory, this.owner)) return true;

		// Peels any wrapper of ours off the front, so a re-take wraps the host's
		// own function rather than stacking on a dead instance — which for the
		// options half would also append the track group twice.
		const nativeFactory = nativeBehind(entry.factory);
		const nativeOptions = typeof entry.options === 'function' ? nativeBehind(entry.options) : entry.options;
		this.nativeFactory = nativeFactory;
		const owner = this.owner;

		const factory: BasesViewFactory = (controller, containerEl) => {
			const view = nativeFactory(controller, containerEl);
			// Through the owner cell rather than `this`: a copy of this wrapper
			// that outlives the instance stops enhancing instead of handing views
			// to an unloaded plugin.
			if (owner.alive) this.enhance(view, false);
			return view;
		};
		stamp(factory, nativeFactory, owner);
		entry.factory = factory;

		if (typeof nativeOptions === 'function') {
			const options: BasesViewOptionsFn = () =>
				owner.alive ? appendTrackOptions(nativeOptions()) : nativeOptions();
			stamp(options, nativeOptions, owner);
			entry.options = options;
		}

		this.patched = { factory, options: entry.options, nativeFactory, nativeOptions };
		this.adoptOpenViews();
		return true;
	}

	/** A track file has gone or moved: drop its parse, and every memo that named it. */
	private forgetTrack(path: string): void {
		this.tracks.invalidate(path);
		// The stored entry describes a file at this path. After a delete there is
		// none, and after a rename the bytes answer to another name — either way
		// it must not be able to place a point.
		this.photoIndex.forget(path);
		this.trackLinks = new WeakMap();
	}

	/** Drop stored entries for photos the vault no longer has. */
	private async prunePhotoIndex(): Promise<void> {
		await this.photoIndex.ready();
		this.photoIndex.prune((path) => this.app.vault.getFileByPath(path) !== null);
	}

	/** Discard the index outright. Nothing on screen changes; later reads refill it. */
	async clearPhotoIndex(): Promise<void> {
		await this.photoIndex.clear();
		new Notice(t('notice.photoIndex.cleared'));
	}

	/** Attach a TrackLayer to one native map view, whatever its age. */
	private enhance(view: BasesMapView | null | undefined, adopted: boolean): TrackLayer | null {
		if (!view || !view.markerManager) return null;
		// An embed's map is a native view too, but it has no query behind it:
		// enhancing it would hand its track over to a layer that thinks the
		// result set is empty, and promptly wipe it.
		if (view.__advancedMapsHeadless) return null;
		// Already ours. The flag is set by attach() and cleared by detach(), which
		// keeps this from depending on *which* method TrackLayer happens to wrap
		// first — probing for that made moving the seam a silent double-attach on
		// every layout-change. It lives on the view instance rather than in a Set
		// here, so a view left wrapped by a previous plugin instance is still
		// recognised.
		if (view.__advancedMapsLayer) return null;
		try {
			const layer = new TrackLayer(this, view, adopted).attach();
			this.layers.add(layer);
			// A view adopted after the fact has already built its map, so the
			// initializeMap wrapper will never fire for it — and its markers were
			// placed before we could move them, so redo those too.
			if (view.map) {
				layer.onMapCreated(view.map, adopted ? 'adopted' : 'current');
				layer.reproject().catch((e) => console.error('Advanced Maps: could not draw tracks', e));
			} else if (adopted) {
				// The pre-existing native initializer may still be fetching a style;
				// wait for it rather than invoking it a second time.
				layer.watchAdoptedMap();
			}
			return layer;
		} catch (e) {
			console.error('Advanced Maps: could not enhance the map view', e);
			return null;
		}
	}

	/** Adopt already-open native map views that did not pass through the wrapped factory. */
	private adoptOpenViews(): void {
		const seen = new Set<object>();
		const visit = (node: unknown): void => {
			if (!node || typeof node !== 'object' || seen.has(node)) return;
			seen.add(node);
			const candidate = node as BasesMapView;
			if (candidate.type === 'map' && candidate.markerManager && candidate.mapEl) {
				this.enhance(candidate, true);
				return;
			}
			const component = node as ComponentNode;
			if (Array.isArray(component._children)) for (const child of component._children) visit(child);
			if (component.controller) visit(component.controller);
			if (component.view) visit(component.view);
		};
		this.app.workspace.iterateAllLeaves((leaf) => visit(leaf.view));
	}

	private unpatchMapsView(): void {
		// First, and whether or not the registration can be restored: a wrapper
		// another plugin has since wrapped cannot be taken out of the chain, so
		// retiring the owner is what stops it acting for an unloaded instance.
		this.owner.alive = false;
		const entry = this.mapRegistration();
		// Identity, not "has a stamp": restoring over someone else's wrapper would
		// discard their augmentation, and restoring over a newer instance's would
		// undo a patch this instance never installed.
		if (entry && this.patched && entry.factory === this.patched.factory) {
			entry.factory = this.patched.nativeFactory;
			if (this.patched.nativeOptions && entry.options === this.patched.options) {
				entry.options = this.patched.nativeOptions;
			}
		}
		for (const layer of [...this.layers]) layer.detach();
		this.layers.clear();
	}

	/** A native map view with a stub controller behind it — used by embeds. */
	createHeadlessView(parentEl: HTMLElement): BasesMapView | null {
		if (typeof this.nativeFactory !== 'function') return null;
		const view = this.nativeFactory({ app: this.app }, parentEl);
		view.__advancedMapsHeadless = true;
		view.config = {
			// An inline map has no view options to decline the offline basemap with,
			// so it follows the plugin setting — answered here rather than by
			// rewriting the config afterwards, so the native `loadConfig` derives
			// everything else from it exactly as it would from a real view's tiles.
			get: (key) => this.headlessOption(key),
			getAsPropertyId: () => null,
			getEvaluatedFormula: () => undefined,
			getDisplayName: (prop) => String(prop),
			set: () => {},
		};
		view.data = { data: [], properties: [] };
		return view;
	}

	/** What a headless view's stub config answers; undefined for everything native. */
	private headlessOption(key: string): unknown {
		if (key !== 'mapTiles' && key !== 'mapTilesDark' && key !== 'minZoom') return undefined;
		const pack = this.offlineBasemap();
		if (!pack) return undefined;
		return key === 'minZoom' ? pack.cameraMinZoom : [pack.url];
	}

	/**
	 * The basemap on disk, resolved for right now, or null when there is none.
	 *
	 * Resolved per call rather than cached: the desktop prefix carries a token the
	 * main process rebuilds at every launch, so a cached URL would survive a
	 * window reload and fail after a restart — the failure that is hardest to
	 * connect back to its cause.
	 */
	offlineBasemap(): OfflineBasemap | null {
		const { offlineTiles, offlineTilesMinZoom, offlineTilesMaxZoom } = this.settings;
		const adapter = this.app.vault.adapter;
		// The prefix this host serves its own local files behind, which is not the
		// same string on every platform: `Platform.resourcePathPrefix` is fetchable
		// on the desktop and is `file:///` on Android, where the web view refuses
		// it. So the host is asked first, and the constant is what is left when
		// there is nothing to derive from.
		const prefix = localResourcePrefix(adapter) ?? Platform.resourcePathPrefix;
		const url = offlineTileUrl(offlineTiles, prefix, vaultBasePath(adapter));
		if (url === null) return null;
		return { url, ...offlineZoomBounds(offlineTilesMinZoom, offlineTilesMaxZoom) };
	}

	/**
	 * Put the new background under every map already on screen.
	 *
	 * The native view compares a snapshot of its *own* option values to decide
	 * whether to restyle, so a plugin setting changing is invisible to it and no
	 * restyle would follow. Rebuilding the config is what re-runs the wrapper that
	 * substitutes — or, once the pack is cleared, what stops it, which is how the
	 * native background comes back without anything having been saved to undo.
	 */
	refreshBasemaps(): void {
		for (const layer of this.layers) layer.refreshBasemap();
		for (const embed of this.embeds) embed.refreshBasemap();
	}

	/** Add or remove this plugin's own map buttons wherever a map is open. */
	refreshControls(): void {
		for (const layer of this.layers) layer.refreshControls();
	}

	refreshTracks(): void {
		// `showPhotos` changes link eligibility without replacing CachedMetadata.
		this.trackLinks = new WeakMap();
		for (const layer of this.layers) {
			layer.sync().catch((e) => console.error('Advanced Maps: could not redraw tracks', e));
		}
		for (const embed of this.embeds) {
			embed.refresh().catch((e) => console.error('Advanced Maps: could not redraw embed', e));
		}
	}

	/**
	 * Move everything already on screen into the new space, without waiting for
	 * Bases to re-run the view. Each layer re-reads its own effective system, so
	 * a view that pins one of its own simply redraws where it already was.
	 */
	reprojectAll(): void {
		for (const layer of this.layers) {
			layer.reproject().catch((e) => console.error('Advanced Maps: could not reproject', e));
		}
		for (const embed of this.embeds) {
			embed.refresh().catch((e) => console.error('Advanced Maps: could not reproject embed', e));
		}
	}

	/* ---- tracks ---- */

	/** Whether this extension is one `resolveTracks` will pick up: a track
	 *  format outright, or a photo format with **Show photos** on. Gating the
	 *  photo half here rather than after the fact is what makes the memo below
	 *  self-correct on a toggle: see `refreshTracks()`. */
	private isTrackFile(extension: string): boolean {
		return TRACK_EXTS.has(extension) || (this.settings.showPhotos && PHOTO_EXTS.has(extension));
	}

	/**
	 * Resolve direct result files plus embeds, body links, and frontmatter links.
	 * Metadata-cache discovery leaves the base query unchanged; TFile identity deduplicates.
	 */
	/**
	 * The attachments a note points at that `accept` admits, in reading order.
	 *
	 * The three reference sources are read separately because Obsidian keeps them
	 * separate, and all three count. Stated once: every caller has to agree on
	 * the order and on the de-duplication, and a second copy of this loop is a
	 * second place for a fourth source or an ordering rule to be missed.
	 */
	private linkedAttachments(file: TFile, cache: CachedMetadata, accept: (extension: string) => boolean): TFile[] {
		const out: TFile[] = [];
		// A Set beside the list rather than scanning `out`: an album note can
		// reference hundreds of photos, and a linear scan per reference makes
		// resolving one note quadratic in its own attachments.
		const seen = new Set<TFile>();
		// Embeds first, so a note that both embeds and links the same file keeps
		// the order it reads in; `getFirstLinkpathDest` answers the same TFile for
		// both, which is what makes the identity check enough to de-duplicate.
		for (const ref of [...(cache.embeds ?? []), ...(cache.links ?? []), ...(cache.frontmatterLinks ?? [])]) {
			const dest = this.app.metadataCache.getFirstLinkpathDest(ref.link, file.path);
			if (dest && accept(dest.extension) && !seen.has(dest)) {
				seen.add(dest);
				out.push(dest);
			}
		}
		return out;
	}

	resolveTracks(file: TFile): TFile[] {
		if (this.isTrackFile(file.extension)) return [file];
		if (file.extension !== 'md') return [];
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return [];

		// Cache-object identity invalidates naturally when Obsidian re-indexes the note.
		const memo = this.trackLinks.get(cache);
		if (memo) return memo;

		const out = this.linkedAttachments(file, cache, (extension) => this.isTrackFile(extension));
		this.trackLinks.set(cache, out);
		return out;
	}

	private registerTrackEmbeds(): void {
		const registry = this.app.embedRegistry;
		if (!registry) {
			console.warn('Advanced Maps: embed registry unavailable, ![[track.gpx]] embeds are disabled.');
			return;
		}
		// Leave anything another plugin already owns alone, so both can coexist.
		this.ownedExtensions = [...TRACK_EXTS].filter((ext) => !registry.isExtensionRegistered(ext));
		if (this.ownedExtensions.length === 0) return;
		registry.registerExtensions(this.ownedExtensions, (context, file) => {
			// `sourcePath` identifies the host note for companion-photo resolution.
			const source = typeof context.sourcePath === 'string' ? context.sourcePath : '';
			const embed = new TrackEmbed(context.containerEl, this, file, source);
			this.embeds.add(embed);
			return embed;
		});
	}

	/* ---- open in map ---- */

	private menuLabel(): string {
		return this.settings.menuLabel || t('command.openInMap');
	}

	private registerOpenInMap(): void {
		this.addCommand({
			id: 'open-in-map',
			name: this.menuLabel(),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!this.hasCoords(file)) return false;
				if (!checking) void this.openMapForFile(file);
				return true;
			},
		});

		// Fires for the note's ⋮ menu, and for the same file elsewhere (explorer,
		// tab header). The coords check keeps it off notes that have no place.
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!this.hasCoords(file)) return;
				menu.addItem((item) =>
					item
						.setTitle(this.menuLabel())
						.setIcon('map-pin')
						.onClick(() => void this.openMapForFile(file))
				);
			})
		);
	}

	private readCoords(file: TAbstractFile | null): { raw: unknown; frontmatter: Record<string, unknown> } | null {
		if (!(file instanceof TFile) || file.extension !== 'md') return null;
		// FrontMatterCache is `any` by declaration; narrowed here so everything
		// downstream reads a property off something with a stated shape.
		const frontmatter: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) return null;
		const raw = frontmatter[this.settings.coordsProperty];
		// Each kind of empty stated on its own rather than inferred from
		// `String(raw).trim()`: that turned any object into a non-empty
		// "[object Object]", and only caught the empty list by the accident of
		// `String([])` being "".
		if (raw === undefined || raw === null) return null;
		if (typeof raw === 'string' && raw.trim() === '') return null;
		if (Array.isArray(raw) && raw.length === 0) return null;
		return { raw, frontmatter };
	}

	/** A type predicate, so the callers that already checked need no cast afterwards. */
	private hasCoords(file: TAbstractFile | null): file is TFile {
		return this.readCoords(file) !== null;
	}

	/**
	 * The configured base, its file and the view to copy out of it, or null with
	 * the reason already on screen. Both the pop-up and the embed start here, and
	 * neither has anything to add to a missing file or a bad parse.
	 */
	private async loadBase(): Promise<{ base: BaseSpec; view: BaseView; file: TFile } | null> {
		const basePath = this.settings.basePath;
		if (!basePath) {
			new Notice(t('notice.baseNotConfigured'));
			return null;
		}

		const baseFile = this.app.vault.getFileByPath(basePath);
		if (!baseFile) {
			new Notice(t('notice.baseNotFound', { path: basePath }));
			return null;
		}

		let base: BaseSpec;
		try {
			base = (parseYaml(await this.app.vault.cachedRead(baseFile)) as BaseSpec) ?? {};
		} catch (e) {
			new Notice(
				t('notice.baseParseFailed', { path: basePath, error: e instanceof Error ? e.message : String(e) })
			);
			return null;
		}

		const view = pickMapView(base, this.settings.viewName);
		if (!view) {
			new Notice(
				this.settings.viewName
					? t('notice.viewNotFound', { path: basePath, view: this.settings.viewName })
					: t('notice.noMapView', { path: basePath })
			);
			return null;
		}

		return { base, view, file: baseFile };
	}

	/** Open the configured base and move its camera without rewriting the base. */
	private async openMapForFile(file: TFile): Promise<void> {
		const found = this.readCoords(file);
		if (!found) {
			new Notice(t('notice.noCoords', { file: file.basename, property: this.settings.coordsProperty }));
			return;
		}
		const pair = parseLatLng(found.raw);
		if (!pair) {
			// A property with something in it that is not a place: a name typed in
			// by hand, a half-finished edit. Worth saying, because the ⋮ item is
			// there — `readCoords` only asks whether the property is empty.
			new Notice(
				t('notice.badCoords', {
					file: file.basename,
					property: this.settings.coordsProperty,
					value: String(found.raw),
				})
			);
			return;
		}

		const loaded = await this.loadBase();
		if (!loaded) return;

		// An explicit zoom, because this is a jump to a subject rather than a look
		// around one. Following, which is the same move made automatically, passes
		// none and keeps whatever zoom the reader chose.
		const target: FocusTarget = { lat: pair[0], lng: pair[1], zoom: this.settings.openZoom, file };
		if (this.settings.openIn === 'modal') this.openMapModal(loaded, file, found.frontmatter, target);
		else await this.openMapLeaf(loaded, target);
	}

	/**
	 * The pop-up: one embed line, and then the camera.
	 *
	 * The heading is what the modal has instead of a popup on the map — it opens
	 * before the base has loaded, so it is the one thing that can say which note
	 * this is a map of straight away.
	 */
	private openMapModal(
		loaded: { view: BaseView; file: TFile },
		note: TFile,
		frontmatter: Record<string, unknown>,
		target: FocusTarget
	): void {
		// fileToLinktext, so the embed is written the way Obsidian writes links —
		// shortest unambiguous form, and correct when two bases share a basename.
		const linktext = this.app.metadataCache.fileToLinktext(loaded.file, note.path);
		// Obsidian's own parser, so `aliases: a, b` reads the way it does elsewhere.
		// `place` is whatever the note put there, so it only gets to be the label
		// when it is something a reader would recognise as one.
		const place = frontmatter.place;
		const label =
			parseFrontMatterAliases(frontmatter)?.[0] ??
			(typeof place === 'string' || typeof place === 'number' ? String(place) : note.basename);
		const coords = formatLatLng(target.lat, target.lng);
		const modal = new MapModal(this.app, note.path, embedLink(linktext, loaded.view.name), `${label} · ${coords}`);
		modal.open();
		this.focusIn(modal.contentEl, target);
	}

	/** Open or reuse a leaf for the base, preserving its writable native config. */
	private async openMapLeaf(loaded: { view: BaseView; file: TFile }, target: FocusTarget): Promise<void> {
		const leaf = this.baseLeaf(loaded.file) ?? this.app.workspace.getLeaf('tab');
		// Bases selects a view through leaf state.
		const state = loaded.view.name ? { viewName: loaded.view.name } : undefined;
		await leaf.openFile(loaded.file, { active: true, state });
		await this.app.workspace.revealLeaf(leaf);
		this.focusIn(leaf.view.containerEl, target);
	}

	/** A leaf already showing this base, wherever it is — a tab, a split, a sidebar. */
	private baseLeaf(file: TFile): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found) return;
			const view = leaf.view;
			if (view instanceof FileView && view.getViewType() === 'bases' && view.file === file) found = leaf;
		});
		return found;
	}

	/* ---- pointing a map at a note ---- */

	/** The layers drawing inside one element: a modal's body, or a leaf. */
	private layersIn(container: HTMLElement): TrackLayer[] {
		return [...this.layers].filter((layer) => {
			const el = layer.view.containerEl;
			return !!el && container.contains(el);
		});
	}

	/** Retry briefly for a lazily-created map inside the supplied container. */
	focusIn(container: HTMLElement, target: FocusTarget): void {
		let tries = 0;
		const timer = window.setInterval(() => {
			const layers = container.isConnected ? this.layersIn(container) : [];
			if (layers.length === 0 && container.isConnected && ++tries <= FOCUS_TRIES) return;
			window.clearInterval(timer);
			for (const layer of layers) layer.focus(target);
		}, FOCUS_RETRY_MS);
		// Registered as well as cleared above, so a pop-up closed mid-wait — or the
		// plugin being disabled — does not leave it ticking.
		this.registerInterval(timer);
	}

	/** Move each opted-in map camera to the active note without changing query or zoom. */
	private followActiveNote(file: TAbstractFile | null): void {
		const target = this.noteTarget(file);
		if (!target) return;
		// Recorded here rather than from the `file-open` handler, because a base
		// file opening in a leaf fires `file-open` too and `noteTarget` is what
		// tells the two apart: only a note with a readable coordinate gets this
		// far, so `followPane` cannot end up pointing at a map.
		this.followPane = this.app.workspace.getMostRecentLeaf();
		for (const layer of this.layers) if (layer.isFollowing()) layer.focus(target);
	}

	/** Start following immediately and remember the note pane so pin clicks do not replace the map. */
	followNow(layer: TrackLayer): void {
		const target = this.noteTarget(this.app.workspace.getActiveFile());
		if (!target) return;
		// Kept rather than cleared when the note is in no pane this may open into:
		// a pane remembered from an earlier follow is a better answer than none.
		this.followPane = this.noteLeaf(target.file, layer) ?? this.followPane;
		layer.focus(target);
	}

	/** Find a pane showing the note, excluding the pane that contains this map. */
	private noteLeaf(file: TFile | undefined, layer: TrackLayer): WorkspaceLeaf | null {
		if (!file) return null;
		const own = layer.view.containerEl;
		let found: WorkspaceLeaf | null = null;
		// The callback returns undefined on every path: `iterateAllLeaves` stops on
		// a truthy return, so an assignment used as the body would visit one leaf
		// per split and look exactly like Obsidian hiding leaves from it.
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found) return;
			const view = leaf.view;
			if (!(view instanceof FileView) || view.file !== file) return;
			if (own && view.containerEl?.contains(own)) return;
			found = leaf;
		});
		return found;
	}

	/** Return the remembered non-map pane for clicks on a following map, or native fallback. */
	followTarget(layer: TrackLayer): WorkspaceLeaf | null {
		const leaf = this.followPane;
		if (!leaf || !leaf.view) return null;
		// Closed since, or it is this very map — either way it is not somewhere
		// else to open a note.
		const own = layer.view.containerEl;
		if (!leaf.view.containerEl?.isConnected) return null;
		if (own && leaf.view.containerEl.contains(own)) return null;
		return leaf;
	}

	/** Where a note's own coordinate would put a camera, or null if it has none to read. */
	private noteTarget(file: TAbstractFile | null): FocusTarget | null {
		if (!(file instanceof TFile)) return null;
		const found = this.readCoords(file);
		const pair = found ? parseLatLng(found.raw) : null;
		if (!pair) return null;
		// keepFocus: this camera moved because the reader switched notes, not
		// because they came over here. See `restoreFocus` in track-layer.ts.
		return { lat: pair[0], lng: pair[1], animate: true, file, keepFocus: true };
	}

	/* ---- a map of the notes around this one ---- */

	/** Blank falls back to the localized name, the way `menuLabel` does. */
	aroundViewName(): string {
		return this.settings.aroundViewName || t('view.around');
	}

	/** Register the cursor-dependent Around-map insertion command and editor item. */
	private registerInsertMap(): void {
		this.addCommand({
			id: 'insert-linked-map',
			name: t('command.insertMap'),
			editorCheckCallback: (checking, editor, ctx) => {
				const file = ctx.file;
				if (!file || file.extension !== 'md') return false;
				if (!checking) void this.insertAroundMap(editor, file);
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, ctx) => {
				const file = ctx.file;
				if (!file || file.extension !== 'md') return;
				menu.addItem((item) =>
					item
						.setTitle(t('command.insertMap'))
						.setIcon('map-plus')
						.onClick(() => void this.insertAroundMap(editor, file))
				);
			})
		);
	}

	private async insertAroundMap(editor: Editor, note: TFile): Promise<void> {
		const loaded = await this.loadBase();
		if (!loaded) return;
		const name = this.aroundViewName();

		if (!(await this.ensureAroundView(loaded, name))) return;

		// fileToLinktext, so the link is written the way Obsidian writes links —
		// shortest unambiguous form, and correct when two bases share a basename.
		const linktext = this.app.metadataCache.fileToLinktext(loaded.file, note.path);
		editor.replaceSelection(embedLink(linktext, name) + '\n');
	}

	/**
	 * Add the view to the base file unless it is already there.
	 *
	 * The whole file is re-serialized, so it is read again inside `process`
	 * rather than reusing what `loadBase` parsed: between the two there is an
	 * await, and the base is a file Bases itself writes to.
	 */
	private async ensureAroundView(
		loaded: { base: BaseSpec; view: BaseView; file: TFile },
		name: string
	): Promise<boolean> {
		// The name can be taken before the write and again during it — the file is
		// re-read inside vault.process — so both checks answer through one refusal
		// rather than stating the same notice twice.
		const occupied = (): false => {
			new Notice(t('notice.around.nameOccupied', { view: name, path: loaded.file.path }));
			return false;
		};
		const initial = aroundViewState(loaded.base, name);
		if (initial === 'map') return true;
		if (initial === 'occupied') return occupied();

		const filter = pointerFilter(this.settings.coordsProperty);
		const result: { outcome: 'added' | 'map' | 'occupied' } = { outcome: 'added' };
		try {
			// Awaited, so the catch below can actually see a failed write. Left
			// floating, the rejection escaped as an unhandled promise and the
			// notice this try/catch exists to show never appeared.
			await this.app.vault.process(loaded.file, (data) => {
				const fresh = (parseYaml(data) as BaseSpec) ?? {};
				const current = aroundViewState(fresh, name);
				if (current !== 'missing') {
					// The file can change between loadBase() and process(). Keep an
					// existing map untouched, but never embed a table/cards view just
					// because it won the requested name in that interval.
					result.outcome = current;
					return data;
				}
				const source = pickMapView(fresh, this.settings.viewName) ?? loaded.view;
				const next = withAroundView(fresh, source, name, filter);
				return next ? stringifyYaml(next) : data;
			});
		} catch (e) {
			new Notice(
				t('notice.around.writeFailed', {
					path: loaded.file.path,
					error: e instanceof Error ? e.message : String(e),
				})
			);
			return false;
		}
		if (result.outcome === 'occupied') return occupied();
		if (result.outcome === 'added') new Notice(t('notice.around.added', { view: name, path: loaded.file.path }));
		return true;
	}

	/* ---- coordinates from a link ---- */

	/**
	 * Deliberately not behind the **Enable location** switch. That setting exists
	 * because asking the device where it is raises a permission prompt and records
	 * where each note was written; pasting a link a person already has does
	 * neither, and gating it there would hide it from everyone who turned the
	 * device off precisely because they wanted to type locations in by hand.
	 */
	private registerLinkPaste(): void {
		this.addCommand({
			id: 'coords-from-link',
			name: t('command.fillFromLink'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) this.openLinkModal(file);
				return true;
			},
		});
	}

	private openLinkModal(file: TFile): void {
		new LinkModal(this.app, this.settings.coordsProperty, (coords) => this.writeCoords(file, coords)).open();
	}

	/* ---- place search ---- */

	private registerPlaceSearch(): void {
		this.addCommand({
			id: 'search-place',
			name: t('command.searchPlace'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) this.openSearchModal(file);
				return true;
			},
		});
	}

	/**
	 * The Amap key, out of whichever of the two stores the reader picked.
	 *
	 * `getSecret` answers null for a secret renamed or deleted since it was
	 * named here, which lands on the same empty string an unconfigured key does
	 * — so `needsKey` below catches it and says so, rather than 高德 rejecting
	 * the request and the search looking like it found nothing.
	 */
	private amapKey(): string {
		const { amapKeyStore, amapKey, amapSecretId } = this.settings;
		if (amapKeyStore !== 'secret') return amapKey;
		return (amapSecretId === '' ? null : this.app.secretStorage.getSecret(amapSecretId)) ?? '';
	}

	private openSearchModal(file: TFile): void {
		const { geocodeProvider, coordsProperty } = this.settings;
		const key = this.amapKey();
		// Said up front rather than as a failed search: an empty result list looks
		// like "no such place", which is the wrong thing to conclude.
		if (needsKey(geocodeProvider, key)) {
			new Notice(t('notice.search.needsKey'));
			return;
		}
		new PlaceSearchModal(this.app, geocodeProvider, key, coordsProperty, (coords) =>
			this.writeCoords(file, coords)
		).open();
	}

	/** The one place a coordinate reaches disk from a deliberate command — the four
	 *  above, and the map's own "set a note's coordinates here" below. */
	async writeCoords(file: TFile, coords: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter[this.settings.coordsProperty] = coords;
		});
	}

	/* ---- a point on the map, into a note that already exists ---- */

	/**
	 * Reached from the map's right-click menu with a WGS-84 pair the menu already
	 * converted exactly once. Everything from here on is about *which* note —
	 * the question no other command in this plugin has to ask, because every one
	 * of them acts on the note the reader is looking at.
	 */
	stampNoteAt(lat: number, lng: number): void {
		const coords = formatLatLng(lat, lng);
		const property = this.settings.coordsProperty;
		new NotePickerModal(this.app, coords, property, (file) => {
			const held = currentCoords(this.app, file, property);
			if (held === null) {
				void this.commitStamp(file, coords);
				return;
			}
			new ReplaceCoordsModal(
				this.app,
				file,
				property,
				held,
				coords,
				() => void this.commitStamp(file, coords)
			).open();
		}).open();
	}

	/**
	 * The note is named in the notice because the map may show nothing: a note
	 * outside this base's own query gains its coordinate and no pin, which
	 * without a word would read as the command having done nothing.
	 */
	private async commitStamp(file: TFile, coords: string): Promise<void> {
		try {
			await this.writeCoords(file, coords);
		} catch (e) {
			new Notice(t('notice.write.failed', { reason: e instanceof Error ? e.message : String(e) }));
			return;
		}
		new Notice(t('notice.stamp.done', { file: file.basename, property: this.settings.coordsProperty, coords }));
	}

	/* ---- reverse geocoding ---- */

	/**
	 * Deliberately not behind **Enable location**, for the same reason the link
	 * paste and place search are not: it raises no permission prompt and records
	 * nothing about where this device is. Unlike either of those, though, it does
	 * send a coordinate the reader already had to a third party — the note's own
	 * `coordsProperty` value, on the way to becoming a place name. README's "What
	 * leaves your vault" says so.
	 */
	private registerReverseGeocode(): void {
		this.addCommand({
			id: 'reverse-geocode',
			name: t('command.reverseGeocode'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!this.hasCoords(file)) return false;
				if (!checking) void this.reverseGeocodeCurrent(file);
				return true;
			},
		});
	}

	/** Write the configured place property through Obsidian's frontmatter API. */
	private async writePlace(file: TFile, name: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter[this.settings.placeProperty] = name;
		});
	}

	/**
	 * Read the note's coordinate, ask the configured provider what is there, and
	 * write the answer into `placeProperty` — overwriting whatever was there,
	 * since running the command is the explicit ask.
	 *
	 * `needsKey` is checked here rather than in the command's `checkCallback`:
	 * doing it there would make the command silently vanish from the palette
	 * whenever Amap is picked with no key set, which is worse than a notice
	 * saying so. `registerPlaceSearch` made the same choice.
	 */
	private async reverseGeocodeCurrent(file: TFile): Promise<void> {
		// Checked before anything else touches the note: writePlace() writes to
		// exactly this key, so if it is also where readCoords() just read the
		// coordinate from, the write below would overwrite that coordinate with
		// the place name it becomes. The two default apart ('coords' vs
		// 'location'), but a reader can point them at the same property by hand —
		// including by renaming coordsProperty to 'location', the very name
		// placeProperty defaults to — and nothing else here would notice.
		if (this.settings.placeProperty === this.settings.coordsProperty) {
			new Notice(t('notice.reverseGeocode.samePropertyAsCoords', { property: this.settings.coordsProperty }));
			return;
		}
		const found = this.readCoords(file);
		if (!found) {
			new Notice(t('notice.noCoords', { file: file.basename, property: this.settings.coordsProperty }));
			return;
		}
		const pair = parseLatLng(found.raw);
		if (!pair) {
			new Notice(
				t('notice.badCoords', {
					file: file.basename,
					property: this.settings.coordsProperty,
					value: String(found.raw),
				})
			);
			return;
		}

		const { geocodeProvider } = this.settings;
		const key = this.amapKey();
		if (needsKey(geocodeProvider, key)) {
			new Notice(t('notice.search.needsKey'));
			return;
		}

		try {
			const request = reverseRequest(geocodeProvider, pair[0], pair[1], { key, language: getLanguage() || 'en' });
			const response = await requestUrl({ url: request.url, headers: request.headers, throw: false });
			if (response.status >= 400) throw new GeocodeError(`HTTP ${response.status}`);
			const name = parseReverse(geocodeProvider, response.json);
			await this.writePlace(file, name);
			new Notice(t('notice.reverseGeocode.done', { property: this.settings.placeProperty, value: name }));
		} catch (e) {
			const reason = e instanceof Error ? e.message : String(e);
			new Notice(t('notice.reverseGeocode.failed', { reason }));
		}
	}

	/* ---- coordinates from a photo ---- */

	/** Resolve referenced photos for an explicit command, independent of display settings. */
	private resolvePhotos(file: TFile): TFile[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return [];
		// Not memoized like `resolveTracks`, and deliberately past `isTrackFile`:
		// this answers an explicit command, so it admits photos whether or not the
		// display setting draws them.
		return this.linkedAttachments(file, cache, (extension) => PHOTO_EXTS.has(extension));
	}

	/** EXIF is local file data, so this command is independent of device-location permission. */
	private registerFillFromPhoto(): void {
		this.addCommand({
			id: 'fill-coords-from-photo',
			name: t('command.fillFromPhoto'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (this.resolvePhotos(file).length === 0) return false;
				if (!checking) void this.fillCoordsFromPhoto(file);
				return true;
			},
		});
	}

	/** Use the first usable referenced photo in note order; report read failure only if none succeeds. */
	private async fillCoordsFromPhoto(file: TFile): Promise<void> {
		const photos = this.resolvePhotos(file);
		let readError: string | null = null;
		for (const photo of photos) {
			const rec = await this.tracks.load(photo, this.settings.photoDatum);
			const geometry = rec.features[0]?.geometry;
			if (geometry && geometry.type === 'Point') {
				const [lng, lat] = geometry.coordinates;
				const coords = formatLatLng(lat, lng);
				await this.writeCoords(file, coords);
				new Notice(t('notice.photo.done', { property: this.settings.coordsProperty, coords }));
				return;
			}
			if (rec.error && readError === null) readError = rec.error;
		}
		if (readError !== null) new Notice(t('notice.photo.failed', { reason: readError }));
		else new Notice(t('notice.photo.none', { file: file.basename }));
	}

	/* ---- track statistics ---- */

	/** Track files only. A photo contributes one point and no distance, climb or
	 *  time, so including one could only move the elevation range — making a
	 *  note's lowest point a photo rather than part of the route. */
	private resolveTrackFiles(file: TFile): TFile[] {
		return this.resolveTracks(file).filter((track) => TRACK_EXTS.has(track.extension));
	}

	private registerWriteStats(): void {
		this.addCommand({
			id: 'write-track-stats',
			name: t('command.writeStats'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (this.resolveTrackFiles(file).length === 0) return false;
				if (!checking) void this.writeTrackStats(file);
				return true;
			},
		});
	}

	/**
	 * Measure the note's own track files and write the figures into its
	 * properties. Run by hand and never on an event: a track file that changes
	 * does not rewrite the notes that link it.
	 *
	 * The note's files are measured together rather than one at a time, so a note
	 * holding two of them is measured exactly as one file holding both segments
	 * already is — `trackStats` never carries distance across the gap between two
	 * lines, and elapsed time is the span from the earliest stamp to the latest.
	 */
	private async writeTrackStats(file: TFile): Promise<void> {
		const features: TrackRecord['features'] = [];
		let readError: string | null = null;
		for (const track of this.resolveTrackFiles(file)) {
			const rec = await this.tracks.load(track, this.settings.photoDatum);
			if (rec.error && readError === null) readError = rec.error;
			// The raw WGS-84 features, never `projectedFeatures()`: measuring the
			// tile-space copy would make a note's distance depend on which basemap
			// happened to be configured when the command was run.
			features.push(...rec.features);
		}

		const stats = trackStats(features);
		// The same condition the inline statistics bar shows itself on. Nothing to
		// measure means nothing written *and* nothing removed: a file temporarily
		// truncated or replaced should not strip a note of figures it still has.
		if (!hasStats(stats)) {
			if (readError !== null) new Notice(t('notice.stats.failed', { reason: readError }));
			else new Notice(t('notice.stats.none', { file: file.basename }));
			return;
		}

		const properties = statsProperties(
			stats,
			this.settings.statsPrefix,
			this.settings.statsNames,
			this.settings.statsWrite
		);
		// Nothing to write is a setting rather than a track: reporting a write of
		// no properties would read as a failure to measure the file, which it is
		// not — the file measured fine and every figure it produced is switched off.
		if (properties.length === 0) {
			new Notice(t('notice.stats.noFigures'));
			return;
		}
		// Said before anything is written, for the reason `reverseGeocodeCurrent`
		// says it: the note's coordinate replaced by a distance is silent, and the
		// pin moving is the only symptom.
		const clash = properties.find(
			({ key }) => key === this.settings.coordsProperty || key === this.settings.placeProperty
		);
		if (clash) {
			new Notice(t('notice.stats.propertyClash', { property: clash.key }));
			return;
		}
		// And the clash a per-figure name makes possible: two figures under one
		// name would write twice into the same property, leaving whichever came
		// last and no sign of the other.
		const duplicate = duplicateStatsName(properties);
		if (duplicate) {
			new Notice(t('notice.stats.nameClash', { property: duplicate.key }));
			return;
		}

		let written = 0;
		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				for (const { key, value } of properties) {
					// A figure this file no longer records leaves no property behind.
					// A stale number still matches a filter, which is worse than an
					// absent one — and every key here is a name a figure the reader
					// has switched on resolves to, which is the whole of what this
					// command reaches: neither a figure switched off nor anything
					// else the reader keeps is in reach.
					if (value === null) {
						delete frontmatter[key];
						continue;
					}
					frontmatter[key] = value;
					written++;
				}
			});
		} catch (e) {
			new Notice(t('notice.write.failed', { reason: e instanceof Error ? e.message : String(e) }));
			return;
		}
		new Notice(t('notice.stats.done', { count: String(written), distance: formatDistance(stats.distance) }));
	}

	/* ---- saved places, into notes ---- */

	/**
	 * Offered on any file this plugin parses, because `file-menu` is synchronous
	 * and whether a file holds points is only knowable after reading it. A TCX has
	 * no point form at all and simply yields none, which is reported like any
	 * other file that holds only routes.
	 */
	private registerImportPlaces(): void {
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile) || !TRACK_EXTS.has(file.extension)) return;
				menu.addItem((item) =>
					item
						.setTitle(t('menu.importPlaces'))
						.setIcon('map-pin')
						.onClick(() => void this.importPlaces(file))
				);
			})
		);
	}

	/** Read the file through the same cache the map draws from, then let the
	 *  reader see the count and choose where it lands before anything is written. */
	private async importPlaces(file: TFile): Promise<void> {
		const rec = await this.tracks.load(file, this.settings.photoDatum);
		if (rec.error) {
			new Notice(t('notice.places.readFailed', { file: file.name, reason: rec.error }));
			return;
		}
		const places = placesFrom(rec.features, file.basename);
		if (places.length === 0) {
			new Notice(t('notice.places.none', { file: file.name }));
			return;
		}
		// Beside the file it came from, under the file's own name: a folder the
		// reader can find again, and one this import can be undone by deleting.
		const parent = file.parent?.path ?? '';
		const folder = parent === '' || parent === '/' ? file.basename : `${parent}/${file.basename}`;
		new ImportPlacesModal(this.app, file.name, places, folder, (chosen) =>
			this.writePlaceNotes(places, chosen, file.basename)
		).open();
	}

	/**
	 * One note per place, all inside the one folder the reader named.
	 *
	 * Sequential rather than a burst of parallel creates: a file of several
	 * hundred places would otherwise open that many writes at once, and each name
	 * has to be settled against the ones already claimed before the next is
	 * chosen. No note links the source file — this plugin resolves track
	 * attachments through a note's links, so a wikilink here would make one KML a
	 * drawn track owned by every note the import created.
	 */
	private async writePlaceNotes(places: Place[], folder: string, fallback: string): Promise<void> {
		const root = folder === '/' ? '' : folder;
		if (root !== '' && !this.app.vault.getFolderByPath(root)) {
			try {
				await this.app.vault.createFolder(root);
			} catch (e) {
				new Notice(
					t('notice.places.folderFailed', {
						folder: root,
						reason: e instanceof Error ? e.message : String(e),
					})
				);
				return;
			}
		}

		// Every name already in the destination, so an import never replaces a note
		// that was there first.
		const taken = new Set<string>();
		const dir = root === '' ? this.app.vault.getRoot() : this.app.vault.getFolderByPath(root);
		for (const child of dir?.children ?? []) {
			if (child instanceof TFile) taken.add(child.basename.toLowerCase());
		}

		const property = this.settings.coordsProperty;
		let written = 0;
		let failed = 0;
		for (const place of places) {
			const name = noteName(place.name, fallback, taken);
			const path = root === '' ? `${name}.md` : `${root}/${name}.md`;
			const front = stringifyYaml({ [property]: formatLatLng(place.lat, place.lng) });
			const body = place.description === '' ? '' : `${place.description}\n`;
			try {
				await this.app.vault.create(path, `---\n${front}---\n\n${body}`);
				written++;
			} catch (e) {
				console.error('Advanced Maps: could not create', path, e);
				failed++;
			}
		}

		const shown = { count: String(written), folder: root === '' ? '/' : root, failed: String(failed) };
		new Notice(failed === 0 ? t('notice.places.imported', shown) : t('notice.places.importedSome', shown));
	}

	/* ---- saved places, out of a map ---- */

	/** The one file an export writes, reported by path because it is a vault file
	 *  from here on — openable, syncable, and drawable like any other track. */
	async writePlacesFile(path: string, text: string, count: number): Promise<void> {
		try {
			// `create` fails outright on a folder that is not there, and a reader
			// typing `exports/places.gpx` means the folder as much as the file — the
			// same reading the import half already takes of its destination.
			const folder = path.slice(0, path.lastIndexOf('/'));
			if (folder !== '' && !this.app.vault.getFolderByPath(folder)) {
				await this.app.vault.createFolder(folder);
			}
			await this.app.vault.create(path, text);
		} catch (e) {
			new Notice(t('notice.places.exportFailed', { path, reason: e instanceof Error ? e.message : String(e) }));
			return;
		}
		new Notice(t('notice.places.exported', { count: String(count), path }));
	}

	/* ---- location ---- */

	/** Toggling the setting is a fresh statement of intent; forget any refusal. */
	resetLocator(): void {
		this.locator.reset();
	}

	private registerLocate(): void {
		this.addCommand({
			id: 'fill-coords',
			name: t('command.fillCoords'),
			checkCallback: (checking) => {
				if (!this.settings.locate) return false;
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) void this.stampCurrentLocation(file);
				return true;
			},
		});

		this.registerEvent(this.app.workspace.on('file-open', (file) => void this.fillCoordsIfEmpty(file)));

		// A template's frontmatter usually lands a beat after the file opens, so
		// the open on its own never sees the blank the template left behind.
		// Restricting this to the active note keeps a sync writing files in the
		// background from being stamped with wherever this device happens to be.
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				if (this.app.workspace.getActiveFile() === file) void this.fillCoordsIfEmpty(file);
			})
		);
	}

	/**
	 * The command. Explicit intent, so it differs from the automatic path twice:
	 * it overwrites a property that already holds something, and it forgives a
	 * platform that refused earlier — running it by hand is a statement that
	 * something has changed, such as a permission finally being granted.
	 */
	private async stampCurrentLocation(file: TFile): Promise<void> {
		this.locator.reset();
		// Duration 0: a cold fix outlasts the default notice by a wide margin.
		const working = new Notice(t('notice.locate.working'), 0);
		let fix;
		try {
			fix = await this.locator.locate();
		} finally {
			working.hide();
		}
		if (!fix) {
			new Notice(t(this.locator.lastFailure() ?? 'notice.locate.failed'));
			return;
		}
		const coords = formatFix(fix);
		await this.writeCoords(file, coords);
		new Notice(t('notice.locate.done', { property: this.settings.coordsProperty, coords }));
	}

	/**
	 * The automatic path: fill in a coordinate property that is there but empty.
	 *
	 * This runs on every metadata change to the active note, so everything before
	 * the await is a property lookup or a substring scan — deliberately so.
	 */
	private async fillCoordsIfEmpty(file: TAbstractFile | null): Promise<void> {
		if (!this.settings.locate || !this.settings.autoFillCoords) return;
		if (!(file instanceof TFile) || file.extension !== 'md') return;
		if (isExcluded(file.path, this.settings.autoFillExclude)) return;
		if (this.filling.has(file)) return;
		if (!this.locator.available()) return;

		const key = this.settings.coordsProperty;
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		// Absent is not blank. A note with no coordinate property never asked for
		// one, and adding it would be the plugin volunteering rather than filling
		// in what a template left for it.
		if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, key)) return;
		if (!isBlank(frontmatter[key])) return;

		this.filling.add(file);
		try {
			const fix = await this.locator.locate();
			if (!fix) return;
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				// Seconds have passed waiting for the fix. The blank may have been
				// filled in by hand since, or the property dropped altogether.
				if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) return;
				if (!isBlank(frontmatter[key])) return;
				frontmatter[key] = formatFix(fix);
			});
		} catch (e) {
			console.error('Advanced Maps: could not write coordinates', e);
		} finally {
			this.filling.delete(file);
		}
	}

	/* ---- settings ---- */

	async loadSettings(): Promise<void> {
		// loadData() is `any` — whatever the last version of this plugin wrote, on
		// disk since. The defaults underneath it are what make the result whole.
		const saved = (await this.loadData()) as Partial<AdvancedMapsSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

		// A key written before there was anywhere else to put it stays where it is.
		// The default for a fresh install is secret storage, which is the safer of
		// the two — but applying that default to a key already on disk would move
		// it into a store that does not sync, and break search on every other
		// device without saying so. Persisted rather than re-derived on each load,
		// so that clearing the box later cannot flip the store on the next start.
		if (saved?.amapKey && !saved.amapKeyStore) {
			this.settings.amapKeyStore = 'plugin';
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
