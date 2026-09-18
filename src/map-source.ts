/* Files the map may read: vault-owned inputs and explicit external photos. */

import { Platform } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { localFileUrl, localResourcePrefix } from './basemap';
import { PHOTO_EXTS } from './constants';

export interface VaultMapSource {
	kind: 'vault';
	file: TFile;
}

export interface ExternalPhotoSource {
	kind: 'external-photo';
	/** Namespaced cache/feature identity; never passed to a vault API. */
	key: string;
	/** Canonical file URL, used only when the reader asks to open the original. */
	uri: string;
	name: string;
	basename: string;
	extension: string;
	/** Per-launch host URL from which fetch and image elements can read it. */
	resourceUrl: string;
}

export type MapSource = VaultMapSource | ExternalPhotoSource;

const EXTERNAL_PREFIX = 'external:';

export function isExternalSourceKey(key: string): boolean {
	return key.startsWith(EXTERNAL_PREFIX);
}

export function vaultMapSource(file: TFile): VaultMapSource {
	return { kind: 'vault', file };
}

export function sourceKey(source: MapSource): string {
	return source.kind === 'vault' ? source.file.path : source.key;
}

export function sourceName(source: MapSource): string {
	return source.kind === 'vault' ? source.file.name : source.name;
}

export function sourceBasename(source: MapSource): string {
	return source.kind === 'vault' ? source.file.basename : source.basename;
}

export function sourceExtension(source: MapSource): string {
	return source.kind === 'vault' ? source.file.extension : source.extension;
}

export function sourceResourceUrl(app: App, source: MapSource): string {
	return source.kind === 'vault' ? app.vault.getResourcePath(source.file) : source.resourceUrl;
}

/**
 * The prefix through which this running host can serve an arbitrary local path.
 *
 * Android's published `Platform.resourcePathPrefix` is `file:///`, which its
 * own HTTP-origin web view refuses. Prefer the adapter-derived Capacitor route
 * everywhere; only desktop may fall back to the published per-launch prefix.
 */
export function externalResourcePrefix(app: App): string {
	const derived = localResourcePrefix(app.vault.adapter);
	if (derived) return derived;
	return Platform.isDesktopApp ? Platform.resourcePathPrefix : '';
}

