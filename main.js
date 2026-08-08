/*
 * Advanced Maps — extends Obsidian's built-in Maps view instead of replacing it.
 *
 * The built-in plugin already does markers, icons, colours, tiles and popups
 * well, so this plugin only adds what it is missing:
 *
 *   · GPX / GeoJSON tracks, resolved from each note's embeds and drawn in that
 *     note's colour
 *   · a zoom-to-fit control, and auto-framing that includes the tracks
 *   · inline maps for ![[track.gpx]] embeds
 *   · an "open in map" pop-up on a note's ⋮ menu
 *
 * It works by wrapping the "map" entry in Bases' view registry: the factory is
 * replaced with one that builds the native view and then attaches a TrackLayer
 * to the instance, and the options callback gets an extra group appended. The
 * native class itself is never subclassed or edited, so an Obsidian update to
 * Maps lands here untouched.
 */

const obsidian = require('obsidian');
const {
	Plugin,
	PluginSettingTab,
	Setting,
	Component,
	Modal,
	MarkdownRenderer,
	TFile,
	Keymap,
	setIcon,
	Notice,
	parseYaml,
	stringifyYaml,
} = obsidian;

const TRACK_EXTS = new Set(['gpx', 'geojson']);

/* Our own source / layer ids. The native marker layer is "marker-pins" on the
 * "markers" source; tracks are inserted below it so markers stay clickable. */
const SRC = 'advanced-maps-tracks';
const LINE_LAYER = 'advanced-maps-track-lines';
const POINT_LAYER = 'advanced-maps-track-points';
const MARKER_LAYER = 'marker-pins';

const DEFAULT_SETTINGS = {
	coordSystem: 'auto',
	trackColor: 'var(--bases-map-marker-background)',
	trackWeight: 4,
	trackOpacity: 85,
	fitMaxZoom: 16,
	embedHeight: 320,
	// "Open in map" — the pop-up launched from a note's ⋮ menu.
	basePath: 'moments.base',
	viewName: '地图',
	coordsProperty: 'coords',
	openZoom: 15,
	menuLabel: '在地图中打开',
};

/* ------------------------------------------------------------------ *
 * Coordinate systems
 *
 * Chinese tile providers do not serve WGS-84. 高德/腾讯 serve GCJ-02 and 百度
 * serves BD-09; both are deliberate, non-linear offsets that land 300–600 m
 * away from the true position. Raster tiles cannot be nudged back, so the data
 * moves instead: every coordinate is shifted on its way onto the map, and
 * shifted back on its way out. MapLibre never learns the difference — it draws
 * the numbers it is handed on top of the numbers the tile server used.
 *
 * Nothing on disk is touched. Notes and .gpx files stay WGS-84; switching the
 * option back to WGS-84 restores the original positions exactly.
 * ------------------------------------------------------------------ */

const COORD_SYSTEMS = {
	wgs84: 'WGS-84 · GPS 原始（OpenStreetMap、ArcGIS）',
	gcj02: 'GCJ-02 · 火星坐标（高德、腾讯、Google 中国）',
	bd09: 'BD-09 · 百度坐标（百度地图）',
};

/** What the dropdowns offer. "auto" is a way of deciding, not a system. */
const COORD_MODES = Object.assign({ auto: '自动识别 · 按瓦片地址判断' }, COORD_SYSTEMS);

/**
 * The coordinate system belongs to the tile source, not to the view — one note
 * can hold an OpenStreetMap embed and a 高德 base view at the same time, and
 * the ⧉ switcher swaps tile sets under a live map. So "auto" reads the answer
 * off the tile URL, which is the thing that actually decides it.
 */
const TILE_SYSTEM_HINTS = [
	['gcj02', ['autonavi.com', 'amap.com', 'qq.com', 'gtimg.cn', 'gtimg.com', 'google.cn']],
	['bd09', ['bdimg.com', 'bdstatic.com', 'baidu.com']],
];

function systemFromTiles(tiles) {
	for (const url of [].concat(tiles || [])) {
		if (typeof url !== 'string') continue;
		const lower = url.toLowerCase();
		for (const hint of TILE_SYSTEM_HINTS) {
			if (hint[1].some((host) => lower.includes(host))) return hint[0];
		}
	}
	// 天地图 serves CGCS2000, whose difference from WGS-84 is centimetres.
	return 'wgs84';
}

const KRASOVSKY_A = 6378245; // Krasovsky 1940 semi-major axis, the ellipsoid GCJ-02 is defined on
const KRASOVSKY_EE = 0.00669342162296594323; // first eccentricity squared
const BD_OFFSET = (Math.PI * 3000) / 180;

/** The GCJ-02 offset is only defined over China; outside it the transform is the identity. */
function outOfChina(lng, lat) {
	return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function offsetLat(x, y) {
	let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
	ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
	ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
	ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
	return ret;
}

function offsetLng(x, y) {
	let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
	ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
	ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
	ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
	return ret;
}

function wgs2gcj(lng, lat) {
	if (outOfChina(lng, lat)) return [lng, lat];
	const dLat = offsetLat(lng - 105, lat - 35);
	const dLng = offsetLng(lng - 105, lat - 35);
	const radLat = (lat / 180) * Math.PI;
	let magic = Math.sin(radLat);
	magic = 1 - KRASOVSKY_EE * magic * magic;
	const sqrtMagic = Math.sqrt(magic);
	return [
		lng + (dLng * 180) / ((KRASOVSKY_A / sqrtMagic) * Math.cos(radLat) * Math.PI),
		lat + (dLat * 180) / (((KRASOVSKY_A * (1 - KRASOVSKY_EE)) / (magic * sqrtMagic)) * Math.PI),
	];
}

/**
 * The inverse has no closed form, so solve it: guess, measure how far the
 * forward transform lands from the target, subtract the miss. Three passes put
 * the residual well under a centimetre — far below GPS noise.
 */
function gcj2wgs(lng, lat) {
	if (outOfChina(lng, lat)) return [lng, lat];
	let wLng = lng;
	let wLat = lat;
	for (let i = 0; i < 3; i++) {
		const guess = wgs2gcj(wLng, wLat);
		wLng += lng - guess[0];
		wLat += lat - guess[1];
	}
	return [wLng, wLat];
}

/* BD-09 sits on top of GCJ-02 and, unlike it, is exactly invertible. */

function gcj2bd(lng, lat) {
	const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * BD_OFFSET);
	const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * BD_OFFSET);
	return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

function bd2gcj(lng, lat) {
	const x = lng - 0.0065;
	const y = lat - 0.006;
	const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * BD_OFFSET);
	const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * BD_OFFSET);
	return [z * Math.cos(theta), z * Math.sin(theta)];
}

