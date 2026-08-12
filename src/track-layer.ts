/*
 * TrackLayer — everything this plugin adds to one native map view.
 */

import { Keymap, Menu } from 'obsidian';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { PaneType, TFile } from 'obsidian';
import {
	ARROW_LAYER,
	ENDPOINT_LAYER,
	LINE_LAYER,
	PHOTO_DOT_LAYER,
	PHOTO_LAYER,
	POINT_LAYER,
	SRC,
	type TrackKnob,
} from './constants';
import {
	knownMode,
	projectCenter,
	projectGeometry,
	resolveSystem,
	toTileSpace,
	toWgs84,
	type CoordSystem,
} from './coords';
import { boundsOf, styleReady, trackFeatures, trackKnob, type TrackFeatureProps } from './geometry';
import { getLocale, t } from './i18n';
import {
	applyTrackPaint,
	drawTracks,
	ensurePhotoImages,
	fitTo,
	FitControl,
	FollowControl,
	guardLocateControl,
	removeTrackLayers,
	type LocateGuard,
	type PhotoIconSource,
} from './layers';
import { customMapLabel, customMapUrl, customMaps, enabledBuiltins, externalMapUrl, resolveBuiltins } from './maplinks';
import { PhotoModal } from './photo-modal';
import { photoImageId, projectedFeatures } from './track-cache';
import type AdvancedMapsPlugin from './main';
import type {
	BasesData,
	BasesEntry,
	BasesMapView,
	LngLat,
	LngLatBounds,
	MapConfig,
	MapMouseEvent,
	MarkerFeature,
} from './types/obsidian-internals';

interface DrawItem {
	entry: BasesEntry;
	file: TFile;
	trackFiles: TFile[];
	color: string;
}

/**
 * Where a map is asked to point, in WGS-84 — the space the note is written in.
 * Moving it into whatever space the tiles are drawn in is `focus()`'s job, and
 * doing it anywhere else is how a pin ends up 500 m from its own street.
 */
export interface FocusTarget {
	lat: number;
	lng: number;
	/** Left out to keep the zoom the reader chose, which is what following wants. */
	zoom?: number;
	/** A move across a map already on screen is worth watching; a map just built is not. */
	animate?: boolean;
	/** Whose popup to open on arrival, when that note is one of this view's own rows. */
	file?: TFile;
	/**
	 * Put the keyboard back where it was once the camera and the popup are done.
	 *
	 * Set by following and not by "open in map": the difference is whether the
	 * reader asked to be over here. See `restoreFocus`.
	 */
	keepFocus?: boolean;
}

type TrackFeature = Feature<Geometry, TrackFeatureProps>;

/**
 * Can this Obsidian build nest menus? `MenuItem.setSubmenu` is undeclared, so
 * it is checked for rather than assumed.
 *
 * Probed on a throwaway `Menu` that is never shown, and remembered: a `MenuItem`
 * is only reachable from inside `addItem`, and probing on the real menu would
 * leave an empty entry sitting in it that there is no API to take out again.
 */
let nestedMenus: boolean | null = null;
function canNestMenus(): boolean {
	if (nestedMenus === null) {
		nestedMenus = false;
		try {
			new Menu().addItem((item) => {
				nestedMenus = typeof item.setSubmenu === 'function';
			});
		} catch {
			/* flat items work everywhere; that is the fallback */
		}
	}
	return nestedMenus;
}

/**
 * Replace one method on an *instance*; the returned function puts it back.
 *
 * An own property shadows the prototype, so the wrapper dies with the object
 * and `delete` restores the untouched method. Where the native code assigned
 * the method as an own property itself, the saved value goes back instead.
 */
function override<T extends object, K extends keyof T>(obj: T, key: K, make: (orig: T[K]) => T[K]): () => void {
	const orig = obj[key];
	const hadOwn = Object.prototype.hasOwnProperty.call(obj, key);
	obj[key] = make(orig);
	return () => {
		if (hadOwn) obj[key] = orig;
		else delete (obj as unknown as Record<string, unknown>)[key as string];
	};
}

export class TrackLayer {
	private items: DrawItem[] = [];
	private data: FeatureCollection<Geometry, TrackFeatureProps> | null = null;
	private userMoved = false;
	private interactionsBound = false;
	private detached = false;
	private fitControl: FitControl | null = null;
	private followControl: FollowControl | null = null;
	/**
	 * Whether this map keeps up with the note being edited. Per layer, so per
	 * open map — the setting is only where a new one starts, and two tabs on the
	 * same base view answer this separately.
	 *
	 * Not persisted anywhere: the two places that could hold it are the base file
	 * (which would make one map's button rewrite everybody else's copy of that
	 * view) and state of the plugin's own, which this repo would rather not keep.
	 * So a reopened tab starts from the setting again.
	 */
	private following: boolean;
	private markerFeatures: MarkerFeature[] | null = null;
	/** How to put back every method wrapped for the life of this layer. */
	private readonly restorers: Array<() => void> = [];
	/** Reached past the wrapper by `hover()`, which already holds tile-space coordinates. */
	private origShowPopup: BasesMapView['popupManager']['showPopup'] | null = null;
	private locate: LocateGuard | null = null;
	/** Which space the map is currently drawn in, so a change to it can be noticed. */
	private appliedSystem: CoordSystem | null = null;
	/** The signature of what is currently on the map; null once nothing is. */
	private drawn: string | null = null;
	/** Where to point the camera, held until there is a camera to point. */
	private pendingFocus: FocusTarget | null = null;
	/** …and where it was pointed, held for as long as this map lives. */
	private held: FocusTarget | null = null;
	/** …and whose popup to open, held until the row it belongs to arrives. */
	private pendingPopup: FocusTarget | null = null;
	/** The last DOM event `open()` acted on — see there for why one click can
	 *  arrive twice. */
	private handledClick: MouseEvent | null = null;

