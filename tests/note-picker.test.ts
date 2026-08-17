import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import type { App, FuzzyMatch } from 'obsidian';
// Straight from the stub rather than through the `obsidian` alias: these two
// shapes are the stub's own, and the published types know nothing about them.
// It is the same module either way — vitest resolves `obsidian` to this file.
import { ButtonStub, Setting } from './obsidian-stub';
import { currentCoords, inFolder, NotePickerModal, ReplaceCoordsModal, templateFolder } from '../src/note-picker';

/**
 * Obsidian extends HTMLElement with these at runtime; happy-dom does not have
 * them. Only the handful the two modals actually call.
 */
beforeAll(() => {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.addClass = function (this: HTMLElement, ...classes: string[]) {
		this.classList.add(...classes);
	};
	proto.setText = function (this: HTMLElement, text: string) {
		this.textContent = text;
	};
	proto.empty = function (this: HTMLElement) {
		this.replaceChildren();
	};
	proto.createEl = function (this: HTMLElement, tag: string, opts?: { text?: string; cls?: string }) {
		const el = document.createElement(tag);
		if (opts?.text) el.textContent = opts.text;
		if (opts?.cls) el.className = opts.cls;
		this.append(el);
		return el;
	};
	proto.createDiv = function (this: HTMLElement, opts?: { text?: string; cls?: string } | string) {
		const o = typeof opts === 'string' ? { cls: opts } : opts;
		return (proto.createEl as (tag: string, o?: unknown) => HTMLElement).call(this, 'div', o);
	};
});

function note(path: string, folder = ''): TFile {
	const file = Object.assign(new TFile(), {
		path,
		name: path.slice(path.lastIndexOf('/') + 1),
		basename: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
		extension: 'md',
		parent: { path: folder },
	});
	return file;
}

/** An app whose metadata cache answers from a path → frontmatter table. */
function appWith(
	frontmatter: Record<string, Record<string, unknown> | undefined>,
	files: TFile[] = [],
	templates?: unknown
): App {
	return {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFileCache: (file: TFile) => {
				const fm = frontmatter[file.path];
				return fm === undefined ? null : { frontmatter: fm };
			},
		},
		internalPlugins: {
			getPluginById: (id: string) =>
				id === 'templates' && templates !== undefined ? { instance: { options: { folder: templates } } } : null,
		},
	} as unknown as App;
}

function match(file: TFile): FuzzyMatch<TFile> {
	return { item: file, match: { score: 0, matches: [] } };
}

describe('currentCoords', () => {
	const file = note('places/楼外楼.md', 'places');

	it('reads a plain string', () => {
		expect(currentCoords(appWith({ 'places/楼外楼.md': { coords: '30.24,120.14' } }), file, 'coords')).toBe(
			'30.24,120.14'
		);
	});

	it('trims, and reads whitespace as nothing there', () => {
		expect(currentCoords(appWith({ 'places/楼外楼.md': { coords: '  30.24,120.14 ' } }), file, 'coords')).toBe(
			'30.24,120.14'
		);
		expect(currentCoords(appWith({ 'places/楼外楼.md': { coords: '   ' } }), file, 'coords')).toBeNull();
	});

	it('joins a list back into one line, and reads an empty list as nothing there', () => {
		expect(currentCoords(appWith({ 'places/楼外楼.md': { coords: ['30.24', '120.14'] } }), file, 'coords')).toBe(
			'30.24,120.14'
		);
		expect(currentCoords(appWith({ 'places/楼外楼.md': { coords: [] } }), file, 'coords')).toBeNull();
	});

	it('is null for a missing property, a missing note, and an explicit null', () => {
		expect(currentCoords(appWith({ 'places/楼外楼.md': { place: 'Hangzhou' } }), file, 'coords')).toBeNull();
		expect(currentCoords(appWith({}), file, 'coords')).toBeNull();
		expect(currentCoords(appWith({ 'places/楼外楼.md': { coords: null } }), file, 'coords')).toBeNull();
	});

	it('still answers for a value that is not a coordinate, since that is the case worth confirming', () => {
		// "[object Object]" is what a naive String() produced here, which reads as
		// a filled property with an unreadable value — the wrong thing to overwrite
		// without asking.
		expect(currentCoords(appWith({ 'places/楼外楼.md': { coords: { lat: 30 } } }), file, 'coords')).toBe(
			'{"lat":30}'
		);
		expect(currentCoords(appWith({ 'places/楼外楼.md': { coords: 30.24 } }), file, 'coords')).toBe('30.24');
	});
});

describe('inFolder', () => {
	it('is true for a note inside the folder, at any depth', () => {
		expect(inFolder('templates/place.md', 'templates')).toBe(true);
		expect(inFolder('templates/nested/place.md', 'templates')).toBe(true);
	});

	it('is false for a folder whose name merely starts the same way', () => {
		// The difference between excluding a folder and excluding every note whose
		// path happens to contain a word.
		expect(inFolder('templates-old/place.md', 'templates')).toBe(false);
		expect(inFolder('my-templates/place.md', 'templates')).toBe(false);
	});

	it('ignores the slashes a folder may be typed with', () => {
		expect(inFolder('templates/place.md', '/templates/')).toBe(true);
	});

	it('is false for an empty or root folder, which would otherwise match everything', () => {
		expect(inFolder('places/楼外楼.md', '')).toBe(false);
		expect(inFolder('places/楼外楼.md', '/')).toBe(false);
	});

	it('matches a nested template folder without matching its parent', () => {
		expect(inFolder('meta/templates/place.md', 'meta/templates')).toBe(true);
		expect(inFolder('meta/other/place.md', 'meta/templates')).toBe(false);
	});
});