/** Vault coordinates — always WGS-84 — into whatever space the tiles are drawn in. */
function toTileSpace(system, lng, lat) {
	if (system === 'gcj02') return wgs2gcj(lng, lat);
	if (system === 'bd09') {
		const gcj = wgs2gcj(lng, lat);
		return gcj2bd(gcj[0], gcj[1]);
	}
	return [lng, lat];
}

/** …and back again, for anything read off the map and shown or stored as a real place. */
function toWgs84(system, lng, lat) {
	if (system === 'gcj02') return gcj2wgs(lng, lat);
	if (system === 'bd09') {
		const gcj = bd2gcj(lng, lat);
		return gcj2wgs(gcj[0], gcj[1]);
	}
	return [lng, lat];
}

function knownMode(value) {
	const key = typeof value === 'string' ? value.trim() : '';
	return COORD_MODES[key] ? key : null;
}

/** Turn a mode — possibly "auto" — into a real system, given the map's config. */
function resolveSystem(mode, mapConfig) {
	const known = knownMode(mode) || 'auto';
	if (known !== 'auto') return known;
	if (!mapConfig) return 'wgs84';
	return systemFromTiles([].concat(mapConfig.mapTiles || [], mapConfig.mapTilesDark || []));
}

/** Deep-copy a geometry with every coordinate pair moved into tile space. */
function projectGeometry(geometry, system) {
	if (!geometry || system === 'wgs84') return geometry;
	if (geometry.type === 'GeometryCollection') {
		return { ...geometry, geometries: (geometry.geometries || []).map((g) => projectGeometry(g, system)) };
	}
	const walk = (coords) => {
		if (!Array.isArray(coords) || coords.length === 0) return coords;
		if (typeof coords[0] === 'number') {
			const moved = toTileSpace(system, coords[0], coords[1]);
			// Keep elevation and any other trailing members intact.
			return coords.length > 2 ? moved.concat(coords.slice(2)) : moved;
		}
		return coords.map(walk);
	};
	return { ...geometry, coordinates: walk(geometry.coordinates) };
}

/**
 * A "lat,lng" string or [lat, lng] pair moved into tile space, given back in
 * the shape it arrived in — the built-in view accepts either and we must not
 * change which one a base file is using.
 */
function projectCenter(value, system) {
	if (system === 'wgs84' || value === null || value === undefined) return value;
	let lat;
	let lng;
	const wasArray = Array.isArray(value);
	if (wasArray) {
		lat = parseFloat(value[0]);
		lng = parseFloat(value[1]);
	} else {
		const parts = String(value).replace(/[[\]]/g, '').split(',');
		if (parts.length < 2) return value;
		lat = parseFloat(parts[0]);
		lng = parseFloat(parts[1]);
	}
	if (!isFinite(lat) || !isFinite(lng)) return value;
	const moved = toTileSpace(system, lng, lat);
	return wasArray ? [moved[1], moved[0]] : `${moved[1]},${moved[0]}`;
}

/* ------------------------------------------------------------------ *
 * Parsing — everything becomes plain GeoJSON features
 * ------------------------------------------------------------------ */

function collectPoints(parent, tag) {
	const pts = [];
	const nodes = parent.getElementsByTagName(tag);
	for (let i = 0; i < nodes.length; i++) {
		const lat = parseFloat(nodes[i].getAttribute('lat'));
		const lon = parseFloat(nodes[i].getAttribute('lon'));
		// GeoJSON is longitude-first; GPX is not.
		if (isFinite(lat) && isFinite(lon)) pts.push([lon, lat]);
	}
	return pts;
}

/**
 * Minimal GPX reader: track segments, routes and waypoints.
 * Uses the browser's own XML parser — no dependency needed.
 */
function parseGpx(text) {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('not valid XML');
	}

	const features = [];
	const addLine = (pts) => {
		if (pts.length > 1) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts } });
	};

	const segs = doc.getElementsByTagName('trkseg');
	for (let i = 0; i < segs.length; i++) addLine(collectPoints(segs[i], 'trkpt'));

	const routes = doc.getElementsByTagName('rte');
	for (let i = 0; i < routes.length; i++) addLine(collectPoints(routes[i], 'rtept'));

	let waypoints = 0;
	for (const pt of collectPoints(doc, 'wpt')) {
		features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pt } });
		waypoints++;
	}

	if (features.length === 0) throw new Error('no track, route or waypoint found');
	return { features, waypoints };
}

function parseGeoJson(text) {
	const data = JSON.parse(text);
	if (!data || typeof data !== 'object') throw new Error('not a GeoJSON object');
	if (data.type === 'FeatureCollection') return { features: (data.features || []).filter((f) => f && f.geometry) };
	if (data.type === 'Feature') return { features: data.geometry ? [data] : [] };
	if (data.type) return { features: [{ type: 'Feature', geometry: data }] };
	throw new Error('not a GeoJSON object');
}

function parseTrack(text, extension) {
	return extension === 'gpx' ? parseGpx(text) : parseGeoJson(text);
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

function walkCoords(coords, fn) {
	if (!Array.isArray(coords) || coords.length === 0) return;
	if (typeof coords[0] === 'number') {
		const [lng, lat] = coords;
		if (isFinite(lng) && isFinite(lat)) fn(lng, lat);
		return;
	}
	for (const child of coords) walkCoords(child, fn);
}

/** Grow a MapLibre LngLatBounds to cover a GeoJSON geometry. Returns a count. */
function extendBounds(bounds, geometry) {
	let n = 0;
	if (!geometry) return n;
	if (geometry.type === 'GeometryCollection') {
		for (const g of geometry.geometries || []) n += extendBounds(bounds, g);
		return n;
	}
	walkCoords(geometry.coordinates, (lng, lat) => {
		bounds.extend([lng, lat]);
		n++;
	});
	return n;
}

/**
 * MapLibre refuses addSource/addLayer until the style has loaded, and setStyle()
 * — theme change, background switch — drops it back to unloaded.
 *
 * Gate on the flag addSource itself checks rather than on isStyleLoaded(), whose
 * answer stays false until every *tile* has arrived as well: waiting for that
 * costs seconds on a busy map, and the source can go in long before.
 */
function styleUsable(map) {
	const style = map.style;
	if (style && typeof style._loaded === 'boolean') return style._loaded;
	return !!(map.isStyleLoaded && map.isStyleLoaded());
}

/** The timeout is a backstop: a style that never loads should not wedge a caller. */
function styleReady(map, timeout = 5000) {
	if (styleUsable(map)) return Promise.resolve();
	return new Promise((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			try {
				map.off('styledata', check);
				map.off('style.load', check);
				map.off('load', check);
			} catch (e) {
				/* map already removed */
			}
			resolve();
		};
		const check = () => {
			if (styleUsable(map)) finish();
		};
		const timer = window.setTimeout(finish, timeout);
		map.on('styledata', check);
		map.on('style.load', check);
		map.on('load', check);
	});
}

