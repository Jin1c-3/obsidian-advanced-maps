import { OFFLINE_TILES_OFF } from './basemap';
import { TRACK_KNOBS, type TrackKnob } from './constants';
import { COORD_MODES } from './coords';
import { t } from './i18n';
import type { ViewOptionGroup } from './types/obsidian-internals';

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
 * Whether this map draws the basemap configured in the plugin settings.
 *
 * The pack is one folder on one machine, so it belongs in plugin settings;
 * whether a given map uses it belongs beside the background it replaces. Empty
 * is the default and means "use it", so a base file written before this existed
 * reads as a map that follows the setting.
 */
export function offlineTilesOptionGroup(): ViewOptionGroup {
	return {
		displayName: t('options.offlineTiles'),
		type: 'group',
		items: [
			{
				displayName: t('options.offlineTilesUse'),
				type: 'dropdown',
				key: 'offlineTiles',
				options: { '': t('options.offlineTiles.on'), [OFFLINE_TILES_OFF]: t('options.offlineTiles.off') },
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
 * this order — the offline basemap and the coordinate system behind Background,
 * which is where a background is chosen and where the datum it implies is asked
 * about. Each is located by option key so the built-in wording can change freely.
 */
export function appendTrackOptions(options: ViewOptionGroup[] | undefined): ViewOptionGroup[] {
	const list = Array.isArray(options) ? options.slice() : [];

	const background = groupIndexByKey(list, 'mapTiles');
	const afterBackground = [offlineTilesOptionGroup(), coordOptionGroup()];
	if (background === -1) list.push(...afterBackground);
	else list.splice(background + 1, 0, ...afterBackground);

	const markers = groupIndexByKey(list, 'coordinates');
	if (markers === -1) list.push(trackOptionGroup());
	else list.splice(markers + 1, 0, trackOptionGroup());

	return list;
}
