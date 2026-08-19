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

import { setIcon } from 'obsidian';
import { MEASURING_CLASS } from './constants';
import { normalizeLng, toTileSpace, toWgs84, type CoordSystem } from './coords';
import { t } from './i18n';
import { drawMeasure, removeMeasureLayers } from './layers';
import { MapEventBindings } from './map-events';
import { measureDrawing, measuredDistance, type MeasureLabel, type MeasurePoint } from './measure';
import { formatDistance } from './stats';
import type { MapControl, MapLibreMap, MapMouseEvent } from './types/obsidian-internals';

/** Above this many pixels from the top edge, a label sits above its vertex. */
const LABEL_FLIP_PX = 28;

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
		const drawing = measureDrawing({ points: this.points, draft: this.draft }, (lng, lat) =>
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
		const point = this.at(ev);
		if (!point) return;
		this.points.push(point);
		// The pointer is standing on the point it just placed. A preview leg of no
		// length, labelled "0 m", would only flicker under the cursor until the
		// next movement replaces it.
		this.draft = null;
		this.redraw();
	}

	/** Follow the pointer, or forget it when it leaves the map. */
	private follow(ev: MapMouseEvent | null): void {
		// Nothing to measure from yet: a preview needs a point to start at.
		if (this.points.length === 0) return;
		const next = ev ? this.at(ev) : null;
		if (next === null && this.draft === null) return;
		this.draft = next;
		this.schedule();
	}

	/**
	 * Where an event landed, in vault space.
	 *
	 * MapLibre answers in the datum its tiles are drawn in, and a tape measures
	 * the world: on a Chinese basemap the two are a few hundred metres apart, and
	 * measuring the offset copy would answer for a pair of places nobody clicked.
	 */
	private at(ev: MapMouseEvent): MeasurePoint | null {
		const lngLat = ev.lngLat;
		if (!lngLat || !isFinite(lngLat.lng) || !isFinite(lngLat.lat)) return null;
		const [lng, lat] = toWgs84(this.system(), lngLat.lng, lngLat.lat);
		// A camera carried past the 180th meridian keeps counting; a point stored
		// as 190.5 would be written and compared as a place that does not exist.
		return { lng: normalizeLng(lng), lat };
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
