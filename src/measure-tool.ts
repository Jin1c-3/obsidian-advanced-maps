/*
 * The measuring tape on one native map: the points, the layers they are drawn
 * on, the distances shown beside them, and the readout saying what they add up
 * to. One instance per MapLibre map, created with it and disposed with it.
 *
 * While the tape is out, the map is a measuring surface rather than a map of
 * notes: `TrackLayer` withholds its own click and hover actions, the native
 * popup and the native context menu, and this turns off the double-click zoom
 * that two quickly-placed points would otherwise trigger. Everything it takes
 * away is given back by `stop()`, which is also what `dispose()` is.
 */

import type { Geometry, Position } from 'geojson';
import { setIcon } from 'obsidian';
import { ENDPOINT_LAYER, MARKER_LAYER, MEASURING_CLASS, PHOTO_DOT_LAYER, POINT_LAYER, SNAP_PX } from './constants';
import { normalizeLng, toTileSpace, toWgs84, type CoordSystem } from './coords';
import { pointsOf } from './geometry';
import { t } from './i18n';
import { drawMeasure, removeMeasureLayers } from './layers';
import { MapEventBindings } from './map-events';
import {
	measureDrawing,
	measuredDistance,
	nearestSnap,
	type MeasureLabel,
	type MeasurePoint,
	type SnapCandidate,
} from './measure';
import { formatDistance } from './stats';
import type { MapControl, MapLibreMap, MapMouseEvent } from './types/obsidian-internals';

/** Above this many pixels from the top edge, a label sits above its vertex. */
const LABEL_FLIP_PX = 28;

/**
 * The layers a point may be taken from, in the order ties are broken.
 *
 * Every one of them draws Points, which is the whole list of what can be taken:
 * a rendered line is simplified for drawing, so its vertices are not
 * coordinates any file recorded. Photos are taken from their dot rather than
 * their thumbnail — the dot is where the photo is, the thumbnail is a 48 px
 * picture whose corner is a quarter of an inch from it.
 */
const SNAP_LAYERS = [MARKER_LAYER, ENDPOINT_LAYER, POINT_LAYER, PHOTO_DOT_LAYER];

/**
 * The readout: what the tape currently says, and the two things to do about it.
 *
 * A control rather than a box of this plugin's own, so MapLibre places it in a
 * corner it manages and keeps clicks on it off the map underneath.
 */
class MeasurePanel implements MapControl {
	private readonly containerEl = createDiv(
		'maplibregl-ctrl maplibregl-ctrl-group canvas-control-group mod-raised advanced-maps-measure-panel'
	);
	private valueEl: HTMLElement | null = null;
	private undoEl: HTMLElement | null = null;

	constructor(
		private readonly onUndo: () => void,
		private readonly onDone: () => void
	) {}

	onAdd(): HTMLElement {
		this.valueEl = this.containerEl.createDiv('advanced-maps-measure-value');
		this.undoEl = this.action('undo-2', t('measure.undo'), this.onUndo);
		this.action('x', t('measure.done'), this.onDone);
		this.setDistance(0, 0);
		return this.containerEl;
	}

	onRemove(): void {
		this.valueEl = null;
		this.undoEl = null;
		this.containerEl.detach();
	}

	/**
	 * One point is not a distance, so until there are two the readout says what to
	 * do instead of showing a zero that never moves.
	 */
	setDistance(metres: number, points: number): void {
		const value = this.valueEl;
		if (!value) return;
		const measured = points > 1;
		value.setText(measured ? formatDistance(metres) : t('measure.hint'));
		value.toggleClass('is-hint', !measured);
		this.undoEl?.toggleClass('is-disabled', points === 0);
	}

	private action(icon: string, label: string, onClick: () => void): HTMLElement {
		const el = this.containerEl.createDiv({
			cls: 'canvas-control-item advanced-maps-measure-action',
			attr: { 'aria-label': label },
		});
		setIcon(el, icon);
		el.addEventListener('click', (ev) => {
			ev.stopPropagation();
			onClick();
		});
		return el;
	}
}

