/* Inline ![[track.gpx]] map built from a headless native Maps view. */

import { Component, Keymap, TFile } from 'obsidian';
import type { FeatureCollection, Geometry } from 'geojson';
import { boundOfflineSource, restyleForBasemap } from './basemap';
import {
	CURSOR_LAYER,
	CURSOR_SRC,
	HIT_LAYER,
	HIT_SRC,
	PHOTO_DOT_LAYER,
	PHOTO_EXTS,
	PHOTO_LAYER,
	POINT_LAYER,
	READ_CONCURRENCY,
	USER_GESTURE_EVENTS,
} from './constants';
import { resolveSystem, toTileSpace, toWgs84, type CoordSystem } from './coords';
import { boundsOf, styleReady, trackFeatures, trackKnob, type TrackFeatureProps } from './geometry';
import { t } from './i18n';
import {
	applyTrackPaint,
	cancelPhotoImages,
	applyPhotoIcons,
	drawTracks,
	ensurePhotoImages,
	fitTo,
	guardLocateControl,
	photoIconSource,
	removeTrackLayers,
	type LocateGuard,
	type PhotoIconSource,
} from './layers';
import {
	formatDistance,
	formatDuration,
	formatElevation,
	formatSpeed,
	hasStats,
	nearestByDistance,
	nearestByPosition,
	type ProfileSample,
	type TrackStats,
} from './stats';
import { PhotoModal } from './photo-modal';
import { pooled, projectedFeatures, recordProfile, recordStats, type TrackRecord } from './track-cache';
import type AdvancedMapsPlugin from './main';
import type { BasesMapView, MapLibreMap, MapMouseEvent } from './types/obsidian-internals';

/** One of the host note's photos, and what its EXIF head parsed to. */
type PhotoEntry = { file: TFile; rec: TrackRecord };

export class TrackEmbed extends Component {
	private rootEl: HTMLElement | null = null;
	// Distance/ascent/duration bar and elevation profile, kept outside `rootEl`
	// — see renderStats() for why — so they need their own handle to tear down.
	private panelEl: HTMLElement | null = null;
	private observer: IntersectionObserver | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private view: BasesMapView | null = null;
	private map: MapLibreMap | null = null;
	private rec: TrackRecord | null = null;
	private locate: LocateGuard | null = null;
	/** The dataset signature the camera was last framed for; null until it has
	 *  been framed at all. */
	private framedFor: string | null = null;
	/** Set once the reader takes the wheel on this map; never cleared, so no
	 *  later redraw can take the camera back off them. */
	private userMoved = false;
	private dead = false;
	/** Only the newest asynchronous build/refresh may commit its data. */
	private operationRevision = 0;
	/** A settings/file refresh requested while initializeMap still owns the map. */
	private refreshPending = false;
	/**
	 * How many builds/refreshes are reading their files without having committed
	 * them yet; read by the style.load handler, which must not draw across a read.
	 *
	 * A count rather than a flag because two of them genuinely overlap — a
	 * settings change and a file change can each call `refresh()` — and the first
	 * to settle would otherwise declare the embed idle while the second is still
	 * reading. A style reload landing in that window drew the *previous* record
	 * and claimed a revision, which then made the live read stand down without
	 * ever assigning its own: the embed sat on pre-edit data until something
	 * unrelated refreshed it.
	 */
	private reading = 0;
	/** A style reload happened during a read and is owed a draw if that read
	 *  turns out to have nothing to draw. */
	private styleDrawPending = false;
	/** Guards map.on(), which survives style.load and refresh() — see
	 *  bindInteractions() for why binding twice would be wrong. */
	private interactionsBound = false;
	/** The last DOM event `openPhoto()` acted on — one click over two photo
	 *  layers dispatches twice; see bindInteractions(). */
	private handledClick: MouseEvent | null = null;
	/** The pointer sample already served, so the two photo layers answer it once. */
	private handledHover: MouseEvent | null = null;
	/** What the tooltip currently holds, so an unchanged feature only repositions it. */
	private shownTooltip: string | null = null;
	/** Shared inline waypoint-name/photo-preview tooltip. */
	private tooltipEl: HTMLElement | null = null;
	/** The elevation profile's own hover state, set by renderProfile() and read
	 *  by hoverTrack() — null whenever there is no profile panel to link to
	 *  (the setting is off, or the file has nothing worth charting). */
	private profile: { samples: ProfileSample[]; highlightAt: (i: number) => void; clear: () => void } | null = null;

	constructor(
		private readonly containerEl: HTMLElement,
		private readonly plugin: AdvancedMapsPlugin,
		private readonly file: TFile,
		/** Host note path used to resolve companion photos; empty means none. */
		private readonly sourcePath = ''
	) {
		super();
	}

	/** Host-note photos stay separate so track statistics/profile remain track-only. */
	private photos: PhotoEntry[] = [];
	/** Which photo files the host note resolved to on the last read, in note
	 *  order and before the no-coordinate filter; see `hostPhotosMoved()`. */
	private photoSources: string[] = [];
	/** The thumbnail candidates the last draw built — camera-independent, so
	 *  `moveend` re-selects from these rather than rebuilding them. */
	private photoIcons: PhotoIconSource[] = [];