	constructor(
		private readonly plugin: AdvancedMapsPlugin,
		/** Public so the plugin can find the layer that draws inside a given element. */
		readonly view: BasesMapView
	) {
		// Read once, here, rather than consulted on every `file-open`: the setting
		// is the state a *new* map starts in, so changing it must not reach across
		// and re-arm a map whose button the reader has since pressed.
		this.following = plugin.settings.followActiveNote;
	}

	/** Whether this map is one of the ones that follows. Read by the plugin's `file-open`. */
	isFollowing(): boolean {
		return this.following;
	}

	/**
	 * The button, and the two things it does besides flipping a flag.
	 *
	 * Switching it **on** aims at the note that is open now rather than waiting
	 * for the next `file-open`: a toggle that appears to do nothing until you
	 * click away and back reads as broken.
	 *
	 * Switching it **off** drops `held`, which is what stands `fit()` down (see
	 * `fit`). Left in place, turning following off would leave the map frozen on
	 * the last note it followed — auto-fit still standing down for a target
	 * nothing is aiming at any more.
	 */
	private toggleFollow(): void {
		this.following = !this.following;
		this.followControl?.setActive(this.following);
		if (this.following) this.plugin.followNow(this);
		else this.held = null;
	}

	private wrap<T extends object, K extends keyof T>(obj: T, key: K, make: (orig: T[K]) => T[K]): void {
		this.restorers.push(override(obj, key, make));
	}

	/**
	 * markerManager.updateMarkers is the useful seam. The native view calls it
	 * after the map exists and after every data change, *and* re-calls it on
	 * `styledata` once a new style has wiped every source — which is exactly the
	 * set of moments the tracks need redrawing too.
	 */
	attach(): this {
		const view = this.view;
		const manager = view.markerManager;
		const popups = view.popupManager;
		// What `enhance()` reads to tell an already-wrapped view from a fresh one.
		view.__advancedMapsLayer = true;

		this.wrap(manager, 'updateMarkers', (orig) => async (data?: BasesData) => {
			await orig.call(manager, data);
			try {
				await this.sync(data);
			} catch (e) {
				console.error('Advanced Maps: could not draw tracks', e);
			}
		});

		// Every marker coordinate that reaches the map is minted here — the
		// native method does nothing but turn parsed entries into Point
		// features — which makes it the one place the pins have to be moved.
		this.wrap(manager, 'createGeoJSONFeatures', (orig) => (entries: unknown) => {
			const features = orig.call(manager, entries);
			const system = this.system();
			const moved =
				system === 'wgs84'
					? features
					: features.map((feature) => ({
							...feature,
							geometry: projectGeometry(feature.geometry, system),
						}));
			// Native getBounds() still answers in WGS-84, so keep the moved
			// features around; bounds() reads them instead.
			this.markerFeatures = moved;
			return moved;
		});

		// Where a click on a pin sends the note. The native callback is
		// `openLinkText(path, '', newLeaf)`, which lands in the active leaf — the
		// map's own, since clicking it is what activated it. Wrapped rather than
		// re-implemented so a map nobody is following keeps the native behaviour
		// exactly, including whatever a future version does with `newLeaf`.
		this.wrap(manager, 'onOpenFile', (orig) => (path: string, newLeaf: boolean) => {
			this.openNote(path, newLeaf, () => orig.call(manager, path, newLeaf));
		});

		// A marker's popup is anchored at the note's own value rather than at the
		// feature that was drawn — the native manager keeps what the property
		// said — so on Chinese tiles it opens a few streets from its own pin.
		this.wrap(popups, 'showPopup', (orig) => {
			this.origShowPopup = orig;
			return (entry, latLng, properties, markerProps, displayName) => {
				const [lng, lat] = toTileSpace(this.system(), latLng[1], latLng[0]);
				orig.call(popups, entry, [lat, lng], properties, markerProps, displayName);
			};
		});

		// The view reads `center` out of the base file in WGS-84 and hands it
		// straight to the map. Converting it here, where the config object is
		// born, means initializeMap and updateCenter both agree — patching
		// either one alone makes them fight over the centre.
		this.wrap(view, 'loadConfig', (orig) => (tileSetId?: string) => {
			const config = orig.call(view, tileSetId);
			this.projectConfigCenter(config);
			return config;
		});

		// The background switcher rewrites mapConfig.mapTiles in place instead of
		// going back through loadConfig, so under "auto" the system can change
		// without the centre hearing about it. Re-derive it from the value we kept.
		this.wrap(view, 'switchToTileSet', (orig) => async (tileSetId: string) => {
			await orig.call(view, tileSetId);
			this.projectConfigCenter(view.mapConfig);
			this.realignCamera();
			this.locate?.replaceDot();
		});

		// The map's own right-click menu turns the click into a coordinate with
		// map.unproject(), which answers in tile space. "New note" writes that
		// into the note it creates, "Copy coordinates" hands it over as a real
		// place, and "Set default center point" stores it in the base file for
		// loadConfig to shift a second time. Rather than rebuild the menu, undo
		// the shift on what unproject answers for the length of the call — every
		// item reads its coordinate off it, synchronously, before the menu opens.
		if (typeof view.showMapContextMenu === 'function') {
			this.wrap(view, 'showMapContextMenu', (orig) => (ev: MouseEvent) => {
				const map = view.map;
				const system = this.system();
				if (!map || system === 'wgs84' || typeof map.unproject !== 'function') {
					orig.call(view, ev);
					// No patch was installed above — under 'wgs84' tile space already
					// *is* WGS-84, so addExternalMapItems's own toWgs84() call below is
					// a correct no-op rather than a missing conversion.
					if (map) this.addExternalMapItems(ev, map, system);
					return;
				}
				const restore = override(map, 'unproject', (native) => (point) => {
					const lngLat = native.call(map, point);
					const [lng, lat] = toWgs84(system, lngLat.lng, lngLat.lat);
					const LngLatCtor = lngLat.constructor as new (lng: number, lat: number) => LngLat;
					return new LngLatCtor(lng, lat);
				});
				try {
					orig.call(view, ev);
				} finally {
					restore();
				}
				// restore() has already put map.unproject back to its native,
				// tile-space form, so addExternalMapItems reading it now gets exactly
				// what the native "New note" item got before *its* un-shift — one
				// more toWgs84() away from WGS-84, same as everything else here.
				this.addExternalMapItems(ev, map, system);
			});
		}

		this.wrap(view, 'initializeMap', (orig) => async () => {
			const fresh = !view.map;
			await orig.call(view);
			if (fresh && view.map) this.onMapCreated(view.map);
		});

		this.wrap(view, 'destroyMap', (orig) => () => {
			this.fitControl = null;
			this.interactionsBound = false;
			this.userMoved = false;
			this.data = null;
			this.drawn = null;
			this.markerFeatures = null;
			this.appliedSystem = null;
			this.pendingFocus = null;
			this.pendingPopup = null;
			this.held = null;
			this.locate?.restore();
			this.locate = null;
			orig.call(view);
		});

		this.wrap(view, 'onunload', (orig) => () => {
			this.detach();
			orig.call(view);
		});

		return this;
	}

