import { describe, expect, it } from 'vitest';
import {
	aroundView,
	embedLink,
	findView,
	LINKED_FROM_NOTE,
	LINKS_TO_NOTE,
	pickMapView,
	pointerFilter,
	THIS_NOTE,
	withAroundView,
} from '../src/map-block';
import type { BaseSpec } from '../src/map-block';

/** Reduced to the shape that matters: top-level filters and formulas, several views. */
const BASE: BaseSpec = {
	filters: { and: ['file.inFolder("moments")'] },
	formulas: { icon: 'if(tags.contains("eat"), "utensils", "map-pin")' },
	properties: { 'formula.icon': { displayName: 'icon' } },
	views: [
		{ type: 'table', name: 'events' },
		{ type: 'map', name: 'map', coordinates: 'coords', markerIcon: 'formula.icon', center: '30.1,120.1' },
		{ type: 'map', name: 'second map' },
	],
};

describe('pickMapView', () => {
	it('takes the first map view when no name is configured', () => {
		expect(pickMapView(BASE)?.name).toBe('map');
	});

	it('takes the named view, whatever its position', () => {
		expect(pickMapView(BASE, 'second map')?.name).toBe('second map');
	});

	it('answers undefined for a name nobody has, and for a base with no views', () => {
		expect(pickMapView(BASE, 'nope')).toBeUndefined();
		expect(pickMapView({})).toBeUndefined();
	});
});

describe('pointerFilter', () => {
	it('takes both directions of link, and the host note itself', () => {
		expect(pointerFilter('coords')).toEqual({
			or: [LINKED_FROM_NOTE, LINKS_TO_NOTE, { and: [THIS_NOTE, '!this["coords"].isEmpty()'] }],
		});
	});

	// The two are not mirror images: one reads the host's links, the other reads
	// every candidate row's. Getting them the same way round is the whole point.
	it('keeps the two link directions distinct', () => {
		expect(LINKED_FROM_NOTE).toBe('this.file.hasLink(file)');
		expect(LINKS_TO_NOTE).toBe('file.hasLink(this.file)');
	});

	// Stated as a filter rather than decided at insert time, so a note that gains
	// a coordinate later appears without the block being touched — and one that
	// never has a coordinate is never a result that draws nothing.
	it('guards the host clause on the property actually holding something', () => {
		const guard = (pointerFilter('coords') as { or: [string, string, { and: string[] }] }).or[2].and[1];
		expect(guard).toBe('!this["coords"].isEmpty()');
	});

	it('reaches the property with brackets, so a name with a space still parses', () => {
		expect(pointerFilter('my coords')).toEqual({
			or: [LINKED_FROM_NOTE, LINKS_TO_NOTE, { and: [THIS_NOTE, '!this["my coords"].isEmpty()'] }],
		});
	});

	it('drops only the host clause when no property is configured', () => {
		expect(pointerFilter()).toEqual({ or: [LINKED_FROM_NOTE, LINKS_TO_NOTE] });
		expect(pointerFilter('')).toEqual({ or: [LINKED_FROM_NOTE, LINKS_TO_NOTE] });
	});
});

