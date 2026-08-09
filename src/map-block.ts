/*
 * "Around this note": a map of the notes a note links to, the notes that link to
 * it, and itself.
 *
 * Nothing here is a data structure of this plugin's own. Bases already answers
 * "which notes" — inside an embedded base `this` is the *embedding* file, so a
 * filter can name the host note's own links — and it already draws them with the
 * base's icons, colours and popups. The plugin contributes one view in the base
 * file and one embed line in the note; adding a place afterwards is dragging a
 * note into the body, which is Obsidian's own behaviour and reaches no code of
 * ours.
 *
 * The view lives in the **base file** rather than being copied into each note.
 * A copy would be self-contained, but it freezes the base's formulas at the
 * moment it was written: change a colour rule and every map inserted before then
 * keeps the old one, with no way to know. Referencing the view instead means
 * there is nothing to refresh, because there is nothing that can go stale.
 *
 * The cost is that the link names the view. Rename it in Bases and the embeds
 * stop resolving, silently — Obsidian does not rewrite `#view` fragments.
 */

export interface BaseView {
	name?: string;
	type?: string;
	[key: string]: unknown;
}

export interface BaseSpec {
	views?: BaseView[];
	[key: string]: unknown;
}

/**
 * Rows the embedding note links to.
 *
 * Verified against a running Obsidian 1.13 rather than assumed: both this and
 * `file.backlinks.contains(this)` answer with exactly the linked notes, but the
 * documentation calls `file.backlinks` performance heavy, and this side of the
 * link is the one already in the metadata cache.
 */
export const LINKED_FROM_NOTE = 'this.file.hasLink(file)';

/**
 * The other direction: notes that link **to** the host.
 *
 * Not `file.backlinks.contains(this)`, which reads as the opposite and is not —
 * a row whose backlinks hold the host is a row the host links to, which is
 * `LINKED_FROM_NOTE` again. Measured: the two return the same set.
 *
 * Note the asymmetry. The outward clause reads one file's links, the host's;
 * this one reads the links of every row the base offers it.
 */
export const LINKS_TO_NOTE = 'file.hasLink(this.file)';

/** The host note itself. A link resolving to a file equates with it. */
export const THIS_NOTE = 'file == this.file';

/**
 * The host's own pin, but only once it has somewhere to put it.
 *
 * Stated as a filter rather than decided when the view is written, so it stays
 * true either way round: a note that gains a coordinate later appears without
 * anything being touched, and one that never has a coordinate never shows up as
 * a result that draws nothing.
 *
 * The property is reached with `this["name"]` rather than `this.name` because
 * the property is configurable and `this.my coords` is a syntax error. The
 * bracket form was checked against a running Obsidian; it is not a guess.
 */
export function pointerFilter(coordsProperty?: string): unknown {
	const clauses: unknown[] = [LINKED_FROM_NOTE, LINKS_TO_NOTE];
	if (coordsProperty) {
		clauses.push({ and: [THIS_NOTE, `!this[${JSON.stringify(coordsProperty)}].isEmpty()`] });
	}
	return { or: clauses };
}

/** The view to copy from: the one named in settings, or the base's first map view. */
export function pickMapView(base: BaseSpec, viewName?: string): BaseView | undefined {
	const views = base.views ?? [];
	if (viewName) return views.find((v) => v && v.name === viewName);
	return views.find((v) => v && v.type === 'map');
}

export function findView(base: BaseSpec, name: string): BaseView | undefined {
	return (base.views ?? []).find((v) => v && v.name === name);
}

/**
 * Narrow a view down to the notes around the host, without discarding what it
 * already filtered on. A view can hold a bare expression, an `and`, an `or` or a
 * `not`, so only the `and` case can be appended to — everything else is nested
 * under a fresh one, which means the same thing and cannot misread the original.
 */
function narrow(existing: unknown, filter: unknown): { and: unknown[] } {
	if (existing === undefined || existing === null || existing === '') return { and: [filter] };
	const and = (existing as { and?: unknown }).and;
	if (Array.isArray(and)) return { and: [...(and as unknown[]), filter] };
	return { and: [existing, filter] };
}

/**
 * The view to add, taken from one the base already has so the markers keep their
 * coordinate property, icons and colours.
 *
 * `center` and `defaultZoom` are dropped rather than copied: auto-fit stands
 * down whenever a view pins either, and a map of the notes around this one that
 * opens somewhere else entirely is the one thing it must not do.
 */
export function aroundView(source: BaseView, name: string, filter: unknown): BaseView {
	const out: BaseView = { ...source, name, filters: narrow(source.filters, filter) };
	delete out.center;
	delete out.defaultZoom;
	return out;
}

/**
 * The base with the view appended, or **null** when it already has one by that
 * name — the signal to write nothing. An existing view is left exactly as it is,
 * edits and all; this only ever creates.
 */
export function withAroundView(base: BaseSpec, source: BaseView, name: string, filter: unknown): BaseSpec | null {
	if (findView(base, name)) return null;
	return { ...base, views: [...(base.views ?? []), aroundView(source, name, filter)] };
}

/** The embed as it lands in the note. The fragment names the view. */
export function embedLink(linktext: string, viewName: string): string {
	return `![[${linktext}#${viewName}]]\n`;
}
