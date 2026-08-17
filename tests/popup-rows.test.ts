import { beforeAll, describe, expect, it } from 'vitest';
import { appendDetail, statsSummary } from '../src/popup-rows';
import { trackStats, type TrackStats } from '../src/stats';

/**
 * Obsidian's own DOM helpers, which happy-dom does not carry. `attr` is here
 * because the photo row is an `<img>`; the rest mirrors what note-picker's
 * suite installs.
 */
beforeAll(() => {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.createEl = function (
		this: HTMLElement,
		tag: string,
		opts?: { text?: string; cls?: string; attr?: Record<string, string> }
	) {
		const el = document.createElement(tag);
		if (opts?.text) el.textContent = opts.text;
		if (opts?.cls) el.className = opts.cls;
		for (const [name, value] of Object.entries(opts?.attr ?? {})) el.setAttribute(name, value);
		this.append(el);
		return el;
	};
	proto.createDiv = function (this: HTMLElement, opts?: { text?: string; cls?: string } | string) {
		const o = typeof opts === 'string' ? { cls: opts } : opts;
		return (proto.createEl as (tag: string, o?: unknown) => HTMLElement).call(this, 'div', o);
	};
	proto.appendText = function (this: HTMLElement, text: string) {
		this.append(document.createTextNode(text));
	};
});

/** A card in the shape `PopupManager.createPopupContent` returns. */
function card(properties: string[]): HTMLElement {
	const el = document.createElement('div');
	el.className = 'bases-map-popup';
	const title = document.createElement('div');
	title.className = 'bases-map-popup-title';
	el.append(title);
	// The host builds no property list at all for a note with a single property.
	if (properties.length === 0) return el;
	const list = document.createElement('div');
	list.className = 'bases-map-popup-properties';
	for (const label of properties) {
		const row = document.createElement('div');
		row.className = 'bases-map-popup-property';
		const labelEl = document.createElement('div');
		labelEl.className = 'bases-map-popup-property-label';
		labelEl.textContent = label;
		row.append(labelEl);
		list.append(row);
	}
	el.append(list);
	return el;
}

function labels(el: HTMLElement): string[] {
	return [...el.querySelectorAll('.bases-map-popup-property-label')].map((n) => n.textContent ?? '');
}

describe('appendDetail', () => {
	it('adds a row to the property list the host already built, after what is there', () => {
		const el = card(['Place', 'Date']);
		appendDetail(el, { label: 'walk', text: '4.2 km' });

		expect(labels(el)).toEqual(['Place', 'Date', 'walk']);
		expect(el.querySelectorAll('.bases-map-popup-properties')).toHaveLength(1);
		expect(el.querySelector('.bases-map-popup-property:last-child')?.textContent).toBe('walk4.2 km');
	});

	it('creates the property list when a one-property note left the card without one', () => {
		const el = card([]);
		expect(el.querySelector('.bases-map-popup-properties')).toBeNull();

		appendDetail(el, { label: 'walk', text: '4.2 km' });

		const list = el.querySelector('.bases-map-popup-properties');
		expect(list).not.toBeNull();
		expect(list?.querySelectorAll('.bases-map-popup-property')).toHaveLength(1);
		// After the title, not before it.
		expect(el.children[0].className).toBe('bases-map-popup-title');
	});

	it('moves and removes nothing the host put in the card', () => {
		const el = card(['Place', 'Date']);
		const before = [...el.querySelectorAll('.bases-map-popup-property')];
		appendDetail(el, { label: 'walk', text: '4.2 km' });

		const after = [...el.querySelectorAll('.bases-map-popup-property')];
		expect(after.slice(0, 2)).toEqual(before);
	});

	it('carries a picture and its file name in one row', () => {
		const el = card(['Place']);
		appendDetail(el, {
			label: 'Photo',
			text: 'lake.jpg',
			image: { src: 'app://x/lake.jpg', alt: 'lake.jpg' },
		});

		const img = el.querySelector('img');
		expect(img?.getAttribute('src')).toBe('app://x/lake.jpg');
		expect(img?.getAttribute('alt')).toBe('lake.jpg');
		expect(img?.className).toBe('advanced-maps-popup-photo');
		expect(el.querySelector('.bases-map-popup-property-value')?.textContent).toBe('lake.jpg');
	});

	it('adds nothing at all when the pointed feature has nothing to say', () => {
		const el = card(['Place']);
		appendDetail(el, { label: 'walk', text: '' });
		appendDetail(el, { label: 'walk' });

		expect(labels(el)).toEqual(['Place']);
	});
});

describe('statsSummary', () => {
	function stats(over: Partial<TrackStats>): TrackStats {
		return {
			distance: 0,
			ascent: null,
			descent: null,
			minEle: null,
			maxEle: null,
			start: null,
			end: null,
			duration: null,
			movingTime: null,
			speed: null,
			points: 0,
			...over,
		};
	}

	it('joins distance, climb and elapsed time', () => {
		expect(statsSummary(stats({ distance: 4210, ascent: 340, duration: 9665000 }))).toBe(
			'4.2 km · ↑ 340 m · 2:41:05'
		);
	});

	it('leaves out a figure the file never recorded rather than showing a zero', () => {
		expect(statsSummary(stats({ distance: 4210 }))).toBe('4.2 km');
		expect(statsSummary(stats({ distance: 4210, duration: 605000 }))).toBe('4.2 km · 10:05');
	});

	it('answers empty for a record with nothing measurable in it', () => {
		// An area: a ring is not a route, so `trackStats` measures nothing from it.
		const area = trackStats([
			{
				type: 'Feature',
				properties: null,
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[0, 0],
							[0, 1],
							[1, 1],
							[0, 0],
						],
					],
				},
			},
		]);
		expect(statsSummary(area)).toBe('');
		expect(statsSummary(stats({}))).toBe('');
	});

	it('says nothing about distance for a lone point that still has an elevation', () => {
		// `hasStats` is true here — min/max elevation are real — but there is no
		// distance travelled, and "0 m" would read as a measurement rather than
		// as the absence of one.
		expect(statsSummary(stats({ minEle: 12, maxEle: 12 }))).toBe('');
	});
});