	/**
	 * Load independent track/photo inputs concurrently for both build and refresh.
	 *
	 * `alive` is the caller's own "is this read still wanted?" answer — a claimed
	 * revision for `refresh()`, liveness alone for `build()`, which has none yet.
	 * It bounds nothing here (this pair is two reads); it is threaded through to
	 * the companion fan-out below, which is as wide as the host note's album.
	 */
	private async loadAll(alive: () => boolean): Promise<{ rec: TrackRecord; photos: PhotoEntry[] }> {
		this.reading++;
		try {
			const [rec, photos] = await Promise.all([
				this.plugin.tracks.load(this.file, this.plugin.settings.photoDatum),
				this.loadPhotos(alive),
			]);
			return { rec, photos };
		} finally {
			this.reading--;
		}
	}

	private async loadPhotos(alive: () => boolean): Promise<PhotoEntry[]> {
		if (!this.plugin.settings.showPhotos || !this.sourcePath) {
			this.photoSources = [];
			return [];
		}
		const host = this.plugin.app.vault.getFileByPath(this.sourcePath);
		if (!host) {
			this.photoSources = [];
			return [];
		}
		const datum = this.plugin.settings.photoDatum;
		const files = this.plugin.resolveTracks(host).filter((f) => PHOTO_EXTS.has(f.extension));
		// Recorded before the GPS filter below: a picture taken indoors resolves
		// every time and draws never, so comparing against the drawn set would
		// read as a change on every edit of the host note.
		this.photoSources = files.map((f) => f.path);
		// Bounded like the map layer's, and in note order, because that order is
		// what the album and the modal's next/previous follow.
		const loaded = await pooled(
			files,
			READ_CONCURRENCY,
			async (file) => ({ file, rec: await this.plugin.tracks.load(file, datum) }),
			alive
		);
		// A photo whose EXIF carried no coordinate parses to a record with no
		// features and no error — not a failure, just a picture taken indoors.
		// An `undefined` slot is a read this refresh was superseded before starting.
		return loaded.filter((p): p is PhotoEntry => !!p && !p.rec.error && p.rec.features.length > 0);
	}

	/** The note this embed was written in; empty when it has no host note. */
	get hostPath(): string {
		return this.sourcePath;
	}

	/**
	 * Does the host note now point at a different set of photos than the one
	 * this embed last read?
	 *
	 * Asked before refreshing on a metadata change, because that fires on every
	 * edit of the note while a refresh re-reads every file behind the map. The
	 * comparison is order-sensitive on purpose: note order is what the album and
	 * the modal's next/previous follow.
	 */
	hostPhotosMoved(): boolean {
		if (!this.plugin.settings.showPhotos || !this.sourcePath) return false;
		const host = this.plugin.app.vault.getFileByPath(this.sourcePath);
		if (!host) return false;
		const now = this.plugin.resolveTracks(host).filter((f) => PHOTO_EXTS.has(f.extension));
		if (now.length !== this.photoSources.length) return true;
		return now.some((file, i) => file.path !== this.photoSources[i]);
	}

	/** The embed API calls this when the file is swapped underneath us. */
	loadFile(): void {}

	/** Embeds have no base option; automatic datum follows their native tile set. */
	private system(): CoordSystem {
		return resolveSystem(this.plugin.settings.coordSystem, this.view?.mapConfig);
	}

	/** Height belongs to the embed container rather than to MapLibre, so it is
	 *  set on the element both on first paint and on every settings refresh. */
	private applyHeight(): void {
		this.rootEl?.style.setProperty('--advanced-maps-embed-height', `${this.plugin.settings.embedHeight}px`);
	}

