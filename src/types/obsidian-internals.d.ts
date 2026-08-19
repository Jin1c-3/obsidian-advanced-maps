/*
 * The parts of Obsidian and MapLibre this plugin reaches into that no published
 * type covers.
 *
 * None of it is API. Bases keeps its view types in a plain writable object, the
 * map view hands its work to a marker manager, and the map itself is a MapLibre
 * instance Obsidian never exports. Everything here was read off a running
 * Obsidian 1.13 with the first-party Maps plugin (0.2.x) installed, so treat a
 * mismatch after an update as expected rather than as a broken build: the
 * plugin checks for what it needs at runtime and stands down when it is absent.
 *
 * Deliberately structural and narrow — only the members actually used, so the
 * compiler flags a typo without pretending to know the rest of the shape.
 */

import type { App, Component, TFile } from 'obsidian';
import type { Feature, Geometry } from 'geojson';
import type { RegistrationStamp } from '../registration';

declare module 'obsidian' {
	interface App {
		internalPlugins: InternalPlugins;
		embedRegistry: EmbedRegistry;
	}

	interface MenuItem {
		/**
		 * Turns this item into a nested menu and hands back the child to fill.
		 * Undeclared in `obsidian.d.ts` but present in the shipped build and used
		 * by Obsidian's own menus — read out of `obsidian.asar`, where it is
		 * `setSubmenu = function () { this.submenu || (this.dom.addClass(
		 * 'has-submenu'), this.submenu = new …); return this.submenu }`, and where
		 * core calls it as `.setIcon('lucide-paintbrush').setSubmenu().addItem(…)`.
		 *
		 * Undeclared means unpromised, so the one call site checks for it at
		 * runtime and falls back to flat items rather than assuming it is there.
		 */
		setSubmenu(): Menu;
	}
}

/* ---- internal plugins ---- */

export interface InternalPluginInstance {
	registrations?: Record<string, BasesViewRegistration | undefined>;
	/**
	 * The core Templates plugin's own settings, whose `folder` names where a
	 * vault keeps its templates.
	 *
	 * Undeclared in `obsidian.d.ts`. Measured on Obsidian 1.13 with the plugin
	 * enabled: `getPluginById('templates').instance` carries
	 * `{id, name, description, defaultOn, app, plugin, options, templateFiles}`,
	 * and `options` is `{folder: "templates"}` — the value typed into the
	 * plugin's own settings tab, vault-root-relative and empty when unset.
	 *
	 * Optional at every level, and only ever used to leave notes out of a list,
	 * so a shape that changes costs a slightly longer list and nothing else.
	 */
	options?: { folder?: unknown };
}

export interface InternalPluginWrapper {
	instance?: InternalPluginInstance;
}

export interface InternalPlugins {
	getPluginById(id: string): InternalPluginWrapper | null;
}

/* ---- embed registry ---- */

export interface EmbedContext {
	app: App;
	containerEl: HTMLElement;
	// The embed API also passes a `depth`, `linktext` and more; unused here.
	[key: string]: unknown;
}

export type EmbedCreator = (context: EmbedContext, file: TFile, subpath?: string) => Component;

export interface EmbedRegistry {
	registerExtensions(extensions: string[], creator: EmbedCreator): void;
	unregisterExtensions(extensions: string[]): void;
	isExtensionRegistered(extension: string): boolean;
}

/* ---- the vault adapter ---- */

/**
 * The two path answers this plugin asks the vault's own adapter for: where a
 * vault starts, and how this host addresses a file inside it.
 *
 * `getResourcePath` is published on `DataAdapter`. `getFullPath` is published on
 * `FileSystemAdapter` and on `CapacitorAdapter`, but not on the `DataAdapter`
 * interface `vault.adapter` is typed as, so it is declared here rather than
 * reached through a cast. Both are optional and answer `unknown`, because the
 * caller is deciding what platform it is on: an adapter that answers differently
 * — or not at all — has to leave the offline basemap unresolved rather than
 * build a URL out of a surprise.
 *
 * Measured on Android (Obsidian 1.13, Capacitor adapter): `getFullPath('x')` is
 * `/storage/emulated/0/Documents/<vault>/x`, `getResourcePath('x')` is that same
 * path behind `http://localhost/_capacitor_file_`, and `getFullPath('')` is the
 * vault's own directory with a trailing separator. A `basePath` property is
 * there too, and `getBasePath()` — the `FileSystemAdapter` method — is not,
 * which is why neither of those is what this reads.
 */