describe('templateFolder', () => {
	it('reads the folder the core Templates plugin names', () => {
		expect(templateFolder(appWith({}, [], 'templates'))).toBe('templates');
		expect(templateFolder(appWith({}, [], '/meta/templates/'))).toBe('meta/templates');
	});

	it('answers null when nothing usable is there, rather than excluding the vault', () => {
		expect(templateFolder(appWith({}, [], ''))).toBeNull();
		expect(templateFolder(appWith({}, [], '/'))).toBeNull();
		// The plugin disabled, the shape changed, the value not a string.
		expect(templateFolder(appWith({}, []))).toBeNull();
		expect(templateFolder(appWith({}, [], 42))).toBeNull();
		expect(templateFolder({} as unknown as App)).toBeNull();
	});
});

describe('NotePickerModal', () => {
	const placed = note('places/楼外楼.md', 'places');
	const unplaced = note('places/新店.md', 'places');
	const app = appWith({ 'places/楼外楼.md': { coords: '30.24,120.14' } }, [placed, unplaced]);

	it('leaves out the vault’s templates, which are shapes rather than places', () => {
		const template = note('templates/地点.md', 'templates');
		const lookalike = note('templates-old/旧地点.md', 'templates-old');
		const withTemplates = appWith({}, [placed, template, lookalike, unplaced], 'templates');
		const modal = new NotePickerModal(withTemplates, '30.25,120.15', 'coords', () => undefined);
		expect(modal.getItems()).toEqual([placed, lookalike, unplaced]);
	});

	it('offers everything when no template folder is configured', () => {
		const template = note('templates/地点.md', 'templates');
		const noTemplates = appWith({}, [placed, template]);
		const modal = new NotePickerModal(noTemplates, '30.25,120.15', 'coords', () => undefined);
		expect(modal.getItems()).toEqual([placed, template]);
	});

	it('offers the vault’s markdown notes, matched on their path', () => {
		const modal = new NotePickerModal(app, '30.25,120.15', 'coords', () => undefined);
		expect(modal.getItems()).toEqual([placed, unplaced]);
		// The full path, so typing a folder narrows the list.
		expect(modal.getItemText(placed)).toBe('places/楼外楼.md');
	});

	it('shows a placed note’s current coordinate on its row', () => {
		const modal = new NotePickerModal(app, '30.25,120.15', 'coords', () => undefined);
		const el = document.createElement('div');
		modal.renderSuggestion(match(placed), el);
		expect(el.textContent).toContain('楼外楼');
		expect(el.textContent).toContain('coords: 30.24,120.14');
	});

	it('shows only the folder for a note with no coordinate', () => {
		const modal = new NotePickerModal(app, '30.25,120.15', 'coords', () => undefined);
		const el = document.createElement('div');
		modal.renderSuggestion(match(unplaced), el);
		expect(el.textContent).toContain('新店');
		expect(el.textContent).toContain('places');
		expect(el.textContent).not.toContain('coords:');
	});

	it('hands the chosen note back', () => {
		const picked: TFile[] = [];
		const modal = new NotePickerModal(app, '30.25,120.15', 'coords', (file) => picked.push(file));
		modal.onChooseItem(unplaced);
		expect(picked).toEqual([unplaced]);
	});
});

describe('ReplaceCoordsModal', () => {
	let buttons: ButtonStub[] = [];

	beforeEach(() => {
		buttons = [];
		vi.spyOn(Setting.prototype, 'addButton').mockImplementation(function (
			this: Setting,
			cb: (button: ButtonStub) => unknown
		) {
			const button = new ButtonStub();
			cb(button);
			buttons.push(button);
			return this;
		});
	});

	function open(onConfirm: () => void): ReplaceCoordsModal {
		const file = note('places/楼外楼.md', 'places');
		const modal = new ReplaceCoordsModal(appWith({}), file, 'coords', '30.24,120.14', '30.25,120.15', onConfirm);
		modal.onOpen();
		return modal;
	}

	it('shows both values, so the replacement is seen before it happens', () => {
		const modal = open(() => undefined);
		expect(modal.contentEl.textContent).toContain('30.24,120.14');
		expect(modal.contentEl.textContent).toContain('30.25,120.15');
		expect(modal.contentEl.textContent).toContain('楼外楼');
	});

	it('writes nothing until the replacement is confirmed', () => {
		const confirmed = vi.fn();
		const modal = open(confirmed);
		const close = vi.spyOn(modal, 'close');

		// Cancel first: the button order is [leave it, replace].
		buttons[0].click();
		expect(confirmed).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalled();

		buttons[1].click();
		expect(confirmed).toHaveBeenCalledTimes(1);
	});

	it('closes before the write reports itself', () => {
		const order: string[] = [];
		const modal = open(() => order.push('write'));
		vi.spyOn(modal, 'close').mockImplementation(() => order.push('close'));
		buttons[1].click();
		expect(order).toEqual(['close', 'write']);
	});
});
