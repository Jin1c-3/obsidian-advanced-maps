/* “Open in map” modal renders a live base reference; camera state stays transient. */

import { Component, MarkdownRenderer, Modal } from 'obsidian';
import type { App } from 'obsidian';

export class MapModal extends Modal {
	private component: Component | null = null;

	constructor(
		app: App,
		/** Where the embed is resolved from, so a relative link finds its base. */
		private readonly sourcePath: string,
		private readonly markdown: string,
		private readonly heading: string
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass('advanced-maps-modal');
		this.titleEl.setText(this.heading);
		this.component = new Component();
		this.component.load();
		void MarkdownRenderer.render(this.app, this.markdown, this.contentEl, this.sourcePath, this.component);
	}

	override onClose(): void {
		this.component?.unload();
		this.component = null;
		this.contentEl.empty();
	}
}
