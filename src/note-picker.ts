/* Choosing which existing note a point on the map belongs to, and guarding a replacement. */

import { FuzzySuggestModal, Modal, Setting } from 'obsidian';
import type { App, FuzzyMatch, TFile } from 'obsidian';
import { t } from './i18n';

/**
 * A frontmatter value as one line, or null when there is nothing there.
 *
 * Every kind of empty is stated rather than inferred from `String(value).trim()`,
 * which used to turn any object into a non-empty "[object Object]" and only
 * caught the empty list by the accident of `String([])` being "" — the same
 * reasoning `readCoords()` in main.ts carries. A value that is not a coordinate
 * at all still answers non-null: what this decides is whether a replacement gets
 * confirmed, and something unreadable in the property is exactly the case worth
 * asking about.
 */
function asText(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	// A list is how a coordinate pair is often written; join it back into the one
	// line this is only ever displaying.
	if (Array.isArray(value)) {
		const parts = value.map(asText).filter((part): part is string => part !== null);
		return parts.length === 0 ? null : parts.join(',');
	}
	try {
		return JSON.stringify(value) ?? null;
	} catch {
		return null;
	}
}

/** What a note's coordinate property holds today, as text, or null when it holds nothing. */
export function currentCoords(app: App, file: TFile, property: string): string | null {
	const frontmatter: Record<string, unknown> | undefined = app.metadataCache.getFileCache(file)?.frontmatter;
	return frontmatter ? asText(frontmatter[property]) : null;
}

/**
 * Is this note inside `folder`? Both are vault-root-relative, '/'-separated.
 *
 * A separator is required after the folder name, so `templates-old/x.md` is not
 * inside `templates`. That is the whole difference between this and a substring
 * test, and it is the difference between excluding a folder and excluding every
 * note whose path happens to contain a word.
 */
export function inFolder(path: string, folder: string): boolean {
	const root = folder.replace(/^\/+|\/+$/g, '');
	if (root === '') return false;
	return path.startsWith(`${root}/`);
}

/**
 * Where this vault keeps its templates, according to the core Templates plugin,
 * or null when it names none.
 *
 * Asked of Obsidian rather than configured here or guessed from a folder name:
 * the reader already told the app where their templates are, and a second
 * setting saying it again is a second thing to keep in sync. Every level is
 * optional and shape-checked — see `InternalPluginInstance.options` — and the
 * cost of it answering null is a slightly longer list.
 */
export function templateFolder(app: App): string | null {
	const folder = app.internalPlugins?.getPluginById('templates')?.instance?.options?.folder;
	if (typeof folder !== 'string') return null;
	const root = folder.replace(/^\/+|\/+$/g, '');
	// A template folder of "/" would mean the whole vault. Excluding everything
	// is worse than excluding nothing, so an unset or root folder excludes nothing.
	return root === '' ? null : root;
}

/**
 * Pick the note a clicked point belongs to.
 *
 * Every markdown note is offered, not only the unplaced ones: correcting a pin
 * that sits in the wrong place is a real use of this, and the confirmation in
 * `ReplaceCoordsModal` is what makes including the placed ones safe. Matching is
 * on the full path, so typing a folder narrows the list the way the quick
 * switcher does.
 *
 * Templates are the one exclusion. A template is not a place, it is the shape a
 * note is stamped from, and stamping a coordinate into one puts that coordinate
 * into every note made from it afterwards.
 */
export class NotePickerModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		/** The coordinate about to be written. It rides in the placeholder, so the
		 *  choice is made against a value rather than from memory. */
		coords: string,
		private readonly property: string,
		private readonly onPick: (file: TFile) => void
	) {
		super(app);
		this.setPlaceholder(t('picker.placeholder', { coords }));
		this.emptyStateText = t('picker.empty');
		this.modalEl.addClass('advanced-maps-note-picker');
	}

	getItems(): TFile[] {
		const notes = this.app.vault.getMarkdownFiles();
		// Read per open rather than held: the reader can move their template
		// folder between one right-click and the next.
		const templates = templateFolder(this.app);
		return templates === null ? notes : notes.filter((file) => !inFolder(file.path, templates));
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	override renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
		const file = match.item;
		el.addClass('advanced-maps-picker-item');
		el.createDiv({ text: file.basename, cls: 'advanced-maps-picker-name' });
		// Read per rendered row rather than per note in the vault: this is a
		// metadata-cache lookup for the handful of rows on screen, not a pass over
		// a vault that may hold tens of thousands.
		const held = currentCoords(this.app, file, this.property);
		const folder = file.parent?.path ?? '';
		const detail = held === null ? folder : `${folder}${folder ? ' · ' : ''}${this.property}: ${held}`;
		if (detail) el.createDiv({ text: detail, cls: 'advanced-maps-picker-detail' });
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

/**
 * The one dialog between a fuzzy match and an overwritten coordinate.
 *
 * Every other coordinate command writes to the note the reader is looking at, so
 * an overwrite there is visible and expected. This one writes to a note chosen
 * out of thousands, where a near-miss on a name is one keystroke away and
 * frontmatter has no undo.
 */
export class ReplaceCoordsModal extends Modal {
	constructor(
		app: App,
		private readonly file: TFile,
		private readonly property: string,
		private readonly held: string,
		private readonly next: string,
		private readonly onConfirm: () => void
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass('advanced-maps-replace-modal');
		this.titleEl.setText(t('replace.title'));
		this.contentEl.createEl('p', {
			text: t('replace.body', { file: this.file.basename, property: this.property }),
		});
		const list = this.contentEl.createDiv({ cls: 'advanced-maps-replace-values' });
		list.createDiv({ text: t('replace.from', { coords: this.held }) });
		list.createDiv({ text: t('replace.to', { coords: this.next }) });

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(t('replace.cancel')).onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText(t('replace.confirm'))
					.setCta()
					.onClick(() => {
						// Closed first: the write reports itself with a notice, and a
						// dialog still on screen behind it reads as nothing having
						// happened yet.
						this.close();
						this.onConfirm();
					})
			);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