	/**
	 * "Open in external map" — one item per map app the reader has left in the
	 * list, appended to the menu the native handler above just built. Nothing is
	 * appended when they have emptied it.
	 *
	 * `Menu.forEvent` keys its menu off the *event*, not off the caller. Read out
	 * of the shipped Obsidian build (undocumented, so this was verified rather
	 * than assumed — `npx asar extract` on `obsidian.asar`), it is exactly a
	 * lookup-or-build against a `WeakMap<Event, Menu>`, with the actual
	 * `showAtMouseEvent` deferred to a `setTimeout(0)`:
	 * `n = map.get(e); if (!n) { n = new Menu(); map.set(e, n);
	 * e.win.setTimeout(() => n.showAtMouseEvent(e)); } return n;`. The native
	 * `showMapContextMenu` above has already called `Menu.forEvent(ev)` once for
	 * this exact `ev`, so calling it again here — synchronously, in the same
	 * task, before that deferred show fires — finds the same menu rather than
	 * building a second, unrelated one, and the item lands before the reader
	 * ever sees it open. This is `Menu.forEvent`'s documented purpose: several
	 * contributors adding items to one menu for one event.
	 *
	 * The providers go in a submenu. `MenuItem.setSubmenu` is absent from
	 * `obsidian.d.ts` but present in the shipped build and used by Obsidian's own
	 * menus — see the declaration in `types/obsidian-internals.d.ts` for what was
	 * read out of `obsidian.asar`. Undeclared means unpromised, so it is checked
	 * for at runtime and six flat items are added instead when it is not there:
	 * repetitive, but a working menu beats a missing one.
	 */
	private addExternalMapItems(ev: MouseEvent, map: NonNullable<BasesMapView['map']>, system: CoordSystem): void {
		if (typeof map.unproject !== 'function') return;
		let lngLat: LngLat;
		try {
			// The same pixel showMapContextMenu itself reads the click from.
			lngLat = map.unproject([ev.offsetX, ev.offsetY]);
		} catch {
			return;
		}
		// By the time this runs, map.unproject is back to its native, tile-space
		// form — either the wrapper above patched it and its own restore() already
		// ran (the finally block, above), or system was already 'wgs84' and no
		// patch was ever installed in the first place. Either way toWgs84() here
		// is exactly *one* un-shift: never the zero a still-patched unproject would
		// leave (this would then double-convert), and never the two an extra call
		// elsewhere would add. Both errors are invisible on screen and land the pin
		// ~500 m from where the reader actually clicked.
		const [lng, lat] = toWgs84(system, lngLat.lng, lngLat.lat);

		const items = this.externalMapItems(lat, lng);
		if (items.length === 0) return;
		const menu = Menu.forEvent(ev);
		const open = (url: string) => window.open(url, '_blank');

		if (canNestMenus()) {
			menu.addItem((item) => {
				item.setTitle(t('menu.openExternal')).setIcon('external-link').setSection('external-map');
				const submenu = item.setSubmenu();
				for (const entry of items) {
					submenu.addItem((child) => child.setTitle(entry.title).onClick(() => open(entry.url)));
				}
			});
			return;
		}

		for (const entry of items) {
			menu.addItem((item) =>
				item
					.setTitle(`${t('menu.openExternal')}: ${entry.title}`)
					.setIcon('external-link')
					.setSection('external-map')
					.onClick(() => open(entry.url))
			);
		}
	}

