/*
 * Inline ![[track.gpx]] embed.
 *
 * There is no exported MapLibre to build a map with, so the embed borrows the
 * built-in view: the native factory is called with a stub controller, which
 * yields a fully configured map (tiles, dark mode, zoom controls) that happens
 * to have no rows behind it. The track is then drawn on top.
 */

import { Component } from 'obsidian';
import type { TFile } from 'obsidian';
import type { FeatureCollection, Geometry } from 'geojson';
import { CURSOR_LAYER, CURSOR_SRC, HIT_LAYER, HIT_SRC, POINT_LAYER } from './constants';
import { resolveSystem, toTileSpace, toWgs84, type CoordSystem } from './coords';
import { boundsOf, styleReady, trackFeatures, trackKnob, type TrackFeatureProps } from './geometry';
import { t } from './i18n';
import { applyTrackPaint, drawTracks, fitTo, guardLocateControl, removeTrackLayers, type LocateGuard } from './layers';
import {
	elevationProfile,
	formatDistance,
	formatDuration,
	formatElevation,
	formatSpeed,
	nearestByDistance,
	nearestByPosition,
	trackStats,
	type ProfileSample,
	type TrackStats,
} from './stats';
import { projectedFeatures, type TrackRecord } from './track-cache';
import type AdvancedMapsPlugin from './main';
import type { BasesMapView, MapLibreMap, MapMouseEvent } from './types/obsidian-internals';

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
	private framed = false;
	private dead = false;
	/** Guards map.on(), which survives style.load and refresh() — see
	 *  bindInteractions() for why binding twice would be wrong. */
	private interactionsBound = false;
	/** A waypoint's name on hover. Embeds only — see CLAUDE.md for why the base
	 *  view keeps its existing hover-shows-the-note-popup behaviour instead. */
	private tooltipEl: HTMLElement | null = null;
	/** The elevation profile's own hover state, set by renderProfile() and read
	 *  by hoverTrack() — null whenever there is no profile panel to link to
	 *  (the setting is off, or the file has nothing worth charting). */
	private profile: { samples: ProfileSample[]; highlightAt: (i: number) => void; clear: () => void } | null = null;

	constructor(
		private readonly containerEl: HTMLElement,
		private readonly plugin: AdvancedMapsPlugin,
		private readonly file: TFile
	) {
		super();
	}

	/** The embed API calls this when the file is swapped underneath us. */
	loadFile(): void {}

	/**
	 * An embed has no base behind it, so there is no view option to read — but it
	 * does have tiles, and under "auto" those are the deciding vote. They are
	 * usually the default tile set, not whatever a base view happens to use.
	 */
	private system(): CoordSystem {
		return resolveSystem(this.plugin.settings.coordSystem, this.view?.mapConfig);
	}

	override onload(): void {
		this.rootEl = this.containerEl.createDiv('advanced-maps-embed');
		this.rootEl.style.setProperty('--advanced-maps-embed-height', `${this.plugin.settings.embedHeight}px`);

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

	private async build(): Promise<void> {
		this.rec = await this.plugin.tracks.load(this.file);
		if (this.dead || !this.rootEl) return;
		if (this.rec.error) return this.fail(this.rec.error);

		const view = this.plugin.createHeadlessView(this.rootEl);
		if (!view) return this.fail(t('embed.mapsDisabled'));
		this.view = view;

		try {
			await view.initializeMap();
		} catch (e) {
			return this.fail(e instanceof Error ? e.message : String(e));
		}
		if (this.dead || !view.map) return;

		this.map = view.map;
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
		// A theme or background change replaces the style and takes the track
		// with it; the built-in view only knows how to put its markers back.
		this.map.on('style.load', () => {
			this.draw().catch(() => {});
		});

		await this.draw();
		this.renderStats();
	}

	/** Re-read the file and start the layers over — the track itself changed. */
	async refresh(): Promise<void> {
		if (!this.map || this.dead) return;
		this.rec = await this.plugin.tracks.load(this.file);
		if (!this.map || this.dead) return;
		removeTrackLayers(this.map);
		// removeTrackLayers() only knows about the four shared track layers —
		// see HIT_SRC/CURSOR_SRC's own comment in constants.ts for why. Left
		// alone, the hover layers would survive this call while the track layers
		// it just removed come back on top of them in draw() below (a fresh
		// addLayer() always lands above whatever is already in the stack), which
		// would bury the cursor dot under the redrawn line on every refresh()
		// after the first. Removing both together and letting draw() re-create
		// both keeps the stacking order — track, then hover link, on top —
		// correct on every call, not just the first.
		removeHoverLayers(this.map);
		this.locate?.replaceDot();
		this.framed = false;
		await this.draw();
		// Also runs on every refresh(), not just the first build() — refresh() is
		// what the two "track statistics" settings toggle through
		// plugin.refreshTracks(), so a rebuild that only happened in build() would
		// leave the toggle looking like it does nothing until the note is reopened.
		this.renderStats();
	}

	private async draw(): Promise<void> {
		const map = this.map;
		if (!map || this.dead) return;
		if (!this.rec || this.rec.error) return;
		const view = this.view;
		if (!view) return;
		await styleReady(map);
		if (!this.map || this.dead) return;

		const color = view.markerManager.resolveColor(this.plugin.settings.trackColor);
		// index 0 for every feature: an embed draws exactly one file, so there is
		// only ever one "note" for amIndex to point at — unlike a base view, which
		// draws one per row and needs the index to tell them apart on hover.
		const data: FeatureCollection<Geometry, TrackFeatureProps> = {
			type: 'FeatureCollection',
			features: trackFeatures(projectedFeatures(this.rec, this.system()), color, 0),
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
			settings.trackMarkers
		);

		// The elevation-profile hover link's own style state — wiped by the same
		// theme/background swap that just wiped the track, so re-created here
		// unconditionally on every draw(), the same as the track layers
		// themselves. Idle and harmless for a file with no profile to link:
		// draw() does not need to know whether renderStats() found one, only
		// renderProfile() (which sets this.profile) ever reads from it.
		ensureHoverLayers(map, weight);
		setHitData(map, data);
		applyCursorPaint(map, color, stroke);

		this.bindInteractions();

		if (this.framed) return;
		// Tighter than the base view's 24: an inline map is a fraction of a note's
		// width, and padding that reads as breathing room there reads as a wasted
		// margin here.
		const bounds = boundsOf(
			map,
			data.features.map((feature) => feature.geometry)
		);
		if (!bounds) return;
		this.framed = true;
		fitTo(map, bounds, 16, trackKnob('fitMaxZoom', settings.fitMaxZoom));
	}

	/**
	 * Waypoint-name-on-hover, and the map-side half of the elevation-profile
	 * hover link. Bound once per map — like the native marker interactions,
	 * these listeners are layer-scoped but bound to the *map*, so they outlive
	 * a style swap that recreates the layer under the same id, and survive
	 * `refresh()` (which recreates the layer but not the map) without this
	 * guard stacking a second copy on top of the first.
	 *
	 * Base views are deliberately not given the same tooltip: they already show
	 * the note's own popup on any part of a track, through `popupManager`, and
	 * this plugin has no handle on that popup's DOM to add to rather than fight.
	 * An embed has no interactivity of its own to collide with. The hover link
	 * has no base-view counterpart at all — a base view has no profile to link
	 * to (see CLAUDE.md).
	 */
	private bindInteractions(): void {
		if (this.interactionsBound) return;
		const map = this.map;
		if (!map) return;
		this.interactionsBound = true;
		map.on('mousemove', POINT_LAYER, (ev: MapMouseEvent) => this.hoverWaypoint(ev));
		map.on('mouseleave', POINT_LAYER, () => this.hideWaypointTooltip());
		map.on('mousemove', HIT_LAYER, (ev: MapMouseEvent) => this.hoverTrack(ev));
		map.on('mouseleave', HIT_LAYER, () => this.hideTrackHover());
	}

	private hoverWaypoint(ev: MapMouseEvent): void {
		const name = ev.features?.[0]?.properties?.amName;
		const point = ev.point;
		// Absent is absent — TCX has no waypoint concept at all, and GeoJSON may
		// or may not name a point. Both read the same as "nothing to show" here.
		if (typeof name !== 'string' || name === '' || !point || !this.rootEl) {
			this.hideWaypointTooltip();
			return;
		}
		this.tooltipEl ??= this.rootEl.createDiv('advanced-maps-waypoint-tooltip');
		this.tooltipEl.setText(name);
		this.tooltipEl.style.left = `${point.x}px`;
		this.tooltipEl.style.top = `${point.y}px`;
		this.tooltipEl.addClass('is-visible');
	}

	private hideWaypointTooltip(): void {
		this.tooltipEl?.removeClass('is-visible');
	}

	/**
	 * The map → profile half of the hover link. `ev.lngLat` is tile space —
	 * whatever the current coordinate system drew the track in — while every
	 * sample in `this.profile.samples` is WGS-84, straight off `rec.features`
	 * (see stats.ts). Comparing the two without converting first would search
	 * the wrong space entirely: on Chinese tiles that is ~500 m off and still
	 * lands on *some* plausible-looking sample, never an error.
	 *
	 * A no-op while `this.profile` is null (the elevation-profile setting is
	 * off, or the file has nothing worth charting) — nothing on screen needs
	 * highlighting either way, and `highlightAt` reuses the exact same closure
	 * `renderProfile`'s own mousemove handler calls, cursor dot and all, so
	 * hovering the track directly also redraws the dot right under the pointer
	 * that is already there rather than leaving two code paths that both know
	 * how to "highlight sample i" free to drift apart later.
	 */
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
		const stats = trackStats(this.rec.features);
		const fields = statsFields(stats);
		if (!fields) return;

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
		const samples = elevationProfile(this.rec.features);
		// A waypoints-only file can carry an elevation (a summit marker, say) with
		// no LineString to plot it against; elevationProfile() only walks
		// LineStrings, so it comes back empty (or a single point) and there is
		// nothing worth a chart over.
		if (samples.length < 2) return;
		this.renderProfile(this.panelEl, samples, stats.minEle, stats.maxEle);
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

/**
 * "13.6 km · ↑ 420 m · 2:41:05 · 5.1 km/h" — values only, no labels; seven
 * labelled fields on one line would not fit a note's width, which is exactly
 * why the i18n table carries a name for each one instead — that rides on the
 * caller's `title`/`aria-label`. `null` fields (see stats.ts — every field but
 * `distance` may be one) are left out entirely rather than shown as a
 * misleading zero.
 *
 * Returns `null` for a file with nothing worth a bar over at all: a
 * waypoints-only export has zero distance and no elevation or time to fall back
 * on, and a lone "0 m" reads as real data rather than as an absence.
 */
function statsFields(stats: TrackStats): Array<{ title: string; text: string }> | null {
	const hasExtra =
		stats.ascent !== null ||
		stats.descent !== null ||
		(stats.minEle !== null && stats.maxEle !== null) ||
		stats.duration !== null ||
		stats.movingTime !== null ||
		stats.speed !== null;
	if (stats.distance === 0 && !hasExtra) return null;

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

/*
 * The elevation-profile hover link's own map-side state: an invisible, wide
 * hit-testing copy of the track line, and the small dot that follows a
 * hover from either direction. Both live here rather than in layers.ts —
 * unlike the four track layers, this has exactly one consumer (TrackEmbed)
 * and no base-view counterpart, since a base view has no profile to link to
 * (see CLAUDE.md) — folding it into the "shared spine" module would misstate
 * what that module is for.
 *
 * Drawn as a GeoJSON layer, not a DOM element tracked by hand or a
 * `maplibregl.Marker`: there is no exported MapLibre module to construct one
 * from, the same reason the tracks themselves are a source and a layer
 * rather than any kind of Marker — and a layer-backed point gets correct
 * screen placement through every pan and zoom for free, with nothing to
 * update but its data.
 */

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

/**
 * Make sure both hover layers exist, and size the hit corridor to the
 * currently drawn line weight. Idempotent per source, mirroring drawTracks()'s
 * own "does it already exist" check, and safe to call unconditionally on
 * every draw() — including every style.load, which wipes these along with
 * everything else a style holds — since draw() does not need to know whether
 * renderStats() found a profile to link this to.
 */
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
