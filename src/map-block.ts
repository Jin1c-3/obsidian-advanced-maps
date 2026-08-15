/* Pure builders for the shared base-file view embedded by “Around this note”. */

export interface BaseView {
	name?: string;
	type?: string;
	[key: string]: unknown;
}

export interface BaseSpec {
	views?: BaseView[];
	[key: string]: unknown;
}

/** Rows the embedding note links to, using the metadata-backed direction. */
export const LINKED_FROM_NOTE = 'this.file.hasLink(file)';

/** Rows whose own links point to the embedding note. */
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
 * bracket form also supports configurable property names containing spaces.
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
	if (viewName) return views.find((v) => v && v.type === 'map' && v.name === viewName);
	return views.find((v) => v && v.type === 'map');
}

export function findView(base: BaseSpec, name: string): BaseView | undefined {
	return (base.views ?? []).find((v) => v && v.name === name);
}

/** Whether an Around-view name is free, already usable, or occupied by another view type. */
export function aroundViewState(base: BaseSpec, name: string): 'missing' | 'map' | 'occupied' {
	const existing = findView(base, name);
	if (!existing) return 'missing';
	return existing.type === 'map' ? 'map' : 'occupied';
}

/** Names of referable map views only; unnamed/non-map views cannot satisfy the setting. */
export function mapViewNames(base: BaseSpec): string[] {
	const names: string[] = [];
	for (const view of base.views ?? []) {
		if (view && view.type === 'map' && typeof view.name === 'string' && view.name !== '') {
			names.push(view.name);
		}
	}
	return names;
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

/**
 * The embed as it lands in the note — and, without the newline, as the "open in
 * map" pop-up renders the base rather than copying it.
 *
 * The fragment names the view. A blank name is the one case where it is left
 * off: `![[x.base#]]` resolves to nothing at all, where `![[x.base]]` opens the
 * base's own first view, which is what "no view name configured" means
 * everywhere else here.
 */
export function embedLink(linktext: string, viewName?: string): string {
	return viewName ? `![[${linktext}#${viewName}]]` : `![[${linktext}]]`;
}