	/**
	 * What the menu offers, in the order the reader put it in: the built-ins they
	 * left switched on, then whatever they added themselves.
	 *
	 * No label is passed anywhere below. The click is on empty map, not on a
	 * note, so there is no name to give — inventing one would be worse than none.
	 *
	 * An unusable custom entry — no scheme, a scheme a menu item must not carry,
	 * or a URL with no `{lat}`/`{lng}` to put the coordinate in — is left out
	 * rather than opened. `customMapUrl` is the one place that decides, and the
	 * settings pane says which of the three it is while the reader is still
	 * typing, because a menu cannot explain the item it is not showing.
	 */
	private externalMapItems(lat: number, lng: number): Array<{ title: string; url: string }> {
		const settings = this.plugin.settings;
		const items = enabledBuiltins(resolveBuiltins(settings.externalMaps, getLocale())).map((provider) => ({
			title: t(`link.provider.${provider}`),
			url: externalMapUrl(provider, lat, lng),
		}));
		for (const entry of customMaps(settings.customMaps)) {
			const url = customMapUrl(entry, lat, lng);
			if (url !== null) items.push({ title: customMapLabel(entry), url });
		}
		return items;
	}

	detach(): void {
		if (this.detached) return;
		this.detached = true;
		const view = this.view;

		this.removeLayers();
		for (const control of [this.fitControl, this.followControl]) {
			if (!control || !view.map) continue;
			try {
				view.map.removeControl(control);
			} catch {
				/* map already gone */
			}
		}
		this.fitControl = null;
		this.followControl = null;

		for (const restore of this.restorers.splice(0)) restore();
		delete view.__advancedMapsLayer;
		this.origShowPopup = null;
		this.locate?.restore();
		this.locate = null;

		this.plugin.layers.delete(this);
	}

	onMapCreated(map: NonNullable<BasesMapView['map']>): void {
		this.fitControl = new FitControl(() => this.fit(true));
		map.addControl(this.fitControl, 'top-right');
		this.followControl = new FollowControl(() => this.toggleFollow());
		map.addControl(this.followControl, 'top-right');
		// `addControl` calls `onAdd` synchronously, so the button exists by now and
		// can be told which way it is pointing.
		this.followControl.setActive(this.following);
		this.locate ??= guardLocateControl(map, () => this.system());
		this.appliedSystem = this.system();

		// A new style is a blank slate: every source and layer is gone. The
		// built-in view puts its markers back, so put the tracks back too rather
		// than riding on its one-shot `styledata` handler.
		map.on('style.load', () => {
			this.sync().catch((e) => console.error('Advanced Maps: could not redraw tracks', e));
		});

		// The built-in view frames every marker when the map finishes loading,
		// *animated*, unless it has a pending camera state at that moment — and
		// that state is one-shot: the data path applies it and sets it to null. So
		// whether the map has finished loading before or after the first data
		// update decides whether a map opened on one note stays on it. Desktop
		// wins that race and mobile loses it, which is exactly how it was found.
		//
		// Registered here, after the native handler, so it runs in the same
		// dispatch and puts the camera back before a frame is drawn — the started
		// animation is cancelled by the new camera command rather than watched.
		map.on('load', () => {
			if (this.held && !this.userMoved) this.aim(this.held, false);
		});

		// Once the reader takes the wheel, stop re-framing the map underneath
		// them. Programmatic moves carry no originalEvent, so they do not count.
		const mark = (ev?: { originalEvent?: unknown }) => {
			if (ev && ev.originalEvent) this.userMoved = true;
		};
		for (const name of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) map.on(name, mark);

		// Asked for before there was a map to ask — "open in map" gets its layer
		// back from the leaf a beat before the view builds its map, measured.
		const pending = this.pendingFocus;
		if (pending) {
			this.pendingFocus = null;
			this.focus(pending);
		}
	}

	/* ---- pointing the camera ---- */

	/**
	 * Point this map at one place: the note "open in map" was run on, or the note
	 * that just became active.
	 *
	 * Keeping it there is the part that took measuring. Three things would
	 * otherwise take the camera back:
	 *
	 * - `fit()`, on the next sync — and Bases syncs on *any* vault change while a
	 *   map is open. `held` is what stands it down, and the ⛶ control still wins
	 *   because that is what `force` means.
	 * - The view's own `load` handler, which frames every marker. See
	 *   `onMapCreated`.
	 * - The configured centre, applied when the map is built.
	 *
	 * The last of those is handled by telling the view its camera is under outside
	 * control, through the `setEphemeralState` seam Obsidian's own back/forward
	 * restore uses. Worth knowing before relying on it: **it is one-shot**. The
	 * native data path applies `pendingMapState` once the markers are up and then
	 * sets it to null, so it cannot be the only thing holding a camera in place —
	 * which is what `held` is for.
	 */
	focus(target: FocusTarget): void {
		if (this.detached) return;
		// No map yet, and no `mapConfig` either — so there is nothing to convert
		// against. Hold the WGS-84 target and let onMapCreated ask again.
		if (!this.view.map) {
			this.pendingFocus = target;
			return;
		}
		this.held = target;
		this.restoreFocus(target, () => {
			this.aim(target, target.animate === true);
			this.pendingPopup = this.showNotePopup(target) ? null : target;
		});
	}

