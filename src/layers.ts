import { setIcon } from 'obsidian';
import type { FeatureCollection } from 'geojson';
import {
	ARROW_LAYER,
	ENDPOINT_LAYER,
	LINE_LAYER,
	MARKER_LAYER,
	PHOTO_DOT_LAYER,
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

/**
 * One button, wearing the same markup as the built-in controls.
 *
 * Shared by both of ours rather than written twice: two four-line `onAdd`s that
 * have to agree on which classes make a MapLibre control look like an Obsidian
 * one are exactly the kind of pair that drifts once a theme changes underneath
 * them.
 */
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

/**
 * The "follow the active note" toggle, which is what decides whether a given
 * map keeps up with the note being edited.
 *
 * It is a button on the map rather than a setting because *which* map should
 * follow is a per-map question, and no rule about where a map sits answers it.
 * Sidebar-only was that rule for two versions, and it got the split-screen case
 * — a note in one tab group, a map in the next one over — exactly wrong.
 *
 * The pressed state is a class and an `aria-pressed`, not a second icon: the
 * built-in controls have no pressed look to inherit, so `styles.css` states one.
 */
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
	// Explicit start/end, not the bare `['has', 'amRole']` this shipped with —
	// a photo's own Point carries `amRole: 'photo'` (see PHOTO_LAYER below) on
	// the very same source, and `has` does not care which value is there. Left
	// as `has`, every photo would additionally match this filter and grow a
	// green start pin of its own, since the icon-image `match` expression below
	// falls back to START_ICON for anything it does not recognise.
	filter: ['any', ['==', ['get', 'amRole'], 'start'], ['==', ['get', 'amRole'], 'end']],
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

/*
 * A photo is "a track file with one Point in it" (exif.ts / track-cache.ts's
 * loadPhoto), sharing SRC with every other track feature and tagged
 * `amRole: 'photo'` on arrival — see geometry.ts's `trackFeatures`. Two
 * layers draw it, not one, because a photo's own thumbnail is a decoded
 * bitmap that may not exist yet (still downloading, still decoding, the file
 * carried none, or `photoThumbnails` is off), and "not there yet" still has
 * to look like *something* other than a gap in the map:
 *
 *   PHOTO_DOT_LAYER — a plain circle, always drawn the moment a photo's Point
 *   reaches the map. It lives in constants.ts beside PHOTO_LAYER, and its
 *   comment there records why it stopped being private to this file the
 *   moment anything wanted to bind a click to a photo.
 *
 *   PHOTO_LAYER — a symbol layer on top of it, `icon-image: ['get', 'amPhoto']`,
 *   which MapLibre simply does not render for a feature whose `amPhoto` names
 *   an image that is not registered. That silence is exactly the fallback
 *   this wants: the dot underneath keeps showing until (and unless) the icon
 *   above it has something to draw.
 */

const photoDotLayerSpec = {
	id: PHOTO_DOT_LAYER,
	type: 'circle',
	source: SRC,
	filter: ['==', ['get', 'amRole'], 'photo'],
	paint: {
		// The note's own colour, same idiom as every other point this source
		// draws — a photo belongs to the note that links or embeds it, exactly
		// as a track does.
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
		// The *opposite* of the endpoint/arrow layers' collision settings above,
		// and for the opposite reason. Those two never want MapLibre to drop one
		// of a pair sitting on the same pixel; a photo album zoomed out *should*
		// thin, and letting MapLibre's own symbol collision detection drop the
		// icons that would overlap — then bring them back as soon as zooming in
		// gives them room — is what makes the density falloff free: nothing
		// here computes a zoom-dependent count, it only has to not fight the
		// default. Do not "fix" this to `true`; that is what turns the album
		// back into an unreadable pile at a low zoom.
		'icon-allow-overlap': false,
		'icon-ignore-placement': false,
		// Collision survivorship needs a rule or it is arbitrary — an unrelated
		// paint change, or the draw list simply being rebuilt in a different
		// order, would otherwise reshuffle which photos happen to still be
		// showing at a given zoom for no reason a reader could find. Sorted by
		// `amIndex` (the note a photo belongs to, not the photo itself — see
		// TrackFeatureProps), so which notes' photos win a crowded cluster is at
		// least stable across redraws of the same data, with ties (several
		// photos from the same note) falling back to the source array's own
		// order, which trackFeatures() builds deterministically every time.
		'symbol-sort-key': ['get', 'amIndex'],
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
	// Photos last, so they land visually on top of the plain waypoint dots and
	// the start/end pins: a photo sitting exactly on one of those is the more
	// specific, more interesting thing for a reader to see, the same reasoning
	// that already puts the endpoint pins above the plain waypoint circles.
	// Still anchored to the same `before` as everything else — a pin on a
	// photo's own note is no more or less clickable than a pin on a track's.
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
		// Deliberately NOT a third loop over every registered photo image here.
		// This runs on refresh() too — a settings toggle or a re-parsed file,
		// not just a style teardown — and draw() re-adds the two layers right
		// after. A decoded thumbnail is expensive to re-derive and cheap to
		// leave registered: dropping PHOTO_LAYER does not touch map.addImage's
		// own table, so the next draw() picks the same bitmaps back up with
		// nothing to redecode. See ensurePhotoImages() for how that table is
		// actually bounded and evicted.
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
 *
 * `photoThumbnails` follows the identical reasoning for a fifth/sixth layer:
 * it is a plain settings toggle, not a change to which files are drawn (that
 * is `showPhotos`, upstream in resolveTracks — see main.ts), so it has to
 * reach an already-open map the moment it is flipped rather than waiting for
 * some unrelated redraw to notice. Turning it off hides PHOTO_LAYER only —
 * PHOTO_DOT_LAYER underneath is not a `showMarkers`-style extra, it is the
 * fallback every photo already needs whenever its thumbnail is not on the map
 * for any other reason (see the layer's own comment above), so it stays
 * visible and unconditioned by this flag.
 */
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
	if (map.getLayer(PHOTO_DOT_LAYER)) {
		// Not scaled by `weight` the way POINT_LAYER's radius is — a photo dot is
		// not part of the track line's own visual weight, it is a fallback for a
		// marker that has its own fixed size (PHOTO_ICON_PX) once its thumbnail
		// is ready, so a fixed radius is what keeps the two from disagreeing.
		map.setPaintProperty(PHOTO_DOT_LAYER, 'circle-stroke-color', stroke);
		map.setPaintProperty(PHOTO_DOT_LAYER, 'circle-opacity', opacity);
	}
	if (map.getLayer(PHOTO_LAYER)) {
		map.setLayoutProperty(PHOTO_LAYER, 'visibility', photoThumbnails ? 'visible' : 'none');
	}
}

/* ---- the photo album: decoding and registering thumbnails ----
 *
 * `map.addImage` needs a synchronous `ImageData`, exactly like the three
 * hand-drawn track icons above — but unlike a plain canvas path fill, there is
 * no synchronous way to get pixels out of a JPEG thumbnail's compressed bytes.
 * `createImageBitmap` is the one door in, and it is a promise, so this whole
 * corner of the file is async where `ensureTrackIcons` is not (trap 5 in the
 * spec this shipped against). `drawTracks()` stays synchronous regardless:
 * `ensurePhotoImages` returns nothing for a caller to await, registers images
 * as they land, and leans on PHOTO_DOT_LAYER (above) to keep every photo
 * visible in the meantime. MapLibre repaints on its own the moment
 * `addImage` lands — nothing here has to ask it to.
 */

/** What one photo needs to become a registered `map.addImage` bitmap. `id` is
 *  whatever `photoImageId()` (track-cache.ts) already stamped onto the
 *  feature as `amPhoto` — passing it back in here rather than recomputing it
 *  is what keeps the two sides from ever landing on different strings for the
 *  same photo. */
export interface PhotoIconSource {
	id: string;
	thumbnail: ExifThumbnail;
	orientation: number;
	/** Tile-space point, so viewport selection uses the same space as the map. */
	coordinates: [number, number];
}

/**
 * One photo's icon candidate, or null when it has nothing to put on the map.
 *
 * The single builder both draw paths call — `TrackLayer.ensurePhotoIcons()` for
 * a base view, `TrackEmbed`'s for an inline one — for the same reason
 * `trackFeatures()` in geometry.ts is shared and `photoImageId()` is exported
 * rather than restated: two independent formulas for what one photo's icon
 * carries are exactly the pair that drifts, and a field added to
 * `PhotoIconSource` would otherwise have to be remembered in two files.
 *
 * A record with no thumbnail, or whose EXIF carried no coordinate to place one
 * at, answers null — it contributes no Point to the drawn collection either, so
 * there is nothing an icon could attach to. Per `PHOTO_DOT_LAYER`'s own
 * reasoning, a photo that gets no icon is never a gap: it is a dot.
 */
export function photoIconSource(path: string, rec: TrackRecord, system: CoordSystem): PhotoIconSource | null {
	const photo = rec.photo;
	if (!photo?.thumbnail) return null;
	const point = projectedFeatures(rec, system).find((feature) => feature.geometry.type === 'Point');
	if (point?.geometry.type !== 'Point') return null;
	return {
		id: photoImageId(path),
		thumbnail: photo.thumbnail,
		orientation: photo.orientation,
		coordinates: [point.geometry.coordinates[0], point.geometry.coordinates[1]] as [number, number],
	};
}

/** Four JPEG decodes at a time keeps a large base from turning one sync into a
 *  burst of hundreds of `createImageBitmap` jobs. */
export const PHOTO_DECODE_CONCURRENCY = 4;

interface PhotoDecodeState {
	active: number;
	pending: Set<string>;
	queued: Map<string, PhotoIconSource>;
	/** The collision-selected on-screen ids this map currently wants. */
	wanted: Set<string>;
	/**
	 * Which photo image ids this file believes it has registered on this map,
	 * oldest-registered-and-still-wanted first, so a repeat call can tell
	 * "already there" from "needs decoding" without an enumeration API
	 * `MapLibreMap` does not declare (there is no `listImages()` here — see
	 * types/obsidian-internals.d.ts).
	 *
	 * This can drift from the map's own truth after a style reload wipes every
	 * registered image out from under it (a theme or background switch): entries
	 * here would still claim to be registered when they no longer are. That is
	 * harmless rather than a bug to chase — every decision this file makes still
	 * asks `map.hasImage(id)` first, which answers correctly regardless of what
	 * this table believes, so a stale entry only costs a redundant `removeImage`
	 * attempt (already wrapped in a catch below) before the next redraw's decode
	 * re-populates it.
	 */
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

/** Stop queued work for a map that no longer belongs to this plugin instance.
 * Active createImageBitmap calls cannot be cancelled, but clearing `wanted`
 * makes their post-await gate discard the result instead of registering it. */
export function cancelPhotoImages(map: MapLibreMap): void {
	const state = photoDecodeStates.get(map);
	if (!state) return;
	state.wanted.clear();
	state.queued.clear();
}

/**
 * Choose the icons that can actually survive MapLibre's collision pass.
 *
 * MapLibre cannot collision-test an icon whose image has not been registered,
 * so asking `queryRenderedFeatures(PHOTO_LAYER)` creates a chicken-and-egg
 * problem. Projecting each Point and reserving one `PHOTO_ICON_PX` square is
 * the cheap equivalent for this fixed-size, unrotated symbol layer. Source
 * order stays the tie-breaker, matching the layer's stable sort intent.
 *
 * A small grid makes this O(n): each accepted icon occupies one cell and only
 * its neighbouring cells can overlap the next candidate. Exact duplicate
 * coordinates therefore decode once, not hundreds of times. The visible set
 * is bounded naturally by map area divided by icon area; `PHOTO_ICON_MAX`
 * limits only the off-screen warm cache, never what a real screen can show.
 */
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

/** Whatever is cheaply checkable about "is there still a live style behind
 *  this map" — the same question `removeTrackLayers()` above answers with a
 *  bare `if (!map.getStyle) return`, wrapped in a `try` here too because a
 *  torn-down map can throw calling the method at all, not just answering it. */
function mapAlive(map: MapLibreMap): boolean {
	try {
		return typeof map.getStyle === 'function' && !!map.getStyle();
	} catch {
		return false;
	}
}

/**
 * The standard EXIF-orientation canvas fix-up for values 1–8 (1, or anything
 * this file has never seen, is left untouched — a no-op transform is the
 * correct answer for "upright already" and for "undocumented tag" alike).
 * `w`/`h` are always the *un-rotated* source dimensions; the transform matrix
 * itself does the axis-swapping for 5–8 rather than the caller pre-swapping
 * them, which is the version of this recipe that is easy to get subtly wrong
 * in one of the four rotated cases and not notice on a photo that happens to
 * be near-square.
 */
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

/**
 * One decoded thumbnail, drawn square at `PHOTO_ICON_PX` (× `ICON_SCALE`, the
 * same retina-style oversampling `ensureTrackIcons`'s three hand-drawn shapes
 * use) with rounded corners and a halo border in the page's own background
 * colour. CLAUDE.md's "an axis-aligned filled square reads as a broken image"
 * was written about the endpoint marker this file used to draw, but the same
 * eye reads a hard-edged photo the same way, sitting beside Obsidian's own
 * rounded controls — rounding the corners is what answers it here, in place
 * of the ring-vs-disc trick that answers it for start/end.
 *
 * Cover-fit, not letterboxed: a portrait phone photo and a landscape one
 * should both read as "a photo of the place" at a glance, not as
 * different-shaped tiles with grey bars down the sides, so the shorter axis
 * is scaled to fill the icon and the overflow on the longer one is clipped
 * away by the same rounded-rect path the border is stroked along.
 */
function drawPhotoIcon(bitmap: ImageBitmap, orientation: number): ImageData {
	const halo = resolveCssColor('var(--background-primary)');
	const swapped = orientation >= 5 && orientation <= 8;
	const srcW = bitmap.width;
	const srcH = bitmap.height;

	// Pass 1: the thumbnail the right way up, at its own (possibly rotated)
	// aspect ratio — a separate canvas rather than drawing the rotation
	// straight into the final square, because the cover-fit math below needs
	// to know the *upright* width and height to centre the crop correctly.
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

	// The border is stroked along the same inset rounded-rect the clip used,
	// so it sits exactly on the visible edge of the photo rather than outside
	// or on top of it.
	roundedRectPath(ctx, strokeWidth / 2, strokeWidth / 2, px - strokeWidth, px - strokeWidth, radius);
	ctx.lineWidth = strokeWidth;
	ctx.strokeStyle = halo;
	ctx.stroke();

	return ctx.getImageData(0, 0, px, px);
}

/** The async half of one photo's icon: decode, draw, register — and, at every
 *  point past the first `await`, check that there is still a map and a style
 *  to register against before touching either. */
async function decodePhotoIcon(map: MapLibreMap, record: PhotoIconSource): Promise<void> {
	const { id, thumbnail, orientation } = record;
	try {
		// `new Uint8Array(thumbnail.bytes)` rather than the bytes themselves: a
		// `Uint8Array` sliced out of a `SharedArrayBuffer`-backed source types as
		// `Uint8Array<ArrayBufferLike>`, which `BlobPart` (TS 5.9's lib.dom)
		// refuses — going through the array-like constructor overload allocates
		// a fresh, plain `ArrayBuffer`-backed copy that `Blob` accepts.
		const blob = new Blob([new Uint8Array(thumbnail.bytes)], { type: 'image/jpeg' });
		const bitmap = await createImageBitmap(blob);
		let imageData: ImageData;
		try {
			imageData = drawPhotoIcon(bitmap, orientation);
		} finally {
			bitmap.close();
		}
		// Everything above this line ran across at least one microtask, often
		// two — plenty of time for the note this photo belongs to to close, for
		// a theme or background switch to wipe the style, or for the plugin
		// itself to unload. None of that throws; all of it leaves nothing safe
		// to register against, which is exactly what `mapAlive` is for.
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

/**
 * Keep a bounded, viewport-driven thumbnail cache for one map.
 *
 * `records` may contain every photo resolved by a large base; projection and
 * screen-space collision select only icons that can visibly survive. Every
 * selected on-screen icon is admitted, only `PHOTO_DECODE_CONCURRENCY` JPEGs
 * decode at once, and at most `PHOTO_ICON_MAX` registered ids outside the
 * current selection survive as spare LRU capacity. A Point never loses its dot
 * while its icon is queued, decoding, unselected or evicted.
 *
 * Fire-and-forget by design (see the section comment above): this returns
 * `void`, never a `Promise`, so nothing about `drawTracks()`'s own synchronous
 * contract changes by calling this beside it.
 */
export function ensurePhotoImages(map: MapLibreMap, records: readonly PhotoIconSource[]): void {
	if (!mapAlive(map)) return;
	const state = photoDecodeState(map);
	const order = state.order;
	const selected = selectPhotoIconIds(map, records);

	// Reconcile our LRU with MapLibre after a style reload, then count how much
	// of it sits *outside* the current selection — the spare warm cache, and the
	// only thing PHOTO_ICON_MAX bounds. Icons just outside the viewport stay warm
	// while there is room; only capacity pressure evicts them.
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
