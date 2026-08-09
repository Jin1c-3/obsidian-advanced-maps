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
import { projectedFeatures, type TrackRecord } from './track-cache';
import type AdvancedMapsPlugin from './main';
import type { BasesMapView, MapLibreMap } from './types/obsidian-internals';

export class TrackEmbed extends Component {
	private rootEl: HTMLElement | null = null;
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

	override onunload(): void {
		this.dead = true;
		this.observer?.disconnect();
		this.resizeObserver?.disconnect();
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