	override onload(): void {
		this.rootEl = this.containerEl.createDiv('advanced-maps-embed');
		this.applyHeight();

		// Each MapLibre map holds a WebGL context and browsers cap how many can
		// be alive at once, so a note full of tracks only builds what is on screen.
		this.observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			this.observer?.disconnect();
			this.observer = null;
			void this.build();
		});
		this.observer.observe(this.rootEl);
	}

	private fail(message: string): void {
		if (!this.rootEl) return;
		this.rootEl.empty();
		this.rootEl.addClass('advanced-maps-error');
		this.rootEl.setText(t('embed.failed', { file: this.file.name, message }));
	}

	/** Report refresh errors without removing the live map or its last good track. */
	private failInPlace(message: string): void {
		// Clear map-side profile state before replacing its sibling panel.
		this.profile?.clear();
		this.profile = null;
		this.panelEl?.remove();
		this.panelEl = null;
		if (!this.rootEl) return;
		this.panelEl = this.containerEl.createDiv({ cls: ['advanced-maps-panel', 'advanced-maps-error'] });
		this.panelEl.setText(t('embed.failed', { file: this.file.name, message }));
	}

	private async build(): Promise<void> {
		let loaded: { rec: TrackRecord; photos: PhotoEntry[] };
		// A settings change while the lazy embed is still reading has no map for
		// refresh() to redraw yet. Re-read before spending a WebGL context, rather
		// than building once with stale settings and hoping a later event fixes it.
		do {
			this.refreshPending = false;
			// No revision claimed yet at build time, so liveness is the whole answer.
			loaded = await this.loadAll(() => !this.dead && !!this.rootEl);
			if (this.dead || !this.rootEl) return;
		} while (this.refreshPending);
		this.rec = loaded.rec;
		this.photos = loaded.photos;
		if (loaded.rec.error) return this.fail(loaded.rec.error);

		const view = this.plugin.createHeadlessView(this.rootEl);
		if (!view) return this.fail(t('embed.mapsDisabled'));
		this.view = view;

		try {
			await view.initializeMap();
		} catch (e) {
			if (this.dead || this.view !== view) {
				this.destroyUnownedView(view);
				return;
			}
			return this.fail(e instanceof Error ? e.message : String(e));
		}
		// initializeMap() can finish after unload has already destroyed the
		// headless view. Use the local view rather than this.view here: the late
		// MapLibre instance belongs to it even though the embed no longer does.
		if (this.dead || this.view !== view) {
			this.destroyUnownedView(view);
			return;
		}
		if (!view.map) return;

		this.map = view.map;
		const revision = ++this.operationRevision;
		// An inline map that eats the scroll wheel makes the note unreadable.
		this.map.scrollZoom.disable();
		// initializeMap adds the locate button on mobile whether or not there is a
		// base behind the view, so an inline map gets one too — and needs the same
		// correction the base views get.
		this.locate = guardLocateControl(this.map, () => this.system());

		this.resizeObserver = new ResizeObserver(() => this.map?.resize());
		this.resizeObserver.observe(this.rootEl);

		this.registerEvent(
			this.plugin.app.workspace.on('css-change', () => {
				if (this.view && this.view.map) this.view.updateMapStyle();
			})
		);
		// refresh() may have been requested while initializeMap() was awaiting.
		// Now that a real map exists it can run normally and owns the next revision.
		if (this.refreshPending) {
			this.refreshPending = false;
			await this.refresh();
		} else {
			await this.draw(revision);
			if (revision === this.operationRevision && !this.dead) this.renderStats();
		}
		// Bound after the first draw, not before it: that draw already waits for
		// `styleReady()`, so binding earlier would make the initial style load
		// draw the same track a second time.
		if (this.map && !this.dead) this.watchStyleReloads(this.map);
	}

	/**
	 * A theme or background change replaces the style and takes the track with
	 * it; the built-in view only knows how to put its markers back.
	 *
	 * The redraw claims its own revision, so a draw still running against the
	 * discarded style gives way to it. While a read has not committed, though,
	 * this stands down entirely: that read draws onto the new style when it
	 * lands, and claiming a revision here would cancel it and leave the map
	 * showing data the file no longer has.
	 */
	private watchStyleReloads(map: MapLibreMap): void {
		// This is bound after the first draw, which already waited for the style, so
		// the constructor's own `style.load` is gone by now. Bound that one here.
		this.boundBasemap(map);
		map.on('style.load', () => {
			if (this.dead) return;
			// A fresh style has a fresh raster source with the default zoom bounds
			// back, whether or not the track is redrawn below.
			this.boundBasemap(map);
			if (this.reading > 0) {
				// Noted rather than drawn, so the one path that ends a read without
				// drawing — an unreadable file — can still put the last good track
				// back onto the style that just replaced it.
				this.styleDrawPending = true;
				return;
			}
			this.redraw();
		});
	}

	/**
	 * Stop this map asking for levels the pack does not hold.
	 *
	 * An inline map has no view options to decline the offline basemap with, so it
	 * follows the plugin setting — the same answer its headless config gave the
	 * native view when the style was built.
	 */
	private boundBasemap(map: MapLibreMap): void {
		const pack = this.plugin.offlineBasemap();
		if (pack) boundOfflineSource(map, pack.url, pack.sourceMaxZoom);
	}

	/** The pack was configured, changed or cleared while this map was on screen. */
	refreshBasemap(): void {
		if (this.dead) return;
		restyleForBasemap(this.view);
	}

	/** Draw the committed data as its own operation, superseding any older one. */
	private redraw(): void {
		this.draw(++this.operationRevision).catch(() => {});
	}

	/** Release a map which initializeMap() created after this embed lost ownership. */
	private destroyUnownedView(view: BasesMapView): void {
		try {
			view.destroyMap();
		} catch {
			/* native initialization did not finish far enough to destroy */
		}
		view.containerEl?.detach();
	}

	/** Re-read the file and start the layers over — the track or a visual setting changed. */
	async refresh(): Promise<void> {
		if (this.dead) return;
		// Applied before the map guard so a settings change also reaches an embed
		// that is still below the fold and has not spent a WebGL context yet.
		this.applyHeight();
		if (!this.map) {
			this.refreshPending = true;
			return;
		}
		const revision = ++this.operationRevision;
		const { rec, photos } = await this.loadAll(() => !this.dead && revision === this.operationRevision);
		if (revision !== this.operationRevision || !this.map || this.dead) return;
		// Answered before anything is torn down, and before `this.rec` is replaced:
		// an unusable read must not be able to take the last usable one with it.
		// See failInPlace() for why this is not the `fail()` build() calls.
		if (rec.error) {
			this.failInPlace(rec.error);
			// This read is ending without a draw, so a style reload that stood
			// down for it has nobody else to put the last good track back.
			if (this.styleDrawPending) this.redraw();
			return;
		}
		this.rec = rec;
		this.photos = photos;
		removeTrackLayers(this.map);
		// Recreate private hover layers with shared layers to preserve stack order.
		removeHoverLayers(this.map);
		this.locate?.replaceDot();
		// No `framed` reset here: draw() reframes when the data it draws is not the
		// data the camera was framed for, and leaves the camera alone otherwise.
		await this.draw(revision);
		if (revision !== this.operationRevision || this.dead) return;
		// Statistics settings reach open embeds through refresh().
		this.renderStats();
	}

	private async draw(revision: number): Promise<void> {
		const map = this.map;
		if (!map || this.dead || revision !== this.operationRevision) return;
		if (!this.rec || this.rec.error) return;
		const view = this.view;
		if (!view) return;
		await styleReady(map);
		if (!this.map || this.dead || revision !== this.operationRevision) return;
		// Whatever a style reload was owed, this draw pays: it waited for the
		// style that replaced it and is about to put the owned content back.
		this.styleDrawPending = false;

		const color = view.markerManager.resolveColor(this.plugin.settings.trackColor);
		// An embed has one owning note, so every feature uses index 0.
		const system = this.system();
		const trackData: FeatureCollection<Geometry, TrackFeatureProps> = {
			type: 'FeatureCollection',
			features: trackFeatures(projectedFeatures(this.rec, system), color, 0, this.file.path),
		};
		// Photos share drawing/framing but stay out of the track-only hover corridor.
		const data: FeatureCollection<Geometry, TrackFeatureProps> = {
			type: 'FeatureCollection',
			features: [
				...trackData.features,
				...this.photos.flatMap((p) => trackFeatures(projectedFeatures(p.rec, system), color, 0, p.file.path)),
			],
		};

		if (!drawTracks(map, data)) return;

		const settings = this.plugin.settings;
		const weight = trackKnob('trackWeight', settings.trackWeight);
		const stroke = view.markerManager.resolveColor('var(--background-primary)');
		applyTrackPaint(
			map,
			weight,
			trackKnob('trackOpacity', settings.trackOpacity) / 100,
			stroke,
			settings.trackMarkers,
			settings.photoThumbnails
		);

		// Thumbnail decoding stays async and bounded off drawTracks' synchronous
		// path. A screen-space collision pass picks icons that have room to render;
		// every other photo stays the dot PHOTO_DOT_LAYER always draws.
		this.ensurePhotoIcons(system);

		// Style replacement wipes private hover layers too; recreate idempotently.
		ensureHoverLayers(map, weight);
		setHitData(map, trackData);
		applyCursorPaint(map, color, stroke);

		this.bindInteractions();

		// Framed once per dataset, and never once the reader has moved this map:
		// a refresh reaches every open embed, including maps in notes that have
		// nothing to do with the file that changed.
		const framing = this.framingSignature(system);
		if (this.framedFor === framing || this.userMoved) return;
		// Tighter than the base view's 24: an inline map is a fraction of a note's
		// width, and padding that reads as breathing room there reads as a wasted
		// margin here.
		const bounds = boundsOf(
			map,
			data.features.map((feature) => feature.geometry)
		);
		if (!bounds) return;
		this.framedFor = framing;
		fitTo(map, bounds, 16, trackKnob('fitMaxZoom', settings.fitMaxZoom));
	}

	/**
	 * What the camera was framed for: everything that decides where the bounds
	 * are — this embed's own track and the host's photos, by path and mtime, in
	 * the space they are drawn in. Paint, statistics and height are deliberately
	 * absent, so a visual setting still refreshes without moving the map.
	 *
	 * '\0' written as an escape rather than as a raw byte, for the reason
	 * `TrackLayer.signature()` gives.
	 */
	private framingSignature(system: CoordSystem): string {
		const parts: string[] = [system, this.plugin.settings.photoDatum];
		// mtime, so an edit to a file counts even though its path has not moved.
		for (const file of [this.file, ...this.photos.map((photo) => photo.file)]) {
			parts.push(file.path, String(file.stat.mtime));
		}
		return parts.join('\0');
	}

	/** `photoIconSource()` (layers.ts) is the one builder this and the base-view
	 *  path share, so the two can never disagree about what an icon carries. */
	private ensurePhotoIcons(system: CoordSystem): void {
		const icons: PhotoIconSource[] = [];
		for (const photo of this.photos) {
			const icon = photoIconSource(photo.file.path, photo.rec, system);
			if (icon) icons.push(icon);
		}
		// Kept whether or not they are drawn, so switching thumbnails back on
		// selects from these rather than waiting for the next full redraw.
		this.photoIcons = icons;
		applyPhotoIcons(this.map, icons, this.plugin.settings.photoThumbnails);
	}

	/** Reselect cached icon candidates after camera movement. */
	private reselectPhotoIcons(): void {
		// Deliberately not `applyPhotoIcons`; see the twin in track-layer.ts.
		if (!this.map || this.photoIcons.length === 0) return;
		if (!this.plugin.settings.photoThumbnails) return;
		ensurePhotoImages(this.map, this.photoIcons);
	}

	/**
	 * Bind once per embed map. Layer listeners survive refresh/style changes,
	 * and the map itself is destroyed with the embed, so explicit off() is unnecessary.
	 */
	private bindInteractions(): void {
		if (this.interactionsBound) return;
		const map = this.map;
		if (!map) return;
		this.interactionsBound = true;
		// Once the reader takes the wheel, stop re-framing the map underneath
		// them. Programmatic moves carry no originalEvent, so they do not count.
		const mark = (ev?: { originalEvent?: unknown }) => {
			if (ev && ev.originalEvent) this.userMoved = true;
		};
		for (const name of USER_GESTURE_EVENTS) {
			map.on(name, mark);
		}
		map.on('moveend', () => this.reselectPhotoIcons());
		map.on('mousemove', POINT_LAYER, (ev: MapMouseEvent) => this.hoverWaypoint(ev));
		map.on('mouseleave', POINT_LAYER, () => this.hideTooltip());
		// Bind dot-only photos too; the shared DOM-event guard prevents double opens.
		for (const layer of [PHOTO_DOT_LAYER, PHOTO_LAYER]) {
			map.on('mousemove', layer, (ev: MapMouseEvent) => this.hoverPhoto(ev));
			map.on('mouseleave', layer, () => this.hideTooltip());
			map.on('click', layer, (ev: MapMouseEvent) => this.openPhoto(ev));
			map.on('mouseenter', layer, () => map.getCanvas().addClass('is-over-marker'));
			map.on('mouseleave', layer, () => map.getCanvas().removeClass('is-over-marker'));
		}
		map.on('mousemove', HIT_LAYER, (ev: MapMouseEvent) => this.hoverTrack(ev));
		map.on('mouseleave', HIT_LAYER, () => this.hideTrackHover());
	}

	private hoverWaypoint(ev: MapMouseEvent): void {
		const name = ev.features?.[0]?.properties?.amName;
		const point = ev.point;
		// Waypoint tooltips follow the same live marker-visibility setting.
		if (!this.plugin.settings.trackMarkers || typeof name !== 'string' || name === '' || !point || !this.rootEl) {
			// Absent is absent — TCX has no waypoint concept at all, and GeoJSON may
			// or may not name a point. Both read the same as "nothing to show" here.
			this.hideTooltip();
			return;
		}
		const key = `w\0${name}`;
		if (this.shownTooltip !== key) {
			this.tooltipEl ??= this.rootEl.createDiv('advanced-maps-waypoint-tooltip');
			// setText() replaces every child, so a tooltip left over from a photo
			// hover (an <img> plus a caption div, see hoverPhoto()) is cleared back
			// to plain text here without a separate empty() call — and the class it
			// added is dropped explicitly, since removeClass has no such side effect.
			this.tooltipEl.removeClass('advanced-maps-photo-tooltip');
			this.tooltipEl.setText(name);
			this.shownTooltip = key;
		}
		// Outside the guard: the box follows the cursor, only its contents are kept.
		this.positionTooltip(point);
	}

	/** Open inline photos in a modal; the host note is already on screen. */
	private openPhoto(ev: MapMouseEvent): void {
		if (ev.originalEvent) {
			if (this.handledClick === ev.originalEvent) return;
			this.handledClick = ev.originalEvent;
		}
		const path = ev.features?.[0]?.properties?.amPath;
		if (typeof path !== 'string' || path === '') return;
		const file = this.plugin.app.vault.getFileByPath(path);
		if (!file) return;
		if (ev.originalEvent && Keymap.isModEvent(ev.originalEvent)) {
			void this.plugin.app.workspace.openLinkText(path, this.sourcePath, Keymap.isModEvent(ev.originalEvent));
			return;
		}
		new PhotoModal(this.plugin.app, file).open();
	}

	/** Show a photo preview, resolving its stored vault path again at hover time. */
	private hoverPhoto(ev: MapMouseEvent): void {
		// The thumbnail layer and the dot beneath it both dispatch this sample; one
		// answer is enough, exactly as for the click above.
		if (ev.originalEvent) {
			if (this.handledHover === ev.originalEvent) return;
			this.handledHover = ev.originalEvent;
		}
		const path = ev.features?.[0]?.properties?.amPath;
		const point = ev.point;
		if (typeof path !== 'string' || path === '' || !point || !this.rootEl) {
			this.hideTooltip();
			return;
		}
		// Rebuilding the box means resolving the file, minting a fresh <img> at the
		// photo's full resolution and hanging a load listener on it. At 60–120
		// pointer samples a second on one unchanged photo, that was all waste.
		if (this.shownTooltip === `p\0${path}`) {
			this.positionTooltip(point);
			return;
		}
		const abstract = this.plugin.app.vault.getAbstractFileByPath(path);
		const file = abstract instanceof TFile ? abstract : null;
		// A file that failed to resolve still has a name worth showing — take it
		// off the path itself rather than leaving the tooltip empty.
		const name = file?.name ?? (path.split('/').pop() || path);

		this.tooltipEl ??= this.rootEl.createDiv('advanced-maps-waypoint-tooltip');
		this.tooltipEl.addClass('advanced-maps-photo-tooltip');
		this.tooltipEl.empty();

		if (file) {
			// getResourcePath never throws on a real TFile in practice, but this
			// tooltip is not worth losing to an internal it did not expect — no
			// image is exactly the "fall back to the file name alone" case below,
			// so a thrown resource path lands there rather than on a blank box.
			try {
				const src = this.plugin.app.vault.getResourcePath(file);
				const img = this.tooltipEl.createEl('img', {
					cls: 'advanced-maps-photo-tooltip-img',
					attr: { src, alt: name },
				});
				// The image decodes asynchronously, so the flip decision inside
				// positionTooltip() — based on the tooltip's *current* rendered
				// height — is only right for the bare-filename box it is called
				// against below. Once the photo has actually painted the box is
				// taller, so the flip is re-decided against its real height too.
				img.addEventListener('load', () => this.positionTooltip(point));
			} catch {
				/* no resource path for this file — filename-only tooltip below */
			}
		}
		this.tooltipEl.createDiv({ cls: 'advanced-maps-photo-tooltip-name', text: name });
		this.shownTooltip = `p\0${path}`;
		this.positionTooltip(point);
	}

	/** Position the shared tooltip and flip it below when its visible height would clip. */
	private positionTooltip(point: { x: number; y: number }): void {
		if (!this.tooltipEl) return;
		this.tooltipEl.style.left = `${point.x}px`;
		this.tooltipEl.style.top = `${point.y}px`;
		this.tooltipEl.addClass('is-visible');
		this.tooltipEl.toggleClass('is-below', point.y < this.tooltipEl.offsetHeight * 1.3);
	}

	private hideTooltip(): void {
		this.tooltipEl?.removeClass('is-visible');
		// Hidden is not "still showing that photo": the next hover must rebuild.
		this.shownTooltip = null;
	}

	/** Convert map tile space back to profile WGS-84 before nearest-point lookup. */
	private hoverTrack(ev: MapMouseEvent): void {
		if (!this.profile) return;
		const [lng, lat] = toWgs84(this.system(), ev.lngLat.lng, ev.lngLat.lat);
		this.profile.highlightAt(nearestByPosition(this.profile.samples, lng, lat));
	}

	private hideTrackHover(): void {
		this.profile?.clear();
	}

	/**
	 * The distance/ascent/duration bar and, under it, the elevation profile.
	 * Torn down and rebuilt from scratch on every call — see build() and
	 * refresh() — so a toggle in settings or a re-parsed file never ends up
	 * appending a second copy underneath the first.
	 *
	 * Built as a sibling of `rootEl` rather than a child of it: `rootEl` is
	 * `.advanced-maps-embed`, which has a fixed height (--advanced-maps-embed-
	 * height) and `overflow: hidden` so the map fills exactly the box the user
	 * configured. Growing the block instead of shrinking the map means that
	 * configured height always means that much map, not map-minus-stats-bar —
	 * and it costs nothing here, since `containerEl.createDiv()` appends after
	 * whatever is already in `containerEl`, which is `rootEl` and nothing else.
	 */
	private renderStats(): void {
		if (this.profile) {
			// The map-side cursor dot lives on the map's own style, not inside
			// panelEl — removing/rebuilding the panel below does not touch it, so
			// a settings toggle or a re-parsed file mid-hover would otherwise
			// leave a stuck dot on the map with nothing left able to clear it.
			this.profile.clear();
			this.profile = null;
		}
		this.panelEl?.remove();
		this.panelEl = null;
		if (this.dead || !this.rootEl || !this.rec || this.rec.error) return;
		if (!this.plugin.settings.trackStats) return;

		// THE TRAP: this.rec.features is the raw, unprojected WGS-84 parse, and
		// that is the only space distance/ascent may be measured in.
		// projectedFeatures() is for drawing on a Chinese tile set, and its
		// GCJ-02/BD-09 offsets are non-linear — a distance summed after that
		// shift is a distance measured in the wrong space, and wrong by too
		// little per pair of points to look wrong. It would also leave nothing
		// to measure regardless: track-cache.ts's projectedFeatures() sets
		// `properties: null` on every feature it produces, and `properties.times`
		// is where the timestamps ascent/duration/speed need actually live.
		// Through the record, so a re-render or a settings change does not walk
		// every position again for figures this file has already been measured for.
		const stats = recordStats(this.rec);
		const fields = stats ? statsFields(stats) : null;
		if (!stats || !fields) return;

		this.panelEl = this.containerEl.createDiv('advanced-maps-panel');
		const bar = this.panelEl.createDiv('advanced-maps-stats-bar');
		for (const field of fields) {
			bar.createSpan({
				cls: 'advanced-maps-stats-field',
				text: field.text,
				attr: { title: field.title, 'aria-label': `${field.title}: ${field.text}` },
			});
		}

		if (!this.plugin.settings.elevationProfile || stats.minEle === null || stats.maxEle === null) return;
		const samples = recordProfile(this.rec);
		// A waypoints-only file can carry an elevation (a summit marker, say) with
		// no LineString to plot it against; elevationProfile() only walks
		// LineStrings, so it comes back empty (or a single point) and there is
		// nothing worth a chart over.
		if (samples.length < 2) return;
		// Scaled to the samples drawn, not to `stats`, which counts waypoint
		// elevations this chart never plots — one 0 m waypoint on a ridge walk
		// would otherwise flatten the whole route into the top of the box.
		let low = Infinity;
		let high = -Infinity;
		for (const sample of samples) {
			if (sample.ele < low) low = sample.ele;
			if (sample.ele > high) high = sample.ele;
		}
		this.renderProfile(this.panelEl, samples, low, high);
	}

	/**
	 * Hand-rolled inline SVG rather than a library — a filled area plus the
	 * outline on top of it, so a short sharp climb stays visible instead of
	 * washing out into flat fill colour. `viewBox` + `preserveAspectRatio="none"`
	 * is what actually stretches this to the note's width; W/H below are just
	 * the coordinate space the path's own numbers are drawn in, not pixels.
	 *
	 * Also wires the profile → map half of the hover link: a vertical rule and
	 * a distance/elevation readout that follow the pointer, plus the dot they
	 * put on the map itself. `this.profile` is what `hoverTrack()` reads to
	 * drive the same highlight from the map side.
	 */
	private renderProfile(container: HTMLElement, samples: ProfileSample[], minEle: number, maxEle: number): void {
		const W = 600;
		const H = 100;
		const maxD = samples[samples.length - 1].d || 1;
		// A dead-flat elevation would otherwise divide by zero; padding the range
		// on top of that keeps a real but small span of movement off the very
		// top/bottom edge of the box, where it would be easy to mistake for clipping.
		const span = Math.max(maxEle - minEle, 1);
		const pad = span * 0.1;
		const x = (d: number) => (d / maxD) * W;
		const y = (ele: number) => H - ((ele - minEle + pad) / (span + pad * 2)) * H;
		const points = samples.map((s) => `${x(s.d).toFixed(1)},${y(s.ele).toFixed(1)}`).join(' ');

		const wrap = container.createDiv({
			cls: 'advanced-maps-profile',
			attr: { role: 'img', 'aria-label': `${t('stats.profile')}: ${Math.round(minEle)}–${Math.round(maxEle)} m` },
		});

		const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
		// The wrapping div already carries the accessible name via role="img" and
		// aria-label; without this the SVG's own (empty) accessibility node would
		// give a screen reader a second, silent stop inside that same image.
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('focusable', 'false');
		svg.appendChild(
			svgEl('polygon', { class: 'advanced-maps-profile-area', points: `0,${H} ${points} ${W},${H}` })
		);
		svg.appendChild(svgEl('polyline', { class: 'advanced-maps-profile-line', points }));
		// x1/x2 move together on every highlightAt() call — always a plain
		// vertical rule, never one whose ends could drift apart. The actual
		// stroke/opacity live in styles.css, same pattern as the polyline above.
		const rule = svgEl('line', { class: 'advanced-maps-profile-rule', x1: '0', x2: '0', y1: '0', y2: String(H) });
		svg.appendChild(rule);
		wrap.appendChild(svg);

		// A plain HTML element, not SVG text: `svg` above is stretched with
		// preserveAspectRatio="none" so it fills the box at any note width, and
		// an SVG <text> living in that same coordinate space would be squashed
		// or stretched right along with it — `vector-effect: non-scaling-stroke`
		// fixes exactly this for a *stroke* (see the rule above and the polyline
		// it mirrors); there is no equivalent fix for text. `aria-hidden` for the
		// same reason the SVG itself carries it a few lines up: the wrap's own
		// role="img" + aria-label is already this image's one accessible name,
		// and dynamic text that updates on every mousemove is exactly the kind
		// of second, unpredictable node that comment already exists to avoid.
		const readout = wrap.createDiv({ cls: 'advanced-maps-profile-readout', attr: { 'aria-hidden': 'true' } });

		const highlightAt = (i: number): void => {
			const s = samples[i];
			if (!s) return;
			const px = x(s.d);
			rule.setAttribute('x1', String(px));
			rule.setAttribute('x2', String(px));
			rule.addClass('is-active');
			readout.addClass('is-active');
			readout.setText(`${formatDistance(s.d)} · ${formatElevation(s.ele)}`);
			readout.style.left = `${(px / W) * 100}%`;
			if (this.map) setCursorPoint(this.map, toTileSpace(this.system(), s.lng, s.lat));
		};
		const clear = (): void => {
			rule.removeClass('is-active');
			readout.removeClass('is-active');
			if (this.map) setCursorPoint(this.map, null);
		};

		wrap.addEventListener('mousemove', (ev: MouseEvent) => {
			const rect = wrap.getBoundingClientRect();
			if (rect.width <= 0) return;
			const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
			highlightAt(nearestByDistance(samples, frac * maxD));
		});
		wrap.addEventListener('mouseleave', clear);

		this.profile = { samples, highlightAt, clear };
	}

	override onunload(): void {
		this.dead = true;
		this.operationRevision++;
		this.observer?.disconnect();
		this.resizeObserver?.disconnect();
		this.panelEl?.remove();
		this.panelEl = null;
		// Hygiene only, not a correctness requirement: destroyMap() just below
		// tears down the whole map, and everything bound to it — HIT_LAYER's
		// listeners, the cursor source, all of it — goes with it regardless.
		this.profile = null;
		this.tooltipEl?.remove();
		this.tooltipEl = null;
		this.locate?.restore();
		this.locate = null;
		if (this.map) cancelPhotoImages(this.map);
		if (this.view) {
			try {
				this.view.destroyMap();
			} catch {
				/* never got that far */
			}
			this.view.containerEl?.detach();
			this.view = null;
		}
		this.map = null;
		this.plugin.embeds.delete(this);
	}
}

