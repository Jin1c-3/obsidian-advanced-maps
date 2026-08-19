import { DEFAULT_BACKGROUND, packBackgroundName } from './basemap';
import { TRACK_KNOBS, type TrackKnob } from './constants';
import { COORD_MODES } from './coords';
import { t } from './i18n';
import type { ViewOptionGroup } from './types/obsidian-internals';

/** One background a view can be opened on: the id it stores, under the name a
 *  reader picks it by. */
export interface BackgroundChoice {
	id: string;
	name: string;
}

/** The slider for one track knob, with its range read from the one table that states it. */
function knobSlider(key: TrackKnob, displayName: string) {
	const { min, max, step, def } = TRACK_KNOBS[key];
	return { displayName, type: 'slider' as const, key, min, max, step, default: def };
}

export function trackOptionGroup(): ViewOptionGroup {
	return {
		displayName: t('options.tracks'),
		type: 'group',
		items: [
			knobSlider('trackWeight', t('options.lineWidth')),
			knobSlider('trackOpacity', t('options.lineOpacity')),
			knobSlider('fitMaxZoom', t('options.fitMaxZoom')),
		],
	};
}

/**
 * Which background this map opens on, named rather than switched on and off.
 *
 * A pack is one folder on one machine, so the packs themselves belong in plugin
 * settings; which of them — or which of the host's own backgrounds — a given map
 * starts on belongs beside the background it replaces.
 *
 * The stored key is still `offlineTiles`, and the two values a base file could
 * already hold still mean what they meant: empty is "follow the plugin default",
 * and `off` names the background the native view resolves. So no base file
 * written before this needs editing.
 *
 * `missing` is what open views name that nothing answers to any more — a pack
 * since renamed or removed. Listed so the picker says the name is gone rather
 * than showing an empty box for a value it has no entry for.
 */
export function basemapOptionGroup(
	backgrounds: readonly BackgroundChoice[] = [],
	missing: readonly string[] = []
): ViewOptionGroup {
	const options: Record<string, string> = {
		'': t('options.basemap.followPlugin'),
		[DEFAULT_BACKGROUND]: t('options.basemap.none'),
	};
	for (const background of backgrounds) {
		// Never over the two above: a pack named `off` would otherwise take the
		// entry that is the only way back to the native background.
		if (background.id in options) continue;
		options[background.id] = background.name;
	}
	for (const id of missing) {
		if (id in options) continue;
		// Under the name the reader gave it, not the id it is stored as: they
		// removed a pack called "Trail", and that is the word they will recognise.
		options[id] = t('options.basemap.missing', { name: packBackgroundName(id) ?? id });
	}
	return {
		displayName: t('options.basemap'),
		type: 'group',
		items: [
			{
				displayName: t('options.basemapPick'),
				type: 'dropdown',
				key: 'offlineTiles',
				options,
				default: '',
			},
		],
	};
}

/** Paired with the tile URLs, since the tiles are what decides the answer. */
export function coordOptionGroup(): ViewOptionGroup {
	const choices: Record<string, string> = { '': t('coord.followPlugin') };
	for (const mode of COORD_MODES) choices[mode] = t(`coord.${mode}`);
	return {
		displayName: t('options.coordSystem'),
		type: 'group',
		items: [
			{
				displayName: t('options.tileCoordSystem'),
				type: 'dropdown',
				key: 'coordSystem',
				options: choices,
				default: '',
			},
		],
	};
}

/** Find a top-level group by one of the option keys it owns. -1 if absent. */
export function groupIndexByKey(list: ViewOptionGroup[], key: string): number {
	return list.findIndex(
		(group) => group && Array.isArray(group.items) && group.items.some((item) => item && item.key === key)
	);
}

/**
 * Slot our three groups into the built-in list: Tracks behind Markers, and — in
 * this order — the basemap picker and the coordinate system behind Background,
 * which is where a background is chosen and where the datum it implies is asked
 * about. Each is located by option key so the built-in wording can change freely.
 */
export function appendTrackOptions(
	options: ViewOptionGroup[] | undefined,
	backgrounds: readonly BackgroundChoice[] = [],
	missing: readonly string[] = []
): ViewOptionGroup[] {
	const list = Array.isArray(options) ? options.slice() : [];

	const background = groupIndexByKey(list, 'mapTiles');
	const afterBackground = [basemapOptionGroup(backgrounds, missing), coordOptionGroup()];
	if (background === -1) list.push(...afterBackground);
	else list.splice(background + 1, 0, ...afterBackground);

	const markers = groupIndexByKey(list, 'coordinates');
	if (markers === -1) list.push(trackOptionGroup());
	else list.splice(markers + 1, 0, trackOptionGroup());

	return list;
}