function clamp(value, min, max, fallback) {
	const n = Number(value);
	if (!isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/* ------------------------------------------------------------------ *
 * Track cache — keyed by path, invalidated by mtime
 * ------------------------------------------------------------------ */

class TrackCache {
	constructor(app) {
		this.app = app;
		this.entries = new Map();
	}

	isFresh(file) {
		const rec = this.entries.get(file.path);
		return !!rec && rec.mtime === file.stat.mtime;
	}

	get(path) {
		return this.entries.get(path);
	}

	has(path) {
		return this.entries.has(path);
	}

	invalidate(path) {
		this.entries.delete(path);
	}

	async load(file) {
		if (this.isFresh(file)) return this.entries.get(file.path);
		let rec;
		try {
			const text = await this.app.vault.cachedRead(file);
			rec = parseTrack(text, file.extension);
			rec.mtime = file.stat.mtime;
		} catch (e) {
			rec = { mtime: file.stat.mtime, features: [], error: e.message || String(e) };
			console.warn(`Advanced Maps: could not read ${file.path}:`, e);
		}
		this.entries.set(file.path, rec);
		return rec;
	}
}

/**
 * A track's geometry in tile space, remembered on the cache record.
 *
 * Shifting is cheap per point but a single watch export runs to five figures,
 * and sync() re-runs on every data change and every style swap. Memoising by
 * system means the arithmetic happens once per file, not once per redraw; a
 * fresh parse replaces the whole record, so the memo cannot go stale.
 */
function projectedFeatures(rec, system) {
	if (!rec || !rec.features) return [];
	if (system === 'wgs84') return rec.features;
	if (rec.projected && rec.projected.system === system) return rec.projected.features;
	const features = rec.features.map((feature) => ({
		type: 'Feature',
		geometry: projectGeometry(feature.geometry, system),
	}));
	rec.projected = { system, features };
	return features;
}

/* ------------------------------------------------------------------ *
 * Map pieces
 * ------------------------------------------------------------------ */

/** A zoom-to-fit button, wearing the same markup as the built-in controls. */
class FitControl {
	constructor(onClick) {
		this.onClick = onClick;
		this.containerEl = createDiv('maplibregl-ctrl maplibregl-ctrl-group canvas-control-group mod-raised');
	}

	onAdd() {
		const btn = this.containerEl.createDiv({
			cls: 'canvas-control-item',
			attr: { 'aria-label': 'Zoom to fit' },
		});
		setIcon(btn, 'scan');
		btn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			this.onClick();
		});
		return this.containerEl;
	}

	onRemove() {
		this.containerEl.detach();
	}
}

function lineLayerSpec(id, source) {
	return {
		id,
		type: 'line',
		source,
		filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']],
		layout: { 'line-join': 'round', 'line-cap': 'round' },
		paint: { 'line-color': ['get', 'amColor'], 'line-width': 4, 'line-opacity': 0.85 },
	};
}

function pointLayerSpec(id, source) {
	return {
		id,
		type: 'circle',
		source,
		filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
		paint: {
			'circle-color': ['get', 'amColor'],
			'circle-radius': 4,
			'circle-stroke-width': 2,
			'circle-stroke-color': '#ffffff',
		},
	};
}

/* ------------------------------------------------------------------ *
 * TrackLayer — everything this plugin adds to one native map view
 * ------------------------------------------------------------------ */

class TrackLayer {
	constructor(plugin, view) {
		this.plugin = plugin;
		this.view = view;
		this.items = [];
		this.data = null;
		this.userMoved = false;
		this.interactionsBound = false;
		this.detached = false;
	}

	/**
	 * Wrap three instance methods rather than the prototype: the wrappers die
	 * with the view, and `delete` puts the untouched prototype method back.
	 *
	 * markerManager.updateMarkers is the useful seam. The native view calls it
	 * after the map exists and after every data change, *and* re-calls it on
	 * `styledata` once a new style has wiped every source — which is exactly the
	 * set of moments the tracks need redrawing too.
	 */
	attach() {
		const view = this.view;

		this.origUpdateMarkers = view.markerManager.updateMarkers;
		view.markerManager.updateMarkers = async (data) => {
			await this.origUpdateMarkers.call(view.markerManager, data);
			try {
				await this.sync(data);
			} catch (e) {
				console.error('Advanced Maps: could not draw tracks', e);
			}
		};

		// Every marker coordinate that reaches the map is minted here — the
		// native method does nothing but turn parsed entries into Point
		// features — which makes it the one place the pins have to be moved.
		this.origCreateFeatures = view.markerManager.createGeoJSONFeatures;
		view.markerManager.createGeoJSONFeatures = (entries) => {
			const features = this.origCreateFeatures.call(view.markerManager, entries);
			const system = this.system();
			const moved =
				system === 'wgs84'
					? features
					: features.map((feature) => ({ ...feature, geometry: projectGeometry(feature.geometry, system) }));
			// Native getBounds() still answers in WGS-84, so keep the moved
			// features around; bounds() reads them instead.
			this.markerFeatures = moved;
			return moved;
		};

		// The view reads `center` out of the base file in WGS-84 and hands it
		// straight to the map. Converting it here, where the config object is
		// born, means initializeMap and updateCenter both agree — patching
		// either one alone makes them fight over the centre.
		this.origLoadConfig = view.loadConfig;
		view.loadConfig = (tileSetId) => {
			const config = this.origLoadConfig.call(view, tileSetId);
			this.projectConfigCenter(config);
			return config;
		};

		// The ⧉ switcher rewrites mapConfig.mapTiles in place instead of going
		// back through loadConfig, so under "auto" the system can change without
		// the centre hearing about it. Re-derive it from the value we kept.
		this.origSwitchToTileSet = view.switchToTileSet;
		view.switchToTileSet = async (tileSetId) => {
			await this.origSwitchToTileSet.call(view, tileSetId);
			this.projectConfigCenter(view.mapConfig);
		};

		this.origInitializeMap = view.initializeMap;
		view.initializeMap = async () => {
			const fresh = !view.map;
			await this.origInitializeMap.call(view);
			if (fresh && view.map) this.onMapCreated(view.map);
		};

		this.origDestroyMap = view.destroyMap;
		view.destroyMap = () => {
			this.fitControl = null;
			this.interactionsBound = false;
			this.userMoved = false;
			this.data = null;
			this.markerFeatures = null;
			this.origDestroyMap.call(view);
		};

		this.origOnunload = view.onunload;
		view.onunload = () => {
			const restore = this.origOnunload;
			this.detach();
			restore.call(view);
		};

		return this;
	}

