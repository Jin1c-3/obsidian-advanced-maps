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
	onunload(): void;
	/** Set by this plugin on the stub view an inline embed builds. */
	__advancedMapsHeadless?: boolean;
	/** Obsidian's Component child list, walked to adopt already-open views. */
	_children?: unknown[];
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
	addControl(control: MapControl, position?: string): void;
	removeControl(control: MapControl): void;
	on(type: string, listener: (ev: any) => void): void;
	on(type: string, layerId: string, listener: (ev: any) => void): void;
	off(type: string, listener: (ev: any) => void): void;
	getCenter(): LngLat | null;
	setCenter(center: LngLat): void;
	getBounds(): LngLatBounds;
	fitBounds(bounds: LngLatBounds, options?: { padding?: number; maxZoom?: number; animate?: boolean }): void;
	/** Pixel back to a coordinate — in tile space, like everything the map holds. */
	unproject(point: [number, number]): LngLat;
	getCanvas(): HTMLCanvasElement;
	resize(): void;
	/** Where MapLibre keeps the controls it has been handed, the locate one included. */
	_controls?: unknown[];
}
