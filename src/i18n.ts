/*
 * A translation table small enough not to need a library.
 *
 * `en` is the source of truth: its keys are the key type, so a missing or
 * misspelled entry in another locale is a compile error rather than a blank
 * label. Placeholders are `{name}` and are substituted at call time.
 */

const en = {
	/* ---- notices ---- */
	'notice.mapsRequired': 'Advanced Maps: enable the built-in Maps plugin.',
	'notice.baseNotConfigured': 'Advanced Maps: set a base file under "Open in map" in the plugin settings.',
	'notice.baseNotFound': 'Could not find {path}',
	'notice.baseParseFailed': 'Could not parse {path}: {error}',
	'notice.viewNotFound': '{path} has no view named "{view}"',
	'notice.noMapView': '{path} has no map view',
	'notice.noCoords': '"{file}" has no {property}',

	/* ---- map controls and embeds ---- */
	'control.zoomToFit': 'Zoom to fit',
	'embed.failed': 'Could not draw {file}: {message}',
	'embed.mapsDisabled': 'the built-in Maps plugin is not enabled',

	/* ---- coordinate systems ---- */
	'coord.auto': 'Auto — decide from the tile URL',
	'coord.wgs84': 'WGS-84 — raw GPS (OpenStreetMap, ArcGIS)',
	'coord.gcj02': 'GCJ-02 — Mars coordinates (Amap, Tencent, Google China)',
	'coord.bd09': 'BD-09 — Baidu coordinates (Baidu Maps)',
	'coord.followPlugin': 'Follow the plugin setting',

	/* ---- per-view options ---- */
	'options.tracks': 'Tracks',
	'options.lineWidth': 'Line width',
	'options.lineOpacity': 'Line opacity',
	'options.fitMaxZoom': 'Max zoom when fitting',
	'options.coordSystem': 'Coordinate system',
	'options.tileCoordSystem': 'Tile coordinate system',

	/* ---- commands ---- */
	'command.openInMap': 'Open in map',

	/* ---- settings: coordinate system ---- */
	'settings.coord.heading': 'Coordinate system',
	'settings.coord.intro':
		'Chinese tile providers do not serve WGS-84: Amap and Tencent use GCJ-02, Baidu uses BD-09, and the offset ' +
		'runs 300–600 m. Pick the right one and note coordinates and tracks are converted as they are drawn, so they ' +
		'line up with the tiles. The system belongs to the tile source, so the default reads it off the tile URL — one ' +
		'vault can hold an Amap base view and an OpenStreetMap inline map at once, each correct, and switching the ' +
		'background follows along. Nothing on disk is touched; switching back to WGS-84 restores the original positions.',
	'settings.coord.default.name': 'Default coordinate system',
	'settings.coord.default.desc':
		'Every map view can override this under its own view options. This is the default, and what inline ![[track.gpx]] maps use.',

	/* ---- settings: open in map ---- */
	'settings.open.heading': 'Open in map',
	'settings.open.intro':
		"Adds an entry to a note's ⋮ menu and to the command palette that pops up the configured base view centred on " +
		'that note. It only appears on notes that actually have the coordinate property.',
	'settings.open.label.name': 'Menu item label',
	'settings.open.label.desc': 'Leave blank for the default.',
	'settings.open.basePath.name': 'Base file path',
	'settings.open.basePath.desc': 'Which .base file the map view is taken from.',
	'settings.open.viewName.name': 'View name',
	'settings.open.viewName.desc': 'Which view inside that base to pop up. Leave blank to use its first map view.',
	'settings.open.coordsProperty.name': 'Coordinate property',
	'settings.open.coordsProperty.desc': 'The note property holding "latitude,longitude".',
	'settings.open.zoom.name': 'Pop-up zoom level',

	/* ---- settings: tracks ---- */
	'settings.tracks.heading': 'Tracks',
	'settings.tracks.intro':
		'Every map view can override line width and opacity under its own view options. These are the defaults, and what inline ![[track.gpx]] maps use.',
	'settings.tracks.color.name': 'Default colour',
	'settings.tracks.color.desc': 'Used when a note has no colour property, or it is empty. A CSS variable works too.',
	'settings.tracks.weight.name': 'Line width',
	'settings.tracks.opacity.name': 'Line opacity',
	'settings.tracks.fitMaxZoom.name': 'Auto-fit zoom limit',
	'settings.tracks.fitMaxZoom.desc': 'How far auto-framing is allowed to zoom in. Can be overridden per view.',
	'settings.tracks.embedHeight.name': 'Inline map height',
	'settings.tracks.embedHeight.desc': 'Height in pixels of the map an ![[track.gpx]] embed renders.',
} as const;

export type TranslationKey = keyof typeof en;