	detach() {
		if (this.detached) return;
		this.detached = true;
		const view = this.view;

		this.removeLayers();
		if (this.fitControl && view.map) {
			try {
				view.map.removeControl(this.fitControl);
			} catch (e) {
				/* map already gone */
			}
		}
		this.fitControl = null;

		delete view.markerManager.updateMarkers;
		delete view.markerManager.createGeoJSONFeatures;
		delete view.loadConfig;
		delete view.switchToTileSet;
		delete view.initializeMap;
		delete view.destroyMap;
		delete view.onunload;

		this.plugin.layers.delete(this);
	}

	onMapCreated(map) {
		this.fitControl = new FitControl(() => this.fit(true));
		map.addControl(this.fitControl, 'top-right');

		// A new style is a blank slate: every source and layer is gone. The
		// built-in view puts its markers back, so put the tracks back too rather
		// than riding on its one-shot `styledata` handler.
		map.on('style.load', () => {
			this.sync().catch((e) => console.error('Advanced Maps: could not redraw tracks', e));
		});

		// Once the reader takes the wheel, stop re-framing the map underneath
		// them. Programmatic moves carry no originalEvent, so they do not count.
		const mark = (ev) => {
			if (ev && ev.originalEvent) this.userMoved = true;
		};
		for (const name of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) map.on(name, mark);
	}

	/* ---- config ---- */

	num(key, fallback, min, max) {
		const view = this.view;
		const raw = view.config ? view.config.get(key) : undefined;
		if (raw === undefined || raw === null || raw === '') return fallback;
		return clamp(raw, min, max, fallback);
	}

	/**
	 * Which space the tiles are in. The view option wins; blank means "follow
	 * the plugin setting", which is also what an embed's stub config answers.
	 *
	 * `config` is passed in from the loadConfig wrapper, where the map's own
	 * mapConfig has not been assigned yet but the fresh one is in hand.
	 */
	/**
	 * Move a config's `center` into tile space, keeping the WGS-84 value it came
	 * from so the same config can be re-converted if the system changes later.
	 */
	projectConfigCenter(config) {
		if (!config) return config;
		if (config.__amCenterWgs === undefined) {
			if (!config.center) return config;
			config.__amCenterWgs = config.center;
		}
		try {
			config.center = projectCenter(config.__amCenterWgs, this.system(config));
		} catch (e) {
			console.warn('Advanced Maps: could not convert the configured centre', e);
		}
		return config;
	}

	system(config) {
		const view = this.view;
		let raw;
		try {
			raw = view.config ? view.config.get('coordSystem') : undefined;
		} catch (e) {
			/* stub config */
		}
		const mode = knownMode(raw) || knownMode(this.plugin.settings.coordSystem) || 'auto';
		return resolveSystem(mode, config || view.mapConfig);
	}

	resolve(color) {
		try {
			return this.view.markerManager.resolveColor(color);
		} catch (e) {
			return color;
		}
	}

	/**
	 * Put both layers back through the transform. Markers only move when the
	 * native manager re-mints them, so drive it from there and let the wrapper
	 * chain do the rest.
	 */
	async reproject() {
		const view = this.view;
		if (this.detached || !view.map) return;
		if (view.data && view.markerManager) await view.markerManager.updateMarkers(view.data);
		else await this.sync();
	}

	/* ---- data ---- */

