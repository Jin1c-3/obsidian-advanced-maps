import { COORD_MODES } from './coords';
import { t } from './i18n';
import type { ViewOptionGroup } from './types/obsidian-internals';

export function trackOptionGroup(): ViewOptionGroup {
	return {
		displayName: t('options.tracks'),
		type: 'group',
		items: [
			{
				displayName: t('options.lineWidth'),
				type: 'slider',
				key: 'trackWeight',
				min: 1,
				max: 12,
				step: 1,
				default: 4,
			},
			{
				displayName: t('options.lineOpacity'),
				type: 'slider',
				key: 'trackOpacity',
				min: 10,
				max: 100,
				step: 5,
				default: 85,
			},
			{
				displayName: t('options.fitMaxZoom'),
				type: 'slider',
				key: 'fitMaxZoom',
				min: 1,
				max: 20,
				step: 1,
				default: 16,
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
 * Slot our two groups into the built-in list: Tracks behind Markers, and the
 * coordinate system behind Background, next to the tile URLs that determine it.
 * Both are located by option key so the built-in wording can change freely.
 */
export function appendTrackOptions(options: ViewOptionGroup[] | undefined): ViewOptionGroup[] {
	const list = Array.isArray(options) ? options.slice() : [];

	const background = groupIndexByKey(list, 'mapTiles');
	if (background === -1) list.push(coordOptionGroup());
	else list.splice(background + 1, 0, coordOptionGroup());

	const markers = groupIndexByKey(list, 'coordinates');
	if (markers === -1) list.push(trackOptionGroup());
	else list.splice(markers + 1, 0, trackOptionGroup());

	return list;
}