export interface VaultPaths {
	getResourcePath?(normalizedPath: string): unknown;
	getFullPath?(normalizedPath: string): unknown;
}

/* ---- Bases view registry ---- */

export interface ViewOption {
	displayName: string;
	type: string;
	key: string;
	default?: unknown;
	min?: number;
	max?: number;
	step?: number;
	options?: Record<string, string>;
	[key: string]: unknown;
}

export interface ViewOptionGroup {
	displayName: string;
	type: 'group';
	items: ViewOption[];
	[key: string]: unknown;
}

/**
 * Provenance: this plugin's own mark on the functions it installs over the
 * native registration, not something Bases reads. `boolean` is what versions up
 * to 1.13.3 wrote; `registration.ts` still recognizes it.
 */
type AdvancedMapsStamp<T> = RegistrationStamp<T> | boolean;

export type BasesViewFactory = ((controller: unknown, containerEl: HTMLElement) => BasesMapView) & {
	__advancedMaps?: AdvancedMapsStamp<BasesViewFactory>;
};

export type BasesViewOptionsFn = (() => ViewOptionGroup[]) & {
	__advancedMaps?: AdvancedMapsStamp<BasesViewOptionsFn>;
};

export interface BasesViewRegistration {
	name?: string;
	icon?: string;
	factory: BasesViewFactory;
	options?: BasesViewOptionsFn;
}

/* ---- the map view ---- */

/** One row of the base's query result. */
export interface BasesEntry {
	file: TFile;
	/**
	 * One displayed property's value for this row, as a Bases `Value` — a class
	 * this plugin does not import, hence `unknown`.
	 *
	 * Public in the Maps source's own typings, where every marker is built from
	 * `entry.getValue(mapConfig.coordinatesProp)`
	 * (obsidian-maps/src/map/markers.ts:78), and optional here because this
	 * plugin's own stub entries have no such method. Measured on Maps 0.2.2 /
	 * Obsidian 1.13.7: it throws for a property the row cannot answer, which is
	 * why the native collector wraps it in a `try`.
	 */
	getValue?(property: unknown): unknown;
	[key: string]: unknown;
}

export interface BasesData {
	data: BasesEntry[];
	properties: unknown[];
}

/** The per-view settings object; `get` answers with whatever the option holds. */
export interface ViewConfig {
	get(key: string): unknown;
	set?(key: string, value: unknown): void;
	getDisplayName(property: unknown): string;
	getAsPropertyId?(value: unknown): unknown;
	getEvaluatedFormula?(name: string): unknown;
}

/** The map's own config, born in `loadConfig` and rewritten by `switchToTileSet`. */
export interface MapConfig {
	mapTiles?: string | string[];
	mapTilesDark?: string | string[];
	/**
	 * The camera bounds and starting zoom, as `loadConfig` resolves them from the
	 * view's own options (`obsidian-maps/src/map-view.ts`, `getNumericConfig`).
	 * All three are numbers there; declared optional and read through a `typeof`
	 * check like every other member of this file.
	 *
	 * `minZoom` and `defaultZoom` are handed to the MapLibre constructor and
	 * re-applied by `applyConfigToMap`, which is what lets an offline basemap
	 * bound the camera by raising a number rather than by driving the map.
	 */
	minZoom?: number;
	maxZoom?: number;
	defaultZoom?: number;
	center?: unknown;
	/** This plugin's own field: the untouched WGS-84 value `center` came from. */
	__amCenterWgs?: unknown;
	/** …and the shifted value handed back, so a foreign write to `center` shows up. */
	__amCenterOut?: unknown;
	[key: string]: unknown;
}

export type MarkerFeature = Feature<Geometry, Record<string, unknown>>;

/**
 * One pin as the native manager tracks it — `MapMarker` in
 * obsidian-maps/src/map/markers.ts. This is both what `createGeoJSONFeatures`
 * is handed and what `markerManager.markers` keeps, and the features it mints
 * come back in the same order, one per marker, each carrying its own index as
 * `entryIndex`.
 *
 * `coordinates` is `[lat, lng]`, the note's own value, and stays untouched by
 * this plugin: the shift into tile space happens to the *features*, which is
 * why "Copy coordinates" on a pin was already right.
 */
export interface MapMarker {
	entry: BasesEntry;
	coordinates: [number, number];
}

