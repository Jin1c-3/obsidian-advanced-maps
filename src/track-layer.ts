/*
 * TrackLayer — everything this plugin adds to one native map view.
 */

import { Keymap } from 'obsidian';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { TFile } from 'obsidian';
import { LINE_LAYER, MARKER_LAYER, POINT_LAYER, SRC } from './constants';
import {
	knownMode,
	projectCenter,
	projectGeometry,
	resolveSystem,
	toTileSpace,
	toWgs84,
	type CoordSystem,
} from './coords';
import { clamp, emptyBounds, extendBounds, styleReady } from './geometry';
import {
	addTrackLayers,
	applyTrackPaint,
	FitControl,
	guardLocateControl,
	removeTrackLayers,
	type LocateGuard,
} from './layers';
import { projectedFeatures } from './track-cache';
import type AdvancedMapsPlugin from './main';
import type {
	BasesData,
	BasesEntry,
	BasesMapView,
	LngLat,
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

/**
 * Replace one method on an *instance*; the returned function puts it back.
 *
 * An own property shadows the prototype, so the wrapper dies with the object
 * and `delete` restores the untouched method. Where the native code assigned
 * the method as an own property itself, the saved value goes back instead.
 */
function override<T extends object, K extends keyof T>(obj: T, key: K, make: (orig: T[K]) => T[K]): () => void {
	const orig = obj[key];
	const hadOwn = Object.prototype.hasOwnProperty.call(obj, key);
	obj[key] = make(orig);
	return () => {
		if (hadOwn) obj[key] = orig;
		else delete (obj as unknown as Record<string, unknown>)[key as string];
	};
}

export class TrackLayer {
	private items: DrawItem[] = [];
	private data: FeatureCollection<Geometry, { amColor: string; amIndex: number }> | null = null;
	private userMoved = false;
	private interactionsBound = false;
	private detached = false;
	private fitControl: FitControl | null = null;
	private markerFeatures: MarkerFeature[] | null = null;
	/** How to put back every method wrapped for the life of this layer. */
	private readonly restorers: Array<() => void> = [];
	/** Reached past the wrapper by `hover()`, which already holds tile-space coordinates. */
	private origShowPopup: BasesMapView['popupManager']['showPopup'] | null = null;
	private locate: LocateGuard | null = null;
	/** Which space the map is currently drawn in, so a change to it can be noticed. */
	private appliedSystem: CoordSystem | null = null;

	constructor(
		private readonly plugin: AdvancedMapsPlugin,
		private readonly view: BasesMapView
	) {}

	private wrap<T extends object, K extends keyof T>(obj: T, key: K, make: (orig: T[K]) => T[K]): void {
		this.restorers.push(override(obj, key, make));
	}

	/**
	 * markerManager.updateMarkers is the useful seam. The native view calls it
	 * after the map exists and after every data change, *and* re-calls it on
	 * `styledata` once a new style has wiped every source — which is exactly the
	 * set of moments the tracks need redrawing too.
	 */
	attach(): this {
		const view = this.view;
		const manager = view.markerManager;
		const popups = view.popupManager;

		this.wrap(manager, 'updateMarkers', (orig) => async (data?: BasesData) => {
			await orig.call(manager, data);
			try {
				await this.sync(data);
			} catch (e) {
				console.error('Advanced Maps: could not draw tracks', e);
			}
		});

		// Every marker coordinate that reaches the map is minted here — the
		// native method does nothing but turn parsed entries into Point
		// features — which makes it the one place the pins have to be moved.
		this.wrap(manager, 'createGeoJSONFeatures', (orig) => (entries: unknown) => {
			const features = orig.call(manager, entries);
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
		});

		// A marker's popup is anchored at the note's own value rather than at the
		// feature that was drawn — the native manager keeps what the property
		// said — so on Chinese tiles it opens a few streets from its own pin.
		this.wrap(popups, 'showPopup', (orig) => {
			this.origShowPopup = orig;
			return (entry, latLng, properties, markerProps, displayName) => {
				const [lng, lat] = toTileSpace(this.system(), latLng[1], latLng[0]);
				orig.call(popups, entry, [lat, lng], properties, markerProps, displayName);
			};
		});

		// The view reads `center` out of the base file in WGS-84 and hands it
		// straight to the map. Converting it here, where the config object is
		// born, means initializeMap and updateCenter both agree — patching
		// either one alone makes them fight over the centre.
		this.wrap(view, 'loadConfig', (orig) => (tileSetId?: string) => {
			const config = orig.call(view, tileSetId);
			this.projectConfigCenter(config);
			return config;
		});

		// The background switcher rewrites mapConfig.mapTiles in place instead of
		// going back through loadConfig, so under "auto" the system can change
		// without the centre hearing about it. Re-derive it from the value we kept.
		this.wrap(view, 'switchToTileSet', (orig) => async (tileSetId: string) => {
			await orig.call(view, tileSetId);
			this.projectConfigCenter(view.mapConfig);
			this.realignCamera();
			this.locate?.replaceDot();
		});

		// The map's own right-click menu turns the click into a coordinate with
		// map.unproject(), which answers in tile space. "New note" writes that
		// into the note it creates, "Copy coordinates" hands it over as a real
		// place, and "Set default center point" stores it in the base file for
		// loadConfig to shift a second time. Rather than rebuild the menu, undo
		// the shift on what unproject answers for the length of the call — every
		// item reads its coordinate off it, synchronously, before the menu opens.
		if (typeof view.showMapContextMenu === 'function') {
			this.wrap(view, 'showMapContextMenu', (orig) => (ev: MouseEvent) => {
				const map = view.map;
				const system = this.system();
				if (!map || system === 'wgs84' || typeof map.unproject !== 'function') {
					orig.call(view, ev);
					return;
				}
				const restore = override(map, 'unproject', (native) => (point) => {
					const lngLat = native.call(map, point);
					const [lng, lat] = toWgs84(system, lngLat.lng, lngLat.lat);
					const LngLatCtor = lngLat.constructor as new (lng: number, lat: number) => LngLat;
					return new LngLatCtor(lng, lat);
				});
				try {
					orig.call(view, ev);
				} finally {
					restore();
				}
			});
		}

		this.wrap(view, 'initializeMap', (orig) => async () => {
			const fresh = !view.map;
			await orig.call(view);
			if (fresh && view.map) this.onMapCreated(view.map);
		});

		this.wrap(view, 'destroyMap', (orig) => () => {
			this.fitControl = null;
			this.interactionsBound = false;
			this.userMoved = false;
			this.data = null;
			this.markerFeatures = null;
			this.appliedSystem = null;
			this.locate?.restore();
			this.locate = null;
			orig.call(view);
		});

		this.wrap(view, 'onunload', (orig) => () => {
			this.detach();
			orig.call(view);
		});

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

		for (const restore of this.restorers.splice(0)) restore();
		this.origShowPopup = null;
		this.locate?.restore();
		this.locate = null;

		this.plugin.layers.delete(this);
	}

	onMapCreated(map: NonNullable<BasesMapView['map']>): void {
		this.fitControl = new FitControl(() => this.fit(true));
		map.addControl(this.fitControl, 'top-right');
		this.locate ??= guardLocateControl(map, () => this.system());
		this.appliedSystem = this.system();

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

	/**
	 * Keep the camera pointed at the same real place when the space beneath it
	 * changes. The map's centre is in tile space like everything else it holds,
	 * so a switch from Amap to OpenStreetMap leaves it looking a few streets from
	 * where the reader left it — and a view that pins a `center` never gets
	 * re-framed by `fit()`, which stands down for exactly that case.
	 */
	private realignCamera(): void {
		const map = this.view.map;
		const system = this.system();
		const previous = this.appliedSystem;
		this.appliedSystem = system;
		if (!map || previous === null || previous === system || typeof map.setCenter !== 'function') return;
		const centre = map.getCenter();
		if (!centre) return;
		const [lng, lat] = toWgs84(previous, centre.lng, centre.lat);
		const [tileLng, tileLat] = toTileSpace(system, lng, lat);
		map.setCenter({ lng: tileLng, lat: tileLat });
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
	 *
	 * The shifted value is kept beside it, which is how a write from anywhere
	 * else is recognised: "Set default center point" assigns `center` straight
	 * onto the live config, and that value is WGS-84, not ours to re-derive from.
	 */
	private projectConfigCenter(config: MapConfig | undefined): MapConfig | undefined {
		if (!config) return config;
		if (config.__amCenterWgs === undefined || config.center !== config.__amCenterOut) {
			if (!config.center) return config;
			config.__amCenterWgs = config.center;
		}
		try {
			config.center = config.__amCenterOut = projectCenter(config.__amCenterWgs, this.system(config));
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
		this.projectConfigCenter(view.mapConfig);
		this.realignCamera();
		this.locate?.replaceDot();
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
				// Anchor below the markers so a pin sitting on its own track stays on top.
				addTrackLayers(map, map.getLayer(MARKER_LAYER) ? MARKER_LAYER : undefined);
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

	private removeLayers(): void {
		if (this.view.map) removeTrackLayers(this.view.map);
	}

	private applyPaint(): void {
		const map = this.view.map;
		if (!map) return;
		applyTrackPaint(
			map,
			this.num('trackWeight', this.plugin.settings.trackWeight, 1, 24),
			this.num('trackOpacity', this.plugin.settings.trackOpacity, 0, 100) / 100,
			this.resolve('var(--background-primary)')
		);
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
		// Under the cursor is where this one belongs, and the cursor is already in
		// tile space — so go straight to the native method, past the wrapper that
		// exists to move the pins' own WGS-84 anchors.
		const show = this.origShowPopup ?? view.popupManager.showPopup;
		show.call(
			view.popupManager,
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
		const bounds = emptyBounds(map);
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
