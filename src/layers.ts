import { setIcon } from 'obsidian';
import type { FeatureCollection } from 'geojson';
import {
	ARROW_LAYER,
	ENDPOINT_LAYER,
	LINE_LAYER,
	MARKER_LAYER,
	PHOTO_DOT_LAYER,
	PHOTO_ICON_PREFIX,
	PHOTO_ICON_MAX,
	PHOTO_ICON_PX,
	PHOTO_LAYER,
	POINT_LAYER,
	SRC,
	TRACK_KNOBS,
} from './constants';
import { toTileSpace, type CoordSystem } from './coords';
import type { ExifThumbnail } from './exif';
import { t } from './i18n';
import { photoImageId, projectedFeatures, type TrackRecord } from './track-cache';
import type { LngLatBounds, LocateControl, MapControl, MapLibreMap } from './types/obsidian-internals';

/** Shared native-looking MapLibre control button. */
class ControlButton implements MapControl {
	protected readonly containerEl: HTMLElement;
	/** Null until `onAdd`, and again after `onRemove`. */
	protected buttonEl: HTMLElement | null = null;

	constructor(
		private readonly icon: string,
		private readonly label: string,
		private readonly onClick: () => void
	) {
		this.containerEl = createDiv('maplibregl-ctrl maplibregl-ctrl-group canvas-control-group mod-raised');
	}

	onAdd(): HTMLElement {
		const btn = this.containerEl.createDiv({
			cls: 'canvas-control-item',
			attr: { 'aria-label': this.label },
		});
		setIcon(btn, this.icon);
		btn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			this.onClick();
		});
		this.buttonEl = btn;
		return this.containerEl;
	}

	onRemove(): void {
		this.buttonEl = null;
		this.containerEl.detach();
	}
}

/** A zoom-to-fit button. */
export class FitControl extends ControlButton {
	constructor(onClick: () => void) {
		super('scan', t('control.zoomToFit'), onClick);
	}
}

/** Per-map follow toggle; pressed state is exposed through class and ARIA state. */
export class FollowControl extends ControlButton {
	constructor(onToggle: () => void) {
		super('crosshair', t('control.follow'), onToggle);
	}

	override onAdd(): HTMLElement {
		const el = super.onAdd();
		this.buttonEl?.addClass('advanced-maps-follow');
		return el;
	}

	setActive(on: boolean): void {
		const btn = this.buttonEl;
		if (!btn) return;
		btn.toggleClass('is-active', on);
		btn.setAttribute('aria-pressed', String(on));
		// The label says what the button does next, which is the half a reader
		// cannot get from the pressed look alone.
		btn.setAttribute('aria-label', t(on ? 'control.followOff' : 'control.follow'));
	}
}

export interface LocateGuard {
	/** Re-place the last fix, for when the tiles have changed under the dot. */
	replaceDot(): void;
	restore(): void;
}

/** Wrap the native locate control instance so its WGS-84 fixes enter tile space once. */
export function guardLocateControl(map: MapLibreMap, system: () => CoordSystem): LocateGuard | null {
	const controls = Array.isArray(map._controls) ? map._controls : [];
	const control = controls.find(
		(c): c is LocateControl => typeof (c as LocateControl | null)?.updatePosition === 'function'
	);
	if (!control) return null;

	// Preserve the native receiver while replacing the instance method.
	const native = control.updatePosition.bind(control);
	let lastFix: [number, number] | null = null;
	control.updatePosition = (lat: number, lng: number) => {
		lastFix = [lat, lng];
		const [tileLng, tileLat] = toTileSpace(system(), lng, lat);
		native(tileLat, tileLng);
	};

	return {
		// Reapply the last fix after a tile-system switch without waiting for GPS.
		replaceDot: () => {
			if (lastFix) control.updatePosition(lastFix[0], lastFix[1]);
		},
		restore: () => {
			delete (control as Partial<LocateControl>).updatePosition;
		},
	};
}

/* Shared track/photo source and layers for base views and inline embeds. */

/** Image ids the two symbol layers below reference by name; see `ensureTrackIcons`. */
const START_ICON = 'advanced-maps-track-start';
const END_ICON = 'advanced-maps-track-end';
const ARROW_ICON = 'advanced-maps-track-arrow';

