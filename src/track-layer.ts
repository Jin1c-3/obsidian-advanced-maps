/*
 * TrackLayer — everything this plugin adds to one native map view.
 */

import { Keymap } from 'obsidian';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { TFile } from 'obsidian';
import { LINE_LAYER, MARKER_LAYER, POINT_LAYER, SRC } from './constants';
import { knownMode, projectCenter, projectGeometry, resolveSystem, type CoordSystem } from './coords';
import { clamp, extendBounds, styleReady } from './geometry';
import { FitControl, lineLayerSpec, pointLayerSpec } from './layers';
import { projectedFeatures } from './track-cache';
import type AdvancedMapsPlugin from './main';
import type {
	BasesData,
	BasesEntry,
	BasesMapView,
	LngLatBounds,
	MapConfig,
	MapMouseEvent,
	MarkerFeature,
} from './types/obsidian-internals';

interface DrawItem {
	entry: BasesEntry;
	file: TFile;
	trackFiles: TFile[];
	color: string;
}

type TrackFeature = Feature<Geometry, { amColor: string; amIndex: number }>;

export class TrackLayer {
	private items: DrawItem[] = [];
	private data: FeatureCollection<Geometry, { amColor: string; amIndex: number }> | null = null;
	private userMoved = false;
	private interactionsBound = false;
	private detached = false;
	private fitControl: FitControl | null = null;
	private markerFeatures: MarkerFeature[] | null = null;

	private origUpdateMarkers!: BasesMapView['markerManager']['updateMarkers'];
	private origCreateFeatures!: BasesMapView['markerManager']['createGeoJSONFeatures'];
	private origLoadConfig!: BasesMapView['loadConfig'];
	private origSwitchToTileSet!: BasesMapView['switchToTileSet'];
	private origInitializeMap!: BasesMapView['initializeMap'];
	private origDestroyMap!: BasesMapView['destroyMap'];
	private origOnunload!: BasesMapView['onunload'];

	constructor(
		private readonly plugin: AdvancedMapsPlugin,
		private readonly view: BasesMapView
	) {}

	/**
	 * Wrap the methods on the *instance* rather than the prototype: the wrappers
	 * die with the view, and `delete` puts the untouched prototype method back.
	 *
	 * markerManager.updateMarkers is the useful seam. The native view calls it
	 * after the map exists and after every data change, *and* re-calls it on
	 * `styledata` once a new style has wiped every source — which is exactly the
	 * set of moments the tracks need redrawing too.
	 */
	attach(): this {
		const view = this.view;

		this.origUpdateMarkers = view.markerManager.updateMarkers;
		view.markerManager.updateMarkers = async (data?: BasesData) => {
			await this.origUpdateMarkers.call(view.markerManager, data);
			try {
				await this.sync(data);
			} catch (e) {
				console.error('Advanced Maps: could not draw tracks', e);
			}
		};

		// Every marker coordinate that reaches the map is minted here — the
		// native method does nothing but turn parsed entries into Point
		// features — which makes it the one place the pins have to be moved.
		this.origCreateFeatures = view.markerManager.createGeoJSONFeatures;
		view.markerManager.createGeoJSONFeatures = (entries: unknown) => {
			const features = this.origCreateFeatures.call(view.markerManager, entries);
			const system = this.system();
			const moved =
				system === 'wgs84'
					? features
					: features.map((feature) => ({
							...feature,
							geometry: projectGeometry(feature.geometry, system),
						}));
			// Native getBounds() still answers in WGS-84, so keep the moved
			// features around; bounds() reads them instead.
			this.markerFeatures = moved;
			return moved;
		};

		// The view reads `center` out of the base file in WGS-84 and hands it
		// straight to the map. Converting it here, where the config object is
		// born, means initializeMap and updateCenter both agree — patching
		// either one alone makes them fight over the centre.
		this.origLoadConfig = view.loadConfig;
		view.loadConfig = (tileSetId?: string) => {
			const config = this.origLoadConfig.call(view, tileSetId);
			this.projectConfigCenter(config);
			return config;
		};

		// The background switcher rewrites mapConfig.mapTiles in place instead of
		// going back through loadConfig, so under "auto" the system can change
		// without the centre hearing about it. Re-derive it from the value we kept.
		this.origSwitchToTileSet = view.switchToTileSet;
		view.switchToTileSet = async (tileSetId: string) => {
			await this.origSwitchToTileSet.call(view, tileSetId);
			this.projectConfigCenter(view.mapConfig);
		};

		this.origInitializeMap = view.initializeMap;
		view.initializeMap = async () => {
			const fresh = !view.map;
			await this.origInitializeMap.call(view);
			if (fresh && view.map) this.onMapCreated(view.map);
		};

		this.origDestroyMap = view.destroyMap;
		view.destroyMap = () => {
			this.fitControl = null;
			this.interactionsBound = false;
			this.userMoved = false;
			this.data = null;
			this.markerFeatures = null;
			this.origDestroyMap.call(view);
		};

		this.origOnunload = view.onunload;
		view.onunload = () => {
			const restore = this.origOnunload;
			this.detach();
			restore.call(view);
		};

		return this;
	}