/** Build compact value-only fields; omit unknowns and an entirely empty bar. */
function statsFields(stats: TrackStats): Array<{ title: string; text: string }> | null {
	// Shared with the command that writes these figures into a note's properties,
	// so the two surfaces cannot disagree about what "has statistics" means.
	if (!hasStats(stats)) return null;

	const fields: Array<{ title: string; text: string }> = [
		{ title: t('stats.distance'), text: formatDistance(stats.distance) },
	];
	if (stats.ascent !== null) fields.push({ title: t('stats.ascent'), text: `↑ ${formatElevation(stats.ascent)}` });
	if (stats.descent !== null) {
		fields.push({ title: t('stats.descent'), text: `↓ ${formatElevation(stats.descent)}` });
	}
	if (stats.minEle !== null && stats.maxEle !== null) {
		fields.push({
			title: t('stats.elevation'),
			text: `${Math.round(stats.minEle)}–${Math.round(stats.maxEle)} m`,
		});
	}
	if (stats.duration !== null) fields.push({ title: t('stats.duration'), text: formatDuration(stats.duration) });
	if (stats.movingTime !== null) {
		fields.push({ title: t('stats.moving'), text: formatDuration(stats.movingTime) });
	}
	if (stats.speed !== null) fields.push({ title: t('stats.speed'), text: formatSpeed(stats.speed) });
	// The point count is deliberately not here. Every other value carries its own
	// unit and reads as what it is; a bare "225" at the end of a run of middots
	// reads as noise, and it is the one number nobody looks at a walk to learn.
	return fields;
}

