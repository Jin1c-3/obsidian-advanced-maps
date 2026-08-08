import { describe, expect, it } from 'vitest';
import { appendTrackOptions, coordOptionGroup, groupIndexByKey, trackOptionGroup } from '../src/view-options';
import { COORD_MODES } from '../src/coords';
import type { ViewOptionGroup } from '../src/types/obsidian-internals';

function group(displayName: string, keys: string[]): ViewOptionGroup {
	return {
		displayName,
		type: 'group',
		items: keys.map((key) => ({ displayName: key, type: 'text', key })),
	};
}

/** What the built-in Maps view hands over, reduced to the keys we anchor on. */
const NATIVE: ViewOptionGroup[] = [
	group('Background', ['mapTiles', 'mapTilesDark']),
	group('Markers', ['coordinates', 'markerColor']),
	group('Popup', ['popupProperties']),
];

describe('groupIndexByKey', () => {
	it('finds the group that owns a key', () => {
		expect(groupIndexByKey(NATIVE, 'mapTiles')).toBe(0);
		expect(groupIndexByKey(NATIVE, 'coordinates')).toBe(1);
	});

	it('answers -1 for a key nobody owns, and survives a malformed group', () => {
		expect(groupIndexByKey(NATIVE, 'nope')).toBe(-1);
		expect(groupIndexByKey([{ displayName: 'x', type: 'group' } as ViewOptionGroup], 'nope')).toBe(-1);
	});
});

describe('appendTrackOptions', () => {
	it('slots each group in behind the one it belongs with', () => {
		const list = appendTrackOptions(NATIVE);
		const names = list.map((g) => g.displayName);
		expect(names.indexOf(coordOptionGroup().displayName)).toBe(1); // right after Background
		expect(names.indexOf(trackOptionGroup().displayName)).toBe(3); // right after Markers
		expect(names[0]).toBe('Background');
		expect(names[2]).toBe('Markers');
		expect(names[4]).toBe('Popup');
	});

	it('leaves the list it was given alone', () => {
		const before = NATIVE.map((g) => g.displayName);
		appendTrackOptions(NATIVE);
		expect(NATIVE.map((g) => g.displayName)).toEqual(before);
	});

	it('appends when the built-in wording — and its anchors — have moved on', () => {
		const list = appendTrackOptions([group('Something else', ['unrelated'])]);
		expect(list).toHaveLength(3);
		expect(list[0].displayName).toBe('Something else');
	});

	it('copes with no options at all', () => {
		expect(appendTrackOptions(undefined)).toHaveLength(2);
		expect(appendTrackOptions([])).toHaveLength(2);
	});
});

describe('option groups', () => {
	it('offers every coordinate mode plus a blank "follow the plugin"', () => {
		const choices = coordOptionGroup().items[0].options ?? {};
		expect(Object.keys(choices)).toEqual(['', ...COORD_MODES]);
		expect(coordOptionGroup().items[0].default).toBe('');
	});

	it('keeps the track sliders on the keys TrackLayer reads', () => {
		expect(trackOptionGroup().items.map((i) => i.key)).toEqual(['trackWeight', 'trackOpacity', 'fitMaxZoom']);
	});
});
