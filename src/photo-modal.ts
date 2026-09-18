/* A modal preserves the active map leaf; optional note opening stays caller-owned. */

import { Modal, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { t } from './i18n';

export interface PhotoPresentation {
	name: string;
	resourceUrl: string;
}

export class PhotoModal extends Modal {
	constructor(
		app: App,
		private readonly photo: PhotoPresentation,
		/** When absent, omit the open-note row. */
		private readonly onOpenNote?: () => void
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass('advanced-maps-photo-modal');
		this.titleEl.setText(this.photo.name);

		const image = this.contentEl.createEl('img', {
			cls: 'advanced-maps-photo-modal-image',
			attr: { src: this.photo.resourceUrl, alt: this.photo.name },
		});
		// The title and optional note route remain useful if the source vanished
		// after the point was drawn; remove the browser's broken-image placeholder.
		image.addEventListener('error', () => image.remove());

		if (!this.onOpenNote) return;
		const open = this.onOpenNote;
		const link = this.contentEl.createEl('button', {
			cls: 'advanced-maps-photo-modal-note',
			text: t('photo.openNote'),
		});
		setIcon(link.createSpan('advanced-maps-photo-modal-icon'), 'arrow-right');
		link.addEventListener('click', () => {
			// Closed first: the note lands in a pane behind this modal, and a
			// reader who asked for the note is done with the picture.
			this.close();
			open();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