/** Obsidian's own helper for the SVG namespace — the `createEl` family covers it too. */
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
	return createSvg(tag, { attr: attrs });
}

/* Inline-only profile hover corridor and map cursor, both as GeoJSON layers. */

const EMPTY_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

const hitLayerSpec = {
	id: HIT_LAYER,
	type: 'line',
	source: HIT_SRC,
	filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']],
	layout: { 'line-join': 'round', 'line-cap': 'round' },
	// Invisible — line-width is set for real in ensureHoverLayers(), scaled to
	// the drawn track's own weight — but still hit-tested: MapLibre's
	// layer-scoped mousemove tests against a layer's rendered geometry
	// regardless of its opacity, only 'visibility: none' would remove it from
	// that test, which this never sets.
	paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 18 },
};

const cursorLayerSpec = {
	id: CURSOR_LAYER,
	type: 'circle',
	source: CURSOR_SRC,
	paint: {
		'circle-radius': 6,
		// Placeholders — applyCursorPaint() sets both to the track's own colour
		// and its halo on every draw(), the same as the waypoint dots already do.
		'circle-color': '#000000',
		'circle-stroke-width': 2,
		'circle-stroke-color': '#ffffff',
	},
};

/** Ensure both hover layers after style changes and size the hit corridor. */
function ensureHoverLayers(map: MapLibreMap, weight: number): void {
	try {
		if (!map.getSource(HIT_SRC)) {
			map.addSource(HIT_SRC, { type: 'geojson', data: EMPTY_COLLECTION });
			map.addLayer(hitLayerSpec);
		}
		if (!map.getSource(CURSOR_SRC)) {
			map.addSource(CURSOR_SRC, { type: 'geojson', data: EMPTY_COLLECTION });
			map.addLayer(cursorLayerSpec);
		}
	} catch (e) {
		console.warn('Advanced Maps: deferring the elevation-profile hover link —', e instanceof Error ? e.message : e);
		return;
	}
	if (map.getLayer(HIT_LAYER)) {
		// trackWeight's own minimum (1 px, see TRACK_KNOBS) is not something a
		// reader can reliably point at, so the hit corridor is always at least
		// 18 px wide regardless of how thin the visible line is drawn.
		map.setPaintProperty(HIT_LAYER, 'line-width', Math.max(18, weight * 1.5));
	}
}