	/** Build the draw list: every entry in the query that owns a track file. */
	collect(data) {
		const view = this.view;
		const entries = (data && data.data) || [];
		const items = [];
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
	colorFor(entry) {
		let raw = null;
		try {
			raw = this.view.markerManager.getCustomColor(entry, this.view.mapConfig);
		} catch (e) {
			/* no colour property configured */
		}
		// MapLibre paint properties want a real colour, not `var(--x)`.
		return this.resolve(raw || this.plugin.settings.trackColor);
	}

	build(items) {
		const system = this.system();
		const features = [];
		items.forEach((item, index) => {
			for (const trackFile of item.trackFiles) {
				const rec = this.plugin.tracks.get(trackFile.path);
				if (!rec || rec.error) continue;
				for (const feature of projectedFeatures(rec, system)) {
					features.push({
						type: 'Feature',
						geometry: feature.geometry,
						properties: { amColor: item.color, amIndex: index },
					});
				}
			}
		});
		return { type: 'FeatureCollection', features };
	}

	async sync(data) {
		const view = this.view;
		if (this.detached || !view.map) return;

		const items = this.collect(data || view.data);

		const pending = [];
		for (const item of items) {
			for (const trackFile of item.trackFiles) {
				if (!this.plugin.tracks.isFresh(trackFile) && !pending.includes(trackFile)) pending.push(trackFile);
			}
		}
		if (pending.length > 0) await Promise.all(pending.map((f) => this.plugin.tracks.load(f)));
		if (this.detached || !view.map) return;

		await styleReady(view.map);
		if (this.detached || !view.map) return;

		const map = view.map;
		this.items = items;
		this.data = this.build(items);

		try {
			const source = map.getSource(SRC);
			if (source) {
				source.setData(this.data);
			} else {
				map.addSource(SRC, { type: 'geojson', data: this.data });
				this.addLayers();
			}
		} catch (e) {
			// The style was swapped out from under us; style.load will retry.
			console.warn('Advanced Maps: deferring track layers —', e.message);
			return;
		}
		this.applyPaint();
		this.bindInteractions();
		this.fit(false);
	}

	addLayers() {
		const map = this.view.map;
		// Anchor below the markers so a pin sitting on its own track stays on top.
		const before = map.getLayer(MARKER_LAYER) ? MARKER_LAYER : undefined;
		map.addLayer(lineLayerSpec(LINE_LAYER, SRC), before);
		map.addLayer(pointLayerSpec(POINT_LAYER, SRC), before);
	}

	removeLayers() {
		const map = this.view.map;
		if (!map || !map.getStyle) return;
		try {
			for (const id of [LINE_LAYER, POINT_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
			if (map.getSource(SRC)) map.removeSource(SRC);
		} catch (e) {
			/* style already torn down */
		}
	}

	applyPaint() {
		const map = this.view.map;
		const weight = this.num('trackWeight', this.plugin.settings.trackWeight, 1, 24);
		const opacity = this.num('trackOpacity', this.plugin.settings.trackOpacity, 0, 100) / 100;
		if (map.getLayer(LINE_LAYER)) {
			map.setPaintProperty(LINE_LAYER, 'line-width', weight);
			map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
		}
		if (map.getLayer(POINT_LAYER)) {
			map.setPaintProperty(POINT_LAYER, 'circle-radius', Math.max(3, Math.round(weight * 1.1)));
			map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', this.resolve('var(--background-primary)'));
			map.setPaintProperty(POINT_LAYER, 'circle-opacity', opacity);
		}
	}

	/* ---- interaction ---- */

	bindInteractions() {
		if (this.interactionsBound) return;
		this.interactionsBound = true;
		const map = this.view.map;
		for (const layer of [LINE_LAYER, POINT_LAYER]) {
			map.on('click', layer, (ev) => this.open(ev));
			map.on('mousemove', layer, (ev) => this.hover(ev));
			map.on('mouseenter', layer, () => map.getCanvas().addClass('is-over-marker'));
			map.on('mouseleave', layer, () => {
				map.getCanvas().removeClass('is-over-marker');
				this.view.popupManager.hidePopup();
			});
		}
	}

	itemFrom(ev) {
		const feature = ev && ev.features && ev.features[0];
		const index = feature && feature.properties ? feature.properties.amIndex : null;
		return typeof index === 'number' ? this.items[index] || null : null;
	}

	open(ev) {
		const item = this.itemFrom(ev);
		if (!item) return;
		const mod = ev.originalEvent ? Keymap.isModEvent(ev.originalEvent) : false;
		this.view.app.workspace.openLinkText(item.file.path, '', mod);
	}

	/** Reuse the built-in popup, so a track hover reads like its marker hover. */
	hover(ev) {
		const item = this.itemFrom(ev);
		const view = this.view;
		if (!item || !view.data || !view.data.properties || !view.mapConfig) return;
		view.popupManager.showPopup(
			item.entry,
			[ev.lngLat.lat, ev.lngLat.lng],
			view.data.properties,
			view.markerManager.getMarkerDrivenProps(view.mapConfig),
			(prop) => view.config.getDisplayName(prop)
		);
	}

	/* ---- framing ---- */

	/**
	 * The built-in view frames the markers once, on load. Tracks arrive later and
	 * usually reach further, so re-frame around both — unless the view pins a
	 * centre or zoom, or the reader has already moved the map themselves.
	 */
	fit(force) {
		const view = this.view;
		const map = view.map;
		if (!map) return;
		if (!force) {
			if (this.userMoved) return;
			if (view.pendingMapState) return;
			if (view.mapConfig && view.mapConfig.center) return;
			if (typeof view.hasConfiguredZoom === 'function' && view.hasConfiguredZoom()) return;
		}
		const bounds = this.bounds();
		if (!bounds) return;
		map.fitBounds(bounds, {
			padding: 24,
			maxZoom: this.num('fitMaxZoom', this.plugin.settings.fitMaxZoom, 1, 22),
			animate: false,
		});
	}

	bounds() {
		const map = this.view.map;
		const LngLatBounds = map.getBounds().constructor;
		const bounds = new LngLatBounds();
		let points = 0;

		// Native getBounds() is computed from the untouched WGS-84 entries, so
		// once the pins have been moved it frames the wrong place. Use the
		// features actually on the map whenever we have them.
		if (this.markerFeatures) {
			for (const feature of this.markerFeatures) points += extendBounds(bounds, feature.geometry);
		} else {
			const markers = this.view.markerManager.getBounds();
			if (markers && !markers.isEmpty()) {
				bounds.extend(markers);
				points++;
			}
		}
		for (const feature of (this.data && this.data.features) || []) {
			points += extendBounds(bounds, feature.geometry);
		}
		return points > 0 && !bounds.isEmpty() ? bounds : null;
	}
}

/* ------------------------------------------------------------------ *
 * View options
 * ------------------------------------------------------------------ */

function trackOptionGroup() {
	return {
		displayName: 'Tracks',
		type: 'group',
		items: [
			{ displayName: 'Line width', type: 'slider', key: 'trackWeight', min: 1, max: 12, step: 1, default: 4 },
			{ displayName: 'Line opacity', type: 'slider', key: 'trackOpacity', min: 10, max: 100, step: 5, default: 85 },
			{ displayName: 'Max zoom when fitting', type: 'slider', key: 'fitMaxZoom', min: 1, max: 20, step: 1, default: 16 },
		],
	};
}

/** Paired with the tile URLs, since the tiles are what decides the answer. */
function coordOptionGroup() {
	const choices = { '': '跟随插件设置' };
	for (const key of Object.keys(COORD_MODES)) choices[key] = COORD_MODES[key];
	return {
		displayName: 'Coordinate system',
		type: 'group',
		items: [
			{ displayName: 'Tile coordinate system', type: 'dropdown', key: 'coordSystem', options: choices, default: '' },
		],
	};
}

/** Find a top-level group by one of the option keys it owns. -1 if absent. */
function groupIndexByKey(list, key) {
	return list.findIndex(
		(group) => group && Array.isArray(group.items) && group.items.some((item) => item && item.key === key)
	);
}

/**
 * Slot our two groups into the built-in list: Tracks behind Markers, and the
 * coordinate system behind Background, next to the tile URLs that determine it.
 * Both are located by option key so the built-in wording can change freely.
 */
function appendTrackOptions(options) {
	const list = Array.isArray(options) ? options.slice() : [];

	const background = groupIndexByKey(list, 'mapTiles');
	if (background === -1) list.push(coordOptionGroup());
	else list.splice(background + 1, 0, coordOptionGroup());

	const markers = groupIndexByKey(list, 'coordinates');
	if (markers === -1) list.push(trackOptionGroup());
	else list.splice(markers + 1, 0, trackOptionGroup());

	return list;
}

/* ------------------------------------------------------------------ *
 * Inline ![[track.gpx]] embed
 *
 * There is no exported MapLibre to build a map with, so the embed borrows the
 * built-in view: the native factory is called with a stub controller, which
 * yields a fully configured map (tiles, dark mode, zoom controls) that happens
 * to have no rows behind it. The track is then drawn on top.
 * ------------------------------------------------------------------ */

class TrackEmbed extends Component {
	constructor(containerEl, plugin, file) {
		super();
		this.containerEl = containerEl;
		this.plugin = plugin;
		this.file = file;
	}

	// The embed API calls this when the file is swapped underneath us.
	loadFile() {}

	onload() {
		this.rootEl = this.containerEl.createDiv('advanced-maps-embed');
		this.rootEl.style.height = `${this.plugin.settings.embedHeight}px`;

		// Each MapLibre map holds a WebGL context and browsers cap how many can
		// be alive at once, so a note full of tracks only builds what is on screen.
		this.observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			this.observer.disconnect();
			this.observer = null;
			this.build();
		});
		this.observer.observe(this.rootEl);
	}

	fail(message) {
		if (!this.rootEl) return;
		this.rootEl.empty();
		this.rootEl.addClass('advanced-maps-error');
		this.rootEl.setText(`Could not draw ${this.file.name}: ${message}`);
	}

	async build() {
		this.rec = await this.plugin.tracks.load(this.file);
		if (this.dead || !this.rootEl) return;
		if (this.rec.error) return this.fail(this.rec.error);

		const view = this.plugin.createHeadlessView(this.rootEl);
		if (!view) return this.fail('the built-in Maps plugin is not enabled');
		this.view = view;

		try {
			await view.initializeMap();
		} catch (e) {
			return this.fail(e.message || String(e));
		}
		if (this.dead || !view.map) return;

		this.map = view.map;
		// An inline map that eats the scroll wheel makes the note unreadable.
		this.map.scrollZoom.disable();

		this.resizeObserver = new ResizeObserver(() => this.map && this.map.resize());
		this.resizeObserver.observe(this.rootEl);

		this.registerEvent(
			this.plugin.app.workspace.on('css-change', () => {
				if (this.view && this.view.map) this.view.updateMapStyle();
			})
		);
		// A theme or background change replaces the style and takes the track
		// with it; the built-in view only knows how to put its markers back.
		this.map.on('style.load', () => this.draw().catch(() => {}));

		await this.draw();
	}

	/** Re-read the file and start the layers over — the track itself changed. */
	async refresh() {
		if (!this.map || this.dead) return;
		this.rec = await this.plugin.tracks.load(this.file);
		if (!this.map || this.dead) return;
		try {
			for (const id of [LINE_LAYER, POINT_LAYER]) if (this.map.getLayer(id)) this.map.removeLayer(id);
			if (this.map.getSource(SRC)) this.map.removeSource(SRC);
		} catch (e) {
			/* style already torn down */
		}
		this.framed = false;
		await this.draw();
	}

	async draw() {
		const map = this.map;
		if (!map || this.dead) return;
		if (!this.rec || this.rec.error) return;
		await styleReady(map);
		if (!this.map || this.dead) return;
		if (map.getSource(SRC)) return;

		const color = this.view.markerManager.resolveColor(this.plugin.settings.trackColor);
		// An embed has no base behind it, so there is no view option to read —
		// but it does have tiles, and under "auto" those are the deciding vote.
		// They are usually the default tile set, not whatever a base view uses.
		const system = resolveSystem(this.plugin.settings.coordSystem, this.view.mapConfig);
		const data = {
			type: 'FeatureCollection',
			features: projectedFeatures(this.rec, system).map((feature) => ({
				type: 'Feature',
				geometry: feature.geometry,
				properties: { amColor: color },
			})),
		};

		try {
			map.addSource(SRC, { type: 'geojson', data });
			map.addLayer(lineLayerSpec(LINE_LAYER, SRC));
			map.addLayer(pointLayerSpec(POINT_LAYER, SRC));
		} catch (e) {
			console.warn('Advanced Maps: deferring track layers —', e.message);
			return;
		}

		const weight = clamp(this.plugin.settings.trackWeight, 1, 24, 4);
		const opacity = clamp(this.plugin.settings.trackOpacity, 0, 100, 85) / 100;
		map.setPaintProperty(LINE_LAYER, 'line-width', weight);
		map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
		map.setPaintProperty(POINT_LAYER, 'circle-radius', Math.max(3, Math.round(weight * 1.1)));
		map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', this.view.markerManager.resolveColor('var(--background-primary)'));

		if (this.framed) return;
		const LngLatBounds = map.getBounds().constructor;
		const bounds = new LngLatBounds();
		let points = 0;
		for (const feature of data.features) points += extendBounds(bounds, feature.geometry);
		if (points === 0 || bounds.isEmpty()) return;
		this.framed = true;
		map.fitBounds(bounds, { padding: 16, maxZoom: 17, animate: false });
	}

	onunload() {
		this.dead = true;
		if (this.observer) this.observer.disconnect();
		if (this.resizeObserver) this.resizeObserver.disconnect();
		if (this.view) {
			try {
				this.view.destroyMap();
			} catch (e) {
				/* never got that far */
			}
			if (this.view.containerEl) this.view.containerEl.detach();
			this.view = null;
		}
		this.map = null;
		this.plugin.embeds.delete(this);
	}
}

/* ------------------------------------------------------------------ *
 * "Open in map" pop-up
 *
 * Renders the configured base as a ```base block rather than instantiating a
 * view directly: that is what carries the base's filters, formulas and
 * properties across, without which the icons, colours and scope are all lost.
 * ------------------------------------------------------------------ */

class MapModal extends Modal {
	constructor(app, file, spec, title) {
		super(app);
		this.file = file;
		this.spec = spec;
		this.title = title;
	}