export class MeasureTool {
	private active = false;
	/** WGS-84, so a datum switch redraws the same places rather than moved ones. */
	private points: MeasurePoint[] = [];
	private draft: MeasurePoint | null = null;
	/** Whether `draft` is a point already on the map rather than a bare pixel. */
	private snapped = false;
	/** The last pointer sample, resolved on the next frame; see `follow()`. */
	private sample: MapMouseEvent | null = null;
	private readonly events = new MapEventBindings();
	private overlayEl: HTMLElement | null = null;
	private readonly labelEls: HTMLElement[] = [];
	private labels: MeasureLabel[] = [];
	private panel: MeasurePanel | null = null;
	/** A pending coalesced redraw; see `schedule()`. */
	private frame: number | null = null;
	/** Null when the double-click zoom was already off, or cannot be reached. */
	private restoreDoubleClick: (() => void) | null = null;

	constructor(
		private readonly map: MapLibreMap,
		private readonly system: () => CoordSystem,
		/** Told which way the button that owns this tool should point. */
		private readonly onChange: (active: boolean) => void
	) {}

	isActive(): boolean {
		return this.active;
	}

	toggle(): void {
		if (this.active) this.stop();
		else this.start();
	}

	/**
	 * Put the tape away, and put back everything taking it out changed.
	 *
	 * Safe to call on a map that is already being torn down: every step is either
	 * guarded or wrapped, because this also runs from `destroyMap` and `detach`.
	 */
	stop(): void {
		if (!this.active) return;
		this.active = false;
		this.points = [];
		this.draft = null;
		this.snapped = false;
		this.sample = null;
		this.labels = [];
		this.events.clear();
		this.cancelFrame();
		removeMeasureLayers(this.map);
		while (this.labelEls.length > 0) this.labelEls.pop()?.remove();
		this.overlayEl?.remove();
		this.overlayEl = null;
		if (this.panel) {
			try {
				this.map.removeControl(this.panel);
			} catch {
				/* the map went away first */
			}
			this.panel = null;
		}
		this.restoreDoubleClick?.();
		this.restoreDoubleClick = null;
		try {
			this.map.getCanvas().removeClass(MEASURING_CLASS);
		} catch {
			/* the canvas went with the map */
		}
		this.onChange(false);
	}

	dispose(): void {
		this.stop();
	}

	/** Take back the last point placed. */
	undo(): void {
		if (!this.active || this.points.length === 0) return;
		this.points.pop();
		// The pointer is still where it was, so the preview leg now runs from the
		// point before the one just removed.
		this.redraw();
	}

	/**
	 * Draw the tape again: after a datum switch, which moves every point on
	 * screen, and after a style swap, which removed the source and layers
	 * underneath it. A no-op while the tape is away.
	 */
	redraw(): void {
		if (!this.active) return;
		this.cancelFrame();
		const system = this.system();
		const drawing = measureDrawing({ points: this.points, draft: this.draft, snapped: this.snapped }, (lng, lat) =>
			toTileSpace(system, lng, lat)
		);
		this.labels = drawing.labels;
		this.renderLabels();
		this.place();
		this.panel?.setDistance(measuredDistance(this.points), this.points.length);
		// Last, because the DOM above cannot fail and this can: a style swapped out
		// mid-draw is recovered by the `style.load` that follows it.
		drawMeasure(this.map, drawing.data);
	}

	private start(): void {
		if (this.active) return;
		this.active = true;
		this.points = [];
		this.draft = null;
		this.snapped = false;
		this.sample = null;

		const canvas = this.map.getCanvas();
		canvas.addClass(MEASURING_CLASS);
		this.silenceDoubleClickZoom();

		this.events.on<MapMouseEvent>(this.map, 'click', (ev) => this.addPoint(ev));
		this.events.on<MapMouseEvent>(this.map, 'mousemove', (ev) => this.follow(ev));
		this.events.on(this.map, 'mouseout', () => this.follow(null));
		// The labels are DOM over the canvas, so they have to be moved whenever the
		// camera is — which is what MapLibre's own markers listen for.
		this.events.on(this.map, 'move', () => this.place());

		// Inside the canvas container, which is the very box `map.project()`
		// answers in, so a label's pixel needs no correction for where it sits.
		const container = canvas.parentElement;
		this.overlayEl = container ? container.createDiv('advanced-maps-measure-labels') : null;
		// Scoped to the map rather than the document: Escape belongs to whatever
		// the reader is actually in, and this is only theirs once they have clicked
		// the map — which is also when they have started measuring.
		if (container) this.events.dom(container, 'keydown', (ev) => this.onKey(ev));

		this.panel = new MeasurePanel(
			() => this.undo(),
			() => this.stop()
		);
		// Bottom left: the native view stacks its own controls, and this plugin's
		// three buttons, in the top-right corner, and MapLibre's attribution sits
		// bottom right. This corner is free, and is where a scale readout lives.
		this.map.addControl(this.panel, 'bottom-left');

		this.onChange(true);
		this.redraw();
	}

