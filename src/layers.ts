import { setIcon } from 'obsidian';
import { t } from './i18n';
import type { MapControl } from './types/obsidian-internals';

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

export function lineLayerSpec(id: string, source: string) {
	return {
		id,
		type: 'line',
		source,
		filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']],
		layout: { 'line-join': 'round', 'line-cap': 'round' },
		paint: { 'line-color': ['get', 'amColor'], 'line-width': 4, 'line-opacity': 0.85 },
	};
}

export function pointLayerSpec(id: string, source: string) {
	return {
		id,
		type: 'circle',
		source,
		filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
		paint: {
			'circle-color': ['get', 'amColor'],
			'circle-radius': 4,
			'circle-stroke-width': 2,
			'circle-stroke-color': '#ffffff',
		},
	};
}
