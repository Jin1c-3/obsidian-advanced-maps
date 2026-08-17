/* Rows this plugin appends to the popup card the native Maps view builds. */

import { formatDistance, formatDuration, formatElevation, hasStats, type TrackStats } from './stats';

/*
 * Class names read off the card `PopupManager.createPopupContent` returns — see
 * its declaration in `types/obsidian-internals.d.ts` for where they come from.
 * Matching them is what makes an appended row look like a property of the card
 * rather than something glued underneath it.
 */
const CARD_PROPERTIES = 'bases-map-popup-properties';
const CARD_PROPERTY = 'bases-map-popup-property';
const CARD_LABEL = 'bases-map-popup-property-label';
const CARD_VALUE = 'bases-map-popup-property-value';

/** What a pointed feature adds to the card: a label, and either text or a picture. */
export interface PointedDetail {
	/** A track's or photo's own name, or the word for a waypoint. */
	label: string;
	text?: string;
	image?: { src: string; alt: string };
}

/**
 * Append one row in the card's own shape.
 *
 * The property list belongs to the host and exists only once a note has a
 * second property to show — a one-property note leaves the card with a title
 * and nothing else — so it is created here when it is missing rather than
 * assumed. Nothing already in the card is moved or removed.
 */
export function appendDetail(card: HTMLElement, detail: PointedDetail): void {
	// An empty string is "nothing to say", not "a row with nothing in it": it is
	// what `statsSummary` answers for a record it could measure nothing from.
	const text = detail.text ?? '';
	if (text === '' && !detail.image) return;
	const list = card.querySelector<HTMLElement>(`.${CARD_PROPERTIES}`) ?? card.createDiv(CARD_PROPERTIES);
	const row = list.createDiv(CARD_PROPERTY);
	row.createDiv({ cls: CARD_LABEL, text: detail.label });
	const value = row.createDiv(CARD_VALUE);
	if (detail.image) {
		value.createEl('img', {
			cls: 'advanced-maps-popup-photo',
			attr: { src: detail.image.src, alt: detail.image.alt },
		});
	}
	if (text !== '') value.appendText(text);
}

/**
 * The pointed track's figures on one line: distance, climb, elapsed time.
 *
 * Three of the nine, because the card is narrow and already carries up to
 * twenty of the note's own properties; the full set stays on the inline embed.
 * The formatters are the ones that surface uses, so a popup and a strip can
 * never write the same number two ways. A figure the file never recorded is
 * left out rather than shown as a zero, and a record with nothing measurable in
 * it — a lone photo, an area — answers with an empty string, which
 * `appendDetail` turns into no row at all.
 */
export function statsSummary(stats: TrackStats): string {
	if (!hasStats(stats)) return '';
	const parts: string[] = [];
	if (stats.distance > 0) parts.push(formatDistance(stats.distance));
	if (stats.ascent !== null) parts.push(`↑ ${formatElevation(stats.ascent)}`);
	if (stats.duration !== null) parts.push(formatDuration(stats.duration));
	return parts.join(' · ');
}