export interface MarkerManager {
	/**
	 * Every marker this manager last built.
	 *
	 * `private markers: MapMarker[]` in obsidian-maps/src/map/markers.ts:20 —
	 * `private` is a compile-time word, and at runtime it is an ordinary own
	 * property. It is assigned wholesale at the end of `updateMarkers`, so it is
	 * the rows the base matched **and** placed: already filtered to those whose
	 * coordinate property resolved through the native `coordinateFromValue`.
	 *
	 * Measured on Maps 0.2.2 / Obsidian 1.13.7: 303 markers on a 16,503-row base,
	 * each `{entry, coordinates, icon, color, imageKey}`, with `coordinates` the
	 * note's own `[lat, lng]` — this plugin's datum shift happens to the features
	 * handed to MapLibre, never to these. Optional and `Array.isArray`-checked at
	 * every read: absent means the feature that wanted it stands down.
	 */
	markers?: MapMarker[];
	updateMarkers(data?: BasesData): Promise<void>;
	createGeoJSONFeatures(markers: MapMarker[]): MarkerFeature[];
	getCustomColor(entry: BasesEntry, config: MapConfig | undefined): string | null | undefined;
	resolveColor(color: string): string;
	/**
	 * Null before the manager has ever run, and thereafter the bounds of the last
	 * marker set — **including an empty `LngLatBounds` when that set was empty**.
	 * `updateMarkers` assigns `this.bounds = new LngLatBounds()` before extending
	 * it (obsidian-maps/src/map/markers.ts), so "not null" does not mean "has a
	 * marker in it".
	 *
	 * That distinction is load-bearing: the native `map.on('load')` handler reads
	 * `if (bounds) this.map.setCenter(bounds.getCenter())`
	 * (obsidian-maps/src/map-view.ts), which is a presence check where it means a
	 * content check. On an empty bounds it leaves the map transform's centre
	 * undefined and every later render throws `reading 'lng'`. Reproduced on a
	 * 12,487-result base where the query outlives the style load; not reachable at
	 * ~1,000 results. See the wrapper in track-layer.ts `attach()`.
	 */
	getBounds(): LngLatBounds | null;
	getMarkerDrivenProps(config: MapConfig | undefined): unknown;
	/**
	 * What a click on a pin does. Handed to the constructor by the view as
	 * `(path, newLeaf) => app.workspace.openLinkText(path, '', newLeaf)` — read
	 * out of `obsidian-maps/src/map-view.ts`, and an own property of the manager,
	 * which is what makes it wrappable per instance.
	 */
	onOpenFile(path: string, newLeaf: boolean): void;
}

export interface PopupManager {
	/**
	 * `latLng` is the note's own WGS-84 value, straight off `markerManager.markers`.
	 *
	 * Returns without building anything when `collectDisplayProperties` comes
	 * back empty, so a note whose displayed properties are all empty raises no
	 * popup at all — inherited rather than worked around.
	 */
	showPopup(
		entry: BasesEntry,
		latLng: [number, number],
		properties: unknown,
		markerProps: unknown,
		displayName: (property: unknown) => string
	): void;
	hidePopup(): void;
	/**
	 * Builds the whole card and returns it, before `showPopup` hands the node to
	 * `sharedPopup.setDOMContent(…).setLngLat(…).addTo(map)`. That ordering is
	 * what makes a row appendable: the node is still the builder's when this
	 * returns.
	 *
	 * `obsidian-maps/src/map/popup.ts` declares this `private`, which is a
	 * compile-time word — at runtime it is an ordinary prototype method, and
	 * shadowing it with an own property on one manager instance is the same wrap
	 * `showPopup` already carries here. Measured on Maps 0.2.2 / Obsidian 1.13.7:
	 * the wrapper is reached through both the wrapped and the original
	 * `showPopup`, appended rows reach the live connected DOM, and `delete`ing
	 * the own property returns the prototype's.
	 *
	 * The card is `div.bases-map-popup` holding `.bases-map-popup-title` and —
	 * only when a second property exists — a `.bases-map-popup-properties` list
	 * of `.bases-map-popup-property` rows, each a `-label` and a `-value`.
	 */
	createPopupContent?(
		entry: BasesEntry,
		properties: unknown,
		displayName: (property: unknown) => string
	): HTMLElement;
}

