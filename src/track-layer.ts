/*
 * TrackLayer — everything this plugin adds to one native map view.
 */

import { Keymap, Menu } from 'obsidian';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { PaneType, TFile } from 'obsidian';
import {
	ARROW_LAYER,
	ENDPOINT_LAYER,
	LINE_LAYER,
	MARKER_LAYER,
	PHOTO_DOT_LAYER,
	PHOTO_LAYER,
	POINT_LAYER,
	SPREAD,
	SRC,
	type TrackKnob,
} from './constants';
import {
	knownMode,
	projectCenter,
	projectGeometry,
	resolveSystem,
	toTileSpace,
	toWgs84,
	type CoordSystem,
} from './coords';
import { boundsOf, styleReady, trackFeatures, trackKnob, type TrackFeatureProps } from './geometry';
import { getLocale, t } from './i18n';
import { MapEventBindings } from './map-events';
import {
	applyTrackPaint,
	cancelPhotoImages,
	disposePhotoImages,
	drawTracks,
	ensurePhotoImages,
	fitTo,
	FitControl,
	FollowControl,
	guardLocateControl,
	photoIconSource,
	removeTrackLayers,
	type LocateGuard,
	type PhotoIconSource,
} from './layers';
import { customMapLabel, customMapUrl, customMaps, enabledBuiltins, externalMapUrl, resolveBuiltins } from './maplinks';
import { PhotoModal } from './photo-modal';
import {
	iconOffsetExpression,
	markerIconScale,
	spreadFactor,
	spreadPins,
	type SpreadPin,
	type SpreadPlan,
} from './spread';
import { projectedFeatures } from './track-cache';
import type AdvancedMapsPlugin from './main';
import type {
	BasesData,
	BasesEntry,
	BasesMapView,
	LngLat,
	LngLatBounds,
	MapLibreMap,
	MapConfig,
	MapMarker,
	MapMouseEvent,
	MarkerFeature,
} from './types/obsidian-internals';

interface DrawItem {
	entry: BasesEntry;
	file: TFile;
	trackFiles: TFile[];
	color: string;
}

/** A requested camera target in vault (WGS-84) space. */
export interface FocusTarget {
	lat: number;
	lng: number;
	/** Left out to keep the zoom the reader chose, which is what following wants. */
	zoom?: number;
	/** A move across a map already on screen is worth watching; a map just built is not. */
	animate?: boolean;
	/** Whose popup to open on arrival, when that note is one of this view's own rows. */
	file?: TFile;
	/** Restore editor focus after a programmatic follow popup. */
	keepFocus?: boolean;
}

type TrackFeature = Feature<Geometry, TrackFeatureProps>;
type CameraProvenance = CoordSystem | 'current' | 'adopted';

function recordedCameraSystem(map: MapLibreMap): CoordSystem | null {
	const value = map.__advancedMapsCameraSystem;
	return value === 'wgs84' || value === 'gcj02' || value === 'bd09' ? value : null;
}

