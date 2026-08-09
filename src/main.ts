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
 *   · an "open in map" pop-up on a note's ⋮ menu
 *   · filling a note's blank coordinate property from the device's location,
 *     on the desktop as well as on mobile
 *
 * It works by wrapping the "map" entry in Bases' view registry: the factory is
 * replaced with one that builds the native view and then attaches a TrackLayer
 * to the instance, and the options callback gets an extra group appended. The
 * native class itself is never subclassed or edited, so an Obsidian update to
 * Maps lands here untouched.
 */

import { Notice, parseYaml, Plugin, stringifyYaml, TFile } from 'obsidian';
import type { TAbstractFile } from 'obsidian';
import { TRACK_EXTS } from './constants';
import { TrackEmbed } from './embed';
import { t } from './i18n';
import { formatFix, isBlank, Locator } from './locate';
import { MapModal } from './modal';
import { AdvancedMapsSettingTab, DEFAULT_SETTINGS, isExcluded, type AdvancedMapsSettings } from './settings';
import { TrackCache } from './track-cache';
import { TrackLayer } from './track-layer';
import { appendTrackOptions } from './view-options';
import type { BasesMapView, BasesViewFactory, BasesViewRegistration } from './types/obsidian-internals';

interface BaseView {
	name?: string;
	type?: string;
	[key: string]: unknown;
}

interface BaseSpec {
	views?: BaseView[];
	[key: string]: unknown;
}

function firstAlias(frontmatter: Record<string, unknown>): string | null {
	const aliases = ([] as unknown[]).concat((frontmatter.aliases as unknown[]) ?? []);
	return aliases.length > 0 ? String(aliases[0]) : null;
}

export default class AdvancedMapsPlugin extends Plugin {
	/** Declared on Plugin as `unknown` since 1.13; narrowed here. */
	override settings!: AdvancedMapsSettings;
	tracks!: TrackCache;
	locator!: Locator;
	readonly layers = new Set<TrackLayer>();
	readonly embeds = new Set<TrackEmbed>();
	/** Notes whose blank coordinate property is already being filled in. */
	private readonly filling = new Set<string>();

	private nativeFactory: BasesViewFactory | null = null;
	private patched: { factory: BasesViewFactory; options?: BasesViewRegistration['options'] } | null = null;
	private ownedExtensions: string[] = [];

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.tracks = new TrackCache(this.app);
		this.locator = new Locator({
			geolocation: typeof navigator !== 'undefined' ? (navigator.geolocation ?? null) : null,
			onGiveUp: (message) => new Notice(message),
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
		this.registerLocate();
		this.addSettingTab(new AdvancedMapsSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on('modify', (file: TAbstractFile) => {
				if (!this.tracks.has(file.path)) return;
				this.tracks.invalidate(file.path);
				this.refreshTracks();
			})
		);

		// Maps re-registers its view whenever it reloads, which drops our wrapper
		// on the floor. The check is a property lookup, so run it whenever the
		// workspace settles.
		this.registerEvent(this.app.workspace.on('layout-change', () => this.patchMapsView()));
	}

	override onunload(): void {
		this.unpatchMapsView();
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

	/** Attach a TrackLayer to one native map view, whatever its age. */
	private enhance(view: BasesMapView | null | undefined): TrackLayer | null {
		if (!view || !view.markerManager) return null;
		// An embed's map is a native view too, but it has no query behind it:
		// enhancing it would hand its track over to a layer that thinks the
		// result set is empty, and promptly wipe it.
		if (view.__advancedMapsHeadless) return null;
		// Already ours: attach() leaves own properties behind on the instance.
		if (Object.prototype.hasOwnProperty.call(view.markerManager, 'updateMarkers')) return null;
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
			if (Array.isArray(candidate._children)) for (const child of candidate._children) visit(child);
			// A bases controller keeps its active view outside the child list.
			if (candidate.controller) visit(candidate.controller);
			if (candidate.view) visit(candidate.view);
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
		const out: TFile[] = [];
		for (const embed of cache.embeds) {
			const dest = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
			if (dest && TRACK_EXTS.has(dest.extension) && !out.includes(dest)) out.push(dest);
		}
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
				if (!checking) void this.openMapForFile(file as TFile);
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
						.onClick(() => void this.openMapForFile(file as TFile))
				);
			})
		);
	}

	private readCoords(file: TAbstractFile | null): { raw: unknown; frontmatter: Record<string, unknown> } | null {
		if (!(file instanceof TFile) || file.extension !== 'md') return null;
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) return null;
		const raw = frontmatter[this.settings.coordsProperty];
		if (raw === undefined || raw === null || String(raw).trim() === '') return null;
		return { raw, frontmatter };
	}

	private hasCoords(file: TAbstractFile | null): boolean {
		return this.readCoords(file) !== null;
	}

	/** The view to pop up: the one named in settings, or the base's first map view. */
	private pickView(base: BaseSpec): BaseView | undefined {
		const views = base.views ?? [];
		if (this.settings.viewName) return views.find((v) => v && v.name === this.settings.viewName);
		return views.find((v) => v && v.type === 'map');
	}

	private async openMapForFile(file: TFile): Promise<void> {
		const found = this.readCoords(file);
		if (!found) {
			new Notice(t('notice.noCoords', { file: file.basename, property: this.settings.coordsProperty }));
			return;
		}
		const coords = String(found.raw);

		const basePath = this.settings.basePath;
		if (!basePath) {
			new Notice(t('notice.baseNotConfigured'));
			return;
		}

		const baseFile = this.app.vault.getFileByPath(basePath);
		if (!baseFile) {
			new Notice(t('notice.baseNotFound', { path: basePath }));
			return;
		}

		let base: BaseSpec;
		try {
			base = (parseYaml(await this.app.vault.cachedRead(baseFile)) as BaseSpec) ?? {};
		} catch (e) {
			new Notice(
				t('notice.baseParseFailed', { path: basePath, error: e instanceof Error ? e.message : String(e) })
			);
			return;
		}

		const view = this.pickView(base);
		if (!view) {
			new Notice(
				this.settings.viewName
					? t('notice.viewNotFound', { path: basePath, view: this.settings.viewName })
					: t('notice.noMapView', { path: basePath })
			);
			return;
		}

		const mapHeight = Math.max(200, Math.min(800, Math.round(window.innerHeight * 0.7)));
		// An explicit centre needs an explicit zoom, otherwise auto-fit frames the
		// whole data set instead of the note you opened.
		const spec = stringifyYaml({
			...base,
			views: [{ ...view, center: coords, defaultZoom: this.settings.openZoom, mapHeight }],
		});

		const label = firstAlias(found.frontmatter) || found.frontmatter.place || file.basename;
		new MapModal(this.app, file, spec, `${String(label)} · ${coords}`).open();
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
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter[this.settings.coordsProperty] = coords;
		});
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
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
