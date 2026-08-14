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

import {
	FileView,
	getLanguage,
	Notice,
	parseFrontMatterAliases,
	parseYaml,
	Plugin,
	requestUrl,
	stringifyYaml,
	TFile,
} from 'obsidian';
import type { CachedMetadata, Editor, TAbstractFile, WorkspaceLeaf } from 'obsidian';
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
	/** The pane the followed notes are opening in; see `followTarget`. */
	private followPane: WorkspaceLeaf | null = null;
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
		this.registerReverseGeocode();
		this.registerFillFromPhoto();
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
		// showPhotos is read inside resolveTracks() itself, but resolveTracks()'s
		// answer is memoised per note against its CachedMetadata object — which a
		// settings change does not touch. Left in place, flipping "Show photos"
		// would keep drawing (or omitting) every photo exactly as before until the
		// vault next changed under each note, which is the same trap the memo
		// avoids for a track file's own edits, just from the settings side instead.
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
	 * The track and photo files a note points at — or the file itself, so a
	 * base that queries `file.ext == "gpx"` (or `"jpg"`) works too.
	 *
	 * Reading the metadata cache rather than the query result means the base's
	 * own filters keep working untouched: no need to widen a filter just to let
	 * attachments into the result set.
	 *
	 * **All three ways of pointing at a file count**, not only `![[x.gpx]]`:
	 * a plain `[[x.gpx]]` in the body, and a `[[x.gpx]]` inside a property, do
	 * too. That is what lets the two halves of this plugin be asked for
	 * separately, which they could not be while an embed was the only way in:
	 * `!` is Obsidian's own mark for "render it here", so `![[x.gpx]]` means an
	 * inline map in the note *and* the line on every base map, while `[[x.gpx]]`
	 * means the line on the base map and nothing rendered in the note. The
	 * reported symptom of having no way to say the second one was two maps in
	 * one note, one of them unwanted (issue #6).
	 *
	 * A photo — `PHOTO_EXTS`, gated on `settings.showPhotos` — is resolved the
	 * same way and through the exact same three lists, on the same reasoning:
	 * an EXIF coordinate belongs to the note that carries the photo, the same
	 * way a track's geometry does, and the reader who links a photo without
	 * embedding it presumably wants it on the map and not duplicated inline.
	 */
	resolveTracks(file: TFile): TFile[] {
		if (this.isTrackFile(file.extension)) return [file];
		if (file.extension !== 'md') return [];
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return [];

		// Keyed on the cache object rather than the path, so it invalidates itself:
		// re-indexing a note hands back a *new* CachedMetadata, which is a miss.
		// Worth the memo because this is per row of the base and Bases replaces its
		// result set on any vault change — several hundred link resolutions per
		// redraw, to recompute an answer that only moves when a note does. It says
		// nothing about `showPhotos`, which is why toggling that setting goes
		// through `refreshTracks()` dropping the whole memo rather than through
		// this function noticing the setting changed.
		const memo = this.trackLinks.get(cache);
		if (memo) return memo;

		const out: TFile[] = [];
		// Embeds first, so a note that both embeds and links the same file keeps
		// the order it reads in; `getFirstLinkpathDest` answers the same TFile for
		// both, which is what makes the identity check enough to de-duplicate.
		for (const ref of [...(cache.embeds ?? []), ...(cache.links ?? []), ...(cache.frontmatterLinks ?? [])]) {
			const dest = this.app.metadataCache.getFirstLinkpathDest(ref.link, file.path);
			if (dest && this.isTrackFile(dest.extension) && !out.includes(dest)) out.push(dest);
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
			// `sourcePath` is the note the embed sits in, which is what lets an
			// inline map draw that note's photos beside its track. Obsidian passes
			// it — measured, by wrapping the registered creator on a running app:
			// the context is `{app, linktext, sourcePath, containerEl, displayMode,
			// showInline, depth}`. Read defensively anyway, since it is one of the
			// keys `EmbedContext` declares as unknown rather than promised.
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
	 * The maps that follow, keeping up with the note being edited.
	 *
	 * **The camera moves, never the query.** The filter belongs to Bases and to
	 * whoever wrote the base; rewriting it to name one note — which is how the
	 * other map plugin does this — takes the wheel off them. The zoom is left
	 * alone too: no `zoom` on the target, so MapLibre keeps whatever the reader
	 * chose. "Open in map" passes `openZoom` because that is a jump to a subject
	 * rather than a look around one.
	 *
	 * **Which** maps follow is each map's own button and nothing else. This asked
	 * `leaf.getRoot() !== workspace.rootSplit` for two versions — sidebar only, on
	 * the grounds that a map in the main area is something being read or arranged
	 * rather than something watching. That reasoning holds for a map sharing a tab
	 * group with the note, which is hidden the moment the note opens, and gets the
	 * case people actually asked about exactly backwards: a note in one tab group
	 * and a map in the next one over is the follow layout, and it lives entirely
	 * in the main area. No rule about where a map sits distinguishes the two —
	 * only the reader does, which is what the button is.
	 */
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

	/**
	 * One map has just been asked to start following. Called by the button rather
	 * than calling it, so that turning following on lands the camera at once
	 * instead of at the next `file-open`.
	 *
	 * **This is the second writer of `followPane`, and it has to be.** The button
	 * is the ordinary way into following — `followActiveNote` defaults to false —
	 * so a map followed this way and never any other reaches `followTarget` with
	 * `followPane` still null, which hands a pin click back to the native
	 * "open in the active leaf": the map's own, because clicking a map is what
	 * makes it active. That is the "a click on a pin ate the map" failure, and it
	 * survived the fix on exactly this path.
	 *
	 * It cannot record the same thing `followActiveNote` does. There, a
	 * `file-open` has just made the note's pane the most recent one; here the
	 * reader's last click was on the map, so `getMostRecentLeaf()` may well answer
	 * the map itself — which `followTarget` then rejects, leaving following on and
	 * the click unprotected. So the pane is looked up from the note instead.
	 */
	followNow(layer: TrackLayer): void {
		const target = this.noteTarget(this.app.workspace.getActiveFile());
		if (!target) return;
		// Kept rather than cleared when the note is in no pane this may open into:
		// a pane remembered from an earlier follow is a better answer than none.
		this.followPane = this.noteLeaf(target.file, layer) ?? this.followPane;
		layer.focus(target);
	}

	/**
	 * A pane showing this note that is not the one `layer` is drawn in.
	 *
	 * The exclusion is the point: the note is usually open in the active leaf, and
	 * on an *embedded* base that leaf is the very note the map is inside — opening
	 * into it would be the same self-replacement `followTarget` exists to prevent,
	 * arrived at from the other direction.
	 */
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

	/**
	 * Where a click on a **following** map should open a note: the pane that map
	 * is following, which is the pane the last followed note opened in.
	 *
	 * The native view opens a marker's note with `openLinkText(path, '', false)`,
	 * which lands in the active leaf — and clicking a map is what makes that leaf
	 * the map's own. So a following map answers a click by replacing itself with
	 * the note it was pointing at, which is the one thing a viewfinder must not
	 * do. Measured: with the map's leaf active, both `getMostRecentLeaf()` and
	 * `getLeaf(false)` answer the map's leaf, so there is no built-in "the other
	 * pane" to ask for — it has to be remembered from when it was the active one.
	 *
	 * Null gives the caller the native behaviour back, which is the right answer
	 * for a map nobody has followed anything with yet.
	 */
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

	/** The one place a coordinate reaches disk from a deliberate command. */
	private async writeCoords(file: TFile, coords: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter[this.settings.coordsProperty] = coords;
		});
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

	/**
	 * The place property, written the same deliberate way `writeCoords` writes
	 * the coordinate one — kept as its own small method rather than folded into a
	 * generalized `write(file, property, value)`, because `writeCoords`'s own
	 * comment calls itself "the one place a coordinate reaches disk from a
	 * deliberate command", and a place name is not a coordinate.
	 */
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
			const reason = e instanceof GeocodeError ? e.message : e instanceof Error ? e.message : String(e);
			new Notice(t('notice.reverseGeocode.failed', { reason }));
		}
	}

	/* ---- coordinates from a photo ---- */

	/**
	 * The photo files a note points at, through the same three-list scan
	 * `resolveTracks` uses — but never gated on `settings.showPhotos`, and never
	 * memoised. Filling a note's coordinate from a photo is a distinct ask from
	 * drawing that photo on the map: a reader with photo thumbnails turned off
	 * should still be able to pull a coordinate out of one, and this only runs
	 * once per command invocation rather than once per redraw, so there is
	 * nothing here worth caching the way the display path is.
	 */
	private resolvePhotos(file: TFile): TFile[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return [];
		const out: TFile[] = [];
		for (const ref of [...(cache.embeds ?? []), ...(cache.links ?? []), ...(cache.frontmatterLinks ?? [])]) {
			const dest = this.app.metadataCache.getFirstLinkpathDest(ref.link, file.path);
			if (dest && PHOTO_EXTS.has(dest.extension) && !out.includes(dest)) out.push(dest);
		}
		return out;
	}

	/**
	 * Deliberately not behind **Enable location**, for the same reason the
	 * link-paste command is not: it raises no permission prompt and records
	 * nothing about where this device is. The coordinate it fills in came from
	 * the photo's own EXIF tags, not from asking the device anything.
	 */
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

	/**
	 * The first of the note's own photos that carries a usable GPS tag wins —
	 * read in the same order `resolvePhotos` answers them, which is the order
	 * they appear in the note. Goes through `TrackCache.load()` rather than
	 * `exif.ts` directly, so this reads a photo's coordinate through the exact
	 * same head-read, EXIF parse and datum conversion the map's own album uses,
	 * with nothing duplicated: `photoWgs84` inside `loadPhoto` is what already
	 * turns the tags into the WGS-84 point sitting on `rec.features[0]`.
	 *
	 * `TrackCache.load()` never throws — a read failure lands on `rec.error`
	 * and an empty `features`, the same "not a failure, just nothing found"
	 * shape a photo with no GPS tags gets. The two are told apart here only to
	 * choose which notice to show once every photo has been tried: a read that
	 * actually failed is worth saying so about, but only if no other photo in
	 * the note answered.
	 */
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
