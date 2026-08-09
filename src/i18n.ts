/*
 * A translation table small enough not to need a library.
 *
 * `en` is the source of truth: its keys are the key type, so a missing or
 * misspelled entry in another locale is a compile error rather than a blank
 * label. Placeholders are `{name}` and are substituted at call time.
 */

import { getLanguage } from 'obsidian';

const en = {
	/* ---- notices ---- */
	'notice.mapsRequired': 'Advanced Maps: enable the built-in Maps plugin.',
	'notice.baseNotConfigured': 'Advanced Maps: set a base file under "Open in map" in the plugin settings.',
	'notice.baseNotFound': 'Could not find {path}',
	'notice.baseParseFailed': 'Could not parse {path}: {error}',
	'notice.viewNotFound': '{path} has no view named "{view}"',
	'notice.noMapView': '{path} has no map view',
	'notice.noCoords': '"{file}" has no {property}',
	'notice.around.added': 'Added the "{view}" view to {path}',
	'notice.around.writeFailed': 'Could not add the view to {path}: {error}',

	/* ---- notices: location ---- */
	'notice.locate.working': 'Getting your location…',
	'notice.locate.done': '{property}: {coords}',
	'notice.locate.noProvider': 'this device has no location service',
	'notice.locate.denied': 'location permission was denied',
	'notice.locate.unavailable': 'no position could be determined',
	'notice.locate.timeout': 'the location request timed out',
	'notice.locate.failed': 'the location request failed',
	'notice.locate.gaveUp': 'Advanced Maps: {reason}. Not asking again until you run the command by hand.',

	/* ---- map controls and embeds ---- */
	'control.zoomToFit': 'Zoom to fit',
	'embed.failed': 'Could not draw {file}: {message}',
	'embed.mapsDisabled': 'the built-in Maps plugin is not enabled',

	/* ---- track statistics ----
	 * Names for what the numbers are. The bar itself shows values only — eight
	 * labels across a line is unreadable — so these ride on the tooltip. */
	'stats.distance': 'Distance',
	'stats.ascent': 'Ascent',
	'stats.descent': 'Descent',
	'stats.duration': 'Duration',
	'stats.moving': 'Moving time',
	'stats.speed': 'Average speed',
	'stats.elevation': 'Elevation',
	'stats.profile': 'Elevation profile',

	/* ---- the map's right-click menu ---- */
	'menu.openExternal': 'Open in external map',

	/* ---- coordinate systems ---- */
	/* Named by provider, not by standard: nobody picks a basemap by its datum. */
	'coord.auto': 'Auto — follow the basemap',
	'coord.wgs84': 'WGS-84 — OpenStreetMap, ArcGIS, Tianditu',
	'coord.gcj02': 'GCJ-02 — Amap, Tencent, Google China',
	'coord.bd09': 'BD-09 — Baidu',
	'coord.followPlugin': 'Follow the plugin default',

	/* ---- per-view options ---- */
	'options.tracks': 'Tracks',
	'options.lineWidth': 'Line width',
	'options.lineOpacity': 'Line opacity',
	'options.fitMaxZoom': 'Max zoom when fitting',
	'options.coordSystem': 'Coordinate system',
	'options.tileCoordSystem': 'Tile coordinate system',

	/* ---- commands ---- */
	'command.openInMap': 'Open in map',
	'command.insertMap': 'Insert a map of the notes around this one',
	/* Doubles as the base view's name and as the link fragment, so it is short. */
	'view.around': 'Around',
	'command.fillCoords': 'Fill coordinates from current location',
	'command.fillFromLink': 'Set coordinates from a map link',
	'command.searchPlace': 'Search for a place and set coordinates',

	/* ---- "set coordinates from a link" ---- */
	'link.title': 'Set coordinates from a map link',
	'link.intro':
		'Paste a share link from Amap, Baidu, Tencent, Google or Apple Maps — or plain coordinates. Whatever ' +
		'system it is in, what gets written is WGS-84.',
	'link.input': 'Link or coordinates',
	'link.placeholder': 'Paste a link, or 30.260901,120.147030',
	'link.system': 'Coordinate system',
	'link.system.detected': 'As detected',
	'link.confirm': 'Set',
	'link.waiting': 'Waiting for something to read.',
	'link.unreadable': 'No coordinate in that. Paste the whole link, or two numbers as "lat,lng".',
	'link.short': 'That is a shortened {provider} link. Open it once and paste the address it lands on.',
	'link.found': 'Read as {provider}, {system}.',
	'link.provider.amap': 'Amap',
	'link.provider.baidu': 'Baidu',
	'link.provider.tencent': 'Tencent',
	'link.provider.google': 'Google Maps',
	'link.provider.apple': 'Apple Maps',
	'link.provider.osm': 'OpenStreetMap',
	'link.provider.geo': 'a geo: URI',
	'link.provider.dms': 'degrees, minutes, seconds',
	'link.provider.plain': 'plain coordinates',

	/* ---- place search ---- */
	'search.placeholder': 'Type a place name…',
	'search.empty': 'No matches.',
	'search.provider.nominatim': 'OpenStreetMap (Nominatim) — no key, thin on Chinese POIs',
	'search.provider.amap': 'Amap 高德 — needs a free web-service key',
	'notice.search.failed': 'Advanced Maps: the search failed — {reason}',
	'notice.search.needsKey': 'Advanced Maps: add an Amap web-service key in the plugin settings, or switch provider.',

	/* ---- settings: place search ---- */
	'settings.search.heading': 'Place search',
	'settings.search.intro':
		'Looks a place name up and writes the coordinate it comes back with. This is the only request the plugin ' +
		'makes on its own behalf — what you type goes to the source below, and nothing else does. A map on screen ' +
		'still fetches tiles from whichever background it is set to.',
	'settings.search.provider.name': 'Search provider',
	'settings.search.provider.desc': 'Amap knows Chinese places far better; OpenStreetMap needs no signing up.',
	'settings.search.amapKey.name': 'Amap web-service key',
	'settings.search.amapKey.desc': 'From console.amap.com — a "Web service" key, not a JS API one.',

	/* ---- settings ----
	 * One line per setting, and one line under each heading. Why a thing works
	 * the way it does belongs in the README; this pane has room for what it does
	 * and what happens when it is off. */

	/* ---- settings: location ---- */
	'settings.locate.heading': 'Location',
	'settings.locate.intro':
		"Fills a note's coordinate property from the device — on the desktop as well as on mobile, wherever the " +
		'operating system can answer.',
	'settings.locate.enable.name': 'Enable location',
	'settings.locate.enable.desc':
		'Enables the command and the automatic fill below. The first request raises a permission prompt.',
	'settings.locate.auto.name': 'Fill an empty coordinate property',
	'settings.locate.auto.desc':
		'Stamps the note you are in when its "{property}" is there but empty — a blank line in a template is the ' +
		'invitation. A property that already holds something is never overwritten.',
	'settings.locate.exclude.name': 'Skip paths containing',
	'settings.locate.exclude.desc':
		'Comma-separated path fragments. Templates belong here: their blank is the one to leave alone.',

	/* ---- settings: coordinate system ---- */
	'settings.coord.heading': 'Coordinate system',
	'settings.coord.intro':
		'Chinese basemaps sit 300–600 m away from raw GPS. Matching the system moves pins and tracks as they are ' +
		'drawn, so they line up with the tiles; nothing on disk changes.',
	'settings.coord.default.name': 'Default coordinate system',
	'settings.coord.default.desc':
		'Used by inline ![[track.gpx]] maps, and by every map view that does not set its own.',

	/* ---- settings: open in map ---- */
	'settings.open.heading': 'Open in map',
	'settings.open.intro':
		"Pops up a base's map view centred on the note you are in, from its ⋮ menu or the command palette. It appears " +
		'on notes whose coordinate property holds a value.',
	'settings.open.label.name': 'Menu item label',
	'settings.open.label.desc':
		'Blank for the default. The ⋮ menu follows at once, the command palette after a reload.',
	'settings.open.basePath.name': 'Base file path',
	'settings.open.basePath.desc':
		'The .base file the map view is taken from — for the pop-up and the inserted map alike.',
	'settings.open.viewName.name': 'View name',
	'settings.open.viewName.desc': 'Which view inside that base. Blank takes its first map view.',
	'settings.open.coordsProperty.name': 'Coordinate property',
	'settings.open.coordsProperty.desc':
		'The property holding "latitude,longitude". Location, below, writes to this one too.',
	'settings.open.zoom.name': 'Pop-up zoom level',
	'settings.open.aroundView.name': '"Around this note" view name',
	'settings.open.aroundView.desc':
		'The view added to that base for maps of the notes around a note. Renaming it here does not repoint maps ' +
		'already inserted — their links name the old one.',

	/* ---- settings: tracks ---- */
	'settings.tracks.heading': 'Tracks',
	'settings.tracks.intro':
		'How GPX / GeoJSON tracks are drawn. A map view can set its own width, opacity and zoom limit.',
	'settings.tracks.color.name': 'Default colour',
	'settings.tracks.color.desc':
		'For inline maps, and for a track whose note the base gives no colour. A CSS variable works.',
	'settings.tracks.weight.name': 'Line width',
	'settings.tracks.opacity.name': 'Line opacity',
	/* The same knob as `options.fitMaxZoom`, so it carries the same name. */
	'settings.tracks.fitMaxZoom.name': 'Max zoom when fitting',
	'settings.tracks.fitMaxZoom.desc': 'How far auto-framing may zoom in.',
	'settings.tracks.embedHeight.name': 'Inline map height',
	'settings.tracks.embedHeight.desc': 'Height in pixels of an inline ![[track.gpx]] map.',
	'settings.tracks.stats.name': 'Show track statistics',
	'settings.tracks.stats.desc':
		'Distance, ascent and time under an inline map. GPX and TCX carry them; a GeoJSON usually carries neither, ' +
		'and what is missing is left out rather than shown as zero.',
	'settings.tracks.profile.name': 'Show the elevation profile',
	'settings.tracks.profile.desc': 'A small chart under the statistics, for files that record elevation.',
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
	'notice.around.added': '已在 {path} 中添加「{view}」视图',
	'notice.around.writeFailed': '无法向 {path} 添加视图：{error}',

	'notice.locate.working': '正在定位…',
	'notice.locate.done': '{property}：{coords}',
	'notice.locate.noProvider': '此设备没有定位服务',
	'notice.locate.denied': '定位权限被拒绝',
	'notice.locate.unavailable': '拿不到位置信息',
	'notice.locate.timeout': '定位超时',
	'notice.locate.failed': '定位失败',
	'notice.locate.gaveUp': 'Advanced Maps：{reason}。本次启动不再自动重试，手动执行命令可以重来。',

	'control.zoomToFit': '缩放到全部',
	'embed.failed': '无法绘制 {file}：{message}',
	'embed.mapsDisabled': '内置的 Maps 插件未启用',

	'stats.distance': '距离',
	'stats.ascent': '累计爬升',
	'stats.descent': '累计下降',
	'stats.duration': '总时长',
	'stats.moving': '移动时间',
	'stats.speed': '平均速度',
	'stats.elevation': '海拔',
	'stats.profile': '高程剖面',

	'menu.openExternal': '用外部地图打开',

	'coord.auto': '自动 · 跟随当前底图',
	'coord.wgs84': 'OpenStreetMap、天地图、ArcGIS · WGS-84',
	'coord.gcj02': '高德、腾讯、Google 中国 · GCJ-02 火星坐标',
	'coord.bd09': '百度地图 · BD-09 百度坐标',
	'coord.followPlugin': '跟随插件默认设置',

	'options.tracks': '轨迹',
	'options.lineWidth': '线宽',
	'options.lineOpacity': '线条透明度',
	'options.fitMaxZoom': '自动缩放上限',
	'options.coordSystem': '坐标系',
	'options.tileCoordSystem': '瓦片坐标系',

	'command.openInMap': '在地图中打开',
	'command.insertMap': '插入本篇相关笔记的地图',
	'view.around': '周围',
	'command.fillCoords': '用当前定位填写坐标',
	'command.fillFromLink': '从地图链接填写坐标',
	'command.searchPlace': '搜索地点并填写坐标',

	'link.title': '从地图链接填写坐标',
	'link.intro':
		'粘贴高德、百度、腾讯、Google 或 Apple 地图的分享链接，或者直接粘坐标。不管原来是哪个坐标系，写进笔记的都是 WGS-84。',
	'link.input': '链接或坐标',
	'link.placeholder': '粘贴链接，或 30.260901,120.147030',
	'link.system': '坐标系',
	'link.system.detected': '按识别结果',
	'link.confirm': '填写',
	'link.waiting': '等待输入。',
	'link.unreadable': '没认出坐标。把整条链接粘进来，或者直接写「纬度,经度」两个数。',
	'link.short': '这是{provider}的短链接。先打开一次，再把跳转后的地址粘进来。',
	'link.found': '识别为{provider}，{system}。',
	'link.provider.amap': '高德',
	'link.provider.baidu': '百度',
	'link.provider.tencent': '腾讯',
	'link.provider.google': 'Google 地图',
	'link.provider.apple': 'Apple 地图',
	'link.provider.osm': 'OpenStreetMap',
	'link.provider.geo': 'geo: 链接',
	'link.provider.dms': '度分秒',
	'link.provider.plain': '纯坐标',

	'search.placeholder': '输入地点名称…',
	'search.empty': '没有匹配结果。',
	'search.provider.nominatim': 'OpenStreetMap（Nominatim）—— 不用申请，但国内 POI 很少',
	'search.provider.amap': '高德 —— 需要免费的 Web 服务 key',
	'notice.search.failed': 'Advanced Maps：搜索失败 —— {reason}',
	'notice.search.needsKey': 'Advanced Maps：请在插件设置里填高德 Web 服务 key，或者换一个搜索源。',

	'settings.search.heading': '地点搜索',
	'settings.search.intro':
		'搜地名，把查到的坐标写进笔记。这是插件自己发起的唯一一次请求：只有你输入的内容会发给下面选的搜索源，别的都不会。地图本身仍然会向所配置的底图服务请求瓦片。',
	'settings.search.provider.name': '搜索源',
	'settings.search.provider.desc': '高德对国内地点熟得多；OpenStreetMap 不用注册。',
	'settings.search.amapKey.name': '高德 Web 服务 key',
	'settings.search.amapKey.desc': '在 console.amap.com 申请，要选「Web 服务」类型，不是 JS API。',

	'settings.locate.heading': '定位',
	'settings.locate.intro': '用设备定位填写笔记的坐标属性。桌面端也可以，只要操作系统能给出位置。',
	'settings.locate.enable.name': '启用定位',
	'settings.locate.enable.desc': '开启后命令和下面的自动填写才生效。第一次请求会弹出权限询问。',
	'settings.locate.auto.name': '自动填写空的坐标属性',
	'settings.locate.auto.desc':
		'当前笔记的「{property}」存在但为空时填入——模板里留一行空的就是在等它。已经有值的属性不会被覆盖。',
	'settings.locate.exclude.name': '跳过路径包含',
	'settings.locate.exclude.desc': '逗号分隔的路径片段。模板目录应当写在这里：它留出的空位正是不该被填掉的。',

	'settings.coord.heading': '坐标系',
	'settings.coord.intro':
		'国内底图与 GPS 原始坐标相差 300–600 米。选对坐标系，标记和轨迹会在绘制时换算过去，与底图对齐；磁盘上的内容不会改动。',
	'settings.coord.default.name': '默认坐标系',
	'settings.coord.default.desc': '内联 ![[track.gpx]] 地图，以及没有单独设置的地图视图都用它。',

	'settings.open.heading': '在地图中打开',
	'settings.open.intro':
		'从 ⋮ 菜单或命令面板弹窗打开指定 base 的地图视图，并以当前笔记为中心。只对坐标属性有值的笔记出现。',
	'settings.open.label.name': '菜单项名称',
	'settings.open.label.desc': '留空用默认名称。⋮ 菜单立即生效，命令面板要重载插件。',
	'settings.open.basePath.name': 'Base 文件路径',
	'settings.open.basePath.desc': '从哪个 .base 文件取地图视图。弹窗和插入的地图取的是同一个。',
	'settings.open.viewName.name': '视图名称',
	'settings.open.viewName.desc': '该 base 里的哪个视图。留空取第一个地图视图。',
	'settings.open.coordsProperty.name': '坐标属性',
	'settings.open.coordsProperty.desc': '存放「纬度,经度」的属性名。下面的定位写入的也是它。',
	'settings.open.zoom.name': '弹窗缩放级别',
	'settings.open.aroundView.name': '「周围」视图名称',
	'settings.open.aroundView.desc':
		'为「本篇相关笔记的地图」在该 base 中添加的视图。在这里改名不会改已经插入的地图——它们的链接指向旧名字。',

	'settings.tracks.heading': '轨迹',
	'settings.tracks.intro': 'GPX / GeoJSON 轨迹的画法。线宽、透明度和缩放上限都可以在单个地图视图里另设。',
	'settings.tracks.color.name': '默认颜色',
	'settings.tracks.color.desc': '内联地图用它，base 没给笔记指定颜色时也用它。可以是 CSS 变量。',
	'settings.tracks.weight.name': '线宽',
	'settings.tracks.opacity.name': '线条透明度',
	'settings.tracks.fitMaxZoom.name': '自动缩放上限',
	'settings.tracks.fitMaxZoom.desc': '自动框选时最多放大到的级别。',
	'settings.tracks.embedHeight.name': '内联地图高度',
	'settings.tracks.embedHeight.desc': '内联 ![[track.gpx]] 地图的高度（像素）。',
	'settings.tracks.stats.name': '显示轨迹统计',
	'settings.tracks.stats.desc':
		'在内联地图下方显示距离、爬升和时间。GPX 和 TCX 带这些信息，GeoJSON 通常两样都没有；缺的那几项直接不显示，而不是显示成 0。',
	'settings.tracks.profile.name': '显示高程剖面',
	'settings.tracks.profile.desc': '统计下面的小图，只对记录了高程的文件出现。',
};

const LOCALES = { en, zh } as const;

export type Locale = keyof typeof LOCALES;

let locale: Locale | null = null;

/**
 * Traditional Chinese falls through to the Simplified table — closer than
 * English until someone contributes a `zh-TW` one.
 */
export function detectLocale(): Locale {
	let tag = '';
	try {
		tag = getLanguage() || '';
	} catch (e) {
		/* not running inside Obsidian */
	}
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