const lineLayerSpec = {
	id: LINE_LAYER,
	type: 'line',
	source: SRC,
	filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']],
	layout: { 'line-join': 'round', 'line-cap': 'round' },
	paint: { 'line-color': ['get', 'amColor'], 'line-width': 4, 'line-opacity': 0.85 },
};

const pointLayerSpec = {
	id: POINT_LAYER,
	type: 'circle',
	source: SRC,
	// Endpoint/photo roles have dedicated layers and must not also be waypoint dots.
	filter: [
		'all',
		['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
		['!', ['has', 'amRole']],
	],
	paint: {
		'circle-color': ['get', 'amColor'],
		'circle-radius': 4,
		'circle-stroke-width': 2,
		'circle-stroke-color': '#ffffff',
	},
};

const endpointLayerSpec = {
	id: ENDPOINT_LAYER,
	type: 'symbol',
	source: SRC,
	// Match explicit endpoint roles: photos share this source and also carry `amRole`.
	filter: ['any', ['==', ['get', 'amRole'], 'start'], ['==', ['get', 'amRole'], 'end']],
	layout: {
		'icon-image': ['match', ['get', 'amRole'], 'start', START_ICON, 'end', END_ICON, START_ICON],
		// A loop may put start and end on the same pixel; both must survive collision.
		'icon-allow-overlap': true,
		'icon-ignore-placement': true,
		'icon-size': 1,
	},
	paint: {},
};

const arrowLayerSpec = {
	id: ARROW_LAYER,
	type: 'symbol',
	source: SRC,
	filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']],
	layout: {
		'icon-image': ARROW_ICON,
		'symbol-placement': 'line',
		'symbol-spacing': 90,
		// Line placement aligns the image's +x axis to travel, so the canvas arrow points right.
		'icon-rotation-alignment': 'map',
		'icon-allow-overlap': true,
		'icon-ignore-placement': true,
		'icon-size': 1,
	},
	paint: {},
};

/* Every photo gets a dot; the thumbnail symbol overlays it only when its image is registered. */

const photoDotLayerSpec = {
	id: PHOTO_DOT_LAYER,
	type: 'circle',
	source: SRC,
	filter: ['==', ['get', 'amRole'], 'photo'],
	paint: {
		// A photo inherits its owning note's colour.
		'circle-color': ['get', 'amColor'],
		'circle-radius': 6,
		'circle-stroke-width': 2,
		'circle-stroke-color': '#ffffff',
	},
};

const photoLayerSpec = {
	id: PHOTO_LAYER,
	type: 'symbol',
	source: SRC,
	filter: ['==', ['get', 'amRole'], 'photo'],
	layout: {
		'icon-image': ['get', 'amPhoto'],
		// Photos deliberately use MapLibre collision to thin crowded thumbnails.
		'icon-allow-overlap': false,
		'icon-ignore-placement': false,
		// Stable note/source order makes collision survivorship deterministic.
		'symbol-sort-key': ['get', 'amIndex'],
		'icon-size': 1,
	},
	paint: {},
};

/* ---- icons ---- Native raster styles have no usable sprite/glyph set, so these are canvas images. */

/** CSS pixels; canvas pixels are multiplied by ICON_SCALE. */
const ENDPOINT_PX = 20;
/** CSS px; paired with the 1.6 size clamp because oversized line symbols are dropped, not shrunk. */
const ARROW_PX = 18;
const ICON_SCALE = 3;

/** Resolve CSS variables through the current Obsidian theme. */
function resolveCssColor(css: string): string {
	const probe = document.body.createDiv();
	probe.setCssStyles({ color: css });
	const resolved = getComputedStyle(probe).color;
	probe.remove();
	return resolved;
}

/** Draw a synchronous high-density canvas icon. */
function drawIcon(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): ImageData {
	const canvas = createEl('canvas');
	const px = size * ICON_SCALE;
	canvas.width = px;
	canvas.height = px;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Advanced Maps: no 2D canvas context for a track icon');
	ctx.scale(ICON_SCALE, ICON_SCALE);
	draw(ctx, size);
	return ctx.getImageData(0, 0, px, px);
}

/** Add theme-aware endpoint and arrow images once per style. */
function ensureTrackIcons(map: MapLibreMap): void {
	if (map.hasImage(START_ICON) && map.hasImage(END_ICON) && map.hasImage(ARROW_ICON)) return;
	const halo = resolveCssColor('var(--background-primary)');
	const startColor = resolveCssColor('var(--text-success)');
	const endColor = resolveCssColor('var(--text-error)');
	const arrowColor = resolveCssColor('var(--text-muted)');

	if (!map.hasImage(START_ICON)) {
		map.addImage(
			START_ICON,
			drawIcon(ENDPOINT_PX, (ctx, size) => {
				ctx.beginPath();
				ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
				ctx.fillStyle = startColor;
				ctx.fill();
				ctx.lineWidth = 2;
				ctx.strokeStyle = halo;
				ctx.stroke();
			}),
			{ pixelRatio: ICON_SCALE }
		);
	}
	if (!map.hasImage(END_ICON)) {
		map.addImage(
			END_ICON,
			drawIcon(ENDPOINT_PX, (ctx, size) => {
				// Solid start versus ring end remains distinguishable without colour.
				const r = size / 2 - 2;
				ctx.beginPath();
				ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
				ctx.fillStyle = endColor;
				ctx.fill();
				ctx.lineWidth = 2;
				ctx.strokeStyle = halo;
				ctx.stroke();
				// Fill the ring hole with the halo so the underlying line does not show.
				ctx.beginPath();
				ctx.arc(size / 2, size / 2, r * 0.42, 0, Math.PI * 2);
				ctx.fillStyle = halo;
				ctx.fill();
			}),
			{ pixelRatio: ICON_SCALE }
		);
	}
	if (!map.hasImage(ARROW_ICON)) {
		map.addImage(
			ARROW_ICON,
			drawIcon(ARROW_PX, (ctx, size) => {
				// A notched tail gives the right-pointing line symbol an unambiguous back.
				ctx.beginPath();
				ctx.moveTo(size * 0.95, size / 2);
				ctx.lineTo(size * 0.12, size * 0.88);
				ctx.lineTo(size * 0.4, size / 2);
				ctx.lineTo(size * 0.12, size * 0.12);
				ctx.closePath();
				ctx.fillStyle = arrowColor;
				ctx.fill();
				// A thin halo separates the arrow from its line without filling the notch.
				ctx.lineWidth = 1.2;
				ctx.strokeStyle = halo;
				ctx.lineJoin = 'round';
				ctx.stroke();
			}),
			{ pixelRatio: ICON_SCALE }
		);
	}
}

/** Add owned layers in visual order, all beneath the native marker layer when present. */
export function addTrackLayers(map: MapLibreMap): void {
	ensureTrackIcons(map);
	const before = map.getLayer(MARKER_LAYER) ? MARKER_LAYER : undefined;
	map.addLayer(lineLayerSpec, before);
	map.addLayer(arrowLayerSpec, before);
	map.addLayer(pointLayerSpec, before);
	map.addLayer(endpointLayerSpec, before);
	// Photos are the most specific feature and render above track points/endpoints.
	map.addLayer(photoDotLayerSpec, before);
	map.addLayer(photoLayerSpec, before);
}

/**
 * Put a collection on the map: update the source if it is already there,
 * otherwise create it and add all four layers.
 *
 * Answers false when the style was swapped out from under the caller. That is
 * not an error — `style.load` fires next and the caller draws again — which is
 * why it is a return value rather than a throw.
 */
export function drawTracks(map: MapLibreMap, data: FeatureCollection): boolean {
	try {
		const source = map.getSource(SRC);
		if (source) source.setData(data);
		else {
			map.addSource(SRC, { type: 'geojson', data });
			addTrackLayers(map);
		}
		return true;
	} catch (e) {
		// `addLayer` can lose a race with a style transition after addSource (or
		// after only some of the six layers). Leaving that prefix behind makes the
		// next call take the setData-only branch forever, so the missing layers can
		// never recover. Roll the whole owned group back to one known state; the
		// next style event/sync then rebuilds it from scratch.
		removeTrackLayers(map);
		console.warn('Advanced Maps: deferring track layers —', e instanceof Error ? e.message : e);
		return false;
	}
}

/** `animate: false` because this is a jump to a new subject, not a move around one. */
export function fitTo(map: MapLibreMap, bounds: LngLatBounds, padding: number, maxZoom: number): void {
	map.fitBounds(bounds, { padding, maxZoom, animate: false });
}

export function removeTrackLayers(map: MapLibreMap): void {
	if (!map.getStyle) return;
	try {
		for (const id of [LINE_LAYER, ARROW_LAYER, POINT_LAYER, ENDPOINT_LAYER, PHOTO_DOT_LAYER, PHOTO_LAYER]) {
			if (map.getLayer(id)) map.removeLayer(id);
		}
		if (map.getSource(SRC)) map.removeSource(SRC);
		// Layers first, images second: removeImage on an image a live layer still
		// references throws, and every layer that could reference one of these
		// three has just been removed above.
		for (const id of [START_ICON, END_ICON, ARROW_ICON]) {
			if (map.hasImage(id)) map.removeImage(id);
		}
		// Refresh removes layers but keeps decoded photo images for the immediate redraw.
	} catch {
		/* style already torn down */
	}
}

/** Apply paint and visibility every sync so settings-only changes reach live maps. */
export function applyTrackPaint(
	map: MapLibreMap,
	weight: number,
	opacity: number,
	stroke: string,
	showMarkers: boolean,
	photoThumbnails: boolean
): void {
	if (map.getLayer(LINE_LAYER)) {
		map.setPaintProperty(LINE_LAYER, 'line-width', weight);
		map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
	}
	if (map.getLayer(POINT_LAYER)) {
		map.setPaintProperty(POINT_LAYER, 'circle-radius', Math.max(3, Math.round(weight * 1.1)));
		map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', stroke);
		map.setPaintProperty(POINT_LAYER, 'circle-opacity', opacity);
	}
	// Scale markers with line weight, bounded because oversized line symbols disappear.
	const iconSize = Math.max(0.7, Math.min(1.6, weight / TRACK_KNOBS.trackWeight.def));
	for (const id of [ENDPOINT_LAYER, ARROW_LAYER]) {
		if (!map.getLayer(id)) continue;
		map.setLayoutProperty(id, 'visibility', showMarkers ? 'visible' : 'none');
		map.setPaintProperty(id, 'icon-opacity', opacity);
		map.setLayoutProperty(id, 'icon-size', iconSize);
	}
	if (map.getLayer(PHOTO_DOT_LAYER)) {
		// Photo fallback size follows its fixed thumbnail size, not track weight.
		map.setPaintProperty(PHOTO_DOT_LAYER, 'circle-stroke-color', stroke);
		map.setPaintProperty(PHOTO_DOT_LAYER, 'circle-opacity', opacity);
	}
	if (map.getLayer(PHOTO_LAYER)) {
		map.setLayoutProperty(PHOTO_LAYER, 'visibility', photoThumbnails ? 'visible' : 'none');
	}
}

/* ---- photo thumbnails ---- Decoding is async; draw paths stay synchronous and dots cover pending icons. */

/** What one photo needs to become a registered `map.addImage` bitmap. */
export interface PhotoIconSource {
	id: string;
	/** Present when this session already read the bytes; otherwise `load` has them. */
	thumbnail?: ExifThumbnail;
	/** Reads the bytes for a photo restored from the persistent index. */
	load?: () => Promise<ExifThumbnail | undefined>;
	orientation: number;
	/** Tile-space point, so viewport selection uses the same space as the map. */
	coordinates: [number, number];
}

/**
 * Shared icon-candidate builder; null when the photo has no thumbnail or no
 * mapped Point.
 *
 * A record restored from the persistent index states that a thumbnail exists
 * without holding it, so eligibility is decided by `has` rather than by the
 * bytes — the read for those is deferred to `decodePhotoIcon`, which runs only
 * for the photos actually selected on screen.
 */
export function photoIconSource(path: string, rec: TrackRecord, system: CoordSystem): PhotoIconSource | null {
	const photo = rec.photo;
	if (!photo?.has) return null;
	const point = projectedFeatures(rec, system).find((feature) => feature.geometry.type === 'Point');
	if (point?.geometry.type !== 'Point') return null;
	return {
		id: photoImageId(path),
		thumbnail: photo.thumbnail,
		load: photo.load,
		orientation: photo.orientation,
		coordinates: [point.geometry.coordinates[0], point.geometry.coordinates[1]] as [number, number],
	};
}

/** Bound concurrent JPEG decoding for large bases. */
export const PHOTO_DECODE_CONCURRENCY = 4;

interface PhotoDecodeState {
	active: number;
	pending: Set<string>;
	queued: Map<string, PhotoIconSource>;
	/** The collision-selected on-screen ids this map currently wants. */
	wanted: Set<string>;
	/** Oldest-to-newest LRU; `map.hasImage` remains authoritative after style replacement. */
	order: Map<string, true>;
}

/**
 * Per-map bookkeeping, keyed by the map itself rather than held as a field on
 * `TrackLayer` or `TrackEmbed`: both call this against their own map, and
 * neither would have anywhere natural to remember to clear it — the WeakMap
 * does that for free once the map itself is garbage.
 */
const photoDecodeStates = new WeakMap<MapLibreMap, PhotoDecodeState>();

function photoDecodeState(map: MapLibreMap): PhotoDecodeState {
	let state = photoDecodeStates.get(map);
	if (!state) {
		state = { active: 0, pending: new Set(), queued: new Map(), wanted: new Set(), order: new Map() };
		photoDecodeStates.set(map, state);
	}
	return state;
}

/** Cancel queued work; active decodes discard their result through `wanted`. */
export function cancelPhotoImages(map: MapLibreMap): void {
	const state = photoDecodeStates.get(map);
	if (!state) return;
	state.wanted.clear();
	state.queued.clear();
}

/**
 * Release photo images when this plugin is permanently detaching from a map.
 * Unlike `removeTrackLayers`, this is terminal: a subsequent redraw must not
 * retain GPU images or let active decodes commit into the map.
 */
export function disposePhotoImages(map: MapLibreMap): void {
	const state = photoDecodeStates.get(map);
	const ownedIds = [...(state?.order.keys() ?? [])];
	// Delete ownership before any map calls. An active decode that resumes while
	// image removal is in progress then sees no wanted state and discards itself.
	state?.wanted.clear();
	state?.queued.clear();
	state?.pending.clear();
	state?.order.clear();
	photoDecodeStates.delete(map);

	let ids: Iterable<string> = ownedIds;
	if (typeof map.listImages === 'function') {
		try {
			ids = map.listImages().filter((id) => id.startsWith(PHOTO_ICON_PREFIX));
		} catch {
			// A half-destroyed native style can reject enumeration; current-module
			// ownership still lets us release the images we know we registered.
		}
	}
	for (const id of ids) {
		try {
			map.removeImage(id);
		} catch {
			// Keep disposal best-effort: one missing or style-owned image must not
			// prevent removing other Advanced Maps thumbnails.
		}
	}
}

/** Select fixed-size, non-overlapping visible icons in O(n); source order breaks ties. */
export function selectPhotoIconIds(map: MapLibreMap, records: readonly PhotoIconSource[]): Set<string> {
	const fallback = (): Set<string> => new Set(records.slice(0, PHOTO_ICON_MAX).map((record) => record.id));

	try {
		if (typeof map.project !== 'function') return fallback();
		const canvas = typeof map.getCanvas === 'function' ? map.getCanvas() : undefined;
		const container = typeof map.getContainer === 'function' ? map.getContainer() : undefined;
		const width = container?.clientWidth || canvas?.clientWidth || canvas?.width || 0;
		const height = container?.clientHeight || canvas?.clientHeight || canvas?.height || 0;
		if (width <= 0 || height <= 0) return fallback();

		const selected = new Set<string>();
		// One accepted icon per cell, never a list: two points in the same cell are
		// within `collisionSize` on both axes by construction, so the second of them
		// always collides with the first and is never stored beside it.
		const cells = new Map<string, { x: number; y: number }>();
		// MapLibre's default icon-padding is 2 CSS px on every edge.
		const collisionSize = PHOTO_ICON_PX + 4;
		const half = collisionSize / 2;
		for (const record of records) {
			const point = map.project(record.coordinates);
			if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
			if (point.x < -half || point.y < -half || point.x > width + half || point.y > height + half) continue;

			const cx = Math.floor(point.x / collisionSize);
			const cy = Math.floor(point.y / collisionSize);
			let collides = false;
			for (let dx = -1; dx <= 1 && !collides; dx++) {
				for (let dy = -1; dy <= 1 && !collides; dy++) {
					const accepted = cells.get(`${cx + dx},${cy + dy}`);
					if (
						accepted &&
						Math.abs(point.x - accepted.x) < collisionSize &&
						Math.abs(point.y - accepted.y) < collisionSize
					) {
						collides = true;
					}
				}
			}
			if (collides) continue;
			selected.add(record.id);
			cells.set(`${cx},${cy}`, point);
		}
		return selected;
	} catch {
		// A map midway through construction or teardown may reject projection.
		// Keep the operation useful and bounded; moveend retries once it settles.
		return fallback();
	}
}

/** Best-effort style liveness check safe during map teardown. */
function mapAlive(map: MapLibreMap): boolean {
	try {
		return typeof map.getStyle === 'function' && !!map.getStyle();
	} catch {
		return false;
	}
}

/** Apply EXIF orientation 1–8 using unrotated source dimensions. */
function applyOrientation(ctx: CanvasRenderingContext2D, orientation: number, w: number, h: number): void {
	switch (orientation) {
		case 2:
			ctx.transform(-1, 0, 0, 1, w, 0);
			break;
		case 3:
			ctx.transform(-1, 0, 0, -1, w, h);
			break;
		case 4:
			ctx.transform(1, 0, 0, -1, 0, h);
			break;
		case 5:
			ctx.transform(0, 1, 1, 0, 0, 0);
			break;
		case 6:
			ctx.transform(0, 1, -1, 0, h, 0);
			break;
		case 7:
			ctx.transform(0, -1, -1, 0, h, w);
			break;
		case 8:
			ctx.transform(0, -1, 1, 0, 0, w);
			break;
		default:
			break;
	}
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/** Orient first, then cover-fit into a rounded square with a theme halo. */
function drawPhotoIcon(bitmap: ImageBitmap, orientation: number): ImageData {
	const halo = resolveCssColor('var(--background-primary)');
	const swapped = orientation >= 5 && orientation <= 8;
	const srcW = bitmap.width;
	const srcH = bitmap.height;

	// Orient on a scratch canvas before calculating the cover-fit crop.
	const upright = createEl('canvas');
	upright.width = swapped ? srcH : srcW;
	upright.height = swapped ? srcW : srcH;
	const uctx = upright.getContext('2d');
	if (!uctx) throw new Error('Advanced Maps: no 2D canvas context for a photo thumbnail');
	applyOrientation(uctx, orientation, srcW, srcH);
	uctx.drawImage(bitmap, 0, 0);

	// Pass 2: cover-fit into the square icon, clipped to a rounded rect.
	const px = PHOTO_ICON_PX * ICON_SCALE;
	const canvas = createEl('canvas');
	canvas.width = px;
	canvas.height = px;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Advanced Maps: no 2D canvas context for a photo thumbnail');

	const strokeWidth = 2 * ICON_SCALE;
	const radius = px * 0.22;
	roundedRectPath(ctx, strokeWidth / 2, strokeWidth / 2, px - strokeWidth, px - strokeWidth, radius);
	ctx.save();
	ctx.clip();
	const scale = Math.max(px / upright.width, px / upright.height);
	const dw = upright.width * scale;
	const dh = upright.height * scale;
	ctx.drawImage(upright, (px - dw) / 2, (px - dh) / 2, dw, dh);
	ctx.restore();

	// Reuse the clipping path for an exactly aligned border.
	roundedRectPath(ctx, strokeWidth / 2, strokeWidth / 2, px - strokeWidth, px - strokeWidth, radius);
	ctx.lineWidth = strokeWidth;
	ctx.strokeStyle = halo;
	ctx.stroke();

	return ctx.getImageData(0, 0, px, px);
}

/** Decode, draw, and register one photo, rechecking map/wanted state after awaits. */
async function decodePhotoIcon(map: MapLibreMap, record: PhotoIconSource): Promise<void> {
	const { id, orientation } = record;
	try {
		// A photo restored from the persistent index reaches here without bytes.
		// This is the one place they are worth reading: the map has already
		// selected this photo, so the read follows the viewport rather than the
		// result set. A file that turns out to hold none simply stays a dot.
		const thumbnail = record.thumbnail ?? (await record.load?.());
		if (!thumbnail) return;
		// The selection may have moved on during that read, exactly as it may
		// during the decode below.
		if (!photoDecodeStates.get(map)?.wanted.has(id)) return;
		// `new Uint8Array(thumbnail.bytes)` rather than the bytes themselves: a
		// `Uint8Array` sliced out of a `SharedArrayBuffer`-backed source types as
		// `Uint8Array<ArrayBufferLike>`, which `BlobPart` (TS 5.9's lib.dom)
		// refuses — going through the array-like constructor overload allocates
		// a fresh, plain `ArrayBuffer`-backed copy that `Blob` accepts.
		const blob = new Blob([new Uint8Array(thumbnail.bytes)], { type: 'image/jpeg' });
		const bitmap = await createImageBitmap(blob);
		// Terminal disposal deletes the map state before image removal. Check before
		// canvas work as well as before registration, so a late decode is released
		// immediately and cannot recreate a thumbnail after detach.
		if (!photoDecodeStates.get(map)?.wanted.has(id)) {
			bitmap.close();
			return;
		}
		let imageData: ImageData;
		try {
			imageData = drawPhotoIcon(bitmap, orientation);
		} finally {
			bitmap.close();
		}
		// The map/style may have disappeared while the bitmap decoded.
		if (!mapAlive(map)) return;
		// Panning or a newer sync may have replaced the viewport selection while
		// this JPEG was decoding. The work cannot be cancelled, but registering its
		// GPU image can — unwanted photos stay as dots.
		if (!photoDecodeStates.get(map)?.wanted.has(id)) return;
		if (map.hasImage(id)) return; // a second call already won this id first
		map.addImage(id, imageData, { pixelRatio: ICON_SCALE });
		const { order } = photoDecodeState(map);
		order.delete(id);
		order.set(id, true); // most-recently-registered, for the LRU walk below
	} catch (e) {
		console.warn(`Advanced Maps: could not decode a photo thumbnail (${id}) —`, e instanceof Error ? e.message : e);
	}
}

function pumpPhotoDecodes(map: MapLibreMap, state: PhotoDecodeState): void {
	while (state.active < PHOTO_DECODE_CONCURRENCY && state.queued.size > 0) {
		const next = state.queued.entries().next().value;
		if (!next) return;
		const [id, record] = next;
		state.queued.delete(id);
		if (!state.wanted.has(id) || state.pending.has(id) || map.hasImage(id)) continue;
		state.active++;
		state.pending.add(id);
		void decodePhotoIcon(map, record).finally(() => {
			state.pending.delete(id);
			state.active--;
			if (mapAlive(map)) pumpPhotoDecodes(map, state);
		});
	}
}

/** Admit all selected icons, bound concurrent decode and off-screen LRU, and return synchronously. */
export function ensurePhotoImages(map: MapLibreMap, records: readonly PhotoIconSource[]): void {
	if (!mapAlive(map)) return;
	const state = photoDecodeState(map);
	const order = state.order;
	const selected = selectPhotoIconIds(map, records);

	// Reconcile after style reload, then bound only off-screen warm entries.
	for (const id of order.keys()) {
		if (!map.hasImage(id)) order.delete(id);
	}
	let spare = 0;
	for (const id of order.keys()) if (!selected.has(id)) spare++;
	for (const record of records) {
		if (!selected.has(record.id) || !map.hasImage(record.id)) continue;
		order.delete(record.id);
		order.set(record.id, true); // touch: most-recently-wanted
	}

	for (const id of order.keys()) {
		if (spare <= PHOTO_ICON_MAX) break;
		if (selected.has(id)) continue;
		try {
			map.removeImage(id);
			order.delete(id);
			spare--;
		} catch {
			// Keep it counted; retry after the style transition settles.
		}
	}

	// A queued decode has not spent anything yet, so panning away cancels it
	// outright. An active createImageBitmap cannot be cancelled, but its result
	// checks `state.wanted` before registering.
	state.wanted = selected;
	for (const id of state.queued.keys()) {
		if (!selected.has(id)) state.queued.delete(id);
	}
	for (const record of records) {
		if (!selected.has(record.id) || map.hasImage(record.id)) continue;
		if (state.pending.has(record.id) || state.queued.has(record.id)) continue;
		state.queued.set(record.id, record);
	}
	pumpPhotoDecodes(map, state);
}
