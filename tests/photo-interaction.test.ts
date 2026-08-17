import { Keymap, TFile } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AREA_LAYER, LINE_LAYER, PHOTO_DOT_LAYER, PHOTO_ICON_PREFIX, PHOTO_LAYER } from '../src/constants';
import { PhotoModal } from '../src/photo-modal';
import { TrackLayer } from '../src/track-layer';
import type AdvancedMapsPlugin from '../src/main';
import type { BasesMapView, MapLibreMap, MapMouseEvent } from '../src/types/obsidian-internals';

interface LayerRegistration {
	type: string;
	layer: string;
	listener: (event: MapMouseEvent) => void;
}

class InteractionMap {
	readonly registrations: LayerRegistration[] = [];
	private readonly canvas = document.createElement('canvas');

	on(type: string, listener: (event: MapMouseEvent) => void): void;
	on(type: string, layer: string, listener: (event: MapMouseEvent) => void): void;
	on(
		type: string,
		layerOrListener: string | ((event: MapMouseEvent) => void),
		maybeListener?: (event: MapMouseEvent) => void
	): void {
		if (typeof layerOrListener === 'string') {
			this.registrations.push({ type, layer: layerOrListener, listener: maybeListener! });
		}
	}

	off(): void {}

	getCanvas(): HTMLCanvasElement {
		return this.canvas;
	}
}

function file(path: string): TFile {
	const value = new TFile();
	value.path = path;
	value.name = path.split('/').at(-1) ?? path;
	value.basename = value.name.replace(/\.[^.]+$/, '');
	value.extension = value.name.split('.').at(-1) ?? '';
	return value;
}

function harness(): {
	layer: TrackLayer;
	map: InteractionMap;
	note: TFile;
	photo: TFile;
	openLinkText: ReturnType<typeof vi.fn>;
} {
	const map = new InteractionMap();
	const note = file('note.md');
	const photo = file('photo.jpg');
	const openLinkText = vi.fn();
	const view = {
		app: {
			vault: {
				getFileByPath: (path: string) => (path === photo.path ? photo : path === note.path ? note : null),
			},
			workspace: { openLinkText },
		},
		map: map as unknown as MapLibreMap,
		popupManager: { hidePopup: vi.fn(), showPopup: vi.fn() },
	} as unknown as BasesMapView;
	const plugin = {
		settings: { followActiveNote: false },
		followTarget: vi.fn(() => null),
	} as unknown as AdvancedMapsPlugin;
	const layer = new TrackLayer(plugin, view);
	Reflect.set(layer, 'items', [{ entry: { file: note }, file: note, trackFiles: [], color: '#fff' }]);
	const bind = Reflect.get(layer, 'bindInteractions') as () => void;
	bind.call(layer);
	return { layer, map, note, photo, openLinkText };
}

function event(originalEvent: MouseEvent, photoPath?: string): MapMouseEvent {
	return {
		originalEvent,
		lngLat: { lng: 0, lat: 0 },
		features: [
			{
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [0, 0] },
				properties: photoPath
					? { amIndex: 0, amRole: 'photo', amPath: photoPath }
					: { amIndex: 0, amRole: 'track' },
			},
		],
	};
}

afterEach(() => vi.restoreAllMocks());

describe('base-map photo click precedence', () => {
	it('opens one photo modal when thumbnail, fallback dot, and track overlap', () => {
		const { map, photo, openLinkText } = harness();
		const openModal = vi.spyOn(PhotoModal.prototype, 'open').mockImplementation(() => undefined);
		const originalEvent = new MouseEvent('click');

		for (const registration of map.registrations) {
			if (registration.type !== 'click') continue;
			if (registration.layer === PHOTO_LAYER || registration.layer === PHOTO_DOT_LAYER) {
				registration.listener(event(originalEvent, photo.path));
			} else if (registration.layer === LINE_LAYER) {
				registration.listener(event(originalEvent));
			}
		}

		expect(openModal).toHaveBeenCalledTimes(1);
		expect(openLinkText).not.toHaveBeenCalled();
	});

	it('preserves modifier-click opening the photo file directly', () => {
		vi.spyOn(Keymap, 'isModEvent').mockReturnValue(true);
		const { map, note, photo, openLinkText } = harness();
		const openModal = vi.spyOn(PhotoModal.prototype, 'open').mockImplementation(() => undefined);
		const photoClick = map.registrations.find(
			(registration) => registration.type === 'click' && registration.layer === PHOTO_LAYER
		)!;

		photoClick.listener(event(new MouseEvent('click'), photo.path));

		expect(openLinkText).toHaveBeenCalledWith(photo.path, note.path, true);
		expect(openModal).not.toHaveBeenCalled();
	});

	it('never lets an area take a click from what is drawn over it', () => {
		const { map, photo, note, openLinkText } = harness();
		const openModal = vi.spyOn(PhotoModal.prototype, 'open').mockImplementation(() => undefined);
		const clicks = map.registrations.filter((registration) => registration.type === 'click');
		const originalEvent = new MouseEvent('click');

		// An area can cover the whole viewport, so it must be delivered last of
		// all — this is the registration order, not the paint order, and it is
		// what decides which of two stacked features the click acts on.
		expect(clicks.at(-1)?.layer).toBe(AREA_LAYER);

		for (const registration of clicks) {
			if (registration.layer === PHOTO_LAYER) registration.listener(event(originalEvent, photo.path));
			else if (registration.layer === AREA_LAYER) registration.listener(event(originalEvent));
		}

		expect(openModal).toHaveBeenCalledTimes(1);
		expect(openLinkText).not.toHaveBeenCalled();
		expect(note.path).toBe('note.md');
	});

	it('opens the owning note for an area with nothing over it', () => {
		const { map, note, openLinkText } = harness();
		const areaClick = map.registrations.find(
			(registration) => registration.type === 'click' && registration.layer === AREA_LAYER
		)!;

		areaClick.listener(event(new MouseEvent('click')));

		expect(openLinkText).toHaveBeenCalledWith(note.path, '', false);
	});

	it('removes terminal photo images only after their referencing layers on detach', () => {
		const calls: string[] = [];
		const imageId = `${PHOTO_ICON_PREFIX}owned`;
		const map = {
			getStyle: () => ({}),
			getLayer: (id: string) => (id === PHOTO_LAYER ? {} : undefined),
			removeLayer: (id: string) => calls.push(`layer:${id}`),
			getSource: () => undefined,
			hasImage: (id: string) => id === imageId,
			listImages: () => [imageId],
			removeImage: (id: string) => calls.push(`image:${id}`),
		} as unknown as MapLibreMap;
		const plugin = {
			settings: { followActiveNote: false },
			layers: new Set<TrackLayer>(),
		} as unknown as AdvancedMapsPlugin;
		const view = { map } as unknown as BasesMapView;
		const layer = new TrackLayer(plugin, view);
		plugin.layers.add(layer);

		layer.detach();

		expect(calls).toEqual([`layer:${PHOTO_LAYER}`, `image:${imageId}`]);
		expect(plugin.layers).not.toContain(layer);
	});
});