/** Probe the undeclared `setSubmenu` on a throwaway menu so the real menu stays untouched. */
let nestedMenus: boolean | null = null;
function canNestMenus(): boolean {
	if (nestedMenus === null) {
		nestedMenus = false;
		try {
			new Menu().addItem((item) => {
				nestedMenus = typeof item.setSubmenu === 'function';
			});
		} catch {
			/* flat items work everywhere; that is the fallback */
		}
	}
	return nestedMenus;
}

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
	/** The thumbnail candidates the last sync built — camera-independent, so
	 *  `moveend` re-selects from these rather than rebuilding them. */
	private photoIcons: PhotoIconSource[] = [];
	private data: FeatureCollection<Geometry, TrackFeatureProps> | null = null;
	private userMoved = false;
	private interactionsBound = false;
	private detached = false;
	private fitControl: FitControl | null = null;
	private followControl: FollowControl | null = null;
	/** Per-open-map follow state; the setting supplies only its initial value. */
	private following: boolean;
	private markerFeatures: MarkerFeature[] | null = null;
	/** Which pins share a spot with another, and where each of them was sent. */
	private spread: SpreadPlan | null = null;
	/** The `icon-offset` currently on the native marker layer, as its own JSON, so
	 *  an unchanged fan costs no re-parse. Null when nothing has been set. */
	private spreadApplied: string | null = null;
	/** How to put back every method wrapped for the life of this layer. */
	private readonly restorers: Array<() => void> = [];
	/** Every listener put directly on a MapLibre map, paired with its exact `off`. */
	private readonly mapEvents = new MapEventBindings();
	/** Reached past the wrapper by `hover()`, which already holds tile-space coordinates. */
	private origShowPopup: BasesMapView['popupManager']['showPopup'] | null = null;
	private locate: LocateGuard | null = null;
	/** Which space the map is currently drawn in, so a change to it can be noticed. */
	private appliedSystem: CoordSystem | null = null;
	/** The signature of what is currently on the map; null once nothing is. */
	private drawn: string | null = null;
	/** Monotonic data operation. Only the newest sync may commit to the map. */
	private syncRevision = 0;
	/** Where to point the camera, held until there is a camera to point. */
	private pendingFocus: FocusTarget | null = null;
	/** …and where it was pointed, held for as long as this map lives. */
	private held: FocusTarget | null = null;
	/** …and whose popup to open, held until the row it belongs to arrives. */
	private pendingPopup: FocusTarget | null = null;
	/** The last DOM event `open()` acted on — see there for why one click can
	 *  arrive twice. */
	private handledClick: MouseEvent | null = null;
	/** The sole MapLibre instance this layer has initialized; reset on native destruction. */
	private createdMap: MapLibreMap | null = null;
	/** True only until the pre-wrapper native map, if any, is adopted once. */
	private adoptingInitialMap: boolean;
	/** Adoption can observe native style loading without taking ownership of it. */
	private adoptionWatcher: number | null = null;

	constructor(
		private readonly plugin: AdvancedMapsPlugin,
		/** Public so the plugin can find the layer that draws inside a given element. */
		readonly view: BasesMapView,
		/** An adopted native map's pre-existing camera is always vault/WGS-84 space. */
		adopted = false
	) {
		this.adoptingInitialMap = adopted;
		// Read once, here, rather than consulted on every `file-open`: the setting
		// is the state a *new* map starts in, so changing it must not reach across
		// and re-arm a map whose button the reader has since pressed.
		this.following = plugin.settings.followActiveNote;
	}

	/** Whether this map is one of the ones that follows. Read by the plugin's `file-open`. */
	isFollowing(): boolean {
		return this.following;
	}

	/** Turning on follows immediately; turning off releases the target that suppresses auto-fit. */
	private toggleFollow(): void {
		this.following = !this.following;
		this.followControl?.setActive(this.following);
		if (this.following) this.plugin.followNow(this);
		else this.held = null;
	}

	private wrap<T extends object, K extends keyof T>(obj: T, key: K, make: (orig: T[K]) => T[K]): void {
		this.restorers.push(override(obj, key, make));
	}

	/** Native marker updates are the shared seam for pin spreading and track synchronization. */
	attach(): this {
		const view = this.view;
		const manager = view.markerManager;
		const popups = view.popupManager;
		// What `enhance()` reads to tell an already-wrapped view from a fresh one.
		view.__advancedMapsLayer = true;

		this.wrap(manager, 'updateMarkers', (orig) => async (data?: BasesData) => {
			await orig.call(manager, data);
			// After the native call, because that is what creates the marker layer
			// the fan is drawn on — and before the tracks, because it depends on
			// none of them.
			this.applySpread();
			try {
				await this.sync(data);
			} catch (e) {
				console.error('Advanced Maps: could not draw tracks', e);
			}
		});

		// Every marker coordinate that reaches the map is minted here — the
		// native method does nothing but turn parsed entries into Point
		// features — which makes it the one place the pins have to be moved.
		this.wrap(manager, 'createGeoJSONFeatures', (orig) => (markers: MapMarker[]) => {
			const features = orig.call(manager, markers);
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
			return this.fanOut(markers, moved);
		});

		// Preserve the native callback except when following supplies another pane.
		this.wrap(manager, 'onOpenFile', (orig) => (path: string, newLeaf: boolean) => {
			this.openNote(path, newLeaf, () => orig.call(manager, path, newLeaf));
		});

		// Native popups receive vault coordinates, so project their anchor once here.
		this.wrap(popups, 'showPopup', (orig) => {
			this.origShowPopup = orig;
			return (entry, latLng, properties, markerProps, displayName) => {
				const [lng, lat] = this.fanned(entry, ...toTileSpace(this.system(), latLng[1], latLng[0]));
				orig.call(popups, entry, [lat, lng], properties, markerProps, displayName);
			};
		});

		// Project the configured centre where the shared config object is created.
		this.wrap(view, 'loadConfig', (orig) => (tileSetId?: string) => {
			const config = orig.call(view, tileSetId);
			this.projectConfigCenter(config);
			return config;
		});

		// `switchToTileSet` mutates the live config without calling `loadConfig` again.
		this.wrap(view, 'switchToTileSet', (orig) => async (tileSetId: string) => {
			await orig.call(view, tileSetId);
			this.projectConfigCenter(view.mapConfig);
			this.realignCamera();
			this.locate?.replaceDot();
		});

		// Native menu actions read `unproject()` synchronously; expose WGS-84 only for that call.
		if (typeof view.showMapContextMenu === 'function') {
			this.wrap(view, 'showMapContextMenu', (orig) => (ev: MouseEvent) => {
				const map = view.map;
				const system = this.system();
				if (!map || system === 'wgs84' || typeof map.unproject !== 'function') {
					orig.call(view, ev);
					// External items always normalize independently; WGS-84 is a no-op.
					if (map) this.addExternalMapItems(ev, map, system);
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
				// External items read native tile space after the temporary wrapper is restored.
				this.addExternalMapItems(ev, map, system);
			});
		}

		this.wrap(view, 'initializeMap', (orig) => async () => {
			await orig.call(view);
			const map = view.map;
			// Native initialization can finish after detach or after the host replaces
			// its map. Neither case authorizes plugin work against that instance.
			if (this.detached || !map || view.map !== map) return;
			const initialSystem = this.adoptingInitialMap ? 'adopted' : 'current';
			if (this.onMapCreated(map, initialSystem) && !this.detached && view.map === map) {
				this.reproject().catch((e) => console.error('Advanced Maps: could not draw tracks', e));
			}
		});

		this.wrap(view, 'destroyMap', (orig) => () => {
			this.syncRevision++;
			this.stopAdoptionWatcher();
			this.createdMap = null;
			this.adoptingInitialMap = false;
			if (view.map) cancelPhotoImages(view.map);
			// MapLibre listeners belong to the map, not to the wrapped view methods.
			// Remove them before the native view tears the map down; on recreation,
			// onMapCreated() registers one fresh set against the new instance.
			this.mapEvents.clear();
			this.fitControl = null;
			this.followControl = null;
			this.interactionsBound = false;
			this.handledClick = null;
			this.userMoved = false;
			this.data = null;
			this.photoIcons = [];
			this.drawn = null;
			this.markerFeatures = null;
			this.spread = null;
			// The layer this was set on goes with the map, so there is nothing to
			// put back — only the memory of having set it.
			this.spreadApplied = null;
			this.appliedSystem = null;
			this.pendingFocus = null;
			this.pendingPopup = null;
			this.held = null;
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

	/** Append to the event-keyed native menu, falling back to flat items without `setSubmenu`. */
	private addExternalMapItems(ev: MouseEvent, map: NonNullable<BasesMapView['map']>, system: CoordSystem): void {
		if (typeof map.unproject !== 'function') return;
		let lngLat: LngLat;
		try {
			// The same pixel showMapContextMenu itself reads the click from.
			lngLat = map.unproject([ev.offsetX, ev.offsetY]);
		} catch {
			return;
		}
		// `unproject` is native tile space here; normalize exactly once before provider conversion.
		const [lng, lat] = toWgs84(system, lngLat.lng, lngLat.lat);

		const items = this.externalMapItems(lat, lng);
		if (items.length === 0) return;
		const menu = Menu.forEvent(ev);
		const open = (url: string) => window.open(url, '_blank');

		if (canNestMenus()) {
			menu.addItem((item) => {
				item.setTitle(t('menu.openExternal')).setIcon('external-link').setSection('external-map');
				const submenu = item.setSubmenu();
				for (const entry of items) {
					submenu.addItem((child) => child.setTitle(entry.title).onClick(() => open(entry.url)));
				}
			});
			return;
		}

		for (const entry of items) {
			menu.addItem((item) =>
				item
					.setTitle(`${t('menu.openExternal')}: ${entry.title}`)
					.setIcon('external-link')
					.setSection('external-map')
					.onClick(() => open(entry.url))
			);
		}
	}

	/** Enabled built-ins in stored order, followed by custom entries that validate. */
	private externalMapItems(lat: number, lng: number): Array<{ title: string; url: string }> {
		const settings = this.plugin.settings;
		const items = enabledBuiltins(resolveBuiltins(settings.externalMaps, getLocale())).map((provider) => ({
			title: t(`link.provider.${provider}`),
			url: externalMapUrl(provider, lat, lng),
		}));
		for (const entry of customMaps(settings.customMaps)) {
			const url = customMapUrl(entry, lat, lng);
			if (url !== null) items.push({ title: customMapLabel(entry), url });
		}
		return items;
	}

	detach(): void {
		if (this.detached) return;
		this.detached = true;
		this.syncRevision++;
		const view = this.view;

		// A native Bases map can stay alive while this plugin instance goes away.
		// Layer-scoped MapLibre listeners survive removeLayer(), so remove them
		// before a later plugin instance recreates the same layer ids. Async photo
		// decodes need their own cancellation because the map remains alive.
		this.mapEvents.clear();
		const map = view.map;
		if (map) cancelPhotoImages(map);
		this.removeLayers();
		// Photo thumbnails are intentionally retained by ordinary refreshes. On
		// terminal detach, remove them only after every referencing layer is gone.
		if (map) disposePhotoImages(map);
		// A native layer, so this one is handed back rather than removed.
		this.restoreSpread();
		this.spread = null;
		for (const control of [this.fitControl, this.followControl]) {
			if (!control || !view.map) continue;
			try {
				view.map.removeControl(control);
			} catch {
				/* map already gone */
			}
		}
		this.fitControl = null;
		this.followControl = null;

		for (const restore of this.restorers.splice(0)) restore();
		delete view.__advancedMapsLayer;
		this.origShowPopup = null;
		this.locate?.restore();
		this.locate = null;
		this.interactionsBound = false;
		this.handledClick = null;
		this.pendingFocus = null;
		this.pendingPopup = null;
		this.held = null;
		this.stopAdoptionWatcher();
		this.createdMap = null;

		this.plugin.layers.delete(this);
	}

	/** Complete layer setup once per map, with explicit camera provenance. */
	onMapCreated(map: NonNullable<BasesMapView['map']>, initialSystem: CameraProvenance): boolean {
		if (this.detached || this.createdMap === map) return false;
		this.stopAdoptionWatcher();
		this.createdMap = map;
		this.adoptingInitialMap = false;
		this.fitControl = new FitControl(() => this.fit(true));
		map.addControl(this.fitControl, 'top-right');
		this.followControl = new FollowControl(() => this.toggleFollow());
		map.addControl(this.followControl, 'top-right');
		// `addControl` calls `onAdd` synchronously, so the button exists by now and
		// can be told which way it is pointing.
		this.followControl.setActive(this.following);
		this.locate ??= guardLocateControl(map, () => this.system());
		this.appliedSystem =
			initialSystem === 'current'
				? this.system()
				: initialSystem === 'adopted'
					? (recordedCameraSystem(map) ?? 'wgs84')
					: initialSystem;
		this.realignCamera();

		// A new style is a blank slate: every source and layer is gone. The
		// built-in view puts its markers back, so put the tracks back too rather
		// than riding on its one-shot `styledata` handler.
		this.mapEvents.on(map, 'style.load', () => {
			// The native marker layer is one of the things wiped, and it comes back
			// carrying its own default offset — so forget what was applied to the
			// old one, or `applySpread` will decide the fan is already up. It is
			// re-applied by the `updateMarkers` the native view runs to put its own
			// markers back.
			this.spreadApplied = null;
			this.sync().catch((e) => console.error('Advanced Maps: could not redraw tracks', e));
		});

		// The native load handler may frame after one-shot pending state is consumed;
		// this later handler restores a held target unless the user moved the map.
		this.mapEvents.on(map, 'load', () => {
			if (this.held && !this.userMoved) this.aim(this.held, false);
		});

		// Once the reader takes the wheel, stop re-framing the map underneath
		// them. Programmatic moves carry no originalEvent, so they do not count.
		const mark = (ev?: { originalEvent?: unknown }) => {
			if (ev && ev.originalEvent) this.userMoved = true;
		};
		for (const name of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) {
			this.mapEvents.on(map, name, mark);
		}
		// Fit, pan and zoom all end here. Re-run the screen-space collision pass;
		// dots remain for every photo that has no room for a thumbnail.
		this.mapEvents.on(map, 'moveend', () => this.reselectPhotoIcons());

		// A focus request may arrive before the native view constructs its map.
		const pending = this.pendingFocus;
		if (pending) {
			this.pendingFocus = null;
			this.focus(pending);
		}
		return true;
	}

	/** Wait sparingly for an already-open view's original native initialization. */
	watchAdoptedMap(): void {
		if (!this.adoptingInitialMap || this.detached || this.view.map || this.adoptionWatcher !== null) return;
		this.adoptionWatcher = window.setInterval(() => {
			const map = this.view.map;
			if (this.detached) {
				this.stopAdoptionWatcher();
				return;
			}
			if (!map) return;
			if (this.onMapCreated(map, 'adopted') && !this.detached && this.view.map === map) {
				this.reproject().catch((e) => console.error('Advanced Maps: could not draw tracks', e));
			}
		}, 250);
	}

	private stopAdoptionWatcher(): void {
		if (this.adoptionWatcher === null) return;
		window.clearInterval(this.adoptionWatcher);
		this.adoptionWatcher = null;
	}

	/* ---- pointing the camera ---- */

	/** Aim at a WGS-84 target and hold it against automatic framing and late native load framing. */
	focus(target: FocusTarget): void {
		if (this.detached) return;
		// No map yet, and no `mapConfig` either — so there is nothing to convert
		// against. Hold the WGS-84 target and let onMapCreated ask again.
		if (!this.view.map) {
			this.pendingFocus = target;
			return;
		}
		this.held = target;
		this.restoreFocus(target, () => {
			this.aim(target, target.animate === true);
			this.pendingPopup = this.showNotePopup(target) ? null : target;
		});
	}

	/** Restore the editor only for programmatic follows; native hover popups retain normal focus behavior. */
	private restoreFocus(target: FocusTarget, run: () => void): void {
		const doc = this.view.containerEl?.doc ?? activeDocument;
		const before = target.keepFocus ? doc.activeElement : null;
		run();
		// `focus()` on the element that already has it is a no-op, but asking is
		// cheaper than the scroll a redundant one can cause in a long note.
		if (before instanceof HTMLElement && doc.activeElement !== before) before.focus();
	}

	/** The camera move itself, which is also what a later re-frame is undone with. */
	private aim(target: FocusTarget, animate: boolean): void {
		const view = this.view;
		const map = view.map;
		if (!map) return;
		const [lng, lat] = toTileSpace(this.system(), target.lng, target.lat);
		view.setEphemeralState?.({ center: { lng, lat }, zoom: target.zoom });
		const move = { center: [lng, lat] as [number, number], zoom: target.zoom };
		if (animate && typeof map.flyTo === 'function') map.flyTo(move);
		else if (typeof map.jumpTo === 'function') map.jumpTo(move);
		else map.setCenter({ lng, lat });
	}

	/** Show a popup only for a row in this view; false asks the next data sync to retry once. */
	private showNotePopup(target: FocusTarget): boolean {
		const file = target.file;
		if (!file) return true;
		const view = this.view;
		if (!view.data || !view.data.properties || !view.mapConfig || !view.config) return false;
		const entry = view.data.data.find((row) => row.file === file);
		if (!entry) return false;
		const config = view.config;
		// The note's own WGS-84 value. The wrapper on showPopup is what moves a
		// popup into tile space; handing it a converted one moves it twice.
		view.popupManager.showPopup(
			entry,
			[target.lat, target.lng],
			view.data.properties,
			view.markerManager.getMarkerDrivenProps(view.mapConfig),
			(prop) => config.getDisplayName(prop)
		);
		return true;
	}

	/** Preserve the real-world camera centre across tile-datum changes. */
	private realignCamera(): void {
		const map = this.view.map;
		const system = this.system();
		const previous = this.appliedSystem;
		if (!map) {
			this.appliedSystem = system;
			return;
		}
		if (previous === null || previous === system || typeof map.setCenter !== 'function') {
			this.appliedSystem = system;
			map.__advancedMapsCameraSystem = system;
			return;
		}
		const centre = map.getCenter();
		if (!centre) return;
		const [lng, lat] = toWgs84(previous, centre.lng, centre.lat);
		const [tileLng, tileLat] = toTileSpace(system, lng, lat);
		map.setCenter({ lng: tileLng, lat: tileLat });
		this.appliedSystem = system;
		map.__advancedMapsCameraSystem = system;
	}

	/* ---- config ---- */

	/**
	 * One track knob: the view's own value when it states one, otherwise the
	 * plugin setting. A blank view option means "follow the plugin", which is why
	 * an empty string falls through rather than clamping to the knob's minimum.
	 */
	private knob(key: TrackKnob): number {
		const view = this.view;
		const raw = view.config ? view.config.get(key) : undefined;
		if (raw === undefined || raw === null || raw === '') return this.plugin.settings[key];
		return trackKnob(key, raw);
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
		} catch {
			/* stub config */
		}
		const mode = knownMode(raw) ?? knownMode(this.plugin.settings.coordSystem) ?? 'auto';
		return resolveSystem(mode, config ?? view.mapConfig);
	}

	private resolve(color: string): string {
		try {
			return this.view.markerManager.resolveColor(color);
		} catch {
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

	/* ---- pins that share a spot ---- */

	/** Stamp stable screen-offset slots without moving coordinates; malformed input disables the whole plan. */
	private fanOut(markers: MapMarker[], features: MarkerFeature[]): MarkerFeature[] {
		this.spread = null;
		if (!this.plugin.settings.spreadMarkers) return features;
		if (!Array.isArray(markers) || markers.length !== features.length) return features;
		const paths: string[] = [];
		const pins: SpreadPin[] = [];
		for (let i = 0; i < features.length; i++) {
			const path = markers[i]?.entry?.file?.path;
			const geometry = features[i]?.geometry;
			if (typeof path !== 'string' || path === '') return features;
			if (!geometry || geometry.type !== 'Point') return features;
			const [lng, lat] = geometry.coordinates;
			paths.push(path);
			pins.push({ key: path, lng, lat });
		}
		const plan = spreadPins(pins);
		if (plan.pins.size === 0) return features;
		this.spread = plan;
		return features.map((feature, i) => {
			const slot = plan.pins.get(paths[i])?.slot;
			if (!slot) return feature;
			return { ...feature, properties: { ...feature.properties, amSlot: slot } };
		});
	}

	/** Apply the slot expression to the native layer once per value; detach restores its offset. */
	private applySpread(): void {
		const map = this.view.map;
		if (!map || typeof map.setLayoutProperty !== 'function') return;
		const table = this.spread?.table ?? [];
		// Never touch a native layer that has nothing to fan and has never been
		// given an expression: a base with no two notes in one place is left
		// exactly as the Maps plugin drew it.
		if (this.spreadApplied === null && table.length < 2) return;
		let offset: unknown;
		try {
			if (!map.getLayer(MARKER_LAYER)) return;
			const scale = markerIconScale(map.getLayoutProperty?.(MARKER_LAYER, 'icon-size'), SPREAD.toZoom);
			offset = iconOffsetExpression(table, scale);
			const applied = JSON.stringify(offset);
			if (applied === this.spreadApplied) return;
			map.setLayoutProperty(MARKER_LAYER, 'icon-offset', offset);
			this.spreadApplied = applied;
		} catch (e) {
			console.warn('Advanced Maps: could not fan out the pins sharing a spot', e);
		}
	}

	/** Put the native layer's own `icon-offset` back. */
	private restoreSpread(): void {
		if (this.spreadApplied === null) return;
		this.spreadApplied = null;
		const map = this.view.map;
		if (!map || typeof map.setLayoutProperty !== 'function') return;
		try {
			if (map.getLayer(MARKER_LAYER)) map.setLayoutProperty(MARKER_LAYER, 'icon-offset', [0, 0]);
		} catch {
			/* map or layer already gone */
		}
	}

	/** Place the popup at the rendered spread pin via MapLibre's own project/unproject pair. */
	private fanned(entry: BasesEntry, lng: number, lat: number): [number, number] {
		const path = entry && entry.file ? entry.file.path : '';
		const slot = path ? this.spread?.pins.get(path) : undefined;
		const map = this.view.map;
		if (!slot || !map) return [lng, lat];
		if (typeof map.project !== 'function' || typeof map.unproject !== 'function') return [lng, lat];
		if (typeof map.getZoom !== 'function') return [lng, lat];
		const factor = spreadFactor(map.getZoom());
		if (factor <= 0) return [lng, lat];
		try {
			const point = map.project([lng, lat]);
			const moved = map.unproject([point.x + slot.offset[0] * factor, point.y + slot.offset[1] * factor]);
			return [moved.lng, moved.lat];
		} catch {
			return [lng, lat];
		}
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
		} catch {
			/* no colour property configured */
		}
		// MapLibre paint properties want a real colour, not `var(--x)`.
		return this.resolve(raw || this.plugin.settings.trackColor);
	}

	private build(items: DrawItem[], system: CoordSystem): FeatureCollection<Geometry, TrackFeatureProps> {
		const features: TrackFeature[] = [];
		items.forEach((item, index) => {
			for (const trackFile of item.trackFiles) {
				const rec = this.plugin.tracks.get(trackFile.path);
				if (!rec || rec.error) continue;
				features.push(...trackFeatures(projectedFeatures(rec, system), item.color, index));
			}
		});
		return { type: 'FeatureCollection', features };
	}

	/** Feature-upload identity; paint/framing stay outside so they still run on every sync. */
	private signature(items: DrawItem[], system: CoordSystem): string {
		const parts: string[] = [system, this.plugin.settings.photoDatum];
		for (const item of items) {
			parts.push(item.color);
			// mtime, so a track edited in place counts as different even though its
			// path has not moved.
			for (const trackFile of item.trackFiles) parts.push(trackFile.path, String(trackFile.stat.mtime));
		}
		// '\0' written as an escape, not as a raw NUL byte in the source: a literal
		// one makes `grep -rn` treat this file as binary and skip it in silence,
		// which reads as "that symbol is not defined anywhere" rather than as a
		// search that never looked. It is still the separator, for the reason it
		// always was — no path or mtime can contain one, so no two different item
		// lists can join to the same string.
		return parts.join('\0');
	}

	async sync(data?: BasesData): Promise<void> {
		const revision = ++this.syncRevision;
		const view = this.view;
		if (this.detached || !view.map) return;

		const items = this.collect(data ?? view.data);

		const pending = new Set<TFile>();
		for (const item of items) {
			for (const trackFile of item.trackFiles) {
				if (!this.plugin.tracks.isFresh(trackFile, this.plugin.settings.photoDatum)) pending.add(trackFile);
			}
		}
		if (pending.size > 0)
			await Promise.all([...pending].map((f) => this.plugin.tracks.load(f, this.plugin.settings.photoDatum)));
		if (revision !== this.syncRevision || this.detached || !view.map) return;

		await styleReady(view.map);
		if (revision !== this.syncRevision || this.detached || !view.map) return;

		const map = view.map;
		// Always adopted, even when the redraw below is skipped: Bases recreates
		// its BasesEntry objects on every update and warns against holding the old
		// ones, and hover() reads an entry straight out of this list.
		this.items = items;

		const system = this.system();
		this.data = this.build(items, system);

		// Skip only expensive worker upload; paint/framing always run, and a style
		// swap forces upload because it removed the source.
		const signature = this.signature(items, system);
		if (signature !== this.drawn || !map.getSource(SRC)) {
			if (!drawTracks(map, this.data)) return;
			this.drawn = signature;
		}

		this.applyPaint();
		this.ensurePhotoIcons(items);
		this.bindInteractions();
		this.fit(false);

		// The rows a focus was waiting for. Cleared whether or not the note turned
		// out to be one of them, so a card cannot open by itself minutes later on
		// a map the reader has since moved somewhere else.
		const waiting = this.pendingPopup;
		this.pendingPopup = null;
		if (waiting) this.restoreFocus(waiting, () => this.showNotePopup(waiting));
	}

	private removeLayers(): void {
		if (this.view.map) removeTrackLayers(this.view.map);
	}

	private applyPaint(): void {
		const map = this.view.map;
		if (!map) return;
		applyTrackPaint(
			map,
			this.knob('trackWeight'),
			this.knob('trackOpacity') / 100,
			this.resolve('var(--background-primary)'),
			this.plugin.settings.trackMarkers,
			this.plugin.settings.photoThumbnails
		);
	}

	/** Rebuild camera-independent candidates per sync; viewport selection stays in `ensurePhotoImages`. */
	private ensurePhotoIcons(items: DrawItem[]): void {
		const system = this.system();
		const records: PhotoIconSource[] = [];
		for (const item of items) {
			for (const trackFile of item.trackFiles) {
				const rec = this.plugin.tracks.get(trackFile.path);
				const icon = rec && photoIconSource(trackFile.path, rec, system);
				if (icon) records.push(icon);
			}
		}
		this.photoIcons = records;
		const map = this.view.map;
		if (map) ensurePhotoImages(map, records);
	}

	/** Camera movement reselects from cached candidates without walking base rows again. */
	private reselectPhotoIcons(): void {
		const map = this.view.map;
		if (!map || this.photoIcons.length === 0) return;
		ensurePhotoImages(map, this.photoIcons);
	}

	/* ---- interaction ---- */

	private bindInteractions(): void {
		if (this.interactionsBound) return;
		const map = this.view.map;
		if (!map) return;
		this.interactionsBound = true;
		const layers = [LINE_LAYER, POINT_LAYER, ENDPOINT_LAYER, ARROW_LAYER, PHOTO_DOT_LAYER, PHOTO_LAYER];
		// MapLibre delegates an overlapping DOM click in registration order. Give
		// photo features first refusal, then let the original-event guard collapse
		// thumbnail + fallback-dot delivery to one action.
		for (const layer of [PHOTO_LAYER, PHOTO_DOT_LAYER, LINE_LAYER, POINT_LAYER, ENDPOINT_LAYER, ARROW_LAYER]) {
			this.mapEvents.onLayer(map, 'click', layer, (ev: MapMouseEvent) => this.open(ev));
		}
		for (const layer of layers) {
			this.mapEvents.onLayer(map, 'mousemove', layer, (ev: MapMouseEvent) => this.hover(ev));
			this.mapEvents.onLayer(map, 'mouseenter', layer, () => map.getCanvas().addClass('is-over-marker'));
			this.mapEvents.onLayer(map, 'mouseleave', layer, () => {
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

	/** Layer-scoped handlers may deliver one DOM event twice; handle it once. */
	private open(ev: MapMouseEvent): void {
		const item = this.itemFrom(ev);
		if (!item) return;
		if (ev.originalEvent) {
			if (this.handledClick === ev.originalEvent) return;
			this.handledClick = ev.originalEvent;
		}
		const mod = ev.originalEvent ? Keymap.isModEvent(ev.originalEvent) : false;
		const props = ev.features?.[0]?.properties;
		const path = props && props.amRole === 'photo' && typeof props.amPath === 'string' ? props.amPath : '';
		if (path) this.openPhoto(path, item, mod);
		else this.openNote(item.file.path, mod);
	}

	/** Normal click opens the modal, mod-click opens the file, and a stale path falls back to its note. */
	private openPhoto(path: string, item: DrawItem, mod: PaneType | boolean): void {
		const file = this.view.app.vault.getFileByPath(path);
		if (!file) {
			this.openNote(item.file.path, mod);
			return;
		}
		if (mod) {
			void this.view.app.workspace.openLinkText(path, item.file.path, mod);
			return;
		}
		new PhotoModal(this.view.app, file, () => this.openNote(item.file.path, false)).open();
	}

	/** Plain clicks on a following map use its followed pane; every other case preserves native behavior. */
	private openNote(path: string, mod: PaneType | boolean, native?: () => void): void {
		const leaf = this.following && !mod ? this.plugin.followTarget(this) : null;
		const file = leaf ? this.view.app.vault.getFileByPath(path) : null;
		if (leaf && file) {
			void leaf.openFile(file, { active: true });
			return;
		}
		if (native) native();
		else void this.view.app.workspace.openLinkText(path, '', mod);
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
		const show = (this.origShowPopup ?? view.popupManager.showPopup).bind(view.popupManager);
		show(
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
			// Pointed at a note deliberately, by "open in map" or by following.
			// `pendingMapState` below says the same thing while it lasts, which is
			// only until the first data update consumes it.
			if (this.held) return;
			if (view.pendingMapState) return;
			if (view.mapConfig && view.mapConfig.center) return;
			if (typeof view.hasConfiguredZoom === 'function' && view.hasConfiguredZoom()) return;
		}
		const bounds = this.bounds();
		if (!bounds) return;
		fitTo(map, bounds, 24, this.knob('fitMaxZoom'));
	}

	private bounds(): LngLatBounds | null {
		const map = this.view.map;
		if (!map) return null;
		const tracks = (this.data?.features ?? []).map((feature) => feature.geometry);

		// Native getBounds() is computed from the untouched WGS-84 entries, so
		// once the pins have been moved it frames the wrong place. Use the
		// features actually on the map whenever we have them.
		if (this.markerFeatures) {
			const markers = this.markerFeatures.map((feature) => feature.geometry);
			return boundsOf(map, [...markers, ...tracks]);
		}
		return boundsOf(map, tracks, this.view.markerManager.getBounds());
	}
}