	private addPoint(ev: MapMouseEvent): void {
		const found = this.at(ev);
		if (!found) return;
		this.points.push(found.point);
		// The pointer is standing on the point it just placed. A preview leg of no
		// length, labelled "0 m", would only flicker under the cursor until the
		// next movement replaces it.
		this.draft = null;
		this.snapped = false;
		this.sample = null;
		this.redraw();
	}

	/**
	 * Follow the pointer, or forget it when it leaves the map.
	 *
	 * The sample is kept and read back on the next frame rather than resolved
	 * here: what the pointer is over is a query against everything the map has
	 * drawn, and `mousemove` arrives several times per frame.
	 */
	private follow(ev: MapMouseEvent | null): void {
		this.sample = ev;
		// The pointer left a map that was showing nothing of its own.
		if (ev === null && this.draft === null) return;
		this.schedule();
	}

	/** What the last pointer sample means, in vault space. */
	private resolve(): void {
		const found = this.sample ? this.at(this.sample) : null;
		this.draft = found ? found.point : null;
		this.snapped = found ? found.snapped : false;
	}

	/**
	 * Where an event landed, in vault space, and whether that is a point already
	 * on the map rather than the bare pixel under the pointer.
	 *
	 * MapLibre answers in the datum its tiles are drawn in, and a tape measures
	 * the world: on a Chinese basemap the two are a few hundred metres apart, and
	 * measuring the offset copy would answer for a pair of places nobody clicked.
	 */
	private at(ev: MapMouseEvent): { point: MeasurePoint; snapped: boolean } | null {
		const lngLat = ev.lngLat;
		if (!lngLat || !isFinite(lngLat.lng) || !isFinite(lngLat.lat)) return null;
		const taken = this.snapAt(ev);
		if (taken) return { point: taken, snapped: true };
		const [lng, lat] = toWgs84(this.system(), lngLat.lng, lngLat.lat);
		// A camera carried past the 180th meridian keeps counting; a point stored
		// as 190.5 would be written and compared as a place that does not exist.
		return { point: { lng: normalizeLng(lng), lat }, snapped: false };
	}

	/**
	 * The point already on the map that this event is aiming at, or null.
	 *
	 * What is drawn decides whether something is a candidate — that is what the
	 * reader aimed at — while the coordinate behind it decides what gets
	 * measured, and the two are not the same pixel: a fanned pin is drawn away
	 * from the note it stands for, and a native pin's teardrop is drawn above its
	 * tip. Ranking by the coordinate is what makes the ring honest, because the
	 * ring is drawn there too.
	 */
	private snapAt(ev: MapMouseEvent): MeasurePoint | null {
		const pointer = ev.point;
		// Alt is the bypass, for the times the ground is the point and not the
		// thing standing on it. A device that reports no pixel cannot be aimed.
		if (!pointer || ev.originalEvent?.altKey) return null;
		// Bound rather than read bare: a live MapLibre method called detached from
		// its map answers for nothing.
		const project = this.map.project?.bind(this.map);
		if (!project) return null;
		const system = this.system();
		const candidates: SnapCandidate[] = [];
		const offer = (point: MeasurePoint, tile: [number, number]) => {
			try {
				candidates.push({ point, at: project(tile) });
			} catch {
				/* the style is mid-swap; this one simply is not offered */
			}
		};
		// This measurement's own points first, so a tie goes to the reader's own
		// work — and every one but the last, because the pointer is standing on
		// that one and a leg from a point to itself is not a measurement.
		for (let i = 0; i < this.points.length - 1; i++) {
			const point = this.points[i];
			offer(point, toTileSpace(system, point.lng, point.lat));
		}
		for (const [tileLng, tileLat] of this.rendered(pointer, ev.lngLat.lng)) {
			const [lng, lat] = toWgs84(system, tileLng, tileLat);
			if (!isFinite(lng) || !isFinite(lat)) continue;
			offer({ lng: normalizeLng(lng), lat }, [tileLng, tileLat]);
		}
		return nearestSnap(pointer, candidates, SNAP_PX)?.point ?? null;
	}