	detach(): void {
		if (this.detached) return;
		this.detached = true;
		const view = this.view;

		this.removeLayers();
		if (this.fitControl && view.map) {
			try {
				view.map.removeControl(this.fitControl);
			} catch (e) {
				/* map already gone */
			}
		}
		this.fitControl = null;

		const manager = view.markerManager as unknown as Record<string, unknown>;
		const instance = view as unknown as Record<string, unknown>;
		delete manager.updateMarkers;
		delete manager.createGeoJSONFeatures;
		delete instance.loadConfig;
		delete instance.switchToTileSet;
		delete instance.initializeMap;
		delete instance.destroyMap;
		delete instance.onunload;

		this.plugin.layers.delete(this);
	}

	onMapCreated(map: NonNullable<BasesMapView['map']>): void {
		this.fitControl = new FitControl(() => this.fit(true));
		map.addControl(this.fitControl, 'top-right');

		// A new style is a blank slate: every source and layer is gone. The
		// built-in view puts its markers back, so put the tracks back too rather
		// than riding on its one-shot `styledata` handler.
		map.on('style.load', () => {
			this.sync().catch((e) => console.error('Advanced Maps: could not redraw tracks', e));
		});

		// Once the reader takes the wheel, stop re-framing the map underneath
		// them. Programmatic moves carry no originalEvent, so they do not count.
		const mark = (ev?: { originalEvent?: unknown }) => {
			if (ev && ev.originalEvent) this.userMoved = true;
		};
		for (const name of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) map.on(name, mark);
	}

	/* ---- config ---- */

	private num(key: string, fallback: number, min: number, max: number): number {
		const view = this.view;
		const raw = view.config ? view.config.get(key) : undefined;
		if (raw === undefined || raw === null || raw === '') return fallback;
		return clamp(raw, min, max, fallback);
	}

	/**
	 * Move a config's `center` into tile space, keeping the WGS-84 value it came
	 * from so the same config can be re-converted if the system changes later.
	 */
	private projectConfigCenter(config: MapConfig | undefined): MapConfig | undefined {
		if (!config) return config;
		if (config.__amCenterWgs === undefined) {
			if (!config.center) return config;
			config.__amCenterWgs = config.center;
		}
		try {
			config.center = projectCenter(config.__amCenterWgs, this.system(config));
		} catch (e) {
			console.warn('Advanced Maps: could not convert the configured centre', e);
		}
		return config;
	}

	/**
	 * Which space the tiles are in. The view option wins; blank means "follow
	 * the plugin setting", which is also what an embed's stub config answers.
	 *
	 * `config` is passed in from the loadConfig wrapper, where the map's own
	 * mapConfig has not been assigned yet but the fresh one is in hand.
	 */
	private system(config?: MapConfig): CoordSystem {
		const view = this.view;
		let raw: unknown;
		try {
			raw = view.config ? view.config.get('coordSystem') : undefined;
		} catch (e) {
			/* stub config */
		}
		const mode = knownMode(raw) ?? knownMode(this.plugin.settings.coordSystem) ?? 'auto';
		return resolveSystem(mode, config ?? view.mapConfig);
	}

