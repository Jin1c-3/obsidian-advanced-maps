/*
 * TrackLayer — everything this plugin adds to one native map view.
 */

import { Keymap, Menu } from 'obsidian';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { PaneType, TFile } from 'obsidian';
import {
	applyOfflineTiles,
	boundOfflineSource,
	restyleForBasemap,
	usesOfflineTiles,
	type OfflineBasemap,
} from './basemap';
import {
	AREA_LAYER,
	ARROW_LAYER,
	ENDPOINT_LAYER,
	LINE_LAYER,
	MARKER_LAYER,
	PHOTO_DOT_LAYER,
	PHOTO_LAYER,
	POINT_LAYER,
	READ_CONCURRENCY,
	SRC,
	type TrackKnob,
} from './constants';
import {
	knownMode,
	normalizeLng,
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
import { valueText, type Place } from './places';
import { ExportPlacesModal, exportStem, type ExportSource } from './places-modal';
import { iconOffsetExpression, spreadFactor, spreadPins, type SpreadPin, type SpreadPlan } from './spread';
import { appendDetail, statsSummary, type PointedDetail } from './popup-rows';
import { pooled, projectedFeatures, recordStats } from './track-cache';
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

/** What the pointer is on, as the properties of a drawn feature state it. */
interface PointedFeature {
	/** '', 'start', 'end' or 'photo'. */
	role: string;
	/** Vault path of the file this feature was read from. */
	path: string;
	/** A waypoint's own name; empty for everything else. */
	name: string;
}

/** The last path segment, for a file that no longer resolves in the vault. */
function basename(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
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
	/** The same, for the pointer samples `hover()` acts on. */
	private handledHover: MouseEvent | null = null;
	/** The feature a popup is being raised for, handed to the `createPopupContent`
	 *  wrapper across one synchronous call and cleared by it. */
	private pointed: PointedFeature | null = null;
	/** Which drawn feature the native popup is currently describing, so pointing
	 *  at it again costs nothing. Null whenever that is no longer known. */
	private shownPopup: string | null = null;
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

		// Report empty native bounds as absent, so the native framing step takes its
		// no-bounds path instead of computing a centre from nothing — see the
		// `getBounds` note in obsidian-internals.d.ts for the crash this prevents.
		// Nothing here changes this plugin's own framing: `boundsOf()` already
		// discards an empty seed, so empty and null were always equivalent to it.
		if (typeof manager.getBounds === 'function') {
			this.wrap(manager, 'getBounds', (orig) => () => {
				const bounds = orig.call(manager);
				// Shape-checked rather than assumed: a host that stops returning a
				// MapLibre bounds should fall through untouched, not throw.
				if (!bounds || typeof bounds.isEmpty !== 'function') return bounds;
				return bounds.isEmpty() ? null : bounds;
			});
		}

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

		// What the pointer is on belongs inside the card the host builds, not in a
		// second floating box beside it: this builder returns the card before
		// `showPopup` inserts it, so a row can be appended while it is still the
		// builder's. Optional at runtime — a Maps build without it leaves hover
		// exactly as it is.
		const buildCard =
			typeof popups.createPopupContent === 'function' ? popups.createPopupContent.bind(popups) : null;
		if (buildCard) {
			this.wrap(popups, 'createPopupContent', () => (entry, properties, displayName) => {
				// One-shot. The native `marker-pins` hover calls this too, so a
				// value left behind would describe a pin with the track pointed at
				// before it.
				const pointed = this.pointed;
				this.pointed = null;
				const card = buildCard(entry, properties, displayName);
				if (pointed) this.describe(card, pointed);
				return card;
			});
		}

		// Point the map at a basemap on disk, and project the configured centre —
		// both where the shared config object is created, and in that order: the
		// centre is projected with the datum of whichever tiles are actually going
		// to be drawn.
		this.wrap(view, 'loadConfig', (orig) => (tileSetId?: string) => {
			const config = orig.call(view, tileSetId);
			applyOfflineTiles(config, this.basemap());
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

		// Native menu actions read `unproject()` synchronously; expose a vault
		// coordinate only for that call. This runs on WGS-84 maps too: the datum
		// correction is a no-op there, but a camera carried across the 180th
		// meridian answers 180.5 for a place a note must write as -179.5.
		if (typeof view.showMapContextMenu === 'function') {
			this.wrap(view, 'showMapContextMenu', (orig) => (ev: MouseEvent) => {
				const map = view.map;
				const system = this.system();
				if (!map || typeof map.unproject !== 'function') {
					orig.call(view, ev);
					return;
				}
				const restore = override(map, 'unproject', (native) => (point) => {
					const lngLat = native.call(map, point);
					// Both corrections exactly once: tile datum back to WGS-84, and
					// the meridian the camera counted past back into range.
					const [lng, lat] = toWgs84(system, lngLat.lng, lngLat.lat);
					const LngLatCtor = lngLat.constructor as new (lng: number, lat: number) => LngLat;
					return new LngLatCtor(normalizeLng(lng), lat);
				});
				try {
					orig.call(view, ev);
				} finally {
					restore();
				}
				// Both read native tile space after the temporary wrapper is restored,
				// through the one helper that converts a click exactly once.
				this.addStampNoteItem(ev, map, system);
				this.addExternalMapItems(ev, map, system);
				// Not one of them: this is about the whole map rather than the
				// clicked pixel, and reads no coordinate off the event at all.
				this.addExportPlacesItem(ev);
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
			this.handledHover = null;
			this.shownPopup = null;
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

	/**
	 * The clicked pixel as a vault coordinate: `[lng, lat]` in WGS-84, or null
	 * when the map cannot answer.
	 *
	 * The one place a click becomes a coordinate, because the correction has to
	 * happen exactly once and there is no way to tell zero from two by looking:
	 * both land the pin about 500 m out on a Chinese basemap. `unproject` is
	 * native tile space here — the temporary wrapper the menu installs has been
	 * restored by now — so this converts the datum first and then brings back a
	 * longitude the camera may have carried past the meridian.
	 */
	private clickedCoordinate(
		ev: MouseEvent,
		map: NonNullable<BasesMapView['map']>,
		system: CoordSystem
	): [number, number] | null {
		if (typeof map.unproject !== 'function') return null;
		let lngLat: LngLat;
		try {
			// The same pixel showMapContextMenu itself reads the click from.
			lngLat = map.unproject([ev.offsetX, ev.offsetY]);
		} catch {
			return null;
		}
		const [rawLng, lat] = toWgs84(system, lngLat.lng, lngLat.lat);
		return [normalizeLng(rawLng), lat];
	}

	/**
	 * Offer to put this spot into a note that already exists — the half of the
	 * menu the native **New note here** leaves out.
	 *
	 * The coordinate is captured now rather than in the click handler: by the
	 * time the item is chosen, the event and its pixel are gone and the map may
	 * have moved.
	 */
	private addStampNoteItem(ev: MouseEvent, map: NonNullable<BasesMapView['map']>, system: CoordSystem): void {
		const point = this.clickedCoordinate(ev, map, system);
		if (!point) return;
		const [lng, lat] = point;
		// 'action' is the section the native items use — measured on a live menu,
		// where New note, Copy coordinates and the two defaults all carry it. This
		// belongs with them rather than in a group of its own, and if that name
		// ever changes the item simply falls to the end of the menu.
		Menu.forEvent(ev).addItem((item) =>
			item
				.setTitle(t('menu.stampNote'))
				.setIcon('map-pin')
				.setSection('action')
				.onClick(() => this.plugin.stampNoteAt(lat, lng))
		);
	}

	/** Append to the event-keyed native menu, falling back to flat items without `setSubmenu`. */
	private addExternalMapItems(ev: MouseEvent, map: NonNullable<BasesMapView['map']>, system: CoordSystem): void {
		const point = this.clickedCoordinate(ev, map, system);
		if (!point) return;
		const [lng, lat] = point;

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

	/**
	 * Offer to carry this map's places out of the vault as a file.
	 *
	 * Offered only when the view can actually say what it holds: a manager with no
	 * readable `markers`, or one holding none, gets no entry rather than an empty
	 * file. Its own menu section, since it is not one of the point actions above.
	 */
	private addExportPlacesItem(ev: MouseEvent): void {
		const places = this.mapPlaces('file');
		if (places.length === 0) return;
		Menu.forEvent(ev).addItem((item) =>
			item
				.setTitle(t('menu.exportPlaces'))
				.setIcon('download')
				.setSection('export-places')
				.onClick(() => this.exportPlaces())
		);
	}

	/**
	 * The places this map shows, named by `nameId` — `file` for the note's own
	 * file name, or `p<n>` for the n-th property the base displays.
	 *
	 * `marker.coordinates` is the note's own `[lat, lng]`, which is the whole
	 * point of reading markers rather than the drawn geometry: the features this
	 * plugin hands MapLibre have been through the tile datum, and exporting those
	 * would make a file depend on which basemap happened to be configured. The
	 * two are one property apart and nothing about the result looks wrong — a
	 * 500 m shift is invisible in a list of numbers.
	 */
	private mapPlaces(nameId: string): Place[] {
		const markers = this.view.markerManager?.markers;
		if (!Array.isArray(markers)) return [];
		const properties = this.view.data?.properties;
		const index = nameId.startsWith('p') ? Number(nameId.slice(1)) : -1;
		const property = Array.isArray(properties) && index >= 0 ? properties[index] : undefined;

		const out: Place[] = [];
		for (const marker of markers) {
			const coords = marker?.coordinates;
			if (!Array.isArray(coords) || coords.length < 2) continue;
			const [lat, lng] = coords;
			if (!isFinite(lat) || !isFinite(lng)) continue;
			const file = marker.entry?.file;
			const fallback = file?.basename ?? '';
			let name = '';
			if (property !== undefined && typeof marker.entry?.getValue === 'function') {
				try {
					name = valueText(marker.entry.getValue(property));
				} catch {
					/* a row that cannot answer for this property keeps its file name */
				}
			}
			out.push({
				// Never nameless: an empty property falls back to the file name, and a
				// file name is the one thing every row has.
				name: name || fallback || t('places.export.defaultName'),
				description: '',
				lat,
				lng,
				path: file?.path ?? '',
			});
		}
		return out;
	}

	/** `file` first, then every property this base displays, by its shown label. */
	private exportNameSources(): ExportSource['names'] {
		const names: ExportSource['names'] = [{ id: 'file', label: t('places.export.nameByFile') }];
		const properties = this.view.data?.properties;
		const config = this.view.config;
		if (!Array.isArray(properties) || !config) return names;
		properties.forEach((property, i) => {
			try {
				const label = config.getDisplayName(property);
				if (typeof label === 'string' && label !== '') names.push({ id: `p${i}`, label });
			} catch {
				/* a property with no display name is simply not offered */
			}
		});
		return names;
	}

	private exportPlaces(): void {
		const places = this.mapPlaces('file');
		if (places.length === 0) return;
		const source: ExportSource = {
			count: places.length,
			names: this.exportNameSources(),
			// Rebuilt per choice rather than held: choosing what names a place is
			// the whole of what that dialog decides.
			places: (nameId) => this.mapPlaces(nameId),
		};
		const app = this.view.app;
		// With a base open in its own tab this is the base's own file name, which
		// is the name the reader already calls this map by.
		const stem = exportStem(app.workspace.getActiveFile()?.basename ?? null);
		new ExportPlacesModal(app, source, stem, (path, text) =>
			this.plugin.writePlacesFile(path, text, source.count)
		).open();
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
		this.handledHover = null;
		this.shownPopup = null;
		this.pointed = null;
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

		// The style the MapLibre constructor was handed loads after this runs, so
		// the handler below is what bounds it. This call is for the other case: a
		// map adopted from a view that was already open, whose style is loaded
		// already and will not announce itself again.
		this.boundBasemap(map);

		// A new style is a blank slate: every source and layer is gone. The
		// built-in view puts its markers back, so put the tracks back too rather
		// than riding on its one-shot `styledata` handler.
		this.mapEvents.on(map, 'style.load', () => {
			// Before the tracks: a fresh style has a fresh raster source with the
			// default bounds back, and this is ahead of MapLibre's first render.
			this.boundBasemap(map);
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

	/**
	 * Restore the editor only for programmatic follows; native hover popups
	 * retain normal focus behavior. A follow moves the map without the reader
	 * having asked to leave the note they are typing in, which is why only that
	 * path puts focus back. Pointing at something is the reader's own doing, and
	 * the native marker hover does not restore focus either — hover() raises the
	 * popup once per pointed feature, the same rate the native path produces.
	 */
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

	/* ---- a basemap already on disk ---- */

	/**
	 * The pack this view draws, or null. The view option wins: a map that has
	 * declined the offline basemap keeps whatever background it was configured
	 * with, and every other map on the vault stays on the pack.
	 */
	private basemap(): OfflineBasemap | null {
		let option: unknown;
		try {
			option = this.view.config ? this.view.config.get('offlineTiles') : undefined;
		} catch {
			/* stub config */
		}
		return usesOfflineTiles(option) ? this.plugin.offlineBasemap() : null;
	}

	/** Stop the map asking for levels the pack does not hold. A no-op without one. */
	private boundBasemap(map: NonNullable<BasesMapView['map']>): void {
		const pack = this.basemap();
		if (pack) boundOfflineSource(map, pack.url, pack.sourceMaxZoom);
	}

	/** The pack was configured, changed or cleared while this map was on screen. */
	refreshBasemap(): void {
		if (this.detached || !restyleForBasemap(this.view)) return;
		// Turning a pack on over a Chinese background changes what "auto" answers,
		// and that moves every pin by a few hundred metres. Realign the camera
		// against the tiles that are about to be drawn, before the restyle's own
		// marker rebuild lands.
		this.realignCamera();
		this.locate?.replaceDot();
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
			// The layer's own `icon-size`, not a number read off it here: the
			// expression divides by that size level by level, because MapLibre
			// multiplies each level's offsets by the size it evaluates there.
			offset = iconOffsetExpression(table, map.getLayoutProperty?.(MARKER_LAYER, 'icon-size'));
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
				features.push(...trackFeatures(projectedFeatures(rec, system), item.color, index, trackFile.path));
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
		// Bounded, because `pending` is as large as the base result: a query that
		// returns photo files directly makes this thousands of reads, not dozens.
		// The predicate is asked per file, so a superseded sync stops reading here
		// rather than at the revision check below.
		if (pending.size > 0)
			await pooled(
				pending,
				READ_CONCURRENCY,
				(f) => this.plugin.tracks.load(f, this.plugin.settings.photoDatum),
				() => revision === this.syncRevision && !this.detached && !!view.map
			);
		if (revision !== this.syncRevision || this.detached || !view.map) return;

		await styleReady(view.map);
		if (revision !== this.syncRevision || this.detached || !view.map) return;

		const map = view.map;
		// Always adopted, even when the redraw below is skipped: Bases recreates
		// its BasesEntry objects on every update and warns against holding the old
		// ones, and hover() reads an entry straight out of this list.
		this.items = items;
		// hover()'s memory of the shown popup indexes into the list just replaced,
		// so it means nothing now. Forgetting costs one redundant rebuild; keeping
		// it would silently withhold a popup the reader asked for.
		this.shownPopup = null;

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
		// Kept whether or not they are drawn, so switching thumbnails back on
		// selects from these rather than waiting for the next base query.
		this.photoIcons = records;
		const map = this.view.map;
		if (!map) return;
		// Hiding the layer is not enough: decoding is what costs the memory, and
		// an album can hold tens of megabytes of it for a layer drawing nothing.
		if (!this.plugin.settings.photoThumbnails) {
			disposePhotoImages(map);
			return;
		}
		ensurePhotoImages(map, records);
	}

	/** Camera movement reselects from cached candidates without walking base rows again. */
	private reselectPhotoIcons(): void {
		const map = this.view.map;
		if (!map || this.photoIcons.length === 0) return;
		if (!this.plugin.settings.photoThumbnails) return;
		ensurePhotoImages(map, this.photoIcons);
	}

	/* ---- interaction ---- */

	private bindInteractions(): void {
		if (this.interactionsBound) return;
		const map = this.view.map;
		if (!map) return;
		this.interactionsBound = true;
		// MapLibre delegates an overlapping DOM event in registration order, and
		// both `open()` and `hover()` act on the first delivery only — so this
		// order decides which of two stacked features wins, and clicking and
		// pointing must not disagree about that. Photo features first, then let
		// the original-event guards collapse thumbnail + fallback-dot delivery.
		// Areas last, and for a stronger reason than the rest of the order: one
		// can cover the whole viewport, so a click inside a region has to reach
		// the photo or track drawn over it rather than the region.
		const layers = [PHOTO_LAYER, PHOTO_DOT_LAYER, LINE_LAYER, POINT_LAYER, ENDPOINT_LAYER, ARROW_LAYER, AREA_LAYER];
		// …and being last is not enough against a *native* pin. Measured on a
		// live map: the native view binds its own `marker-pins` handlers after
		// these, so an overlapping click reaches this plugin first, and an area
		// would answer for every pin standing inside it — opening its note and
		// leaving native to open the pin's as well. Only asking what is under the
		// pointer settles that, and only the area layer needs to ask: every other
		// owned feature is small enough that landing on one is a real choice.
		const yieldToPin = (act: (ev: MapMouseEvent) => void) => (ev: MapMouseEvent) => {
			if (!this.pinHoldsPointer(ev)) act(ev);
		};
		for (const layer of layers) {
			const open = (ev: MapMouseEvent) => this.open(ev);
			this.mapEvents.onLayer(map, 'click', layer, layer === AREA_LAYER ? yieldToPin(open) : open);
		}
		for (const layer of layers) {
			const hover = (ev: MapMouseEvent) => this.hover(ev);
			this.mapEvents.onLayer(map, 'mousemove', layer, layer === AREA_LAYER ? yieldToPin(hover) : hover);
			this.mapEvents.onLayer(map, 'mouseenter', layer, () => map.getCanvas().addClass('is-over-marker'));
			this.mapEvents.onLayer(map, 'mouseleave', layer, () => {
				map.getCanvas().removeClass('is-over-marker');
				this.view.popupManager.hidePopup();
				// The popup this was describing is on its way out, so coming back
				// to the same feature has to raise it again.
				this.shownPopup = null;
			});
		}
	}

	/**
	 * Whether a native pin — not one of this plugin's features — is under the
	 * pointer, and so owns this event.
	 *
	 * Answers false rather than throwing on a map whose style is mid-swap: a
	 * pointer sample is not worth a raised exception, and the area answering one
	 * extra event is a smaller wrong than an uncaught one.
	 */
	private pinHoldsPointer(ev: MapMouseEvent): boolean {
		const map = this.view.map;
		if (!map || !ev.point || typeof map.queryRenderedFeatures !== 'function') return false;
		if (!map.getLayer(MARKER_LAYER)) return false;
		let held = false;
		try {
			held = map.queryRenderedFeatures(ev.point, { layers: [MARKER_LAYER] }).length > 0;
		} catch {
			/* style torn down between delivery and query */
		}
		// The popup showing is native's now, so returning to the area has to
		// raise its own again rather than be suppressed as unchanged.
		if (held) this.shownPopup = null;
		return held;
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

	/**
	 * Reuse the built-in popup, so a track hover reads like its marker hover.
	 *
	 * This runs on `mousemove` rather than `mouseenter`, because six overlapping
	 * layers mean `mouseenter` never fires when the pointer crosses between two
	 * features of the same layer. That makes it the caller's job not to rebuild
	 * a popup that is already correct: the native `showPopup` ends in
	 * `addTo(map)`, which re-inserts the shared popup and re-lays it out — ~3.7ms
	 * measured, ~90% of a pointer sample's whole cost. So one DOM event is acted
	 * on once, and an unchanged feature is not acted on at all.
	 */
	private hover(ev: MapMouseEvent): void {
		const item = this.itemFrom(ev);
		const view = this.view;
		if (!item || !view.data || !view.data.properties || !view.mapConfig || !view.config) return;
		if (ev.originalEvent) {
			if (this.handledHover === ev.originalEvent) return;
			this.handledHover = ev.originalEvent;
		}
		// Two photos of one note are different popups, and so are two of its
		// tracks now that a line names its own file; a thumbnail and the dot
		// beneath it are the same one. Index, role and path say exactly that, and
		// a space separates them unambiguously because only the trailing path can
		// contain one.
		const props = ev.features?.[0]?.properties;
		const index = props && typeof props.amIndex === 'number' ? props.amIndex : -1;
		const role = props && typeof props.amRole === 'string' ? props.amRole : '';
		const path = props && typeof props.amPath === 'string' ? props.amPath : '';
		const name = props && typeof props.amName === 'string' ? props.amName : '';
		const key = `${index} ${role} ${path}`;
		if (key === this.shownPopup) return;
		this.shownPopup = key;
		const config = view.config;
		// Where the pointer entered this feature is where the popup stays, since
		// only a changed feature reaches here — the same as a native marker
		// popup, which opens on the marker's own coordinate and does not follow
		// the cursor. The cursor is already in tile space, so go straight to the
		// native method, past the wrapper that exists to move the pins' own
		// WGS-84 anchors.
		const show = (this.origShowPopup ?? view.popupManager.showPopup).bind(view.popupManager);
		// Read back by the `createPopupContent` wrapper, which this call reaches
		// synchronously. Cleared again on the way out because the host builds no
		// card at all for a note whose displayed properties are empty — the
		// wrapper would never run, and a native pin hover would inherit this.
		this.pointed = { role, path, name };
		try {
			show(
				item.entry,
				[ev.lngLat.lat, ev.lngLat.lng],
				view.data.properties,
				view.markerManager.getMarkerDrivenProps(view.mapConfig),
				(prop) => config.getDisplayName(prop)
			);
		} finally {
			this.pointed = null;
		}
	}

	/**
	 * Say what the pointer is on, in the card the host just built.
	 *
	 * One row: a photo shows itself, a named waypoint shows its name, and
	 * anything else drawn for a track shows that track's own figures. A waypoint
	 * name follows the same **Show track markers** setting the inline tooltip
	 * does, and says nothing at all when that is off rather than saying something
	 * else instead.
	 */
	private describe(card: HTMLElement, pointed: PointedFeature): void {
		const app = this.view.app;
		if (pointed.role === 'photo') {
			const file = app.vault.getFileByPath(pointed.path);
			const name = file?.name ?? basename(pointed.path);
			let image: PointedDetail['image'];
			if (file) {
				try {
					image = { src: app.vault.getResourcePath(file), alt: name };
				} catch {
					/* no resource path for this file — the row keeps its name alone */
				}
			}
			appendDetail(card, { label: t('popup.photo'), text: name, image });
			return;
		}
		if (pointed.name !== '') {
			if (this.plugin.settings.trackMarkers) {
				appendDetail(card, { label: t('popup.waypoint'), text: pointed.name });
			}
			return;
		}
		if (pointed.path === '') return;
		const stats = recordStats(this.plugin.tracks.get(pointed.path));
		if (!stats) return;
		const file = app.vault.getFileByPath(pointed.path);
		const label = file?.basename ?? basename(pointed.path).replace(/\.[^.]+$/, '');
		appendDetail(card, { label, text: statsSummary(stats) });
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
