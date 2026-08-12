/*
 * The photo a pin on the map stands for, at a size worth looking at.
 *
 * A modal rather than `workspace.openLinkText(photo)`, which is the obvious
 * cheaper answer and is wrong for one measured reason: clicking a map is what
 * makes the map's own leaf the active one, so opening anything in the active
 * leaf replaces the map with what you clicked. CLAUDE.md's "A click on a pin
 * ate the map" records that trap for notes, where `openNote()` answers it by
 * routing through the pane a following map is following. A photo has no such
 * pane to fall back on — nobody is "following" an image — so the only shape
 * that cannot eat the map is one that does not take a leaf at all.
 *
 * It also answers the thing the note popup cannot: one note can hold a dozen
 * photos (a walk with a camera generally does), and "open the note" loses
 * which of them was under the cursor. Hover still gives the note's own card,
 * so neither half is out of reach — see `bindInteractions()` in
 * track-layer.ts, where both are bound to the same two layers.
 *
 * `onOpenNote` is a callback rather than a path this opens itself, so the one
 * door rule holds: every note-opening click in this plugin goes through
 * `TrackLayer.openNote()`, including the one that starts in here.
 */

import { Modal, setIcon } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { t } from './i18n';

export class PhotoModal extends Modal {
	constructor(
		app: App,
		private readonly photo: TFile,
		/** Absent when the photo's note could not be resolved; the row is then
		 *  simply not drawn, rather than drawn and dead. */
		private readonly onOpenNote?: () => void
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass('advanced-maps-photo-modal');
		this.titleEl.setText(this.photo.name);

		// `getResourcePath` carries the file's mtime as a query parameter, so an
		// edited photo is not served from the last one's cache entry.
		this.contentEl.createEl('img', {
			cls: 'advanced-maps-photo-modal-image',
			attr: { src: this.app.vault.getResourcePath(this.photo), alt: this.photo.name },
		});

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
