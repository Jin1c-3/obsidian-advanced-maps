/*
 * "Set coordinates from a link".
 *
 * The reader is in geolink.ts and is pure; this is only the box you paste into.
 * Two things it is careful about:
 *
 * - It shows the WGS-84 result *before* anything is written, because a datum
 *   mistake is invisible afterwards — the note looks fine and the pin is in the
 *   next province.
 * - The detected datum is a dropdown, not a verdict. Bare numbers carry no clue
 *   about which system they came from, and a proxied or reformatted link can
 *   lose the host that would have said.
 */

import { Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { COORD_MODES, toWgs84, type CoordSystem } from './coords';
import { parseGeoLink, shortLink, type ParsedPoint } from './geolink';
import { t } from './i18n';
import { COORD_DIGITS } from './locate';

/** What the user chose in the dropdown: "as detected", or a forced datum. */
type Choice = 'detected' | CoordSystem;

const FORCEABLE = COORD_MODES.filter((mode): mode is CoordSystem => mode !== 'auto');

export class LinkModal extends Modal {
	private text = '';
	private choice: Choice = 'detected';
	private parsed: ParsedPoint | null = null;
	private resultEl!: HTMLElement;
	private confirm!: HTMLButtonElement;

	constructor(
		app: App,
		private readonly property: string,
		private readonly onPick: (coords: string) => void | Promise<void>
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass('advanced-maps-link-modal');
		this.titleEl.setText(t('link.title'));

		this.contentEl.createEl('p', { text: t('link.intro'), cls: 'advanced-maps-link-intro' });

		new Setting(this.contentEl).setName(t('link.input')).addTextArea((area) => {
			area.setPlaceholder(t('link.placeholder'));
			area.inputEl.rows = 3;
			area.inputEl.addClass('advanced-maps-link-input');
			area.onChange((value) => {
				this.text = value;
				this.review();
			});
			// Focus lands here, so a paste needs no click first.
			window.setTimeout(() => area.inputEl.focus(), 0);
			void this.prefill(area.inputEl);
		});

		new Setting(this.contentEl).setName(t('link.system')).addDropdown((drop) => {
			drop.addOption('detected', t('link.system.detected'));
			for (const mode of FORCEABLE) drop.addOption(mode, t(`coord.${mode}` as const));
			drop.setValue('detected');
			drop.onChange((value) => {
				this.choice = value as Choice;
				this.review();
			});
		});

		this.resultEl = this.contentEl.createDiv({ cls: 'advanced-maps-link-result' });

		new Setting(this.contentEl).addButton((button) => {
			button
				.setButtonText(t('link.confirm'))
				.setCta()
				.onClick(() => void this.commit());
			this.confirm = button.buttonEl;
		});

		this.review();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * The clipboard usually already holds the link — that is how it got here.
	 * Reading it can be refused, and a refusal is not worth a word to the user:
	 * the box is right there, empty, waiting for a paste.
	 */
	private async prefill(input: HTMLTextAreaElement): Promise<void> {
		try {
			const clip = (await navigator.clipboard.readText()).trim();
			if (!clip || this.text) return;
			if (!parseGeoLink(clip) && !shortLink(clip)) return;
			input.value = clip;
			this.text = clip;
			input.select();
			this.review();
		} catch {
			/* no clipboard access; the box works by hand */
		}
	}

	/** Re-read the box and repaint the verdict. Cheap enough to run per keystroke. */
	private review(): void {
		this.parsed = parseGeoLink(this.text);
		this.resultEl.empty();

		if (!this.text.trim()) {
			this.setState('advanced-maps-link-idle', t('link.waiting'), false);
			return;
		}

		if (!this.parsed) {
			const short = shortLink(this.text);
			// The one failure with a cure: say what it is instead of "no coordinate".
			const message = short
				? t('link.short', { provider: t(`link.provider.${short.provider}`) })
				: t('link.unreadable');
			this.setState('advanced-maps-link-bad', message, false);
			return;
		}

		const coords = this.coords();
		const system = this.system();
		const provider = t(`link.provider.${this.parsed.provider}`);
		this.setState('advanced-maps-link-good', t('link.found', { provider, system: t(`coord.${system}`) }), true);
		this.resultEl.createEl('code', { text: `${this.property}: ${coords}`, cls: 'advanced-maps-link-coords' });
	}

	private setState(cls: string, message: string, ready: boolean): void {
		this.resultEl.className = `advanced-maps-link-result ${cls}`;
		this.resultEl.createDiv({ text: message });
		this.confirm.disabled = !ready;
	}

	/** The dropdown wins when it has been moved off "as detected". */
	private system(): CoordSystem {
		if (this.choice !== 'detected') return this.choice;
		return this.parsed?.system ?? 'wgs84';
	}

	/** The WGS-84 string that will land in frontmatter, shaped like every other. */
	private coords(): string {
		const p = this.parsed;
		if (!p) return '';
		const [lng, lat] = toWgs84(this.system(), p.lng, p.lat);
		return `${lat.toFixed(COORD_DIGITS)},${lng.toFixed(COORD_DIGITS)}`;
	}

	private async commit(): Promise<void> {
		if (!this.parsed) return;
		const coords = this.coords();
		this.close();
		await this.onPick(coords);
		new Notice(t('notice.locate.done', { property: this.property, coords }));
	}
}
