/* The two dialogs a place passes through: into notes from a file, out of a map into one. */

import { AbstractInputSuggest, Modal, Setting, normalizePath } from 'obsidian';
import type { App, TFolder } from 'obsidian';
import { t } from './i18n';
import { PLACE_FORMATS, writePlaces, type Place, type PlaceFormat } from './places';

/** How many names the import dialog shows before saying "and N more". */
const PREVIEW_NAMES = 5;

/** Built from the format list itself: a fourth format must not need editing here too. */
const FORMAT_EXT = new RegExp(`\\.(${PLACE_FORMATS.join('|')})$`, 'i');

/** The vault's folders, matched on their path, for a text field that names one. */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		input: HTMLInputElement,
		private readonly onPick: (path: string) => void
	) {
		super(app, input);
	}

	getSuggestions(query: string): TFolder[] {
		const needle = query.toLowerCase();
		// The folders, not every file in the vault filtered down to them: this runs
		// on each keystroke, and a large vault holds orders of magnitude more files
		// than folders.
		return this.app.vault.getAllFolders(true).filter((folder) => folder.path.toLowerCase().includes(needle));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		// The vault root is `/` as a path and empty as a destination.
		el.setText(folder.path === '/' ? '/' : folder.path);
	}

	override selectSuggestion(folder: TFolder): void {
		const path = folder.path === '/' ? '' : folder.path;
		this.setValue(path);
		this.onPick(path);
		this.close();
	}
}

/**
 * Confirm an import: what was found, and where it is about to land.
 *
 * The places are parsed before this opens, so the count is the real one rather
 * than a promise about the file — and the reader chooses the folder knowing it.
 */
export class ImportPlacesModal extends Modal {
	private folder: string;

	constructor(
		app: App,
		private readonly source: string,
		private readonly places: Place[],
		defaultFolder: string,
		private readonly onConfirm: (folder: string) => void | Promise<void>
	) {
		super(app);
		this.folder = defaultFolder;
	}

	override onOpen(): void {
		this.modalEl.addClass('advanced-maps-places-modal');
		this.titleEl.setText(t('places.import.title'));

		this.contentEl.createEl('p', {
			text: t('places.import.intro', { count: String(this.places.length), file: this.source }),
		});

		const names = this.places.slice(0, PREVIEW_NAMES).map((place) => place.name);
		const preview = this.contentEl.createDiv({ cls: 'advanced-maps-places-preview' });
		for (const name of names) preview.createDiv({ text: name });
		if (this.places.length > names.length) {
			preview.createDiv({
				text: t('places.import.more', { count: String(this.places.length - names.length) }),
				cls: 'advanced-maps-places-more',
			});
		}

		new Setting(this.contentEl).setName(t('places.import.folder')).addText((text) => {
			text.setPlaceholder(t('places.import.folderPlaceholder'))
				.setValue(this.folder)
				.onChange((value) => {
					this.folder = value;
				});
			new FolderSuggest(this.app, text.inputEl, (path) => {
				this.folder = path;
			});
		});

		this.contentEl.createEl('p', { text: t('places.import.undo'), cls: 'advanced-maps-places-note' });

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(t('places.cancel')).onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText(t('places.import.confirm'))
					.setCta()
					.onClick(() => {
						// Closed first: the import reports itself with a notice, and a
						// dialog still on screen behind it reads as nothing having
						// happened yet — the same order `ReplaceCoordsModal` uses.
						this.close();
						void this.onConfirm(normalizePath(this.folder.trim() || '/'));
					})
			);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

/** What a map can tell the export dialog about itself. */
export interface ExportSource {
	/** How many places the map holds — the same for every name source. */
	count: number;
	/** `file` first, then one entry per property the base displays. */
	names: Array<{ id: string; label: string }>;
	/** The places, named by one of `names`. Rebuilt per choice rather than held,
	 *  since choosing a name source is what the dialog is for. */
	places(nameId: string): Place[];
}

/**
 * Confirm an export: the format, what names the places, and where the file goes.
 *
 * The file text is composed here from the pure writers and handed over whole, so
 * the one thing the caller does is write it — and the path it is written to is
 * the one shown here, checked against the vault as it is typed.
 */
export class ExportPlacesModal extends Modal {
	private format: PlaceFormat = 'gpx';
	private nameId: string;
	private path: string;
	private pathEl!: HTMLElement;
	private pathInput: HTMLInputElement | null = null;
	private confirm!: HTMLButtonElement;