	/**
	 * Run something that opens a popup, and leave the keyboard where it was.
	 *
	 * A MapLibre `Popup` focuses itself when it opens — `focusAfterOpen`, which
	 * defaults to true and which the native `PopupManager` never sets — so it
	 * grabs the first focusable thing inside itself, the note link. Measured: with
	 * a note focused in one pane, a follow lands `document.activeElement` on
	 * `a.internal-link` inside the map's popup.
	 *
	 * That is correct for a popup the reader opened by pointing at a pin, and it
	 * is the whole of why following was unusable in a split: every switch between
	 * notes took the caret out of the editor and put it on the map. The popup is
	 * still worth opening — a map that moves should say what it moved for — so the
	 * focus goes back rather than the popup going away.
	 *
	 * Restoring after the fact, rather than turning `focusAfterOpen` off on the
	 * shared popup: the flag is MapLibre's own and the popup is the native
	 * manager's, and a reader who opens a popup by hovering a pin should still be
	 * able to tab into it.
	 */
	private restoreFocus(target: FocusTarget, run: () => void): void {
		const doc = this.view.containerEl?.doc ?? activeDocument;
		const before = target.keepFocus ? doc.activeElement : null;
		run();
		// `focus()` on the element that already has it is a no-op, but asking is
		// cheaper than the scroll a redundant one can cause in a long note.
		if (before instanceof HTMLElement && doc.activeElement !== before) before.focus();
	}

	/** The camera move itself, which is also what a later re-frame is undone with. */
	private aim(target: FocusTarget, animate: boolean): void {
		const view = this.view;
		const map = view.map;
		if (!map) return;
		const [lng, lat] = toTileSpace(this.system(), target.lng, target.lat);
		view.setEphemeralState?.({ center: { lng, lat }, zoom: target.zoom });
		const move = { center: [lng, lat] as [number, number], zoom: target.zoom };
		if (animate && typeof map.flyTo === 'function') map.flyTo(move);
		else if (typeof map.jumpTo === 'function') map.jumpTo(move);
		else map.setCenter({ lng, lat });
	}

	/**
	 * Open the note's own popup where the camera landed, so a map that moves says
	 * what it moved for.
	 *
	 * Only for a note the view holds a row for. One the base filters out has no
	 * pin of its own, and a card floating over empty map would name a place that
	 * is not on it. A view that has only just been built has its map before it has
	 * its rows, which is what the pending slot above is for — answering false here
	 * means "ask again once the data lands", once.
	 */
	private showNotePopup(target: FocusTarget): boolean {
		const file = target.file;
		if (!file) return true;
		const view = this.view;
		if (!view.data || !view.data.properties || !view.mapConfig || !view.config) return false;
		const entry = view.data.data.find((row) => row.file === file);
		if (!entry) return false;
		const config = view.config;
		// The note's own WGS-84 value. The wrapper on showPopup is what moves a
		// popup into tile space; handing it a converted one moves it twice.
		view.popupManager.showPopup(
			entry,
			[target.lat, target.lng],
			view.data.properties,
			view.markerManager.getMarkerDrivenProps(view.mapConfig),
			(prop) => config.getDisplayName(prop)
		);
		return true;
	}

	/**
	 * Keep the camera pointed at the same real place when the space beneath it
	 * changes. The map's centre is in tile space like everything else it holds,
	 * so a switch from Amap to OpenStreetMap leaves it looking a few streets from
	 * where the reader left it — and a view that pins a `center` never gets
	 * re-framed by `fit()`, which stands down for exactly that case.
	 */
	private realignCamera(): void {
		const map = this.view.map;
		const system = this.system();
		const previous = this.appliedSystem;
		this.appliedSystem = system;
		if (!map || previous === null || previous === system || typeof map.setCenter !== 'function') return;
		const centre = map.getCenter();
		if (!centre) return;
		const [lng, lat] = toWgs84(previous, centre.lng, centre.lat);
		const [tileLng, tileLat] = toTileSpace(system, lng, lat);
		map.setCenter({ lng: tileLng, lat: tileLat });
	}

	/* ---- config ---- */

	/**
	 * One track knob: the view's own value when it states one, otherwise the
	 * plugin setting. A blank view option means "follow the plugin", which is why
	 * an empty string falls through rather than clamping to the knob's minimum.
	 */
	private knob(key: TrackKnob): number {
		const view = this.view;
		const raw = view.config ? view.config.get(key) : undefined;
		if (raw === undefined || raw === null || raw === '') return this.plugin.settings[key];
		return trackKnob(key, raw);
	}

