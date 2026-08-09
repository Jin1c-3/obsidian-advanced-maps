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
import { SRC } from './constants';
import { resolveSystem, type CoordSystem } from './coords';
import { clamp, emptyBounds, extendBounds, styleReady } from './geometry';
import { t } from './i18n';
import { addTrackLayers, applyTrackPaint, guardLocateControl, removeTrackLayers, type LocateGuard } from './layers';
import {
	elevationProfile,
	formatDistance,
	formatDuration,
	formatElevation,
	formatSpeed,
	trackStats,
	type TrackStats,
} from './stats';
import { projectedFeatures, type TrackRecord } from './track-cache';
import type AdvancedMapsPlugin from './main';
import type { BasesMapView, MapLibreMap } from './types/obsidian-internals';

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
		// Defensive rather than load-bearing on the paths that call fail() today —
		// every one of them runs before renderStats() ever gets a chance to build a
		// panel — but "a stats panel cannot outlive its map" has to hold even if a
		// future failure path is added after that point.
		this.panelEl?.remove();
		this.panelEl = null;
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
		if (map.getSource(SRC)) return;

		const color = view.markerManager.resolveColor(this.plugin.settings.trackColor);
		const data: FeatureCollection<Geometry, { amColor: string }> = {
			type: 'FeatureCollection',
			features: projectedFeatures(this.rec, this.system()).map((feature) => ({
				type: 'Feature',
				geometry: feature.geometry,
				properties: { amColor: color },
			})),
		};

		try {
			map.addSource(SRC, { type: 'geojson', data });
			addTrackLayers(map);
		} catch (e) {
			console.warn('Advanced Maps: deferring track layers —', e instanceof Error ? e.message : e);
			return;
		}

		applyTrackPaint(
			map,
			clamp(this.plugin.settings.trackWeight, 1, 24, 4),
			clamp(this.plugin.settings.trackOpacity, 0, 100, 85) / 100,
			view.markerManager.resolveColor('var(--background-primary)')
		);

		if (this.framed) return;
		const bounds = emptyBounds(map);
		let points = 0;
		for (const feature of data.features) points += extendBounds(bounds, feature.geometry);
		if (points === 0 || bounds.isEmpty()) return;
		this.framed = true;
		map.fitBounds(bounds, {
			padding: 16,
			maxZoom: clamp(this.plugin.settings.fitMaxZoom, 1, 22, 16),
			animate: false,
		});
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
	 */
	private renderProfile(
		container: HTMLElement,
		samples: Array<{ d: number; ele: number }>,
		minEle: number,
		maxEle: number
	): void {
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
		wrap.appendChild(svg);
	}

	override onunload(): void {
		this.dead = true;
		this.observer?.disconnect();
		this.resizeObserver?.disconnect();
		this.panelEl?.remove();
		this.panelEl = null;
		this.locate?.restore();
		this.locate = null;
		if (this.view) {
			try {
				this.view.destroyMap();
			} catch (e) {
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

/** A namespaced element `createDiv`/`createSpan` cannot make — Obsidian's DOM helpers only cover the HTML namespace. */
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
	return el;
}
