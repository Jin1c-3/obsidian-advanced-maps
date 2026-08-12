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

export type BasesViewFactory = ((controller: unknown, containerEl: HTMLElement) => BasesMapView) & {
	__advancedMaps?: boolean;
};

export type BasesViewOptionsFn = (() => ViewOptionGroup[]) & { __advancedMaps?: boolean };

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
	center?: unknown;
	/** This plugin's own field: the untouched WGS-84 value `center` came from. */
	__amCenterWgs?: unknown;
	/** …and the shifted value handed back, so a foreign write to `center` shows up. */
	__amCenterOut?: unknown;
	[key: string]: unknown;
}

export type MarkerFeature = Feature<Geometry, Record<string, unknown>>;

export interface MarkerManager {
	updateMarkers(data?: BasesData): Promise<void>;
	createGeoJSONFeatures(entries: unknown): MarkerFeature[];
	getCustomColor(entry: BasesEntry, config: MapConfig | undefined): string | null | undefined;
	resolveColor(color: string): string;
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
	/** `latLng` is the note's own WGS-84 value, straight off `markerManager.markers`. */
	showPopup(
		entry: BasesEntry,
		latLng: [number, number],
		properties: unknown,
		markerProps: unknown,
		displayName: (property: unknown) => string
	): void;
	hidePopup(): void;
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
	 * Where the camera should be, kept apart from where the base file says it
	 * should be. Obsidian's own back/forward restore is what this exists for, and
	 * the shape is `{ center: { lng, lat }, zoom }` — **tile space**, since it is
	 * handed to MapLibre unconverted.
	 *
	 * Read out of the Maps source rather than assumed, because three behaviours
	 * hang off it: `initializeMap` builds the map with it in place of the
	 * configured centre, the map's own `load` handler stands down while it is set,
	 * and so does `applyConfigToMap`. `pendingMapState` below is where it lands.
	 *
	 * **It is one-shot** — the data path applies it and sets it to null — so it
	 * holds a camera in place only until the first data update. `TrackLayer.held`
	 * is what holds it after that; see the `focus()` notes in CLAUDE.md.
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
	style?: { _loaded?: boolean };
	scrollZoom: { disable(): void; enable(): void };
	isStyleLoaded?(): boolean;
	getStyle?(): unknown;
	getSource(id: string): GeoJSONSource | undefined;
	addSource(id: string, spec: unknown): void;
	removeSource(id: string): void;
	getLayer(id: string): unknown;
	addLayer(spec: unknown, before?: string): void;
	removeLayer(id: string): void;
	setPaintProperty(layerId: string, name: string, value: unknown): void;
	setLayoutProperty(layerId: string, name: string, value: unknown): void;
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
	addControl(control: MapControl, position?: string): void;
	removeControl(control: MapControl): void;
	on(type: string, listener: (ev: any) => void): void;
	on(type: string, layerId: string, listener: (ev: any) => void): void;
	off(type: string, listener: (ev: any) => void): void;
	getCenter(): LngLat | null;
	setCenter(center: LngLat): void;
	getZoom?(): number;
	/** A move around the map the reader can follow with their eyes. */
	flyTo?(options: { center?: [number, number]; zoom?: number }): void;
	/** …and the same move made instantly, for a map that has only just appeared. */
	jumpTo?(options: { center?: [number, number]; zoom?: number }): void;
	getBounds(): LngLatBounds;
	fitBounds(bounds: LngLatBounds, options?: { padding?: number; maxZoom?: number; animate?: boolean }): void;
	/** Pixel back to a coordinate — in tile space, like everything the map holds. */
	unproject(point: [number, number]): LngLat;
	getCanvas(): HTMLCanvasElement;
	resize(): void;
	/** Where MapLibre keeps the controls it has been handed, the locate one included. */
	_controls?: unknown[];
}