	/**
	 * Move a config's `center` into tile space, keeping the WGS-84 value it came
	 * from so the same config can be re-converted if the system changes later.
	 *
	 * The shifted value is kept beside it, which is how a write from anywhere
	 * else is recognised: "Set default center point" assigns `center` straight
	 * onto the live config, and that value is WGS-84, not ours to re-derive from.
	 */
	private projectConfigCenter(config: MapConfig | undefined): MapConfig | undefined {
		if (!config) return config;
		if (config.__amCenterWgs === undefined || config.center !== config.__amCenterOut) {
			if (!config.center) return config;
			config.__amCenterWgs = config.center;
		}
		try {
			config.center = config.__amCenterOut = projectCenter(config.__amCenterWgs, this.system(config));
		} catch (e) {
			console.warn('Advanced Maps: could not convert the configured centre', e);
		}
		return config;
	}

	/**
	 * Which space the tiles are in. The view option wins; blank means "follow
	 * the plugin setting", which is also what an embed's stub config answers.
	 *
	 * `config` is passed in from the loadConfig wrapper, where the map's own
	 * mapConfig has not been assigned yet but the fresh one is in hand.
	 */
	private system(config?: MapConfig): CoordSystem {
		const view = this.view;
		let raw: unknown;
		try {
			raw = view.config ? view.config.get('coordSystem') : undefined;
		} catch {
			/* stub config */
		}
		const mode = knownMode(raw) ?? knownMode(this.plugin.settings.coordSystem) ?? 'auto';
		return resolveSystem(mode, config ?? view.mapConfig);
	}

	private resolve(color: string): string {
		try {
			return this.view.markerManager.resolveColor(color);
		} catch {
			return color;
		}
	}

	/**
	 * Put both layers back through the transform. Markers only move when the
	 * native manager re-mints them, so drive it from there and let the wrapper
	 * chain do the rest.
	 */
	async reproject(): Promise<void> {
		const view = this.view;
		if (this.detached || !view.map) return;
		this.projectConfigCenter(view.mapConfig);
		this.realignCamera();
		this.locate?.replaceDot();
		if (view.data && view.markerManager) await view.markerManager.updateMarkers(view.data);
		else await this.sync();
	}

	/* ---- data ---- */

	/** Build the draw list: every entry in the query that owns a track file. */
	private collect(data: BasesData | undefined): DrawItem[] {
		const entries = data?.data ?? [];
		const items: DrawItem[] = [];
		for (const entry of entries) {
			const file = entry && entry.file;
			if (!file) continue;
			const trackFiles = this.plugin.resolveTracks(file);
			if (trackFiles.length === 0) continue;
			items.push({ entry, file, trackFiles, color: this.colorFor(entry) });
		}
		return items;
	}

	/** A track belongs to its note, so it is drawn in that note's marker colour. */
	private colorFor(entry: BasesEntry): string {
		let raw: string | null | undefined = null;
		try {
			raw = this.view.markerManager.getCustomColor(entry, this.view.mapConfig);
		} catch {
			/* no colour property configured */
		}
		// MapLibre paint properties want a real colour, not `var(--x)`.
		return this.resolve(raw || this.plugin.settings.trackColor);
	}

	private build(items: DrawItem[], system: CoordSystem): FeatureCollection<Geometry, TrackFeatureProps> {
		const features: TrackFeature[] = [];
		items.forEach((item, index) => {
			for (const trackFile of item.trackFiles) {
				const rec = this.plugin.tracks.get(trackFile.path);
				if (!rec || rec.error) continue;
				features.push(...trackFeatures(projectedFeatures(rec, system), item.color, index));
			}
		});
		return { type: 'FeatureCollection', features };
	}

	/**
	 * Everything the uploaded collection depends on, as one comparable string:
	 * which files, in which state, in which colour, in which space.
	 *
	 * Paint and framing are deliberately *not* in here. They are cheap and they
	 * run on every sync regardless, so this only has to answer one question —
	 * "are these the same features as the ones already up?".
	 *
	 * `photoDatum` is in the same bucket as `system`: neither one is visible in
	 * a track file's own path or mtime, so a change to either has to be spelled
	 * out here by hand or `sync()`'s upload-skip gate cannot see it. Missing it
	 * looks fine right up until a photo whose EXIF stated no datum is *why* the
	 * reader flipped the setting — `sync()`'s own `isFresh()` check, below, now
	 * reloads it under the new datum and `build()` puts the corrected coordinate
	 * in `this.data`, but without this line the redraw is still skipped, since
	 * path+mtime+color are unchanged — the map keeps showing the old pin having
	 * done all the work to compute the new one.
	 */
	private signature(items: DrawItem[], system: CoordSystem): string {
		const parts: string[] = [system, this.plugin.settings.photoDatum];
		for (const item of items) {
			parts.push(item.color);
			// mtime, so a track edited in place counts as different even though its
			// path has not moved.
			for (const trackFile of item.trackFiles) parts.push(trackFile.path, String(trackFile.stat.mtime));
		}
		return parts.join(' ');
	}

