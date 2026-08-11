/*
 * Advanced Maps — extends Obsidian's built-in Maps view instead of replacing it.
 *
 * The built-in plugin already does markers, icons, colours, tiles and popups
 * well, so this plugin only adds what it is missing:
 *
 *   · GPX / GeoJSON tracks, resolved from each note's embeds and drawn in that
 *     note's colour
 *   · a zoom-to-fit control, and auto-framing that includes the tracks
 *   · GCJ-02 / BD-09 alignment for Chinese tile providers
 *   · inline maps for ![[track.gpx]] embeds
 *   · "open in map" on a note's ⋮ menu, and a sidebar map that follows the note
 *     being edited — both of them one camera move over the reader's own base
 *   · filling a note's blank coordinate property from the device's location,
 *     on the desktop as well as on mobile
 *
 * It works by wrapping the "map" entry in Bases' view registry: the factory is
 * replaced with one that builds the native view and then attaches a TrackLayer
 * to the instance, and the options callback gets an extra group appended. The
 * native class itself is never subclassed or edited, so an Obsidian update to
 * Maps lands here untouched.
 */

import { FileView, Notice, parseFrontMatterAliases, parseYaml, Plugin, stringifyYaml, TFile } from 'obsidian';
import type { CachedMetadata, Editor, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { FOCUS_RETRY_MS, FOCUS_TRIES, TRACK_EXTS } from './constants';
import { formatLatLng, parseLatLng } from './coords';
import { TrackEmbed } from './embed';
import { t } from './i18n';
import { needsKey } from './geocode';
import { LinkModal } from './link-modal';
import { formatFix, isBlank, Locator } from './locate';
import {
	embedLink,
	findView,
	pickMapView,
	pointerFilter,
	withAroundView,
	type BaseSpec,
	type BaseView,
} from './map-block';
import { MapModal } from './modal';
import { PlaceSearchModal } from './search-modal';
import { AdvancedMapsSettingTab, DEFAULT_SETTINGS, isExcluded, type AdvancedMapsSettings } from './settings';
import { TrackCache } from './track-cache';
import { TrackLayer, type FocusTarget } from './track-layer';
import { appendTrackOptions } from './view-options';
import type { BasesMapView, BasesViewFactory, BasesViewRegistration, ComponentNode } from './types/obsidian-internals';

export default class AdvancedMapsPlugin extends Plugin {
	/** Declared on Plugin as `unknown` since 1.13; narrowed here. */
	override settings!: AdvancedMapsSettings;
	tracks!: TrackCache;
	locator!: Locator;
	readonly layers = new Set<TrackLayer>();
	readonly embeds = new Set<TrackEmbed>();
	/** Notes whose blank coordinate property is already being filled in. */
	private readonly filling = new Set<string>();
	/** Which track files a note embeds, memoised against the metadata that answered. */
	private trackLinks = new WeakMap<CachedMetadata, TFile[]>();

	private nativeFactory: BasesViewFactory | null = null;
	private patched: { factory: BasesViewFactory; options?: BasesViewRegistration['options'] } | null = null;
	private ownedExtensions: string[] = [];

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.tracks = new TrackCache(this.app);
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

		// A parsed track is held by path, so a file that goes away — or moves —
		// would otherwise sit in the cache for the rest of the session holding its
		// geometry and every projection of it. These also drop the embed memo,
		// because which file a `![[track.gpx]]` resolves to can change without the
		// *note* being touched at all: creating the attachment a note already
		// links to is exactly that case.
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

		// Maps re-registers its view whenever it reloads, which drops our wrapper
		// on the floor. The check is a property lookup, so run it whenever the
		// workspace settles.
		this.registerEvent(this.app.workspace.on('layout-change', () => this.patchMapsView()));
	}

	override onunload(): void {
		this.unpatchMapsView();
		// Each live embed holds its own MapLibre map, and so its own WebGL context,
		// of which a browser will keep only about sixteen alive at once. Without
		// this they survive until their note is closed — so the documented
		// hot-reload loop, or any update, leaks one per embed still on screen.
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
		if (entry.factory.__advancedMaps) return true;

		const nativeFactory = entry.factory;
		const nativeOptions = entry.options;
		this.nativeFactory = nativeFactory;

		const factory: BasesViewFactory = (controller, containerEl) => {
			const view = nativeFactory(controller, containerEl);
			this.enhance(view);
			return view;
		};
		factory.__advancedMaps = true;
		entry.factory = factory;

		if (typeof nativeOptions === 'function') {
			const options = () => appendTrackOptions(nativeOptions());
			options.__advancedMaps = true;
			entry.options = options;
		}

		this.patched = { factory: nativeFactory, options: nativeOptions };
		this.adoptOpenViews();
		return true;
	}

	/** A track file has gone or moved: drop its parse, and every memo that named it. */
	private forgetTrack(path: string): void {
		this.tracks.invalidate(path);
		this.trackLinks = new WeakMap();
	}

	/** Attach a TrackLayer to one native map view, whatever its age. */
	private enhance(view: BasesMapView | null | undefined): TrackLayer | null {
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
			const layer = new TrackLayer(this, view).attach();
			this.layers.add(layer);
			// A view adopted after the fact has already built its map, so the
			// initializeMap wrapper will never fire for it — and its markers were
			// placed before we could move them, so redo those too.
			if (view.map) {
				layer.onMapCreated(view.map);
				layer.reproject().catch((e) => console.error('Advanced Maps: could not draw tracks', e));
			}
			return layer;
		} catch (e) {
			console.error('Advanced Maps: could not enhance the map view', e);
			return null;
		}
	}

	/**
	 * Enabling the plugin — or Maps reloading — leaves already-open map views
	 * behind, since they never pass through the patched factory. Walk the
	 * component tree and pick them up, so nobody has to reopen a tab.
	 */
	private adoptOpenViews(): void {
		const seen = new Set<object>();
		const visit = (node: unknown): void => {
			if (!node || typeof node !== 'object' || seen.has(node)) return;
			seen.add(node);
			const candidate = node as BasesMapView;
			if (candidate.type === 'map' && candidate.markerManager && candidate.mapEl) {
				this.enhance(candidate);
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
		const entry = this.mapRegistration();
		if (entry && this.patched && entry.factory && entry.factory.__advancedMaps) {
			entry.factory = this.patched.factory;
			if (this.patched.options) entry.options = this.patched.options;
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
			get: () => undefined,
			getAsPropertyId: () => null,
			getEvaluatedFormula: () => undefined,
			getDisplayName: (prop) => String(prop),
			set: () => {},
		};
		view.data = { data: [], properties: [] };
		return view;
	}

	refreshTracks(): void {
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

	/**
	 * The track files a note points at — or the file itself, so a base that
	 * queries `file.ext == "gpx"` works too.
	 *
	 * Reading embeds from the metadata cache rather than the query result means
	 * the base's own filters keep working untouched: no need to widen a filter
	 * just to let attachments into the result set.
	 */
	resolveTracks(file: TFile): TFile[] {
		if (TRACK_EXTS.has(file.extension)) return [file];
		if (file.extension !== 'md') return [];
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !cache.embeds) return [];

		// Keyed on the cache object rather than the path, so it invalidates itself:
		// re-indexing a note hands back a *new* CachedMetadata, which is a miss.
		// Worth the memo because this is per row of the base and Bases replaces its
		// result set on any vault change — several hundred link resolutions per
		// redraw, to recompute an answer that only moves when a note does.
		const memo = this.trackLinks.get(cache);
		if (memo) return memo;

		const out: TFile[] = [];
		for (const embed of cache.embeds) {
			const dest = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
			if (dest && TRACK_EXTS.has(dest.extension) && !out.includes(dest)) out.push(dest);
		}
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
			const embed = new TrackEmbed(context.containerEl, this, file);
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

	/**
	 * Open the base's map on this note.
	 *
	 * Neither half of this writes anything. The base is *referenced* — opened as
	 * itself in a leaf, or embedded in the pop-up — rather than copied with a
	 * `center` spliced into it, which is what the first version of this did and
	 * what froze every pop-up at the base as it stood when the map was written.
	 * Where the note is, is a camera position, and a camera position belongs to
	 * the camera.
	 */
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

	/**
	 * The base file itself, in a leaf — its toolbar, its other views, and the one
	 * thing neither the pop-up nor an embed has: a config that writes back to disk
	 * when the reader changes something on the map.
	 *
	 * A leaf already showing that base is reused rather than added to. Pressing
	 * this on one note after another is then a single map that keeps moving, which
	 * is exactly what "follow the active note" does without being asked.
	 */
	private async openMapLeaf(loaded: { view: BaseView; file: TFile }, target: FocusTarget): Promise<void> {
		const leaf = this.baseLeaf(loaded.file) ?? this.app.workspace.getLeaf('tab');
		// The view name goes through the leaf's state, which is how Bases itself
		// records which view a tab is on — read off a running Obsidian rather than
		// guessed: `{ type: 'bases', state: { file, viewName } }`.
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

	/**
	 * Point whatever map is inside `container` at a place, however soon it turns
	 * up.
	 *
	 * A base opened in a leaf already has its TrackLayer by the time `openFile`
	 * resolves — measured — and `focus()` covers its map arriving a beat after
	 * that. An embedded base is the one that has to be waited for: it is built
	 * when the embed loads and there is no promise to await for it. So this asks
	 * again, for as long as the container is on screen and no longer.
	 */
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

	/**
	 * A map in a sidebar keeping up with the note being edited.
	 *
	 * **The camera moves, never the query.** The filter belongs to Bases and to
	 * whoever wrote the base; rewriting it to name one note — which is how the
	 * other map plugin does this — takes the wheel off them.
	 *
	 * Only sidebar maps follow, and the zoom is left alone. A map in the main area
	 * is something being read or arranged, and moving it because a note was
	 * clicked in the file explorer is the same overreach one step smaller.
	 */
	private followActiveNote(file: TAbstractFile | null): void {
		if (!this.settings.followActiveNote) return;
		if (!(file instanceof TFile)) return;
		const found = this.readCoords(file);
		const pair = found ? parseLatLng(found.raw) : null;
		if (!pair) return;
		const target: FocusTarget = { lat: pair[0], lng: pair[1], animate: true, file };
		for (const layer of this.sidebarLayers()) layer.focus(target);
	}

	/** The layers drawing outside the main area, which are the only ones that follow. */
	private sidebarLayers(): TrackLayer[] {
		const { workspace } = this.app;
		const out: TrackLayer[] = [];
		workspace.iterateAllLeaves((leaf) => {
			if (leaf.getRoot() === workspace.rootSplit) return;
			out.push(...this.layersIn(leaf.view.containerEl));
		});
		return out;
	}

	/* ---- a map of the notes around this one ---- */

	/** Blank falls back to the localized name, the way `menuLabel` does. */
	aroundViewName(): string {
		return this.settings.aroundViewName || t('view.around');
	}

	/**
	 * Writes one line — an embed of a view in the configured base, filtered to
	 * the notes this note links to, the notes that link to it, and itself. The
	 * view is added to the base file the first time and referenced afterwards, so
	 * a later change to the base reaches every note that embeds it.
	 *
	 * After that the plugin is out of the loop entirely: adding a place is
	 * dragging a note into the body, which is Obsidian's own behaviour, and the
	 * map follows because Bases re-runs the filter.
	 *
	 * Deliberately not on the file menu. It writes at the cursor, and `file-menu`
	 * fires from the explorer and from tab headers, neither of which has one.
	 * `editor-menu` is the entry point that does — a right-click inside the
	 * editor is exactly a cursor at a particular spot — so the command sits on
	 * the command palette and there.
	 */
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
		if (findView(loaded.base, name)) return true;
		const filter = pointerFilter(this.settings.coordsProperty);
		try {
			// Awaited, so the catch below can actually see a failed write. Left
			// floating, the rejection escaped as an unhandled promise and the
			// notice this try/catch exists to show never appeared.
			await this.app.vault.process(loaded.file, (data) => {
				const fresh = (parseYaml(data) as BaseSpec) ?? {};
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
		new Notice(t('notice.around.added', { view: name, path: loaded.file.path }));
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

	/** The one place a coordinate reaches disk from a deliberate command. */
	private async writeCoords(file: TFile, coords: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter[this.settings.coordsProperty] = coords;
		});
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
		if (this.filling.has(file.path)) return;
		if (!this.locator.available()) return;

		const key = this.settings.coordsProperty;
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		// Absent is not blank. A note with no coordinate property never asked for
		// one, and adding it would be the plugin volunteering rather than filling
		// in what a template left for it.
		if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, key)) return;
		if (!isBlank(frontmatter[key])) return;

		this.filling.add(file.path);
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
			this.filling.delete(file.path);
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