const zh: Record<TranslationKey, string> = {
	'notice.mapsRequired': 'Advanced Maps：需要启用内置的 Maps 插件。',
	'notice.baseNotConfigured': 'Advanced Maps：请先在插件设置的「在地图中打开」里指定 base 文件。',
	'notice.baseNotFound': '找不到 {path}',
	'notice.baseParseFailed': '无法解析 {path}：{error}',
	'notice.viewNotFound': '{path} 里没有「{view}」视图',
	'notice.noMapView': '{path} 里没有地图视图',
	'notice.noCoords': '「{file}」没有 {property}',

	'control.zoomToFit': '缩放到全部',
	'embed.failed': '无法绘制 {file}：{message}',
	'embed.mapsDisabled': '内置的 Maps 插件未启用',

	'coord.auto': '自动识别 · 按瓦片地址判断',
	'coord.wgs84': 'WGS-84 · GPS 原始（OpenStreetMap、ArcGIS）',
	'coord.gcj02': 'GCJ-02 · 火星坐标（高德、腾讯、Google 中国）',
	'coord.bd09': 'BD-09 · 百度坐标（百度地图）',
	'coord.followPlugin': '跟随插件设置',

	'options.tracks': '轨迹',
	'options.lineWidth': '线宽',
	'options.lineOpacity': '线条透明度',
	'options.fitMaxZoom': '自动缩放上限',
	'options.coordSystem': '坐标系',
	'options.tileCoordSystem': '瓦片坐标系',

	'command.openInMap': '在地图中打开',

	'settings.coord.heading': '坐标系',
	'settings.coord.intro':
		'国内地图服务商的瓦片不是 WGS-84：高德、腾讯用 GCJ-02，百度用 BD-09，实际偏差 300–600 米。' +
		'选对之后，笔记坐标和轨迹会在绘制时换算到瓦片所在的坐标系，和底图对齐。' +
		'坐标系取决于用的是哪家瓦片，所以默认按瓦片地址自动判断——同一个库里，高德底图的视图和 ' +
		'OpenStreetMap 底图的内联地图各按各的来，切换背景也会跟着变。' +
		'笔记和 .gpx 文件本身不会被改动，换回 WGS-84 即可还原。',
	'settings.coord.default.name': '默认坐标系',
	'settings.coord.default.desc':
		'每个地图视图都可以在视图设置里单独覆盖；这里是默认值，也是内联 ![[track.gpx]] 使用的值。',

	'settings.open.heading': '在地图中打开',
	'settings.open.intro':
		'在笔记右上角 ⋮ 菜单（以及命令面板）中添加一个入口，弹窗显示指定 base 的地图视图，' +
		'并以当前笔记的坐标为中心。只有带坐标属性的笔记才会出现该菜单项。',
	'settings.open.label.name': '菜单项名称',
	'settings.open.label.desc': '留空则使用默认名称。',
	'settings.open.basePath.name': 'Base 文件路径',
	'settings.open.basePath.desc': '从哪个 .base 文件取地图视图。',
	'settings.open.viewName.name': '视图名称',
	'settings.open.viewName.desc': '该 base 里要弹出的视图名。留空则取它的第一个地图视图。',
	'settings.open.coordsProperty.name': '坐标属性',
	'settings.open.coordsProperty.desc': '笔记里存放「纬度,经度」的属性名。',
	'settings.open.zoom.name': '弹窗缩放级别',

	'settings.tracks.heading': '轨迹',
	'settings.tracks.intro':
		'每个地图视图都可以在视图设置里单独覆盖线宽和透明度；这里设置的是默认值，也是内联 ![[track.gpx]] 使用的值。',
	'settings.tracks.color.name': '默认颜色',
	'settings.tracks.color.desc': '笔记没有配置颜色属性、或属性为空时使用。可以是 CSS 变量。',
	'settings.tracks.weight.name': '线宽',
	'settings.tracks.opacity.name': '线条透明度',
	'settings.tracks.fitMaxZoom.name': '自动缩放上限',
	'settings.tracks.fitMaxZoom.desc': '自动框选数据时允许放大到的最大级别。视图设置里可以单独覆盖。',
	'settings.tracks.embedHeight.name': '内联地图高度',
	'settings.tracks.embedHeight.desc': '笔记里 ![[track.gpx]] 渲染出的地图高度（像素）。',
};

const LOCALES = { en, zh } as const;

export type Locale = keyof typeof LOCALES;

let locale: Locale | null = null;

/**
 * Obsidian keeps the chosen interface language in localStorage; `navigator` is
 * the fallback for a headless test or an install that never set it. Traditional
 * Chinese falls through to the Simplified table — closer than English until
 * someone contributes a `zh-TW` one.
 */
export function detectLocale(): Locale {
	let tag = '';
	try {
		tag = window.localStorage.getItem('language') || '';
	} catch (e) {
		/* no localStorage in tests */
	}
	if (!tag && typeof navigator !== 'undefined') tag = navigator.language || '';
	return tag.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Overriding the detected locale is only meant for tests. */
export function setLocale(next: Locale | null): void {
	locale = next;
}

export function getLocale(): Locale {
	if (locale === null) locale = detectLocale();
	return locale;
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
	const template = LOCALES[getLocale()][key] ?? en[key];
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
		Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
	);
}

/** Exposed so a test can assert the tables stay in step. */
export const translations = LOCALES;