	async sync(data?: BasesData): Promise<void> {
		const view = this.view;
		if (this.detached || !view.map) return;

		const items = this.collect(data ?? view.data);

		const pending = new Set<TFile>();
		for (const item of items) {
			for (const trackFile of item.trackFiles) {
				if (!this.plugin.tracks.isFresh(trackFile, this.plugin.settings.photoDatum)) pending.add(trackFile);
			}
		}
		if (pending.size > 0)
			await Promise.all([...pending].map((f) => this.plugin.tracks.load(f, this.plugin.settings.photoDatum)));
		if (this.detached || !view.map) return;

		await styleReady(view.map);
		if (this.detached || !view.map) return;

		const map = view.map;
		// Always adopted, even when the redraw below is skipped: Bases recreates
		// its BasesEntry objects on every update and warns against holding the old
		// ones, and hover() reads an entry straight out of this list.
		this.items = items;

		const system = this.system();
		this.data = this.build(items, system);

		// `setData` hands every position to MapLibre's worker and re-tiles the
		// lot, which is the one genuinely expensive step in here — and Bases
		// replaces its result set on *any* vault change while a map view is open,
		// not just changes to notes the base matches, so sync() runs far more
		// often than the tracks themselves change.
		//
		// Only the upload is skipped. Paint and framing below are cheap and still
		// run every time, so a row that arrives carrying a pin and no track still
		// re-frames the map exactly as it used to. And the source has to still be
		// there: a style swap — theme, background — wipes every source, then
		// `style.load` re-enters here with an unchanged signature to put the
		// tracks back.
		const signature = this.signature(items, system);
		if (signature !== this.drawn || !map.getSource(SRC)) {
			if (!drawTracks(map, this.data)) return;
			this.drawn = signature;
		}

		this.applyPaint();
		this.ensurePhotoIcons(items);
		this.bindInteractions();
		this.fit(false);

		// The rows a focus was waiting for. Cleared whether or not the note turned
		// out to be one of them, so a card cannot open by itself minutes later on
		// a map the reader has since moved somewhere else.
		const waiting = this.pendingPopup;
		this.pendingPopup = null;
		if (waiting) this.restoreFocus(waiting, () => this.showNotePopup(waiting));
	}

	private removeLayers(): void {
		if (this.view.map) removeTrackLayers(this.view.map);
	}

	private applyPaint(): void {
		const map = this.view.map;
		if (!map) return;
		applyTrackPaint(
			map,
			this.knob('trackWeight'),
			this.knob('trackOpacity') / 100,
			this.resolve('var(--background-primary)'),
			this.plugin.settings.trackMarkers,
			this.plugin.settings.photoThumbnails
		);
	}

	/**
	 * Decodes and registers every photo thumbnail the current result set
	 * carries, keyed by the identical `photoImageId()` formula `loadPhoto()`
	 * (track-cache.ts) already stamped onto each feature as `amPhoto` — the
	 * one thing that keeps the two sides landing on the same id. `wanted` is
	 * every id in the current draw, which is also what `ensurePhotoImages`
	 * uses to decide what is safe to evict once `PHOTO_ICON_MAX` is crossed:
	 * a base with fewer photos on screen than that cap never evicts anything.
	 *
	 * Run every sync(), same as `applyPaint()` beside it — cheap (a map lookup
	 * per track file, no decoding of its own) and it has to reach a base view
	 * that is already open the moment a row's photo comes into the result set,
	 * not wait for some unrelated redraw.
	 */
	private ensurePhotoIcons(items: DrawItem[]): void {
		const map = this.view.map;
		if (!map) return;
		const records: PhotoIconSource[] = [];
		for (const item of items) {
			for (const trackFile of item.trackFiles) {
				const rec = this.plugin.tracks.get(trackFile.path);
				const thumbnail = rec?.photo?.thumbnail;
				if (!rec?.photo || !thumbnail) continue;
				records.push({ id: photoImageId(trackFile.path), thumbnail, orientation: rec.photo.orientation });
			}
		}
		ensurePhotoImages(map, records, new Set(records.map((r) => r.id)));
	}

	/* ---- interaction ---- */

	private bindInteractions(): void {
		if (this.interactionsBound) return;
		const map = this.view.map;
		if (!map) return;
		this.interactionsBound = true;
		// Endpoint pins and direction arrows share the click-to-open,
		// hover-shows-the-note-popup behaviour of the line and the waypoint dots
		// "for free" — same source, same amIndex, so itemFrom() resolves them the
		// same way it resolves everything else.
		//
		// The two photo layers are here for the hover half of exactly that, and
		// both of them are, not just the one that draws a thumbnail: a photo with
		// no decoded icon renders on PHOTO_DOT_LAYER alone (see its comment in
		// constants.ts), and binding only PHOTO_LAYER would leave that photo
		// inert. `open()` is what tells the two apart on the way out — a photo
		// opens the photo, everything else opens the note.
		for (const layer of [LINE_LAYER, POINT_LAYER, ENDPOINT_LAYER, ARROW_LAYER, PHOTO_DOT_LAYER, PHOTO_LAYER]) {
			map.on('click', layer, (ev: MapMouseEvent) => this.open(ev));
			map.on('mousemove', layer, (ev: MapMouseEvent) => this.hover(ev));
			map.on('mouseenter', layer, () => map.getCanvas().addClass('is-over-marker'));
			map.on('mouseleave', layer, () => {
				map.getCanvas().removeClass('is-over-marker');
				this.view.popupManager.hidePopup();
			});
		}
	}

	private itemFrom(ev: MapMouseEvent | undefined): DrawItem | null {
		const feature = ev && ev.features && ev.features[0];
		const index = feature && feature.properties ? feature.properties.amIndex : null;
		return typeof index === 'number' ? (this.items[index] ?? null) : null;
	}

