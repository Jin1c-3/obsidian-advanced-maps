/*
 * "Search for a place".
 *
 * A SuggestModal fires `getSuggestions` on every keystroke, which is one HTTP
 * request per character typed — past what Nominatim's usage policy allows and
 * rude to 高德 besides. So every query waits out a quiet period first and is
 * dropped if a newer one has arrived, and answers are remembered for the length
 * of the modal: backspacing through a query then re-typing it costs nothing.
 *
 * The result is converted to WGS-84 on the way out, like everything else this
 * plugin writes to disk.
 */

import { getLanguage, Notice, SuggestModal, requestUrl } from 'obsidian';
import type { App } from 'obsidian';
import { toWgs84 } from './coords';
import { geocodeRequest, GeocodeError, parseGeocode, type GeocodeProvider, type Place } from './geocode';
import { t } from './i18n';
import { COORD_DIGITS } from './locate';

/** Long enough to outlast typing, short enough not to feel broken. */
const QUIET_MS = 450;
const MIN_QUERY = 2;

export class PlaceSearchModal extends SuggestModal<Place> {
	private readonly cache = new Map<string, Place[]>();
	/** The most recent query; anything older resolves to nothing. */
	private latest = '';

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
		const q = query.trim();
		if (q.length < MIN_QUERY) return [];

		const remembered = this.cache.get(q);
		if (remembered) return remembered;

		this.latest = q;
		await sleep(QUIET_MS);
		// Someone kept typing. Their request is already on its way; this one would
		// only race it to the list.
		if (this.latest !== q) return [];

		try {
			// Ask for names in the reader's own language: Nominatim will answer
			// "杭州市" rather than "Hangzhou" when told to.
			const request = geocodeRequest(this.provider, q, { key: this.key, language: getLanguage() || 'en' });
			const response = await requestUrl({ url: request.url, headers: request.headers, throw: false });
			if (response.status >= 400) throw new GeocodeError(`HTTP ${response.status}`);
			const places = parseGeocode(this.provider, response.json);
			this.cache.set(q, places);
			return places;
		} catch (e) {
			// The list going quiet says nothing about why. A notice does, and a
			// failed key or a blocked host is exactly what people need told.
			const reason = e instanceof GeocodeError ? e.message : e instanceof Error ? e.message : String(e);
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
		const coords = `${lat.toFixed(COORD_DIGITS)},${lng.toFixed(COORD_DIGITS)}`;
		void Promise.resolve(this.onPick(coords, place)).then(() => {
			new Notice(t('notice.locate.done', { property: this.property, coords }));
		});
	}
}
