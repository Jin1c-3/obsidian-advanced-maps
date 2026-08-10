import { setIcon } from 'obsidian';
import type { FeatureCollection } from 'geojson';
import { LINE_LAYER, MARKER_LAYER, POINT_LAYER, SRC } from './constants';
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
 * One GeoJSON source, two layers: the lines, and a circle for every waypoint.
 * Both take their colour per-feature, so one source can carry every note's
 * track in that note's own colour.
 *
 * The base view and an inline embed draw the same pair, which is why adding,
 * removing and painting them all live here rather than once on each side.
 */

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
	filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
	paint: {
		'circle-color': ['get', 'amColor'],
		'circle-radius': 4,
		'circle-stroke-width': 2,
		'circle-stroke-color': '#ffffff',
	},
};

/**
 * Both layers, anchored below the pins so a pin sitting on its own track stays
 * clickable.
 *
 * The anchor is probed here rather than passed in, because "tracks go below the
 * pins" is a property of these two layers rather than of whoever is drawing
 * them: a second drawer that forgot to pass it would get unclickable pins, and
 * only on maps that have pins at all — which is the common case in exactly the
 * vault this plugin was built for. An embed's map carries no marker layer, so
 * the probe answers `undefined` there on its own.
 */
export function addTrackLayers(map: MapLibreMap): void {
	const before = map.getLayer(MARKER_LAYER) ? MARKER_LAYER : undefined;
	map.addLayer(lineLayerSpec, before);
	map.addLayer(pointLayerSpec, before);
}

/**
 * Put a collection on the map: update the source if it is already there,
 * otherwise create it and add both layers.
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
		for (const id of [LINE_LAYER, POINT_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
		if (map.getSource(SRC)) map.removeSource(SRC);
	} catch {
		/* style already torn down */
	}
}

/** Width in pixels, opacity 0–1, and a stroke colour MapLibre will accept. */
export function applyTrackPaint(map: MapLibreMap, weight: number, opacity: number, stroke: string): void {
	if (map.getLayer(LINE_LAYER)) {
		map.setPaintProperty(LINE_LAYER, 'line-width', weight);
		map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
	}
	if (map.getLayer(POINT_LAYER)) {
		map.setPaintProperty(POINT_LAYER, 'circle-radius', Math.max(3, Math.round(weight * 1.1)));
		map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', stroke);
		map.setPaintProperty(POINT_LAYER, 'circle-opacity', opacity);
	}
}
