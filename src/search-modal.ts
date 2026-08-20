/* Debounced, cached place search with provider throttling and WGS-84 output. */

import { getLanguage, Notice, SuggestModal, requestUrl } from 'obsidian';
import type { App } from 'obsidian';
import { formatLatLng, toWgs84 } from './coords';
import {
	awaitRateLimit,
	geocodeRequest,
	GeocodeError,
	parseGeocode,
	type GeocodeProvider,
	type Place,
} from './geocode';
import { t } from './i18n';

/** Long enough to outlast typing, short enough not to feel broken. */
export const QUIET_MS = 450;
/** Re-exported from the module that owns the policy, so this one keeps naming it. */
export { NOMINATIM_INTERVAL_MS } from './geocode';
const MIN_QUERY = 2;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class PlaceSearchModal extends SuggestModal<Place> {
	private readonly cache = new Map<string, Place[]>();
	/** Incremented for every invocation — including short and cached queries — so
	 *  every new keystroke cancels debounce waits and in-flight responses alike. */
	private revision = 0;

	constructor(
		app: App,
		private readonly provider: GeocodeProvider,
		private readonly key: string,
		private readonly property: string,
		private readonly onPick: (coords: string, place: Place) => void | Promise<void>
	) {
		super(app);
		this.setPlaceholder(t('search.placeholder'));
		this.emptyStateText = t('search.empty');
		this.modalEl.addClass('advanced-maps-search-modal');
	}

	async getSuggestions(query: string): Promise<Place[]> {
		const revision = ++this.revision;
		const q = query.trim();
		if (q.length < MIN_QUERY) return [];

		const remembered = this.cache.get(q);
		if (remembered) return remembered;

		await delay(QUIET_MS);
		if (revision !== this.revision) return [];

		// The slot is claimed only if this keystroke is still the newest one; a
		// superseded query leaves it for the query that replaced it.
		if (!(await awaitRateLimit(this.provider, () => revision === this.revision))) return [];

		try {
			// Ask for names in the reader's own language: Nominatim will answer
			// "杭州市" rather than "Hangzhou" when told to.
			const request = geocodeRequest(this.provider, q, { key: this.key, language: getLanguage() || 'en' });
			const response = await requestUrl({ url: request.url, headers: request.headers, throw: false });
			// A newer query can arrive while the network request is in flight. Its
			// response owns the list; do not cache, display or report errors from this
			// one after it has been superseded.
			if (revision !== this.revision) return [];
			if (response.status >= 400) throw new GeocodeError(`HTTP ${response.status}`);
			const places = parseGeocode(this.provider, response.json);
			this.cache.set(q, places);
			return places;
		} catch (e) {
			if (revision !== this.revision) return [];
			// The list going quiet says nothing about why. A notice does, and a
			// failed key or a blocked host is exactly what people need told.
			const reason = e instanceof Error ? e.message : String(e);
			new Notice(t('notice.search.failed', { reason }));
			return [];
		}
	}

	renderSuggestion(place: Place, el: HTMLElement): void {
		el.addClass('advanced-maps-search-item');
		el.createDiv({ text: place.name, cls: 'advanced-maps-search-name' });
		if (place.detail) el.createDiv({ text: place.detail, cls: 'advanced-maps-search-detail' });
	}

	onChooseSuggestion(place: Place): void {
		const [lng, lat] = toWgs84(place.system, place.lng, place.lat);
		const coords = formatLatLng(lat, lng);
		void Promise.resolve(this.onPick(coords, place)).then(
			() => {
				new Notice(t('notice.locate.done', { property: this.property, coords }));
			},
			(e: unknown) => {
				// The modal has already closed by now, so an unreported failure is
				// a note that silently did not change — and, before this, an
				// unhandled rejection in the console rather than a message.
				const reason = e instanceof Error ? e.message : String(e);
				console.error('Advanced Maps: could not write the chosen place', e);
				new Notice(t('notice.write.failed', { reason }));
			}
		);
	}
}