	onOpen() {
		this.modalEl.addClass('advanced-maps-modal');
		this.titleEl.setText(this.title);
		this.component = new Component();
		this.component.load();
		MarkdownRenderer.render(
			this.app,
			'```base\n' + this.spec + '```',
			this.contentEl,
			this.file.path,
			this.component
		);
	}

	onClose() {
		if (this.component) this.component.unload();
		this.contentEl.empty();
	}
}

function firstAlias(frontmatter) {
	const aliases = [].concat(frontmatter.aliases || []);
	return aliases.length > 0 ? aliases[0] : null;
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

class AdvancedMapsSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		const save = async () => {
			await this.plugin.saveSettings();
		};

		new Setting(containerEl).setName('坐标系').setHeading();

		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text:
				'国内地图服务商的瓦片不是 WGS-84：高德、腾讯用 GCJ-02，百度用 BD-09，实际偏差 300–600 米。' +
				'选对之后，笔记坐标和轨迹会在绘制时换算到瓦片所在的坐标系，和底图对齐。' +
				'坐标系取决于用的是哪家瓦片，所以默认按瓦片地址自动判断——同一个库里，高德底图的视图和 ' +
				'OpenStreetMap 底图的内联地图各按各的来，切换背景也会跟着变。' +
				'笔记和 .gpx 文件本身不会被改动，换回 WGS-84 即可还原。',
		});

		new Setting(containerEl)
			.setName('默认坐标系')
			.setDesc('每个地图视图都可以在视图设置里单独覆盖；这里是默认值，也是内联 ![[track.gpx]] 使用的值。')
			.addDropdown((d) => {
				for (const key of Object.keys(COORD_MODES)) d.addOption(key, COORD_MODES[key]);
				d.setValue(knownMode(this.plugin.settings.coordSystem) || 'auto').onChange(async (v) => {
					this.plugin.settings.coordSystem = v;
					await save();
					this.plugin.reprojectAll();
				});
			});

		new Setting(containerEl).setName('在地图中打开').setHeading();

		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: '在笔记右上角 ⋮ 菜单（以及命令面板）中添加一个入口，弹窗显示指定 base 的地图视图，并以当前笔记的坐标为中心。只有带坐标属性的笔记才会出现该菜单项。',
		});

		new Setting(containerEl).setName('菜单项名称').addText((t) =>
			t.setValue(this.plugin.settings.menuLabel).onChange(async (v) => {
				this.plugin.settings.menuLabel = v || DEFAULT_SETTINGS.menuLabel;
				await save();
			})
		);

		new Setting(containerEl)
			.setName('Base 文件路径')
			.setDesc('从哪个 .base 文件取地图视图。')
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.basePath)
					.setValue(this.plugin.settings.basePath)
					.onChange(async (v) => {
						this.plugin.settings.basePath = v || DEFAULT_SETTINGS.basePath;
						await save();
					})
			);

		new Setting(containerEl)
			.setName('视图名称')
			.setDesc('该 base 里要弹出的视图名。')
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.viewName)
					.setValue(this.plugin.settings.viewName)
					.onChange(async (v) => {
						this.plugin.settings.viewName = v || DEFAULT_SETTINGS.viewName;
						await save();
					})
			);

		new Setting(containerEl)
			.setName('坐标属性')
			.setDesc('笔记里存放 “纬度,经度” 的属性名。')
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.coordsProperty)
					.setValue(this.plugin.settings.coordsProperty)
					.onChange(async (v) => {
						this.plugin.settings.coordsProperty = v || DEFAULT_SETTINGS.coordsProperty;
						await save();
					})
			);

		new Setting(containerEl).setName('弹窗缩放级别').addSlider((s) =>
			s
				.setLimits(1, 18, 1)
				.setValue(this.plugin.settings.openZoom)
				.setDynamicTooltip()
				.onChange(async (v) => {
					this.plugin.settings.openZoom = v;
					await save();
				})
		);

		new Setting(containerEl).setName('轨迹').setHeading();

		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: '每个地图视图都可以在视图设置里单独覆盖线宽和透明度；这里设置的是默认值，也是内联 ![[track.gpx]] 使用的值。',
		});

		new Setting(containerEl)
			.setName('默认颜色')
			.setDesc('笔记没有配置颜色属性、或属性为空时使用。可以是 CSS 变量。')
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.trackColor)
					.setValue(this.plugin.settings.trackColor)
					.onChange(async (v) => {
						this.plugin.settings.trackColor = v || DEFAULT_SETTINGS.trackColor;
						await save();
					})
			);

		new Setting(containerEl).setName('线宽').addSlider((s) =>
			s
				.setLimits(1, 12, 1)
				.setValue(this.plugin.settings.trackWeight)
				.setDynamicTooltip()
				.onChange(async (v) => {
					this.plugin.settings.trackWeight = v;
					await save();
				})
		);

		new Setting(containerEl).setName('线条透明度').addSlider((s) =>
			s
				.setLimits(10, 100, 5)
				.setValue(this.plugin.settings.trackOpacity)
				.setDynamicTooltip()
				.onChange(async (v) => {
					this.plugin.settings.trackOpacity = v;
					await save();
				})
		);

		new Setting(containerEl)
			.setName('自动缩放上限')
			.setDesc('自动框选数据时允许放大到的最大级别。视图设置里可以单独覆盖。')
			.addSlider((s) =>
				s
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.fitMaxZoom)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.fitMaxZoom = v;
						await save();
					})
			);

		new Setting(containerEl)
			.setName('内联地图高度')
			.setDesc('笔记里 ![[track.gpx]] 渲染出的地图高度（像素）。')
			.addSlider((s) =>
				s
					.setLimits(160, 800, 20)
					.setValue(this.plugin.settings.embedHeight)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.embedHeight = v;
						await save();
					})
			);
	}
}