	constructor(
		app: App,
		private readonly source: ExportSource,
		stem: string,
		private readonly onConfirm: (path: string, text: string) => void | Promise<void>
	) {
		super(app);
		this.nameId = source.names[0]?.id ?? 'file';
		this.path = `${stem}.${this.format}`;
	}

	override onOpen(): void {
		this.modalEl.addClass('advanced-maps-places-modal');
		this.titleEl.setText(t('places.export.title'));

		this.contentEl.createEl('p', { text: t('places.export.intro', { count: String(this.source.count) }) });

		new Setting(this.contentEl).setName(t('places.export.format')).addDropdown((drop) => {
			for (const format of PLACE_FORMATS) drop.addOption(format, t(`places.format.${format}` as const));
			drop.setValue(this.format);
			drop.onChange((value) => {
				this.format = value as PlaceFormat;
				this.retarget();
				this.review();
			});
		});

		new Setting(this.contentEl)
			.setName(t('places.export.nameBy'))
			.setDesc(t('places.export.nameByDesc'))
			.addDropdown((drop) => {
				for (const name of this.source.names) drop.addOption(name.id, name.label);
				drop.setValue(this.nameId);
				drop.onChange((value) => {
					this.nameId = value;
				});
			});

		new Setting(this.contentEl).setName(t('places.export.path')).addText((text) => {
			text.setValue(this.path).onChange((value) => {
				this.path = value;
				this.review();
			});
			this.pathInput = text.inputEl;
		});

		this.pathEl = this.contentEl.createDiv({ cls: 'advanced-maps-places-note' });

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(t('places.cancel')).onClick(() => this.close()))
			.addButton((button) => {
				button
					.setButtonText(t('places.export.confirm'))
					.setCta()
					.onClick(() => void this.commit());
				this.confirm = button.buttonEl;
			});

		this.review();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	/** Follow the format in the box, but only where the box still ends in one. */
	private retarget(): void {
		this.path = `${this.path.replace(FORMAT_EXT, '')}.${this.format}`;
		if (this.pathInput) this.pathInput.value = this.path;
	}

	/** Repaint the verdict on the destination. Cheap enough to run per keystroke. */
	private review(): void {
		this.pathEl.empty();
		const path = this.resolved();
		if (path === '') {
			this.pathEl.setText(t('places.export.needsPath'));
			this.confirm.disabled = true;
			return;
		}
		if (this.app.vault.getAbstractFileByPath(path)) {
			this.pathEl.setText(t('places.export.taken', { path }));
			this.confirm.disabled = true;
			return;
		}
		this.pathEl.setText(t('places.export.willWrite', { path }));
		this.confirm.disabled = false;
	}

	private resolved(): string {
		const trimmed = this.path.trim();
		return trimmed === '' ? '' : normalizePath(trimmed);
	}

	private async commit(): Promise<void> {
		const path = this.resolved();
		if (path === '' || this.app.vault.getAbstractFileByPath(path)) return;
		const text = writePlaces(this.source.places(this.nameId), this.format);
		this.close();
		await this.onConfirm(path, text);
	}
}

/** The default file name an export offers: the base's own name, or a plain one. */
export function exportStem(activeName: string | null): string {
	const stem = (activeName ?? '').trim();
	return stem === '' ? t('places.export.defaultName') : stem;
}
