/*
 * The "open in map" pop-up.
 *
 * It renders one line — `![[places.base#Map]]` — because that is a *reference*
 * to the base rather than a copy of it. The first shape of this serialized the
 * whole base into a ```base block with `center`, `defaultZoom` and `mapHeight`
 * overwritten, which bought a centred map at the price of a base frozen at the
 * moment the pop-up opened: a formula or a colour rule changed since was not in
 * it, and nothing changed inside it went anywhere. Same lesson as the "around
 * this note" view in `map-block.ts`, and the same answer.
 *
 * What the copy bought is bought elsewhere now. The camera is pointed by
 * `TrackLayer.focus()`, which writes nothing anywhere; the height is CSS,
 * because `applyMapHeight` sets it inline on every config apply and CSS is the
 * only thing that wins that without fighting it.
 *
 * The one cost, stated in the settings rather than left to be discovered: an
 * embedded base has nowhere to write a view option back to, so a change made on
 * this map is gone when it closes. Measured — `config.set` neither throws nor
 * reaches disk. Opening the base in a tab is the setting for people who want
 * their changes kept.
 */

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
