import { setIcon } from 'obsidian';
import type { FeatureCollection } from 'geojson';
import { ARROW_LAYER, ENDPOINT_LAYER, LINE_LAYER, MARKER_LAYER, POINT_LAYER, SRC, TRACK_KNOBS } from './constants';
import { toTileSpace, type CoordSystem } from './coords';
import { t } from './i18n';
import type { LngLatBounds, LocateControl, MapControl, MapLibreMap } from './types/obsidian-internals';

/** A zoom-to-fit button, wearing the same markup as the built-in controls. */
export class FitControl implements MapControl {
	private readonly containerEl: HTMLElement;

	constructor(private readonly onClick: () => void) {
		this.containerEl = createDiv('maplibregl-ctrl maplibregl-ctrl-group canvas-control-group mod-raised');
	}

	onAdd(): HTMLElement {
		const btn = this.containerEl.createDiv({
			cls: 'canvas-control-item',
			attr: { 'aria-label': t('control.zoomToFit') },
		});
		setIcon(btn, 'scan');
		btn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			this.onClick();
		});
		return this.containerEl;
	}

	onRemove(): void {
		this.containerEl.detach();
	}
}

export interface LocateGuard {
	/** Re-place the last fix, for when the tiles have changed under the dot. */
	replaceDot(): void;
	restore(): void;
}

/**
 * The built-in "locate me" button — the Maps plugin's own control, added on
 * mobile only — hands the device's WGS-84 fix straight to the map, which lands
 * the dot a few streets from where you are once the tiles are Chinese.
 *
 * `updatePosition` is the single door a fix comes through: the dot and the
 * fly-to that follows are both derived from it, so one wrapper covers both. It
 * is wrapped on the *instance*, so `delete` puts the prototype method back.
 *
 * Answers null on the desktop, and on any Obsidian that has moved the control
 * somewhere this cannot see.
 */
export function guardLocateControl(map: MapLibreMap, system: () => CoordSystem): LocateGuard | null {
	const controls = Array.isArray(map._controls) ? map._controls : [];
	const control = controls.find(
		(c): c is LocateControl => typeof (c as LocateControl | null)?.updatePosition === 'function'
	);
	if (!control) return null;

	// Bound now rather than `.call`-ed later: the native control reads its own
	// state out of `this`, and a bare reference to the method is a `this`-less
	// function the moment it leaves the object.
	const native = control.updatePosition.bind(control);
	let lastFix: [number, number] | null = null;
	control.updatePosition = (lat: number, lng: number) => {
		lastFix = [lat, lng];
		const [tileLng, tileLat] = toTileSpace(system(), lng, lat);
		native(tileLat, tileLng);
	};

	return {
		// A device only sends a fix when it feels like it, so standing still after
		// a background switch would otherwise leave the dot visibly stale.
		replaceDot: () => {
			if (lastFix) control.updatePosition(lastFix[0], lastFix[1]);
		},
		restore: () => {
			delete (control as Partial<LocateControl>).updatePosition;
		},
	};
}

/*
 * One GeoJSON source, four layers: the lines, direction arrows along them, a
 * circle for every waypoint, and start/end pins. All four take their colour
 * (or, for the pins and arrows, their whole image) per-feature, so one source
 * can carry every note's track in that note's own colour.
 *
 * The base view and an inline embed draw the same four, which is why adding,
 * removing and painting them all live here rather than once on each side.
 */

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
	// `trackFeatures()` in geometry.ts adds a synthetic Point at each line's
	// start and end, tagged `amRole`, so they can be picked out of this same
	// source for the endpoint layer below rather than drawn twice as ordinary
	// waypoint dots too.
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
	filter: ['has', 'amRole'],
	layout: {
		'icon-image': ['match', ['get', 'amRole'], 'start', START_ICON, 'end', END_ICON, START_ICON],
		// Collision detection defaults on for a symbol layer (unlike the circle
		// layer above, which has none), and a loop route puts both markers on the
		// same pixel — without both of these MapLibre would silently drop one of
		// the two rather than draw them stacked. Native marker-pins sets both for
		// the identical reason (obsidian-maps/src/map/markers.ts).
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
		// The icon is drawn pointing RIGHT in its own canvas — see ensureTrackIcons
		// — because 'map' alignment on a line placement rotates the image's +x axis
		// onto the line's bearing, not its top. Same convention as text along a
		// line, which reads left-to-right in the direction of travel, and the
		// reason every OSM one-way arrow sprite is drawn pointing right. Drawing
		// it pointing up instead is a silent 90° error: the arrows still sit on
		// the line, still rotate as it turns, and point across it the whole way.
		'icon-rotation-alignment': 'map',
		'icon-allow-overlap': true,
		'icon-ignore-placement': true,
		'icon-size': 1,
	},
	paint: {},
};