	private resolve(color: string): string {
		try {
			return this.view.markerManager.resolveColor(color);
		} catch (e) {
			return color;
		}
	}

	/**
	 * Put both layers back through the transform. Markers only move when the
	 * native manager re-mints them, so drive it from there and let the wrapper
	 * chain do the rest.
	 */
	async reproject(): Promise<void> {
		const view = this.view;
		if (this.detached || !view.map) return;
		if (view.data && view.markerManager) await view.markerManager.updateMarkers(view.data);
		else await this.sync();
	}

	/* ---- data ---- */

	/** Build the draw list: every entry in the query that owns a track file. */
	private collect(data: BasesData | undefined): DrawItem[] {
		const entries = data?.data ?? [];
		const items: DrawItem[] = [];
		for (const entry of entries) {
			const file = entry && entry.file;
			if (!file) continue;
			const trackFiles = this.plugin.resolveTracks(file);
			if (trackFiles.length === 0) continue;
			items.push({ entry, file, trackFiles, color: this.colorFor(entry) });
		}
		return items;
	}

	/** A track belongs to its note, so it is drawn in that note's marker colour. */
	private colorFor(entry: BasesEntry): string {
		let raw: string | null | undefined = null;
		try {
			raw = this.view.markerManager.getCustomColor(entry, this.view.mapConfig);
		} catch (e) {
			/* no colour property configured */
		}
		// MapLibre paint properties want a real colour, not `var(--x)`.
		return this.resolve(raw || this.plugin.settings.trackColor);
	}

	private build(items: DrawItem[]): FeatureCollection<Geometry, { amColor: string; amIndex: number }> {
		const system = this.system();
		const features: TrackFeature[] = [];
		items.forEach((item, index) => {
			for (const trackFile of item.trackFiles) {
				const rec = this.plugin.tracks.get(trackFile.path);
				if (!rec || rec.error) continue;
				for (const feature of projectedFeatures(rec, system)) {
					features.push({
						type: 'Feature',
						geometry: feature.geometry,
						properties: { amColor: item.color, amIndex: index },
					});
				}
			}
		});
		return { type: 'FeatureCollection', features };
	}

	async sync(data?: BasesData): Promise<void> {
		const view = this.view;
		if (this.detached || !view.map) return;

		const items = this.collect(data ?? view.data);

		const pending: TFile[] = [];
		for (const item of items) {
			for (const trackFile of item.trackFiles) {
				if (!this.plugin.tracks.isFresh(trackFile) && !pending.includes(trackFile)) pending.push(trackFile);
			}
		}
		if (pending.length > 0) await Promise.all(pending.map((f) => this.plugin.tracks.load(f)));
		if (this.detached || !view.map) return;

		await styleReady(view.map);
		if (this.detached || !view.map) return;

		const map = view.map;
		this.items = items;
		this.data = this.build(items);

		try {
			const source = map.getSource(SRC);
			if (source) {
				source.setData(this.data);
			} else {
				map.addSource(SRC, { type: 'geojson', data: this.data });
				this.addLayers();
			}
		} catch (e) {
			// The style was swapped out from under us; style.load will retry.
			console.warn('Advanced Maps: deferring track layers —', e instanceof Error ? e.message : e);
			return;
		}
		this.applyPaint();
		this.bindInteractions();
		this.fit(false);
	}

	private addLayers(): void {
		const map = this.view.map;
		if (!map) return;
		// Anchor below the markers so a pin sitting on its own track stays on top.
		const before = map.getLayer(MARKER_LAYER) ? MARKER_LAYER : undefined;
		map.addLayer(lineLayerSpec(LINE_LAYER, SRC), before);
		map.addLayer(pointLayerSpec(POINT_LAYER, SRC), before);
	}

