import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { TrackEmbed } from '../src/embed';
import type AdvancedMapsPlugin from '../src/main';
import type { BasesMapView, MapLibreMap } from '../src/types/obsidian-internals';

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	return { promise: new Promise<void>((done) => (resolve = done)), resolve };
}

describe('TrackEmbed deferred initialization', () => {
	it('destroys a map created after unload without committing embed work', async () => {
		const initialized = deferred();
		const container = document.createElement('div');
		const mapContainer = document.createElement('div');
		const detach = vi.fn(() => mapContainer.remove());
		mapContainer.detach = detach;
		container.append(mapContainer);

		const map = {} as MapLibreMap;
		const destroyMap = vi.fn();
		const initializeMap = vi.fn(async () => {
			await initialized.promise;
			view.map = map;
		});
		const view = {
			containerEl: mapContainer,
			initializeMap,
			destroyMap,
		} as unknown as BasesMapView;
		const file = Object.assign(new TFile(), { name: 'route.gpx', path: 'route.gpx', extension: 'gpx' });
		const plugin = {
			settings: { showPhotos: false },
			tracks: { load: vi.fn().mockResolvedValue({ features: [], error: null }) },
			createHeadlessView: vi.fn(() => view),
			embeds: new Set<TrackEmbed>(),
		} as unknown as AdvancedMapsPlugin;
		const embed = new TrackEmbed(container, plugin, file);
		Reflect.set(embed, 'rootEl', container);

		const build = Reflect.get(embed, 'build') as () => Promise<void>;
		const building = build.call(embed);
		await vi.waitFor(() => expect(initializeMap).toHaveBeenCalledTimes(1));
		embed.onunload();
		initialized.resolve();
		await building;

		expect(destroyMap).toHaveBeenCalledTimes(2);
		expect(detach).toHaveBeenCalledTimes(2);
		expect(Reflect.get(embed, 'map')).toBeNull();
		expect(Reflect.get(embed, 'resizeObserver')).toBeNull();
		expect(Reflect.get(embed, 'interactionsBound')).toBe(false);
		expect(container.querySelector('.advanced-maps-panel')).toBeNull();
	});
});
