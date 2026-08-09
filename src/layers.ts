import { setIcon } from 'obsidian';
import { LINE_LAYER, POINT_LAYER, SRC } from './constants';
import { toTileSpace, type CoordSystem } from './coords';
import { t } from './i18n';
import type { LocateControl, MapControl, MapLibreMap } from './types/obsidian-internals';

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

/** `before` anchors the tracks below the pins, so a pin on its own track stays clickable. */
export function addTrackLayers(map: MapLibreMap, before?: string): void {
	map.addLayer(lineLayerSpec, before);
	map.addLayer(pointLayerSpec, before);
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