	private removeLayers(): void {
		const map = this.view.map;
		if (!map || !map.getStyle) return;
		try {
			for (const id of [LINE_LAYER, POINT_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
			if (map.getSource(SRC)) map.removeSource(SRC);
		} catch (e) {
			/* style already torn down */
		}
	}

	private applyPaint(): void {
		const map = this.view.map;
		if (!map) return;
		const weight = this.num('trackWeight', this.plugin.settings.trackWeight, 1, 24);
		const opacity = this.num('trackOpacity', this.plugin.settings.trackOpacity, 0, 100) / 100;
		if (map.getLayer(LINE_LAYER)) {
			map.setPaintProperty(LINE_LAYER, 'line-width', weight);
			map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
		}
		if (map.getLayer(POINT_LAYER)) {
			map.setPaintProperty(POINT_LAYER, 'circle-radius', Math.max(3, Math.round(weight * 1.1)));
			map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', this.resolve('var(--background-primary)'));
			map.setPaintProperty(POINT_LAYER, 'circle-opacity', opacity);
		}
	}

	/* ---- interaction ---- */

	private bindInteractions(): void {
		if (this.interactionsBound) return;
		const map = this.view.map;
		if (!map) return;
		this.interactionsBound = true;
		for (const layer of [LINE_LAYER, POINT_LAYER]) {
			map.on('click', layer, (ev: MapMouseEvent) => this.open(ev));
			map.on('mousemove', layer, (ev: MapMouseEvent) => this.hover(ev));
			map.on('mouseenter', layer, () => map.getCanvas().addClass('is-over-marker'));
			map.on('mouseleave', layer, () => {
				map.getCanvas().removeClass('is-over-marker');
				this.view.popupManager.hidePopup();
			});
		}
	}

	private itemFrom(ev: MapMouseEvent | undefined): DrawItem | null {
		const feature = ev && ev.features && ev.features[0];
		const index = feature && feature.properties ? feature.properties.amIndex : null;
		return typeof index === 'number' ? (this.items[index] ?? null) : null;
	}

	private open(ev: MapMouseEvent): void {
		const item = this.itemFrom(ev);
		if (!item) return;
		const mod = ev.originalEvent ? Keymap.isModEvent(ev.originalEvent) : false;
		this.view.app.workspace.openLinkText(item.file.path, '', mod);
	}

	/** Reuse the built-in popup, so a track hover reads like its marker hover. */
	private hover(ev: MapMouseEvent): void {
		const item = this.itemFrom(ev);
		const view = this.view;
		if (!item || !view.data || !view.data.properties || !view.mapConfig || !view.config) return;
		const config = view.config;
		view.popupManager.showPopup(
			item.entry,
			[ev.lngLat.lat, ev.lngLat.lng],
			view.data.properties,
			view.markerManager.getMarkerDrivenProps(view.mapConfig),
			(prop) => config.getDisplayName(prop)
		);
	}

	/* ---- framing ---- */

	/**
	 * The built-in view frames the markers once, on load. Tracks arrive later and
	 * usually reach further, so re-frame around both — unless the view pins a
	 * centre or zoom, or the reader has already moved the map themselves.
	 */
	fit(force: boolean): void {
		const view = this.view;
		const map = view.map;
		if (!map) return;
		if (!force) {
			if (this.userMoved) return;
			if (view.pendingMapState) return;
			if (view.mapConfig && view.mapConfig.center) return;
			if (typeof view.hasConfiguredZoom === 'function' && view.hasConfiguredZoom()) return;
		}
		const bounds = this.bounds();
		if (!bounds) return;
		map.fitBounds(bounds, {
			padding: 24,
			maxZoom: this.num('fitMaxZoom', this.plugin.settings.fitMaxZoom, 1, 22),
			animate: false,
		});
	}

	private bounds(): LngLatBounds | null {
		const map = this.view.map;
		if (!map) return null;
		const LngLatBoundsCtor = map.getBounds().constructor as new () => LngLatBounds;
		const bounds = new LngLatBoundsCtor();
		let points = 0;

		// Native getBounds() is computed from the untouched WGS-84 entries, so
		// once the pins have been moved it frames the wrong place. Use the
		// features actually on the map whenever we have them.
		if (this.markerFeatures) {
			for (const feature of this.markerFeatures) points += extendBounds(bounds, feature.geometry);
		} else {
			const markers = this.view.markerManager.getBounds();
			if (markers && !markers.isEmpty()) {
				bounds.extend(markers);
				points++;
			}
		}
		for (const feature of this.data?.features ?? []) {
			points += extendBounds(bounds, feature.geometry);
		}
		return points > 0 && !bounds.isEmpty() ? bounds : null;
	}
}