export interface BasesMapView {
	app: App;
	type?: string;
	containerEl?: HTMLElement;
	mapEl?: HTMLElement;
	map?: MapLibreMap | null;
	mapConfig?: MapConfig;
	config?: ViewConfig;
	data?: BasesData;
	markerManager: MarkerManager;
	popupManager: PopupManager;
	pendingMapState?: unknown;
	loadConfig(tileSetId?: string): MapConfig;
	switchToTileSet(tileSetId: string): Promise<void>;
	initializeMap(): Promise<void>;
	destroyMap(): void;
	updateMapStyle(): void;
	hasConfiguredZoom?(): boolean;
	/**
	 * Right-click on the map itself: "New note" here, "Copy coordinates", "Set
	 * default center point". All three read the click through `map.unproject`,
	 * so all three answer in whatever space the tiles are drawn in.
	 */
	showMapContextMenu(ev: MouseEvent): void;
	/**
	 * Native back/forward camera state in tile space. The Maps data path consumes
	 * it once, so callers needing a durable target must keep their own state.
	 */
	setEphemeralState?(state: { center?: { lng: number; lat: number }; zoom?: number } | null): void;
	onunload(): void;
	/** Set by this plugin on the stub view an inline embed builds. */
	__advancedMapsHeadless?: boolean;
	/** Set by this plugin's TrackLayer.attach(), cleared by detach(). */
	__advancedMapsLayer?: boolean;
}

/**
 * A node in Obsidian's component tree, as `adoptOpenViews` walks it looking for
 * map views built before the registry was patched.
 *
 * Separate from `BasesMapView` because these are properties of *any* component:
 * declaring them there would say a map view has a `.view`, which it does not,
 * and this file exists to record what is actually assumed rather than what is
 * convenient to cast to.
 */
export interface ComponentNode {
	_children?: unknown[];
	/** A bases controller keeps its active view outside the child list. */
	controller?: unknown;
	view?: unknown;
}

/* ---- MapLibre ---- */

export interface LngLatBounds {
	extend(value: unknown): LngLatBounds;
	isEmpty(): boolean;
}

export interface GeoJSONSource {
	setData(data: unknown): void;
}

/**
 * A raster tile source, for the one field this plugin writes.
 *
 * Standard MapLibre, declared here for the same reason the rest of this
 * interface is: no `maplibre-gl` dependency to import the real types from.
 * Measured on the runtime MapLibre Obsidian ships: assigning `maxzoom` on a live
 * source takes effect at the next covering-tile computation, with no reload and
 * no `setTiles` — so a pack's deepest level can be stated without discarding the
 * tiles already on screen.
 */
export interface RasterTileSource {
	type?: string;
	tiles?: string[];
	minzoom?: number;
	maxzoom?: number;
}

export interface MapControl {
	onAdd(map?: MapLibreMap): HTMLElement;
	onRemove(map?: MapLibreMap): void;
}

export interface LngLat {
	lng: number;
	lat: number;
}

/**
 * The built-in "locate user" button, added on mobile only. It is the Maps
 * plugin's own control rather than MapLibre's GeolocateControl, and
 * `updatePosition` is the single door a device fix comes through: the dot and
 * the fly-to that follows are both derived from it.
 */
export interface LocateControl {
	updatePosition(lat: number, lng: number): void;
}

export interface MapMouseEvent {
	features?: MarkerFeature[];
	lngLat: { lng: number; lat: number };
	originalEvent?: MouseEvent;
	/** MapLibre's own pixel-in-container field — used to place the embed's
	 *  hand-built waypoint tooltip rather than `originalEvent.offsetX/offsetY`,
	 *  which is relative to whatever element the browser happened to pick as the
	 *  event target rather than to the map. Optional, like everything else this
	 *  file declares about a MapLibre event: hand-typed rather than imported
	 *  from a `maplibre-gl` this plugin does not depend on. */
	point?: { x: number; y: number };
}

