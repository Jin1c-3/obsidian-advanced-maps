import { describe, expect, it } from 'vitest';
import {
	appendTrackOptions,
	basemapOptionGroup,
	coordOptionGroup,
	groupIndexByKey,
	trackOptionGroup,
} from '../src/view-options';
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
		// Where a background is chosen, then what it is made of, then the datum it
		// implies — and the track knobs behind the markers they sit beside.
		expect(names.indexOf(basemapOptionGroup().displayName)).toBe(1);
		expect(names.indexOf(coordOptionGroup().displayName)).toBe(2);
		expect(names.indexOf(trackOptionGroup().displayName)).toBe(4);
		expect(names[0]).toBe('Background');
		expect(names[3]).toBe('Markers');
		expect(names[5]).toBe('Popup');
	});

	it('leaves the list it was given alone', () => {
		const before = NATIVE.map((g) => g.displayName);
		appendTrackOptions(NATIVE);
		expect(NATIVE.map((g) => g.displayName)).toEqual(before);
	});

	it('appends when the built-in wording — and its anchors — have moved on', () => {
		const list = appendTrackOptions([group('Something else', ['unrelated'])]);
		expect(list).toHaveLength(4);
		expect(list[0].displayName).toBe('Something else');
	});

	it('copes with no options at all', () => {
		expect(appendTrackOptions(undefined)).toHaveLength(3);
		expect(appendTrackOptions([])).toHaveLength(3);
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

	it('keeps the two values a base file could already hold, meaning what they meant', () => {
		const item = basemapOptionGroup().items[0];
		// The same key, so no base file written before this needs editing.
		expect(item.key).toBe('offlineTiles');
		// Empty is the default, so a base written before this existed follows the
		// plugin setting rather than opting out by omission.
		expect(item.default).toBe('');
		expect(Object.keys(item.options ?? {})).toEqual(['', 'off']);
	});

	it('offers the host backgrounds and the packs behind those two', () => {
		const item = basemapOptionGroup([
			{ id: '1786085922534', name: 'Liberty' },
			{ id: 'pack:Trail', name: 'Trail' },
		]).items[0];
		expect(Object.keys(item.options ?? {})).toEqual(['', 'off', '1786085922534', 'pack:Trail']);
		expect(item.options?.['1786085922534']).toBe('Liberty');
		expect(item.options?.['pack:Trail']).toBe('Trail');
	});

	it('names a background an open view wants that nothing answers to', () => {
		const item = basemapOptionGroup([{ id: 'pack:City', name: 'City' }], ['pack:Trail']).items[0];
		expect(Object.keys(item.options ?? {})).toEqual(['', 'off', 'pack:City', 'pack:Trail']);
		// Under the name the reader gave it, not the id it is stored as.
		expect(item.options?.['pack:Trail']).toContain('Trail');
		expect(item.options?.['pack:Trail']).not.toBe('Trail');
	});

	it('never lets a pack take the entry that is the way back to no pack at all', () => {
		const item = basemapOptionGroup([{ id: 'off', name: 'A background called off' }], ['off', '']).items[0];
		expect(Object.keys(item.options ?? {})).toEqual(['', 'off']);
		expect(item.options?.off).not.toBe('A background called off');
	});
});