/* ------------------------------------------------------------------ *
 * Plugin
 * ------------------------------------------------------------------ */

class AdvancedMapsPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		this.tracks = new TrackCache(this.app);
		this.layers = new Set();
		this.embeds = new Set();

		if (!this.patchMapsView()) {
			// Load order is not guaranteed, so try again once everything is up.
			this.app.workspace.onLayoutReady(() => {
				if (!this.patchMapsView()) {
					new Notice('Advanced Maps: 需要启用内置的 Maps 插件。');
					console.warn('Advanced Maps: the built-in Maps view is not registered.');
				}
			});
		}

		this.registerTrackEmbeds();
		this.registerOpenInMap();
		this.addSettingTab(new AdvancedMapsSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!this.tracks.has(file.path)) return;
				this.tracks.invalidate(file.path);
				this.refreshTracks();
			})
		);

		// Maps re-registers its view whenever it reloads, which drops our wrapper
		// on the floor. The check is a property lookup, so run it whenever the
		// workspace settles.
		this.registerEvent(this.app.workspace.on('layout-change', () => this.patchMapsView()));
	}

	onunload() {
		this.unpatchMapsView();
		const registry = this.app.embedRegistry;
		if (registry && this.ownedExtensions && this.ownedExtensions.length > 0) {
			registry.unregisterExtensions(this.ownedExtensions);
		}
	}

	/* ---- patching the built-in view ---- */

	mapRegistration() {
		const bases = this.app.internalPlugins && this.app.internalPlugins.getPluginById('bases');
		const registrations = bases && bases.instance && bases.instance.registrations;
		return registrations ? registrations.map : null;
	}

	patchMapsView() {
		const entry = this.mapRegistration();
		if (!entry || typeof entry.factory !== 'function') return false;
		if (entry.factory.__advancedMaps) return true;

		const nativeFactory = entry.factory;
		const nativeOptions = entry.options;
		this.nativeFactory = nativeFactory;

		const factory = (controller, containerEl) => {
			const view = nativeFactory(controller, containerEl);
			this.enhance(view);
			return view;
		};
		factory.__advancedMaps = true;
		entry.factory = factory;

		if (typeof nativeOptions === 'function') {
			const options = () => appendTrackOptions(nativeOptions());
			options.__advancedMaps = true;
			entry.options = options;
		}

		this.patched = { nativeFactory, nativeOptions };
		this.adoptOpenViews();
		return true;
	}

	/** Attach a TrackLayer to one native map view, whatever its age. */
	enhance(view) {
		if (!view || !view.markerManager) return null;
		// An embed's map is a native view too, but it has no query behind it:
		// enhancing it would hand its track over to a layer that thinks the
		// result set is empty, and promptly wipe it.
		if (view.__advancedMapsHeadless) return null;
		// Already ours: attach() leaves own properties behind on the instance.
		if (Object.prototype.hasOwnProperty.call(view.markerManager, 'updateMarkers')) return null;
		try {
			const layer = new TrackLayer(this, view).attach();
			this.layers.add(layer);
			// A view adopted after the fact has already built its map, so the
			// initializeMap wrapper will never fire for it — and its markers were
			// placed before we could move them, so redo those too.
			if (view.map) {
				layer.onMapCreated(view.map);
				layer.reproject().catch((e) => console.error('Advanced Maps: could not draw tracks', e));
			}
			return layer;
		} catch (e) {
			console.error('Advanced Maps: could not enhance the map view', e);
			return null;
		}
	}

	/**
	 * Enabling the plugin — or Maps reloading — leaves already-open map views
	 * behind, since they never pass through the patched factory. Walk the
	 * component tree and pick them up, so nobody has to reopen a tab.
	 */
	adoptOpenViews() {
		const seen = new Set();
		const visit = (node) => {
			if (!node || typeof node !== 'object' || seen.has(node)) return;
			seen.add(node);
			if (node.type === 'map' && node.markerManager && node.mapEl) {
				this.enhance(node);
				return;
			}
			if (Array.isArray(node._children)) for (const child of node._children) visit(child);
			// A bases controller keeps its active view outside the child list.
			if (node.controller) visit(node.controller);
			if (node.view) visit(node.view);
		};
		this.app.workspace.iterateAllLeaves((leaf) => visit(leaf.view));
	}

	unpatchMapsView() {
		const entry = this.mapRegistration();
		if (entry && this.patched && entry.factory && entry.factory.__advancedMaps) {
			entry.factory = this.patched.nativeFactory;
			if (this.patched.nativeOptions) entry.options = this.patched.nativeOptions;
		}
		for (const layer of [...this.layers]) layer.detach();
		this.layers.clear();
	}

	/** A native map view with a stub controller behind it — used by embeds. */
	createHeadlessView(parentEl) {
		if (typeof this.nativeFactory !== 'function') return null;
		const view = this.nativeFactory({ app: this.app }, parentEl);
		view.__advancedMapsHeadless = true;
		view.config = {
			get: () => undefined,
			getAsPropertyId: () => null,
			getEvaluatedFormula: () => undefined,
			getDisplayName: (prop) => prop,
			set: () => {},
		};
		view.data = { data: [], properties: [] };
		return view;
	}

	refreshTracks() {
		for (const layer of this.layers) {
			layer.sync().catch((e) => console.error('Advanced Maps: could not redraw tracks', e));
		}
		for (const embed of this.embeds) {
			embed.refresh().catch((e) => console.error('Advanced Maps: could not redraw embed', e));
		}
	}

	/**
	 * Move everything already on screen into the new space, without waiting for
	 * Bases to re-run the view. Each layer re-reads its own effective system, so
	 * a view that pins one of its own simply redraws where it already was.
	 */
	reprojectAll() {
		for (const layer of this.layers) {
			layer.reproject().catch((e) => console.error('Advanced Maps: could not reproject', e));
		}
		for (const embed of this.embeds) {
			embed.refresh().catch((e) => console.error('Advanced Maps: could not reproject embed', e));
		}
	}

	/* ---- tracks ---- */

	/**
	 * The track files a note points at — or the file itself, so a base that
	 * queries `file.ext == "gpx"` works too.
	 *
	 * Reading embeds from the metadata cache rather than the query result means
	 * the base's own filters keep working untouched: no need to widen a filter
	 * just to let attachments into the result set.
	 */
	resolveTracks(file) {
		if (TRACK_EXTS.has(file.extension)) return [file];
		if (file.extension !== 'md') return [];
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !cache.embeds) return [];
		const out = [];
		for (const embed of cache.embeds) {
			const dest = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
			if (dest && TRACK_EXTS.has(dest.extension) && !out.includes(dest)) out.push(dest);
		}
		return out;
	}

	registerTrackEmbeds() {
		const registry = this.app.embedRegistry;
		if (!registry) {
			console.warn('Advanced Maps: embed registry unavailable, ![[track.gpx]] embeds are disabled.');
			return;
		}
		// Leave anything another plugin already owns alone, so both can coexist.
		this.ownedExtensions = [...TRACK_EXTS].filter((ext) => !registry.isExtensionRegistered(ext));
		if (this.ownedExtensions.length === 0) return;
		registry.registerExtensions(this.ownedExtensions, (context, file) => {
			const embed = new TrackEmbed(context.containerEl, this, file);
			this.embeds.add(embed);
			return embed;
		});
	}

	/* ---- open in map ---- */

	registerOpenInMap() {
		this.addCommand({
			id: 'open-in-map',
			name: this.settings.menuLabel,
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!this.hasCoords(file)) return false;
				if (!checking) this.openMapForFile(file);
				return true;
			},
		});

		// Fires for the note's ⋮ menu, and for the same file elsewhere (explorer,
		// tab header). The coords check keeps it off notes that have no place.
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!this.hasCoords(file)) return;
				menu.addItem((item) =>
					item
						.setTitle(this.settings.menuLabel)
						.setIcon('map-pin')
						.onClick(() => this.openMapForFile(file))
				);
			})
		);
	}

	readCoords(file) {
		if (!(file instanceof TFile) || file.extension !== 'md') return null;
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) return null;
		const raw = frontmatter[this.settings.coordsProperty];
		if (raw === undefined || raw === null || String(raw).trim() === '') return null;
		return { raw, frontmatter };
	}

	hasCoords(file) {
		return this.readCoords(file) !== null;
	}

	async openMapForFile(file) {
		const found = this.readCoords(file);
		if (!found) {
			new Notice(`「${file.basename}」没有 ${this.settings.coordsProperty}`);
			return;
		}
		const coords = String(found.raw);

		const baseFile = this.app.vault.getFileByPath(this.settings.basePath);
		if (!baseFile) {
			new Notice(`找不到 ${this.settings.basePath}`);
			return;
		}

		let base;
		try {
			base = parseYaml(await this.app.vault.cachedRead(baseFile)) || {};
		} catch (e) {
			new Notice(`无法解析 ${this.settings.basePath}：${e.message}`);
			return;
		}

		const view = (base.views || []).find((v) => v && v.name === this.settings.viewName);
		if (!view) {
			new Notice(`${this.settings.basePath} 里没有「${this.settings.viewName}」视图`);
			return;
		}

		const mapHeight = Math.max(200, Math.min(800, Math.round(window.innerHeight * 0.7)));
		// An explicit centre needs an explicit zoom, otherwise auto-fit frames the
		// whole data set instead of the note you opened.
		const spec = stringifyYaml({
			...base,
			views: [{ ...view, center: coords, defaultZoom: this.settings.openZoom, mapHeight }],
		});

		const label = firstAlias(found.frontmatter) || found.frontmatter.place || file.basename;
		new MapModal(this.app, file, spec, `${label} · ${coords}`).open();
	}

	/* ---- settings ---- */

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

module.exports = AdvancedMapsPlugin;
