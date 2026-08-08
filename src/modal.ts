/*
 * The "open in map" pop-up.
 *
 * Renders the configured base as a ```base block rather than instantiating a
 * view directly: that is what carries the base's filters, formulas and
 * properties across, without which the icons, colours and scope are all lost.
 */

import { Component, MarkdownRenderer, Modal } from 'obsidian';
import type { App, TFile } from 'obsidian';

export class MapModal extends Modal {
	private component: Component | null = null;

	constructor(
		app: App,
		private readonly file: TFile,
		private readonly spec: string,
		private readonly heading: string
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass('advanced-maps-modal');
		this.titleEl.setText(this.heading);
		this.component = new Component();
		this.component.load();
		void MarkdownRenderer.render(
			this.app,
			'```base\n' + this.spec + '```',
			this.contentEl,
			this.file.path,
			this.component
		);
	}

	override onClose(): void {
		this.component?.unload();
		this.component = null;
		this.contentEl.empty();
	}
}