	/**
	 * One click, one thing opened.
	 *
	 * `map.on('click', layer, …)` is registered per layer and dispatched per
	 * layer, so a pointer over two of this source's layers at once fires this
	 * twice for one `originalEvent`. That has always been possible — a
	 * direction arrow sits on the line it describes — and cost nothing while
	 * every layer opened the same note twice. A photo makes it visible: the
	 * thumbnail on PHOTO_LAYER and the dot beneath it on PHOTO_DOT_LAYER are
	 * the same feature, and two modals would open on top of each other.
	 */
	private open(ev: MapMouseEvent): void {
		const item = this.itemFrom(ev);
		if (!item) return;
		if (ev.originalEvent) {
			if (this.handledClick === ev.originalEvent) return;
			this.handledClick = ev.originalEvent;
		}
		const mod = ev.originalEvent ? Keymap.isModEvent(ev.originalEvent) : false;
		const props = ev.features?.[0]?.properties;
		const path = props && props.amRole === 'photo' && typeof props.amPath === 'string' ? props.amPath : '';
		if (path) this.openPhoto(path, item, mod);
		else this.openNote(item.file.path, mod);
	}

	/**
	 * A photo pin opens the photo; its note stays one click further away, in
	 * the card that hovering the same pin already shows and in the modal's own
	 * "open note" row. A mod-click keeps Obsidian's own meaning — the image
	 * file, in a new tab — because that is the one case where the reader has
	 * asked for a leaf and no map is about to be replaced by it.
	 *
	 * A path that no longer resolves falls back to the note rather than to
	 * nothing: the pin was drawn from a record that was accurate when it was
	 * built, and a file deleted since is a reason to show its note, not to make
	 * the click dead.
	 */
	private openPhoto(path: string, item: DrawItem, mod: PaneType | boolean): void {
		const file = this.view.app.vault.getFileByPath(path);
		if (!file) {
			this.openNote(item.file.path, mod);
			return;
		}
		if (mod) {
			void this.view.app.workspace.openLinkText(path, item.file.path, mod);
			return;
		}
		new PhotoModal(this.view.app, file, () => this.openNote(item.file.path, false)).open();
	}

	/**
	 * A click on this map, sent somewhere that is not this map.
	 *
	 * Only while following, and only for a plain click — a mod-click means "a new
	 * tab" and already lands somewhere harmless. Everything else falls through to
	 * `native`, so a map nobody is following behaves exactly as it always did,
	 * including whatever a later version of Maps does with `newLeaf`.
	 *
	 * `active: true`, because a click on a pin is a request to read that note.
	 * The `file-open` this raises comes back round to `followActiveNote`, which
	 * aims this same map at the note it was already showing — a no-op move, and
	 * cheaper than an exception to the rule.
	 */
	private openNote(path: string, mod: PaneType | boolean, native?: () => void): void {
		const leaf = this.following && !mod ? this.plugin.followTarget(this) : null;
		const file = leaf ? this.view.app.vault.getFileByPath(path) : null;
		if (leaf && file) {
			void leaf.openFile(file, { active: true });
			return;
		}
		if (native) native();
		else void this.view.app.workspace.openLinkText(path, '', mod);
	}

	/** Reuse the built-in popup, so a track hover reads like its marker hover. */
	private hover(ev: MapMouseEvent): void {
		const item = this.itemFrom(ev);
		const view = this.view;
		if (!item || !view.data || !view.data.properties || !view.mapConfig || !view.config) return;
		const config = view.config;
		// Under the cursor is where this one belongs, and the cursor is already in
		// tile space — so go straight to the native method, past the wrapper that
		// exists to move the pins' own WGS-84 anchors.
		const show = (this.origShowPopup ?? view.popupManager.showPopup).bind(view.popupManager);
		show(
			item.entry,
			[ev.lngLat.lat, ev.lngLat.lng],
			view.data.properties,
			view.markerManager.getMarkerDrivenProps(view.mapConfig),
			(prop) => config.getDisplayName(prop)
		);
	}

	/* ---- framing ---- */

	/**
	 * The built-in view frames the markers once, on load. Tracks arrive later and
	 * usually reach further, so re-frame around both — unless the view pins a
	 * centre or zoom, or the reader has already moved the map themselves.
	 */
	fit(force: boolean): void {
		const view = this.view;
		const map = view.map;
		if (!map) return;
		if (!force) {
			if (this.userMoved) return;
			// Pointed at a note deliberately, by "open in map" or by following.
			// `pendingMapState` below says the same thing while it lasts, which is
			// only until the first data update consumes it.
			if (this.held) return;
			if (view.pendingMapState) return;
			if (view.mapConfig && view.mapConfig.center) return;
			if (typeof view.hasConfiguredZoom === 'function' && view.hasConfiguredZoom()) return;
		}
		const bounds = this.bounds();
		if (!bounds) return;
		fitTo(map, bounds, 24, this.knob('fitMaxZoom'));
	}

	private bounds(): LngLatBounds | null {
		const map = this.view.map;
		if (!map) return null;
		const tracks = (this.data?.features ?? []).map((feature) => feature.geometry);

		// Native getBounds() is computed from the untouched WGS-84 entries, so
		// once the pins have been moved it frames the wrong place. Use the
		// features actually on the map whenever we have them.
		if (this.markerFeatures) {
			const markers = this.markerFeatures.map((feature) => feature.geometry);
			return boundsOf(map, [...markers, ...tracks]);
		}
		return boundsOf(map, tracks, this.view.markerManager.getBounds());
	}
}
