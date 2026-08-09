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
}

export class Modal {
	modalEl: HTMLElement = document.createElement('div');
	titleEl: HTMLElement = document.createElement('div');
	contentEl: HTMLElement = document.createElement('div');
	constructor(public app: unknown) {}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
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