	/**
	 * Every Point the map has drawn within the snap box, in the datum it draws in.
	 *
	 * `around` is the pointer's own longitude, which a camera carried past the
	 * 180th meridian reports as 190 rather than -170. A source holds the
	 * coordinate once, so a feature the reader is pointing at on the far copy of
	 * the world is offered on the copy they are looking at rather than a
	 * screen-width away.
	 */
	private rendered(pointer: { x: number; y: number }, around: number): Position[] {
		const map = this.map;
		if (typeof map.queryRenderedFeatures !== 'function') return [];
		const out: Position[] = [];
		try {
			// An id the style does not have makes MapLibre throw rather than skip
			// it, and a style mid-swap has none of them.
			const layers = SNAP_LAYERS.filter((id) => map.getLayer(id));
			if (layers.length === 0) return out;
			const box: [[number, number], [number, number]] = [
				[pointer.x - SNAP_PX, pointer.y - SNAP_PX],
				[pointer.x + SNAP_PX, pointer.y + SNAP_PX],
			];
			for (const feature of map.queryRenderedFeatures(box, { layers })) {
				const geometry = (feature as { geometry?: Geometry }).geometry;
				// Points only — see SNAP_LAYERS. `pointsOf` admits a MultiPoint and
				// a GeometryCollection of them, and nothing else.
				for (const [lng, lat] of pointsOf(geometry)) {
					if (!isFinite(lng) || !isFinite(lat)) continue;
					out.push([lng + 360 * Math.round((around - lng) / 360), lat]);
				}
			}
		} catch {
			/* the style was torn down between the pointer sample and the query */
		}
		return out;
	}

	private onKey(ev: KeyboardEvent): void {
		if (ev.key === 'Escape') this.stop();
		else if (ev.key === 'Backspace' || ev.key === 'Delete') this.undo();
		else return;
		// Only for the two keys handled: everything else on a focused map canvas
		// still belongs to Obsidian and to MapLibre's own keyboard panning.
		ev.preventDefault();
		ev.stopPropagation();
	}

	/**
	 * One redraw per frame. `mousemove` arrives far faster than the map is drawn,
	 * and every one of them rebuilds the whole collection.
	 */
	private schedule(): void {
		if (this.frame !== null) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			const had = this.draft !== null;
			const rang = this.snapped;
			this.resolve();
			// Before the first point is placed there is nothing on screen but the
			// ring, so a pointer crossing open ground is not a redraw.
			if (this.points.length === 0 && !this.snapped && !rang) return;
			if (!had && this.draft === null) return;
			this.redraw();
		});
	}

	private cancelFrame(): void {
		if (this.frame === null) return;
		window.cancelAnimationFrame(this.frame);
		this.frame = null;
	}

	/** Reconcile the label elements with the labels there are; text last. */
	private renderLabels(): void {
		const host = this.overlayEl;
		if (!host) return;
		while (this.labelEls.length > this.labels.length) this.labelEls.pop()?.remove();
		while (this.labelEls.length < this.labels.length) {
			this.labelEls.push(host.createDiv('advanced-maps-measure-label'));
		}
		this.labels.forEach((label, i) => {
			const el = this.labelEls[i];
			el.setText(label.text);
			el.toggleClass('is-draft', label.draft);
		});
	}

	/** Put every label where its vertex currently is; runs once per camera frame. */
	private place(): void {
		// Bound rather than read bare: this is a live MapLibre method and calling
		// it detached from its map would answer for nothing.
		const project = this.map.project?.bind(this.map);
		if (!project) return;
		for (let i = 0; i < this.labels.length; i++) {
			const el = this.labelEls[i];
			if (!el) continue;
			let point: { x: number; y: number };
			try {
				point = project(this.labels[i].at);
			} catch {
				// The style is mid-swap; the redraw that follows it places these again.
				return;
			}
			el.style.left = `${point.x}px`;
			el.style.top = `${point.y}px`;
			// A vertex near the top edge would carry its label off the map, so that
			// one hangs below the point instead.
			el.toggleClass('is-below', point.y < LABEL_FLIP_PX);
		}
	}

	/**
	 * Off while the tape is out, and back on only if it was on to begin with —
	 * restoring a handler a reader had deliberately disabled would be this plugin
	 * changing a native map setting behind them.
	 */
	private silenceDoubleClickZoom(): void {
		const handler = this.map.doubleClickZoom;
		if (!handler || typeof handler.disable !== 'function' || typeof handler.enable !== 'function') return;
		if (typeof handler.isEnabled === 'function' && !handler.isEnabled()) return;
		handler.disable();
		this.restoreDoubleClick = () => handler.enable();
	}
}