/* ---- icons ----
 *
 * The native raster style ships no glyphs and no sprite (obsidian-maps's own
 * style.ts is version 8, sources and layers, nothing else), so a `text-field`
 * renders nothing on it — and images, like every other part of a style, are
 * wiped by a theme or background switch and have to be put back afterwards,
 * same as the layers above. `map.addImage()` is what the native marker code
 * already leans on for its own pins, so this follows the same door rather than
 * opening a new one.
 *
 * Three ordinary canvas path shapes rather than Lucide icons through
 * `setIcon()`: a Lucide name that does not exist in Obsidian's bundled icon
 * set renders nothing, silently, and there is no way to probe for one from
 * outside a running Obsidian. A hand-drawn path cannot fail that way.
 *
 * Which shapes, though, took a phone to settle, and the first answer was wrong
 * on two of the three. A plain filled triangle does not read as an arrow at
 * this size — at 12 px its apex was 6 px from either base corner, so nothing
 * said which of the three was the front — and an axis-aligned filled square,
 * sitting beside Obsidian's own rounded map controls, reads as an image that
 * failed to load. Both are fixed below, and both were only visible on a
 * screenshot: a triangle and a square are exactly the shapes that look
 * reasonable in the source.
 *
 * No SDF and no `icon-color`. `icon-color` only tints an SDF-marked image, and
 * a hand-authored true distance field is the kind of thing that looks fine
 * until it is rendered at a couple of different zoom levels and turns out
 * aliased at one of them. The colour is baked into the pixels instead, which
 * is also why there is no per-note track colour here — see `ensureTrackIcons`
 * below for the fixed, theme-aware palette this draws with, chosen for
 * contrast over pretty.
 */

/** CSS pixels the icon is meant to display at; the canvas is rendered larger
 *  than this and handed to MapLibre with a matching `pixelRatio`, the same way
 *  a retina image is served larger than its layout size. */
const ENDPOINT_PX = 20;
/** 18 rather than the 12 this shipped at: the notched tail below needs room to
 *  read as a notch, and at 12 the halo stroke was closing it back up. Do not
 *  raise this much further, and do not raise `applyTrackPaint`'s 1.6 clamp on
 *  `icon-size` to compensate for a thin line: measured, a line-placed symbol
 *  MapLibre cannot fit on its segment is **dropped**, not shrunk — at
 *  `icon-size: 4` every arrow on this track vanished rather than getting
 *  bigger. 18 × the 1.6 clamp is still inside what places. */
const ARROW_PX = 18;
const ICON_SCALE = 3;

/**
 * A CSS colour — possibly a `var(--x)` — resolved to whatever the browser
 * actually paints. The same hidden-element-plus-`getComputedStyle` probe the
 * native `MarkerManager.resolveColor` and `TrackLayer.resolve()` already use,
 * duplicated here rather than threaded through `drawTracks()`/`addTrackLayers()`
 * as a parameter: those two are called from many places, and widening their
 * signature to share five lines of already-precedented DOM probing is worse
 * than the duplication.
 */
function resolveCssColor(css: string): string {
	const probe = document.body.createDiv();
	probe.setCssStyles({ color: css });
	const resolved = getComputedStyle(probe).color;
	probe.remove();
	return resolved;
}

/** A `size`×`size` (CSS px) icon, drawn at `ICON_SCALE`× and read back
 *  synchronously — there is nothing async about a canvas path fill, so this
 *  skips the decode round trip the native, SVG-rasterizing marker code needs. */
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

/**
 * The three icons the two symbol layers reference, added once per style —
 * `map.hasImage` is the per-icon guard, so a style swap (which wipes every
 * image along with every source and layer) is what makes this run again
 * rather than an explicit "is this a fresh style" flag.
 *
 * Colours: start = `var(--text-success)`, end = `var(--text-error)`, the arrow
 * = `var(--text-muted)`, every one haloed in `var(--background-primary)` — the
 * same halo idiom the waypoint circles already use via `circle-stroke-color`
 * in `applyTrackPaint`, so the ring always matches the page rather than a
 * hardcoded white. `text-success`/`text-error`/`text-muted` against
 * `background-primary` is the base contrast pairing Obsidian's own theme
 * system already guarantees on both a light and a dark theme, not a colour
 * this plugin picked and hoped works.
 */
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
				// A ring, at the same diameter as the start disc. Solid-versus-ring is
				// also what carries the pair for a reader who cannot tell
				// `text-success` from `text-error`, which colour alone would not.
				const r = size / 2 - 2;
				ctx.beginPath();
				ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
				ctx.fillStyle = endColor;
				ctx.fill();
				ctx.lineWidth = 2;
				ctx.strokeStyle = halo;
				ctx.stroke();
				// Punched out in the halo colour rather than left transparent: a
				// transparent hole would show the track's own line running through
				// the middle of the marker that marks where it ends.
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
				// An arrowhead with a notched tail, apex pointing RIGHT — see
				// arrowLayerSpec's `icon-rotation-alignment` for why right and not up,
				// which cost a second look at a phone to notice. The notch is the
				// other half: it gives the shape one concave end, and a viewer reads
				// "that end is the back" far faster than they read "that corner is
				// sharper". Which is what the triangle this replaces got wrong.
				ctx.beginPath();
				ctx.moveTo(size * 0.95, size / 2);
				ctx.lineTo(size * 0.12, size * 0.88);
				ctx.lineTo(size * 0.4, size / 2);
				ctx.lineTo(size * 0.12, size * 0.12);
				ctx.closePath();
				ctx.fillStyle = arrowColor;
				ctx.fill();
				// Same halo the endpoint pins get, and for the same reason: the
				// arrow sits directly on the line it decorates, so a track colour
				// close to `text-muted` would otherwise blend the two together.
				// Thinner than their 2 px, because a round-joined ring that wide on
				// a shape this small fills the notch back in.
				ctx.lineWidth = 1.2;
				ctx.strokeStyle = halo;
				ctx.lineJoin = 'round';
				ctx.stroke();
			}),
			{ pixelRatio: ICON_SCALE }
		);
	}
}