/** Feed the hit layer the same collection just drawn as the visible track. */
function setHitData(map: MapLibreMap, data: FeatureCollection): void {
	map.getSource(HIT_SRC)?.setData(data);
}

/** Move the hover dot to a tile-space position, or hide it with `null`. */
function setCursorPoint(map: MapLibreMap, pos: [number, number] | null): void {
	const source = map.getSource(CURSOR_SRC);
	if (!source) return;
	source.setData(
		pos
			? {
					type: 'FeatureCollection',
					features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pos } }],
				}
			: EMPTY_COLLECTION
	);
}

/** The dot's own colour and halo — the same pair applyTrackPaint() already resolved for the track it sits on. */
function applyCursorPaint(map: MapLibreMap, color: string, stroke: string): void {
	if (!map.getLayer(CURSOR_LAYER)) return;
	map.setPaintProperty(CURSOR_LAYER, 'circle-color', color);
	map.setPaintProperty(CURSOR_LAYER, 'circle-stroke-color', stroke);
}

/** Torn down alongside the four track layers on refresh() — see refresh()'s own comment for why both must go together. */
function removeHoverLayers(map: MapLibreMap): void {
	if (!map.getStyle) return;
	try {
		for (const id of [CURSOR_LAYER, HIT_LAYER]) {
			if (map.getLayer(id)) map.removeLayer(id);
		}
		if (map.getSource(CURSOR_SRC)) map.removeSource(CURSOR_SRC);
		if (map.getSource(HIT_SRC)) map.removeSource(HIT_SRC);
	} catch {
		/* style already torn down */
	}
}