/** A validated supported external photo, or null before any I/O is attempted. */
export function externalPhotoSource(destination: string, prefix: string): ExternalPhotoSource | null {
	const text = destination.trim();
	// `new URL('file:relative.jpg')` invents an absolute-looking pathname. Only
	// the explicit absolute form the guide documents crosses this trust boundary.
	if (!/^file:\/\//i.test(text)) return null;
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	if (url.protocol.toLowerCase() !== 'file:' || url.username || url.password || url.port) return null;
	if (url.search !== '' || url.hash !== '') return null;
	if (url.hostname !== '' && url.hostname.toLowerCase() !== 'localhost') return null;

	let path: string;
	try {
		path = decodeURIComponent(url.pathname);
	} catch {
		return null;
	}
	// URL pathnames keep the slash before a Windows drive. The local resource
	// handler wants `C:/...`, while POSIX and mobile paths keep their root slash.
	if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
	const resourceUrl = localFileUrl(path, prefix);
	if (!resourceUrl) return null;

	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');
	if (dot <= 0 || dot === name.length - 1) return null;
	const extension = name.slice(dot + 1).toLowerCase();
	if (!PHOTO_EXTS.has(extension)) return null;
	const basename = name.slice(0, dot);
	const uri = url.href;
	return {
		kind: 'external-photo',
		key: EXTERNAL_PREFIX + uri,
		uri,
		name,
		basename,
		extension,
		resourceUrl,
	};
}

/** Replace non-newline characters while preserving offsets and line starts. */
function blank(line: string): string {
	return line.replace(/[^\r\n]/g, ' ');
}

/**
 * Remove frontmatter and fenced code before the inline scanner sees brackets.
 * Fences follow the CommonMark shape relevant here: up to three leading spaces,
 * at least three matching backticks or tildes, and a closing run at least as
 * long. Indented code is deliberately outside the documented grammar.
 */
function bodyText(markdown: string): string {
	const lines = markdown.match(/.*(?:\r?\n|$)/g)?.filter((line) => line !== '') ?? [];
	let frontmatter = /^\uFEFF?---[\t ]*(?:\r?\n|$)/.test(lines[0] ?? '');
	let fence: { mark: '`' | '~'; length: number } | null = null;
	return lines
		.map((line, index) => {
			if (frontmatter) {
				if (index > 0 && /^\s{0,3}(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/.test(line)) frontmatter = false;
				return blank(line);
			}
			const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
			if (fence) {
				if (match && match[1][0] === fence.mark && match[1].length >= fence.length) fence = null;
				return blank(line);
			}
			if (match) {
				fence = { mark: match[1][0] as '`' | '~', length: match[1].length };
				return blank(line);
			}
			return line;
		})
		.join('');
}

/** Find a matching label bracket, honoring nesting and Markdown escapes. */
function labelEnd(text: string, start: number): number {
	let depth = 1;
	for (let i = start + 1; i < text.length; i++) {
		if (text[i] === '\\') {
			i++;
			continue;
		}
		if (text[i] === '[') depth++;
		else if (text[i] === ']' && --depth === 0) return i;
	}
	return -1;
}

/** The destination inside `(...)`, plus the index after the closing parenthesis. */
function inlineDestination(text: string, open: number): { destination: string; end: number } | null {
	let i = open + 1;
	while (i < text.length && /[\t \r\n]/.test(text[i])) i++;
	let destination = '';
	if (text[i] === '<') {
		i++;
		for (; i < text.length; i++) {
			if (text[i] === '\\' && i + 1 < text.length) {
				destination += text[i] + text[++i];
				continue;
			}
			if (text[i] === '>') {
				i++;
				break;
			}
			if (text[i] === '\n' || text[i] === '\r' || text[i] === '<') return null;
			destination += text[i];
		}
		if (text[i - 1] !== '>') return null;
	} else {
		let depth = 0;
		for (; i < text.length; i++) {
			const char = text[i];
			if (char === '\\' && i + 1 < text.length) {
				destination += char + text[++i];
				continue;
			}
			if (char === '(') depth++;
			else if (char === ')') {
				if (depth === 0) break;
				depth--;
			} else if (/\s/.test(char) && depth === 0) break;
			destination += char;
		}
	}
	// Optional title is not interpreted, but the whole inline link still has to
	// close. Quotes may contain a parenthesis; escapes preserve the next byte.
	let quote = '';
	for (; i < text.length; i++) {
		const char = text[i];
		if (char === '\\') {
			i++;
			continue;
		}
		if (quote) {
			if (char === quote) quote = '';
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === ')') {
			const unescaped = destination.replace(/\\([\\`*{}\x5b\x5d()<>#+.!_-])/g, '$1');
			return unescaped === '' ? null : { destination: unescaped, end: i + 1 };
		} else if (char === '\n' || char === '\r') return null;
	}
	return null;
}

/**
 * Supported external photos in body occurrence order, de-duplicated after URL
 * canonicalization. This is discovery only: whether the bytes are readable is
 * answered later by the bounded loader, per device.
 */
export function externalPhotoSources(markdown: string, prefix: string): ExternalPhotoSource[] {
	if (prefix === '') return [];
	const text = bodyText(markdown);
	const out: ExternalPhotoSource[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < text.length;) {
		if (text[i] === '`') {
			let length = 1;
			while (text[i + length] === '`') length++;
			const marker = '`'.repeat(length);
			const end = text.indexOf(marker, i + length);
			if (end !== -1) {
				i = end + length;
				continue;
			}
		}
		if (text[i] !== '[' || (i > 0 && text[i - 1] === '\\')) {
			i++;
			continue;
		}
		const close = labelEnd(text, i);
		if (close === -1 || text[close + 1] !== '(') {
			i++;
			continue;
		}
		const parsed = inlineDestination(text, close + 1);
		if (!parsed) {
			i++;
			continue;
		}
		const source = externalPhotoSource(parsed.destination, prefix);
		if (source && !seen.has(source.key)) {
			seen.add(source.key);
			out.push(source);
		}
		i = parsed.end;
	}
	return out;
}
