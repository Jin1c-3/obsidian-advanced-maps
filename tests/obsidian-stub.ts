/*
 * The `obsidian` package ships types only — there is no runtime entry, because
 * the real implementation is injected by the app. Vitest resolves `obsidian`
 * here instead (see vitest.config.ts) so a test can import a module that pulls
 * in Obsidian symbols without needing a running vault.
 *
 * Stubs, not fakes: enough shape to import and construct, nothing more. A test
 * that needs real behaviour should spy on these rather than trust them.
 */

export class Component {
	load(): void {}
	unload(): void {}
	onload(): void {}
	onunload(): void {}
	addChild<T>(child: T): T {
		return child;
	}
	removeChild<T>(child: T): T {
		return child;
	}
	register(_cb: () => void): void {}
	registerEvent(_ref: unknown): void {}
	registerDomEvent(..._args: unknown[]): void {}
	registerInterval(id: number): number {
		return id;
	}
}

export class Plugin extends Component {
	settings?: unknown;
	constructor(
		public app: unknown,
		public manifest: unknown
	) {
		super();
	}
	addCommand(command: unknown): unknown {
		return command;
	}
	addSettingTab(_tab: unknown): void {}
	async loadData(): Promise<unknown> {
		return null;
	}
	async saveData(_data: unknown): Promise<void> {}
}

export class SettingTab {
	containerEl: HTMLElement = document.createElement('div');
	constructor(
		public app: unknown,
		public plugin: unknown
	) {}
	display(): void {}
	hide(): void {}
}

export class PluginSettingTab extends SettingTab {}

export class Setting {
	constructor(public containerEl: HTMLElement) {}
	setName(): this {
		return this;
	}
	setDesc(): this {
		return this;
	}
	setHeading(): this {
		return this;
	}
	addText(): this {
		return this;
	}
	addSlider(): this {
		return this;
	}
	addDropdown(): this {
		return this;
	}
	addToggle(): this {
		return this;
	}
	/** Unlike its siblings this one runs the callback: a test drives a modal's
	 *  buttons by capturing the components it builds. */
	addButton(cb: (button: ButtonStub) => unknown): this {
		cb(new ButtonStub());
		return this;
	}
}

/** Just enough of ButtonComponent to be built and clicked. */
export class ButtonStub {
	text = '';
	cta = false;
	click: () => void = () => undefined;
	setButtonText(text: string): this {
		this.text = text;
		return this;
	}
	setCta(): this {
		this.cta = true;
		return this;
	}
	onClick(cb: () => void): this {
		this.click = cb;
		return this;
	}
}

export class Modal {
	modalEl: HTMLElement = document.createElement('div');
	titleEl: HTMLElement = document.createElement('div');
	contentEl: HTMLElement = document.createElement('div');
	constructor(public app: unknown) {
		// Obsidian extends HTMLElement with these conveniences at runtime.
		this.modalEl.addClass = (...classes: string[]) => this.modalEl.classList.add(...classes);
	}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class SuggestModal<T> extends Modal {
	emptyStateText = '';
	setPlaceholder(_placeholder: string): void {}
	getSuggestions(_query: string): T[] | Promise<T[]> {
		return [];
	}
	renderSuggestion(_value: T, _el: HTMLElement): void {}
	onChooseSuggestion(_value: T): void {}
}

export class FuzzySuggestModal<T> extends SuggestModal<unknown> {
	getItems(): T[] {
		return [];
	}
	getItemText(_item: T): string {
		return '';
	}
	onChooseItem(_item: T, _evt?: unknown): void {}
}

export class TFile {
	path = '';
	name = '';
	basename = '';
	extension = '';
	stat = { mtime: 0, ctime: 0, size: 0 };
}

export class Notice {
	constructor(public message: string) {}
	hide(): void {}
}

export const MarkdownRenderer = {
	render: async (): Promise<void> => {},
};

export const Keymap = {
	isModEvent: (): boolean => false,
};

export function setIcon(_el: HTMLElement, _icon: string): void {}

/** Obsidian answers this from the language it stored; so does the stub. */
export function getLanguage(): string {
	try {
		return window.localStorage.getItem('language') || '';
	} catch {
		return '';
	}
}

export async function requestUrl(_options: unknown): Promise<{ status: number; json: unknown }> {
	throw new Error('requestUrl is not stubbed; spy on it in the test');
}

export function parseFrontMatterAliases(frontmatter: Record<string, unknown> | null): string[] | null {
	const raw = frontmatter?.aliases;
	if (typeof raw === 'string') return raw.split(',').map((part) => part.trim());
	return Array.isArray(raw) ? raw.map(String) : null;
}

export function parseYaml(_text: string): unknown {
	throw new Error('parseYaml is not stubbed; inject a parser in the test');
}

export function stringifyYaml(_value: unknown): string {
	throw new Error('stringifyYaml is not stubbed; inject a serialiser in the test');
}