export interface MapLibreMap {
	/** Advanced Maps-owned camera provenance retained when this native map
	 * outlives one plugin instance and is adopted by the next. */
	__advancedMapsCameraSystem?: 'wgs84' | 'gcj02' | 'bd09';
	style?: { _loaded?: boolean };
	scrollZoom: { disable(): void; enable(): void };
	/** The same shape as `scrollZoom`, turned off while the measuring tape is out
	 *  so a second point placed quickly is a point and not a zoom. Optional, and
	 *  `isEnabled` doubly so: it is only asked in order to leave a handler the
	 *  reader had already turned off exactly as they left it. */
	doubleClickZoom?: { disable(): void; enable(): void; isEnabled?(): boolean };
	isStyleLoaded?(): boolean;
	getStyle?(): unknown;
	/** Defaulted rather than overloaded: every existing call wants the GeoJSON
	 *  source it added, and the offline basemap asks for a raster one by name. */
	getSource<T = GeoJSONSource>(id: string): T | undefined;
	addSource(id: string, spec: unknown): void;
	removeSource(id: string): void;
	getLayer(id: string): unknown;
	addLayer(spec: unknown, before?: string): void;
	removeLayer(id: string): void;
	setPaintProperty(layerId: string, name: string, value: unknown): void;
	setLayoutProperty(layerId: string, name: string, value: unknown): void;
	/** What a layer is currently asking for — read on the *native* marker layer,
	 *  whose `icon-size` the fan in `spread.ts` has to divide out. Public
	 *  MapLibre API; optional here like everything else on this interface. */
	getLayoutProperty?(layerId: string, name: string): unknown;
	/**
	 * Standard, documented MapLibre GL JS `Map` methods — not an Obsidian
	 * secret, declared here for the same reason every other `MapLibreMap`
	 * member is: this plugin carries no `maplibre-gl` dependency to import the
	 * real types from. `addImage`'s payload is a synchronous `ImageData`
	 * (`ctx.getImageData()`), not the async canvas→blob→`Image()`→decode round
	 * trip the native marker code uses — that round trip exists there only to
	 * rasterize an untrusted, dynamically-chosen Lucide SVG through an `<img>`
	 * src, and the start/end/arrow icons here are drawn with plain canvas path
	 * primitives, nothing to decode.
	 */
	hasImage(id: string): boolean;
	addImage(id: string, image: ImageData, options?: { pixelRatio?: number }): void;
	/** Throws if a layer still references the id — remove the layer first. */
	removeImage(id: string): void;
	/** Public MapLibre GL JS `Map#listImages`; optional because Obsidian owns the
	 * runtime MapLibre version and this plugin must stand down on shape changes. */
	listImages?(): string[];
	addControl(control: MapControl, position?: string): void;
	removeControl(control: MapControl): void;
	on(type: string, listener: (ev: any) => void): void;
	on(type: string, layerId: string, listener: (ev: any) => void): void;
	off(type: string, listener: (ev: any) => void): void;
	off(type: string, layerId: string, listener: (ev: any) => void): void;
	getCenter(): LngLat | null;
	setCenter(center: LngLat): void;
	getZoom?(): number;
	/** Public MapLibre API. Used to bring a live map up to the shallowest level an
	 *  offline pack covers; the native view sets the same bound from its config
	 *  when a map is built, so this is only for maps already on screen. */
	setMinZoom?(zoom: number): void;
	/** A move around the map the reader can follow with their eyes. */
	flyTo?(options: { center?: [number, number]; zoom?: number }): void;
	/** …and the same move made instantly, for a map that has only just appeared. */
	jumpTo?(options: { center?: [number, number]; zoom?: number }): void;
	getBounds(): LngLatBounds;
	fitBounds(bounds: LngLatBounds, options?: { padding?: number; maxZoom?: number; animate?: boolean }): void;
	/** Coordinate to CSS pixels inside the map container. Public MapLibre API;
	 * optional only because every undocumented runtime edge is shape-checked. */
	project?(coordinate: [number, number] | LngLat): { x: number; y: number };
	/**
	 * What is drawn at a pixel, restricted to the named layers. Public MapLibre
	 * API, optional for the same reason as the rest of this interface.
	 *
	 * Used to ask whether a *native* marker holds the pointer. Measured against
	 * a live map: the native view registers its own `marker-pins` handlers after
	 * this plugin's layers are bound, so MapLibre's registration-order delivery
	 * hands an overlapping click to the plugin first. Registration order alone
	 * therefore cannot make an owned layer lose to a pin; asking what is under
	 * the pointer can.
	 */
	/** A pixel, or — for the measuring tape's snapping — a box given as its two
	 *  opposite corners. Both forms are MapLibre's own; hand-typed here like
	 *  everything else this file says about a map, because the plugin depends on
	 *  no `maplibre-gl` package to import them from. A layer id the style does
	 *  not have throws rather than being skipped, so callers filter first. */
	queryRenderedFeatures?(
		point: { x: number; y: number } | [number, number] | [[number, number], [number, number]],
		options?: { layers?: string[] }
	): unknown[];
	/** Pixel back to a coordinate — in tile space, like everything the map holds. */
	unproject(point: [number, number]): LngLat;
	getCanvas(): HTMLCanvasElement;
	getContainer?(): HTMLElement;
	resize(): void;
	/** Where MapLibre keeps the controls it has been handed, the locate one included. */
	_controls?: unknown[];
}