/**
 * All four layers, anchored below the pins so a pin sitting on its own track
 * stays clickable — and, among themselves, line → arrow → point → endpoint, so
 * a start/end pin sitting exactly on a waypoint dot is not hidden underneath
 * it. `addLayer`'s `before` only orders a new layer relative to *one* named
 * layer, so getting all four right relative to each other means calling it in
 * this order, not just passing the same anchor to each.
 *
 * The anchor is probed here rather than passed in, because "tracks go below the
 * pins" is a property of these layers rather than of whoever is drawing them: a
 * second drawer that forgot to pass it would get unclickable pins, and only on
 * maps that have pins at all — which is the common case in exactly the vault
 * this plugin was built for. An embed's map carries no marker layer, so the
 * probe answers `undefined` there on its own.
 */
export function addTrackLayers(map: MapLibreMap): void {
	ensureTrackIcons(map);
	const before = map.getLayer(MARKER_LAYER) ? MARKER_LAYER : undefined;
	map.addLayer(lineLayerSpec, before);
	map.addLayer(arrowLayerSpec, before);
	map.addLayer(pointLayerSpec, before);
	map.addLayer(endpointLayerSpec, before);
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
		if (source) {
			source.setData(data);
		} else {
			map.addSource(SRC, { type: 'geojson', data });
			addTrackLayers(map);
		}
		return true;
	} catch (e) {
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
		for (const id of [LINE_LAYER, ARROW_LAYER, POINT_LAYER, ENDPOINT_LAYER]) {
			if (map.getLayer(id)) map.removeLayer(id);
		}
		if (map.getSource(SRC)) map.removeSource(SRC);
		// Layers first, images second: removeImage on an image a live layer still
		// references throws, and every layer that could reference one of these
		// three has just been removed above.
		for (const id of [START_ICON, END_ICON, ARROW_ICON]) {
			if (map.hasImage(id)) map.removeImage(id);
		}
	} catch {
		/* style already torn down */
	}
}

/**
 * Width in pixels, opacity 0–1, a stroke colour MapLibre will accept, and
 * whether the start/end pins and direction arrows should show at all.
 *
 * `showMarkers` deliberately reaches the map through here rather than through
 * `TrackLayer.signature()`/`sync()`'s upload-skip gate: this function already
 * runs unconditionally on every `sync()`/`draw()`, same as weight and opacity
 * do today, which is what lets the *Show track markers* setting take effect on
 * an already-open map at once. Folding it into the signature instead would
 * mean a plain settings toggle changes nothing the signature can see, and the
 * two new layers would keep whatever visibility they had until some unrelated
 * change — a recolour, a track file edit, a theme swap — happened to force a
 * redraw anyway. That is the exact class of bug guard #8 in "Non-obvious
 * things to leave alone" already documents for paint and framing.
 */
export function applyTrackPaint(
	map: MapLibreMap,
	weight: number,
	opacity: number,
	stroke: string,
	showMarkers: boolean
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
	// Scaled off the line weight rather than fixed, clamped so a reader who set
	// an extreme hand-edited weight (see TRACK_KNOBS' hardMax) gets a bigger or
	// smaller marker rather than one that overflows or vanishes.
	const iconSize = Math.max(0.7, Math.min(1.6, weight / TRACK_KNOBS.trackWeight.def));
	for (const id of [ENDPOINT_LAYER, ARROW_LAYER]) {
		if (!map.getLayer(id)) continue;
		map.setLayoutProperty(id, 'visibility', showMarkers ? 'visible' : 'none');
		map.setPaintProperty(id, 'icon-opacity', opacity);
		map.setLayoutProperty(id, 'icon-size', iconSize);
	}
}