describe('aroundView', () => {
	const around = (view: Parameters<typeof aroundView>[0], filter: unknown = pointerFilter()) =>
		aroundView(view, 'Around', filter);

	it('filters on the notes around the embedding note', () => {
		expect(around({ type: 'map' }).filters).toEqual({ and: [pointerFilter()] });
	});

	it('appends to an existing "and" rather than replacing it', () => {
		const view = around({ type: 'map', filters: { and: ['private != true'] } });
		expect(view.filters).toEqual({ and: ['private != true', pointerFilter()] });
	});

	it('nests any other filter shape under a fresh "and"', () => {
		expect(around({ type: 'map', filters: 'private != true' }).filters).toEqual({
			and: ['private != true', pointerFilter()],
		});
		const or = { or: ['a', 'b'] };
		expect(around({ type: 'map', filters: or }).filters).toEqual({ and: [or, pointerFilter()] });
	});

	it('treats a blank filter as no filter, so the pointer does not end up ANDed with nothing', () => {
		expect(around({ type: 'map', filters: '' }).filters).toEqual({ and: [pointerFilter()] });
	});

	// Auto-fit stands down whenever a view pins either of these, and a map of
	// hand-picked notes that opens somewhere else is the one thing it must not do.
	it('drops a configured centre and zoom so auto-fit can frame the picked notes', () => {
		const view = around({ type: 'map', center: '30.1,120.1', defaultZoom: 14, mapHeight: 400 });
		expect(view.center).toBeUndefined();
		expect(view.defaultZoom).toBeUndefined();
		expect(view.mapHeight).toBe(400);
	});

	it('leaves the view it was given alone', () => {
		const original = { type: 'map', center: '30.1,120.1', filters: { and: ['a'] } };
		around(original);
		expect(original.center).toBe('30.1,120.1');
		expect(original.filters).toEqual({ and: ['a'] });
	});

	it('takes a filter of its own when one is passed', () => {
		expect(around({ type: 'map' }, 'this.places.contains(file)').filters).toEqual({
			and: ['this.places.contains(file)'],
		});
	});

	it('nests a whole filter group under the view\'s existing "and"', () => {
		const view = around({ type: 'map', filters: { and: ['private != true'] } }, pointerFilter('coords'));
		expect(view.filters).toEqual({ and: ['private != true', pointerFilter('coords')] });
	});
});

describe('findView', () => {
	it('finds a view by name and answers undefined otherwise', () => {
		expect(findView(BASE, 'map')?.type).toBe('map');
		expect(findView(BASE, 'nope')).toBeUndefined();
		expect(findView({}, 'map')).toBeUndefined();
	});
});

describe('withAroundView', () => {
	const next = withAroundView(BASE, pickMapView(BASE)!, 'Around', pointerFilter('coords'))!;

	it('appends the view and leaves everything else alone', () => {
		expect(next.views).toHaveLength(4);
		expect(next.filters).toEqual(BASE.filters);
		expect(next.formulas).toEqual(BASE.formulas);
		expect(next.views!.slice(0, 3)).toEqual(BASE.views);
	});

	// Copied from a view the base already has, so the markers keep the coordinate
	// property, the icons and the colours the base gives them.
	it('takes the marker settings from the view it copied', () => {
		const added = next.views![3];
		expect(added.name).toBe('Around');
		expect(added.coordinates).toBe('coords');
		expect(added.markerIcon).toBe('formula.icon');
		expect(added.filters).toEqual({ and: [pointerFilter('coords')] });
	});

	// Nothing to write is the signal not to touch the base file at all — and an
	// existing view keeps whatever edits it has been given since.
	it('answers null when a view by that name is already there', () => {
		expect(withAroundView(BASE, pickMapView(BASE)!, 'map', pointerFilter())).toBeNull();
		expect(withAroundView(next, pickMapView(BASE)!, 'Around', pointerFilter())).toBeNull();
	});

	it('does not touch the base it read', () => {
		expect(BASE.views).toHaveLength(3);
		expect(BASE.views![1].center).toBe('30.1,120.1');
	});

	it('copes with a base that has no views at all', () => {
		const bare = withAroundView({}, { type: 'map' }, 'Around', pointerFilter())!;
		expect(bare.views).toHaveLength(1);
		expect(bare.views![0].name).toBe('Around');
	});
});

describe('embedLink', () => {
	it('writes the embed with the view as the fragment', () => {
		expect(embedLink('moments.base', 'Around')).toBe('![[moments.base#Around]]\n');
	});

	// fileToLinktext may answer with a path when two bases share a basename.
	it('takes the linktext as given', () => {
		expect(embedLink('trips/places.base', '周围')).toBe('![[trips/places.base#周围]]\n');
	});
});
