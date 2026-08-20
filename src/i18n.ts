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
	'notice.badCoords': '{property} of "{file}" is not a coordinate: {value}',
	'notice.around.added': 'Added the "{view}" view to {path}',
	'notice.around.nameOccupied': '“{view}” already names a non-map view in {path}',
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
	'control.follow': 'Follow the active note',
	'control.followOff': 'Stop following the active note',
	'control.measure': 'Measure distance',
	'control.measure.hide': 'Hide the readout',
	'control.measure.show': 'Show the readout',
	'measure.hint': 'Pick two places',
	'measure.undo': 'Take back the last point',
	'measure.done': 'Done measuring',
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

	/* ---- rows added to a base map's own note popup ----
	 * Labels for what the pointer is on. A pointed track's row is labelled with
	 * that track's own name instead, so it has no key here. */
	'popup.waypoint': 'Waypoint',
	'popup.photo': 'Photo',

	/* ---- the map's right-click menu ---- */
	'menu.openExternal': 'Open in external map',
	/* Beside the native "New note here", whose other half it is. */
	'menu.stampNote': "Set a note's coordinates here",
	/* On a file rather than on the map: the one entry this plugin adds to the
	 * file menu, and the only one of the two that names a file. */
	'menu.importPlaces': 'Import places as notes…',
	/* About the whole map rather than the clicked point, which is why it sits in
	 * a section of its own. */
	'menu.exportPlaces': 'Export places…',

	/* ---- picking the note a clicked point belongs to ---- */
	'picker.placeholder': 'Which note is at {coords}?',
	'picker.empty': 'No note by that name.',
	'replace.title': 'Replace this coordinate?',
	'replace.body': '“{file}” already has a {property}.',
	'replace.from': 'Now: {coords}',
	'replace.to': 'After: {coords}',
	'replace.cancel': 'Leave it',
	'replace.confirm': 'Replace',
	'notice.stamp.done': '{file} — {property}: {coords}',

	/* ---- places in and out ---- */
	'places.cancel': 'Cancel',
	'places.import.title': 'Import places as notes',
	'places.import.intro': '{file} holds {count} places. Each becomes a note carrying its coordinate.',
	'places.import.more': '…and {count} more',
	'places.import.folder': 'Destination folder',
	'places.import.folderPlaceholder': 'Vault root',
	'places.import.undo':
		'Every note lands in this folder, and nothing already there is overwritten — so deleting the folder ' +
		'undoes the import. Importing the same file again later makes a second set of notes rather than ' +
		'updating these.',
	'places.import.confirm': 'Import',
	'notice.places.none': 'No places in {file} — it holds routes or areas rather than points.',
	'notice.places.readFailed': 'Could not read {file}: {reason}',
	'notice.places.folderFailed': 'Could not create {folder}: {reason}',
	'notice.places.imported': 'Imported {count} places into {folder}',
	'notice.places.importedSome': 'Imported {count} places into {folder}; {failed} could not be written',
	'places.export.title': 'Export places',
	'places.export.intro': 'This map shows {count} places.',
	'places.export.format': 'Format',
	'places.format.gpx': 'GPX — waypoints',
	'places.format.kml': 'KML — placemarks',
	'places.format.csv': 'CSV — one row per place',
	'places.export.nameBy': 'Name each place by',
	'places.export.nameByDesc': "Falls back to the note's file name wherever the property is empty.",
	'places.export.nameByFile': 'File name',
	'places.export.path': 'Save as',
	'places.export.needsPath': 'Give the file a path inside the vault.',
	'places.export.taken': '{path} already exists.',
	'places.export.willWrite': 'Writes {path}',
	'places.export.confirm': 'Export',
	/* Only reached when nothing names the map — the file name is normally the base's. */
	'places.export.defaultName': 'places',
	'notice.places.exported': 'Wrote {count} places to {path}',
	'notice.places.exportFailed': 'Could not write {path}: {reason}',

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
	'options.basemap': 'Basemap',
	'options.basemapPick': 'This map opens on',
	'options.basemap.followPlugin': 'Follow the plugin default',
	'options.basemap.none': "None — this view's own background",
	'options.basemap.missing': '{name} — no longer configured',
	/* The entry this plugin adds to the map's own layers menu when the host has
	 * no backgrounds of its own, so choosing a pack is always reversible. */
	'background.default': 'Default background',

	/* ---- commands ---- */
	'command.openInMap': 'Open in map',
	'command.insertMap': 'Insert a map of the notes around this one',
	/* Doubles as the base view's name and as the link fragment, so it is short. */
	'view.around': 'Around',
	'command.fillCoords': 'Fill coordinates from current location',
	'command.fillFromLink': 'Set coordinates from a map link',
	'command.searchPlace': 'Search for a place and set coordinates',
	'command.reverseGeocode': 'Fill place name from coordinates',
	'command.fillFromPhoto': 'Set coordinates from a photo',
	'command.writeStats': 'Write track statistics to properties',

	/* ---- "set coordinates from a link" ---- */
	'link.title': 'Set coordinates from a map link',
	'link.intro':
		'Paste a share link from Amap, Baidu, Tencent, Google or Apple Maps — or a Plus Code, or plain ' +
		'coordinates. Whatever system it is in, what gets written is WGS-84.',
	'link.input': 'Link or coordinates',
	'link.placeholder': 'Paste a link, 8FVC9G8F+6W, or 30.260901,120.147030',
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
	'link.provider.pluscode': 'a Plus Code',
	'link.pluscode.short':
		'That is a short Plus Code. It only means somewhere near a place you have not named — paste the full ' +
		'code, the one with eight characters before the +.',
	'link.pluscode.imprecise':
		'That Plus Code is padded with zeros, so it names an area kilometres across rather than a place. Paste ' +
		'the full code.',

	/* ---- place search ---- */
	'search.placeholder': 'Type a place name…',
	'search.empty': 'No matches.',
	'search.provider.nominatim': 'OpenStreetMap (Nominatim) — no key, thin on Chinese POIs',
	'search.provider.amap': 'Amap 高德 — needs a free web-service key',
	/* The same two without the hint the dropdown carries, for the settings entry
	 * that states which one is in effect. */
	'search.providerShort.nominatim': 'OpenStreetMap',
	'search.providerShort.amap': 'Amap 高德',
	'search.keyStore.secret': 'Secret storage — this device only',
	'search.keyStore.plugin': 'Plugin settings — synced, in plain text',
	'notice.search.failed': 'Advanced Maps: the search failed — {reason}',
	'notice.search.needsKey': 'Advanced Maps: add an Amap web-service key in the plugin settings, or switch provider.',
	'notice.write.failed': 'Advanced Maps: could not write to the note — {reason}',

	/* ---- reverse geocoding ---- */
	'notice.reverseGeocode.failed': 'Advanced Maps: could not look up a place name — {reason}',
	'notice.reverseGeocode.done': '{property}: {value}',
	'notice.reverseGeocode.samePropertyAsCoords':
		'Advanced Maps: Place property and Coordinate property are both "{property}" — set them to different ' +
		'properties in settings, or this would overwrite the coordinate with the place name.',

	/* ---- fill coordinates from a photo ---- */
	'notice.photo.none': '"{file}" has no linked photo with a location',
	'notice.photo.done': '{property}: {coords}, from the photo',
	'notice.photo.failed': 'Advanced Maps: could not read a location from that photo — {reason}',
	'notice.photoIndex.cleared': 'Advanced Maps: cleared the photo index. Photos are read again as maps ask for them.',

	/* ---- track statistics written to a note ---- */
	'notice.stats.done': 'Advanced Maps: wrote {count} properties — {distance}',
	'notice.stats.none': '"{file}" has no track data to measure',
	'notice.stats.noFigures': 'Advanced Maps: no figure is switched on — see Tracks → Track properties',
	'notice.stats.failed': 'Advanced Maps: could not read that track — {reason}',
	/* Names the property rather than the box: the clash can come from the prefix
	 * or from that one figure's own name, and Track properties holds both. */
	'notice.stats.propertyClash':
		'Advanced Maps: the statistics would be written to "{property}", which is already in use — change the ' +
		"prefix or that figure's name under Track properties, or this would overwrite it.",
	'notice.stats.nameClash':
		'Advanced Maps: two track figures are both named "{property}" — give them different names in settings, ' +
		'or one would overwrite the other.',

	/* ---- the photo a map pin stands for ---- */
	'photo.openNote': 'Open note',

	/* ---- settings: external maps ---- */
	'settings.external.heading': 'Open in external map',
	'settings.external.intro':
		'What the map offers when you right-click a spot on it. Order the built-in apps, switch off the ones you never use, and add any app that takes a coordinate in a URL.',
	'settings.external.builtin.heading': 'Built-in',
	'settings.external.custom.heading': 'Your own',
	'settings.external.custom.empty': 'Nothing added. The six above need no setting up.',
	'settings.external.custom.add': 'Add a map app',
	/* The three boxes on a custom entry's row carry their own labels as
	 * placeholders — a row is one entry, so the fields share it. */
	'settings.external.custom.name.name': 'Name',
	'settings.external.custom.url.placeholder': 'https://…{lat}…{lng}',
	'settings.external.custom.url.desc':
		'{lat} and {lng} are replaced with the coordinate, in whichever order the app wants. An app scheme such as waze:// works on a device that has it.',
	'settings.external.custom.datum.desc':
		'Which system that URL expects. Guessing wrong lands the pin a few streets away.',
	/* Short forms: these sit in a dropdown beside two text boxes, where the
	 * provider lists the coordinate-system setting spells out do not fit. */
	'datum.wgs84': 'WGS-84',
	'datum.gcj02': 'GCJ-02',
	'datum.bd09': 'BD-09',
	'settings.external.error.scheme': 'Needs to start with a scheme, like https:// or waze://.',
	'settings.external.error.unsafe': 'That scheme cannot be opened from a menu.',
	'settings.external.error.placeholder': 'Needs both {lat} and {lng} in it.',

	/* ---- settings: place search ---- */
	'settings.search.heading': 'Place search',
	'settings.search.intro':
		'Looks a place name up, and turns a coordinate back into a place name. These are the only two requests this plugin makes on its own; a map still fetches tiles from its own background.',
	'settings.search.provider.name': 'Search provider',
	'settings.search.provider.desc': 'Amap knows Chinese places far better; OpenStreetMap needs no signing up.',
	'settings.search.keyStore.name': 'Amap key storage',
	// The two option labels carry the trade-off; this says the one thing they
	// cannot, which is what happens to the key when the answer changes.
	'settings.search.keyStore.desc':
		'Switching to secret storage moves the key across. Switching back does not copy it out.',
	'settings.search.amapKey.name': 'Amap key',
	'settings.search.amapKey.desc': 'From console.amap.com — a "Web service" key, not a JS API one.',

	/* ---- settings ----
	 * One line per setting, and one line under each heading. Why a thing works
	 * the way it does belongs in the README; this pane has room for what it does
	 * and what happens when it is off. */

	/* ---- settings: location ---- */
	'settings.locate.heading': 'Location',
	'settings.locate.intro': "Fills a note's coordinate property from the device, on the desktop as well as on mobile.",
	'settings.locate.enable.name': 'Use device location',
	'settings.locate.enable.desc':
		'Enables the command and the automatic fill below. The first request raises a permission prompt.',
	'settings.locate.auto.name': 'Fill empty coordinates',
	'settings.locate.auto.desc':
		'Stamps the note you are in when its "{property}" is there but empty. A property that already holds something is never overwritten.',
	'settings.locate.exclude.name': 'Skip these folders',
	'settings.locate.exclude.desc':
		'Notes under these paths are never stamped. Templates belong here: their blank is the one to leave alone.',
	'settings.locate.exclude.empty':
		'Nothing skipped — a blank coordinate in a template will be filled like any other.',
	'settings.locate.exclude.add': 'Add a folder',

	/* ---- settings: what a page entry states ----
	 * A page shows no control of its own, so the entry says what is behind it. */
	'settings.state.on': 'On',
	'settings.state.off': 'Off',
	'settings.state.unset': 'Not set',
	'settings.external.enabled': '{count} switched on',

	/* ---- settings: the pane's first row ----
	 * Where the guide is, and the one thing the plugin asks for back. Each badge
	 * is a link and carries its own emoji, so a locale can replace both. */
	'settings.about.guide.link': '📖 User guide',
	'settings.about.guide': 'Every feature, with pictures and worked examples.',
	'settings.about.star.link': '⭐ Star on GitHub',
	'settings.about.star': 'Advanced Maps is free; a star is all it asks.',

	/* ---- settings: coordinate system ---- */
	'settings.coord.heading': 'Coordinate system',
	'settings.coord.intro':
		'Chinese basemaps sit 300–600 m from raw GPS. Matching the system lines pins and tracks up with the tiles as they are drawn. Nothing on disk changes.',
	'settings.coord.default.name': 'Default coordinate system',
	'settings.coord.default.desc': 'Used by inline maps, and by every map view that does not set its own.',

	/* ---- settings: offline basemap ---- */
	'settings.tiles.heading': 'Offline basemap',
	'settings.tiles.intro':
		'Folders of tiles already on your disk become backgrounds every map can be put on, with nothing asked of the network. The tiles are only ever read.',
	'settings.tiles.packs.heading': 'Tile packs',
	'settings.tiles.packs.empty': 'Add a folder of tiles already on your disk.',
	'settings.tiles.packs.add': 'Add tile pack',
	'settings.tiles.pack.name': 'Name',
	'settings.tiles.pack.unnamed': 'Tiles',
	'settings.tiles.path.name': 'Tile path',
	'settings.tiles.path.desc':
		'The path your tiles are addressed by, holding {z}, {x} and {y}. Absolute, or relative to the vault.',
	'settings.tiles.error.placeholders': 'Needs {z}, {x} and {y} in it.',
	'settings.tiles.error.unnamed': 'Give this pack a name — the name is what a map is pointed at.',
	'settings.tiles.error.duplicate': 'Two packs cannot share a name.',
	'settings.tiles.minZoom.name': 'Lowest zoom level',
	'settings.tiles.minZoom.desc':
		'The lowest-numbered folder your pack goes down to. Maps stop zooming out there rather than emptying.',
	'settings.tiles.maxZoom.name': 'Highest zoom level',
	'settings.tiles.maxZoom.desc':
		'The highest-numbered folder your pack goes up to. Past it the map magnifies what it has instead of asking for tiles you do not have.',
	'settings.tiles.default.name': 'Default background',
	'settings.tiles.default.desc':
		'The pack every map opens on unless it names another. Each map can pick a different one from its own options, or from the layers button on the map itself.',
	'settings.tiles.default.none': 'None — leave every map its own background',

	/* ---- settings: open in map ---- */
	'settings.open.heading': 'Open in map',
	'settings.open.intro':
		'Opens a map view on the note you are in, from its ⋮ menu or the command palette. It appears on notes whose coordinate property holds a value.',
	'settings.open.label.name': 'Menu item label',
	'settings.open.label.desc':
		'Blank for the default. The ⋮ menu follows at once, the command palette after a reload.',
	'settings.open.basePath.name': 'Base file',
	'settings.open.basePath.desc': 'The .base file every map this plugin opens is taken from.',
	'settings.open.viewName.name': 'View name',
	'settings.open.viewName.desc': 'Which view inside that base. Blank takes its first map view.',
	'open.view.first': 'The first map view',
	/* A view named in settings that the base does not have — renamed since, or
	 * left behind by a change of base. Said rather than dropped: a dropdown with
	 * no matching option shows the first one, which would read as "blank".
	 *
	 * The name is quoted, as it is in `notice.viewNotFound`, because a view is
	 * usually named after what it shows: unquoted, a view called "map" reads as
	 * "map — no such view in this base", which sounds like the base has no map. */
	'open.view.missing': '"{view}" — no such view in this base',
	'settings.open.openIn.name': 'Open in',
	'settings.open.openIn.desc':
		'A tab opens the base file itself and keeps any view option you change there. A pop-up leaves your layout alone, but has nowhere to save a change.',
	'open.target.tab': 'A tab, reusing one already showing that base',
	'open.target.modal': 'A pop-up',
	'settings.open.coordsProperty.name': 'Coordinate property',
	'settings.open.coordsProperty.desc': 'The property holding "latitude,longitude". Location writes to this one too.',
	'settings.open.placeProperty.name': 'Place property',
	'settings.open.placeProperty.desc': 'Where "Fill place name from coordinates" writes its result.',
	'settings.open.zoom.name': 'Zoom level',
	'settings.open.zoom.desc': 'How close the map lands when it opens on a note.',
	'settings.open.aroundView.name': 'Around view name',
	'settings.open.aroundView.desc':
		'The view added to that base for maps of the notes around a note. Renaming it here does not repoint maps already inserted.',

	/* ---- settings: map buttons ----
	 * What this plugin adds to the map's own corner. Zoom-to-fit has no switch:
	 * it is the only way back to the whole collection once the camera has
	 * wandered, so there is nothing to weigh against keeping it. */
	'settings.controls.heading': 'Map buttons',
	'settings.controls.intro':
		'The buttons this plugin adds to a map view, beside the native ones. Zoom-to-fit is always there.',
	'settings.controls.follow.name': 'Follow the active note',
	'settings.controls.follow.desc':
		'Adds the ⊹ button. A following map pans to the note you switch to and opens its popup, leaving the query and the zoom alone.',
	'settings.controls.followStart.name': 'New maps start following',
	'settings.controls.followStart.desc':
		'Which way ⊹ points on a map that has just opened. It is not remembered when a map is closed.',
	'settings.controls.measure.name': 'Measure distance',
	'settings.controls.measure.desc': 'Adds the ruler button. Its readout opens beside it while you measure.',
	'settings.controls.count': '{on} of {total} on',

	/* ---- settings: pins ----
	 * The notes' own markers, which belong to the native Maps view rather than
	 * to this plugin — a group of their own rather than a row among the track
	 * knobs, which are about files a note points at. */
	'settings.pins.heading': 'Pins',
	'settings.pins.intro': "How the notes' own markers behave on a map view.",
	'settings.pins.spread.name': 'Fan out overlapping pins',
	'settings.pins.spread.desc':
		'Notes at the same place stack into one pin. Past zoom {zoom} they fan onto a ring so each can be hovered and opened. Drawn on screen only; nothing is written.',

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
		'Distance, ascent and time under an inline map. What a file does not record is left out rather than shown as zero.',
	'settings.tracks.profile.name': 'Show elevation profile',
	'settings.tracks.profile.desc': 'A small chart under the statistics, for files that record elevation.',
	'settings.tracks.markers.name': 'Show track markers',
	'settings.tracks.markers.desc':
		"A start and an end pin on every track, direction arrows along it, and — inline — a waypoint's own name on hover.",
	'settings.tracks.statsPrefix.name': 'Property prefix',
	'settings.tracks.statsPrefix.desc':
		'What "Write track statistics to properties" names what it writes: "track" gives track-distance-km, track-ascent-m, and so on.',

	/* ---- settings: track properties ----
	 * The nine figures the write-statistics command knows: whether each one is
	 * written, and what it is called when it is. Each box is empty by default and
	 * shows the prefixed name it would otherwise write. */
	'settings.trackProps.heading': 'Track properties',
	'settings.trackProps.intro':
		'Which figures "Write track statistics to properties" writes, and what it calls each one. A figure switched off is not written, and one already in a note is not removed either. An empty box keeps the name shown in it.',
	'settings.trackProps.count': '{on} of {total} figures',
	'settings.trackProps.figures.heading': 'Figures',
	'settings.trackProps.write': 'Write this figure',
	'settings.trackProps.distance.name': 'Distance',
	'settings.trackProps.ascent.name': 'Ascent',
	'settings.trackProps.descent.name': 'Descent',
	'settings.trackProps.lowest.name': 'Lowest point',
	'settings.trackProps.highest.name': 'Highest point',
	'settings.trackProps.duration.name': 'Elapsed time',
	'settings.trackProps.moving.name': 'Moving time',
	'settings.trackProps.speed.name': 'Average speed',
	'settings.trackProps.start.name': 'Start time',

	/* ---- settings: photos ----
	 * A page of its own beside the track knobs above: a track comes from a
	 * file the note points at on purpose, a photo's location comes along for
	 * free with a file kept for an unrelated reason, and the intro below
	 * exists to say plainly what that free ride does and does not do. */
	'settings.photos.heading': 'Photos',
	'settings.photos.intro':
		"Draws a linked photo's own location, read from its EXIF GPS tags, the same way a linked .gpx file draws a track. A photo is only ever read, and nothing about it leaves the vault.",
	'setting.showPhotos': 'Show photos',
	'setting.showPhotos.desc': "Draws a pin at a linked photo's own coordinate, wherever its EXIF GPS tags name one.",
	'setting.photoThumbnails': 'Show photo thumbnails',
	'setting.photoThumbnails.desc':
		"Uses each photo's own embedded thumbnail as its map icon, in place of a plain dot.",
	'setting.photoDatum': 'Photo coordinate system',
	'setting.photoDatum.desc':
		"EXIF GPS coordinates are WGS-84 by specification. Auto believes a photo's own GPSMapDatum tag when it states one, and falls back to WGS-84.",
	'setting.photoDatum.auto': "Auto — follow the photo's own GPSMapDatum, if it states one",
	'setting.photoDatum.wgs84': 'WGS-84 — the EXIF specification',
	'setting.photoDatum.gcj02': 'GCJ-02 — force it',
	'setting.photoIndex': 'Clear the photo index',
	'setting.photoIndex.desc':
		'Reading a photo is remembered, so opening the vault again draws its pin without opening the file. Clearing it changes nothing on any map; the photos are read again as maps ask for them.',
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
	'notice.badCoords': '「{file}」的 {property} 不是坐标：{value}',
	'notice.around.added': '已在 {path} 中添加「{view}」视图',
	'notice.around.nameOccupied': '{path} 中已有一个名为「{view}」的非地图视图',
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
	'control.follow': '跟随当前笔记',
	'control.followOff': '停止跟随当前笔记',
	'control.measure': '测距',
	'control.measure.hide': '收起读数',
	'control.measure.show': '展开读数',
	'measure.hint': '点两个位置',
	'measure.undo': '撤销上一个点',
	'measure.done': '结束测距',
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

	'popup.waypoint': '途经点',
	'popup.photo': '照片',

	'menu.openExternal': '用外部地图打开',
	'menu.stampNote': '把某篇笔记的坐标设成这里',
	'menu.importPlaces': '把地点导入成笔记…',
	'menu.exportPlaces': '导出地点…',

	'picker.placeholder': '{coords} 是哪篇笔记？',
	'picker.empty': '没有叫这个名字的笔记。',
	'replace.title': '要替换这个坐标吗？',
	'replace.body': '「{file}」已经有 {property} 了。',
	'replace.from': '现在：{coords}',
	'replace.to': '改成：{coords}',
	'replace.cancel': '保持原样',
	'replace.confirm': '替换',
	'notice.stamp.done': '{file} —— {property}：{coords}',

	'places.cancel': '取消',
	'places.import.title': '把地点导入成笔记',
	'places.import.intro': '{file} 里有 {count} 个地点，每个都会变成一篇带坐标的笔记。',
	'places.import.more': '……还有 {count} 个',
	'places.import.folder': '放到哪个文件夹',
	'places.import.folderPlaceholder': '仓库根目录',
	'places.import.undo':
		'笔记全部落在这个文件夹里，已有的文件不会被覆盖 —— 所以删掉这个文件夹就等于撤销这次导入。' +
		'以后再导入同一个文件，会再生成一份新的笔记，而不是更新这一份。',
	'places.import.confirm': '导入',
	'notice.places.none': '{file} 里没有地点 —— 它装的是轨迹或面，不是点。',
	'notice.places.readFailed': '读不了 {file}：{reason}',
	'notice.places.folderFailed': '建不了 {folder}：{reason}',
	'notice.places.imported': '已把 {count} 个地点导入 {folder}',
	'notice.places.importedSome': '已把 {count} 个地点导入 {folder}；有 {failed} 个没能写成笔记',
	'places.export.title': '导出地点',
	'places.export.intro': '这张地图上有 {count} 个地点。',
	'places.export.format': '格式',
	'places.format.gpx': 'GPX · 途经点',
	'places.format.kml': 'KML · 地标',
	'places.format.csv': 'CSV · 一行一个地点',
	'places.export.nameBy': '用什么给地点命名',
	'places.export.nameByDesc': '属性为空的那些，仍然用笔记的文件名。',
	'places.export.nameByFile': '文件名',
	'places.export.path': '存成',
	'places.export.needsPath': '给这个文件一个仓库里的路径。',
	'places.export.taken': '{path} 已经存在了。',
	'places.export.willWrite': '会写入 {path}',
	'places.export.confirm': '导出',
	'places.export.defaultName': '地点',
	'notice.places.exported': '已把 {count} 个地点写进 {path}',
	'notice.places.exportFailed': '写不了 {path}：{reason}',

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
	'options.basemap': '底图',
	'options.basemapPick': '这张地图打开时用',
	'options.basemap.followPlugin': '跟随插件默认设置',
	'options.basemap.none': '不用，保留这个视图自己的底图',
	'options.basemap.missing': '{name} —— 已不存在',
	'background.default': '默认底图',

	'command.openInMap': '在地图中打开',
	'command.insertMap': '插入本篇相关笔记的地图',
	'view.around': '周围',
	'command.fillCoords': '用当前定位填写坐标',
	'command.fillFromLink': '从地图链接填写坐标',
	'command.searchPlace': '搜索地点并填写坐标',
	'command.reverseGeocode': '从坐标填写地名',
	'command.fillFromPhoto': '从照片填写坐标',
	'command.writeStats': '把轨迹数据写进属性',

	'link.title': '从地图链接填写坐标',
	'link.intro':
		'粘贴高德、百度、腾讯、Google 或 Apple 地图的分享链接，也可以是 Plus Code 或直接粘坐标。不管原来是哪个坐标系，写进笔记的都是 WGS-84。',
	'link.input': '链接或坐标',
	'link.placeholder': '粘贴链接、8FVC9G8F+6W，或 30.260901,120.147030',
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
	'link.provider.pluscode': 'Plus Code',
	'link.pluscode.short': '这是简写的 Plus Code，只有在知道大概位置时才有意义。请粘贴完整的那种 —— 加号前面有八位。',
	'link.pluscode.imprecise':
		'这个 Plus Code 用 0 补过位，指的是几公里见方的一片区域，不是一个地点。请粘贴完整的那种。',

	'search.placeholder': '输入地点名称…',
	'search.empty': '没有匹配结果。',
	'search.provider.nominatim': 'OpenStreetMap（Nominatim）—— 不用申请，但国内 POI 很少',
	'search.provider.amap': '高德 —— 需要免费的 Web 服务 key',
	'search.providerShort.nominatim': 'OpenStreetMap',
	'search.providerShort.amap': '高德',
	'search.keyStore.secret': '密钥存储 —— 只留在这台设备',
	'search.keyStore.plugin': '插件设置 —— 跟着同步，明文保存',
	'notice.search.failed': 'Advanced Maps：搜索失败 —— {reason}',
	'notice.search.needsKey': 'Advanced Maps：请在插件设置里填高德 Web 服务 key，或者换一个搜索源。',
	'notice.write.failed': 'Advanced Maps：写入笔记失败 —— {reason}',

	'notice.reverseGeocode.failed': 'Advanced Maps：查找地名失败——{reason}',
	'notice.reverseGeocode.done': '{property}：{value}',
	'notice.reverseGeocode.samePropertyAsCoords':
		'Advanced Maps：地名属性和坐标属性都是「{property}」——请在设置里把它们改成不同的属性，否则会用地名覆盖坐标。',

	'notice.photo.none': '「{file}」没有带位置信息的链接照片',
	'notice.photo.done': '{property}：{coords}（来自照片）',
	'notice.photo.failed': 'Advanced Maps：无法从这张照片读取位置——{reason}',
	'notice.photoIndex.cleared': 'Advanced Maps：照片索引已清空。地图再要照片时会重新读取。',

	'notice.stats.done': 'Advanced Maps：写入了 {count} 个属性——{distance}',
	'notice.stats.none': '「{file}」没有可统计的轨迹数据',
	'notice.stats.noFigures': 'Advanced Maps：一项数据都没开——见「轨迹 → 轨迹属性」',
	'notice.stats.failed': 'Advanced Maps：无法读取这条轨迹——{reason}',
	'notice.stats.propertyClash':
		'Advanced Maps：统计会写到「{property}」，而这个属性已经另有用途——请在「轨迹属性」里改前缀或那一项的名字，' +
		'否则会覆盖它。',
	'notice.stats.nameClash':
		'Advanced Maps：有两项轨迹数据都叫「{property}」——请在设置里给它们不同的名字，否则一项会覆盖另一项。',

	'photo.openNote': '打开笔记',

	'settings.external.heading': '用外部地图打开',
	'settings.external.intro':
		'在地图上右键一个位置时给出的选项。可以给内置的几个排序、把用不上的关掉，也可以添加任何用 URL 接收坐标的地图应用。',
	'settings.external.builtin.heading': '内置',
	'settings.external.custom.heading': '自定义',
	'settings.external.custom.empty': '还没有添加。上面那六个不用配置就能用。',
	'settings.external.custom.add': '添加地图应用',
	'settings.external.custom.name.name': '名称',
	'settings.external.custom.url.placeholder': 'https://…{lat}…{lng}',
	'settings.external.custom.url.desc':
		'{lat} 和 {lng} 会被替换成坐标，先后顺序按目标应用的要求写。waze:// 这类应用协议在装了该应用的设备上有效。',
	'settings.external.custom.datum.desc': '这个 URL 期待的坐标系。选错不会报错，只会把标记落到隔几条街的地方。',
	'datum.wgs84': 'WGS-84',
	'datum.gcj02': 'GCJ-02 火星坐标',
	'datum.bd09': 'BD-09 百度坐标',
	'settings.external.error.scheme': '需要以协议开头，例如 https:// 或 waze:// 。',
	'settings.external.error.unsafe': '这个协议不能从菜单里打开。',
	'settings.external.error.placeholder': '需要同时包含 {lat} 和 {lng} 。',

	'settings.search.heading': '地点搜索',
	'settings.search.intro':
		'搜地名，把查到的坐标写进笔记；反过来也能把坐标查成地名。这是插件自己发起的仅有的两次请求；地图本身仍会向底图服务请求瓦片。',
	'settings.search.provider.name': '搜索源',
	'settings.search.provider.desc': '高德对国内地点熟得多；OpenStreetMap 不用注册。',
	'settings.search.keyStore.name': '高德 key 存放位置',
	'settings.search.keyStore.desc': '切到密钥存储会把 key 一并搬过去；切回来不会再抄出来。',
	'settings.search.amapKey.name': '高德 key',
	'settings.search.amapKey.desc': '在 console.amap.com 申请，要选「Web 服务」类型，不是 JS API。',

	'settings.locate.heading': '定位',
	'settings.locate.intro': '用设备定位填写笔记的坐标属性。桌面端也可以。',
	'settings.locate.enable.name': '使用设备定位',
	'settings.locate.enable.desc': '开启后命令和下面的自动填写才生效。第一次请求会弹出权限询问。',
	'settings.locate.auto.name': '自动填写空坐标',
	'settings.locate.auto.desc': '当前笔记的「{property}」存在但为空时填入。已经有值的属性不会被覆盖。',
	'settings.locate.exclude.name': '跳过这些文件夹',
	'settings.locate.exclude.desc':
		'这些路径下的笔记永远不会被填写。模板目录应当写在这里：它留出的空位正是不该被填掉的。',
	'settings.locate.exclude.empty': '没有跳过任何路径——模板里空着的坐标也会照常被填。',
	'settings.locate.exclude.add': '添加文件夹',

	'settings.state.on': '已开启',
	'settings.state.off': '已关闭',
	'settings.state.unset': '未设置',
	'settings.external.enabled': '已启用 {count} 个',

	'settings.about.guide.link': '📖 用户指南',
	'settings.about.guide': '每项功能都配了截图和实例。',
	'settings.about.star.link': '⭐ 去 GitHub 点个 star',
	'settings.about.star': 'Advanced Maps 免费，只求这一颗星。',

	'settings.coord.heading': '坐标系',
	'settings.coord.intro':
		'国内底图与 GPS 原始坐标相差 300–600 米。选对坐标系，标记和轨迹在绘制时换算过去，与底图对齐；磁盘上的内容不动。',
	'settings.coord.default.name': '默认坐标系',
	'settings.coord.default.desc': '内联地图，以及没有单独设置的地图视图都用它。',

	'settings.tiles.heading': '离线底图',
	'settings.tiles.intro':
		'磁盘上现成的瓦片可以当地图底图，直接从文件系统读，不走网络。可以配多套，每套一个名字。瓦片只读不写。',
	'settings.tiles.packs.heading': '瓦片包',
	'settings.tiles.packs.empty': '添加一套磁盘上现成的瓦片。',
	'settings.tiles.packs.add': '添加瓦片包',
	'settings.tiles.pack.name': '名称',
	'settings.tiles.pack.unnamed': '瓦片',
	'settings.tiles.path.name': '瓦片路径',
	'settings.tiles.path.desc': '瓦片的寻址路径，要含 {z}、{x}、{y}。可以是绝对路径，也可以相对于仓库。',
	'settings.tiles.error.placeholders': '需要同时包含 {z}、{x} 和 {y} 。',
	'settings.tiles.error.unnamed': '给这套瓦片起个名字 —— 地图是靠名字指向它的。',
	'settings.tiles.error.duplicate': '两套瓦片不能同名。',
	'settings.tiles.minZoom.name': '最低层级',
	'settings.tiles.minZoom.desc': '这套瓦片里编号最小的那层。地图缩小到这里就停住，而不是变成空白。',
	'settings.tiles.maxZoom.name': '最高层级',
	'settings.tiles.maxZoom.desc':
		'这套瓦片里编号最大的那层。再放大时地图会把已有瓦片放大接着画，而不是去要没有的瓦片。',
	'settings.tiles.default.name': '默认底图',
	'settings.tiles.default.desc':
		'所有地图默认用哪一套。单张地图可以在自己的视图设置里另选，也可以直接点地图上的图层按钮切换。',
	'settings.tiles.default.none': '不用 —— 各地图保持原有底图',

	'settings.open.heading': '在地图中打开',
	'settings.open.intro':
		'从笔记的 ⋮ 菜单或命令面板，把地图视图打开到当前笔记。只有坐标属性有值的笔记才会出现这一项。',
	'settings.open.label.name': '菜单项名称',
	'settings.open.label.desc': '留空用默认名称。⋮ 菜单立即生效，命令面板要重载插件。',
	'settings.open.basePath.name': 'Base 文件',
	'settings.open.basePath.desc': '本插件打开的每张地图都取自这个 .base 文件。',
	'settings.open.viewName.name': '视图名称',
	'settings.open.viewName.desc': '该 base 里的哪个视图。留空取第一个地图视图。',
	'open.view.first': '第一个地图视图',
	'open.view.missing': '该 base 里没有「{view}」这个视图',
	'settings.open.openIn.name': '打开方式',
	'settings.open.openIn.desc':
		'标签页打开的是 base 文件本身，在地图上改的东西会存下来。弹窗不动你的布局，但没有地方回写视图设置。',
	'open.target.tab': '标签页（已打开该 base 的就复用）',
	'open.target.modal': '弹窗',
	'settings.open.coordsProperty.name': '坐标属性',
	'settings.open.coordsProperty.desc': '存放「纬度,经度」的属性名。定位写入的也是它。',
	'settings.open.placeProperty.name': '地名属性',
	'settings.open.placeProperty.desc': '「从坐标填写地名」命令写入结果的属性名。',
	'settings.open.zoom.name': '缩放级别',
	'settings.open.zoom.desc': '打开到某篇笔记时放大到的级别。',
	'settings.open.aroundView.name': '「周围」视图名称',
	'settings.open.aroundView.desc': '为「本篇相关笔记的地图」在该 base 中添加的视图。在这里改名不会改已经插入的地图。',

	'settings.controls.heading': '地图按钮',
	'settings.controls.intro': '本插件加在地图视图上的按钮，和原生那几个排在一起。「缩放到全部」不可关闭。',
	'settings.controls.follow.name': '跟随当前笔记',
	'settings.controls.follow.desc':
		'显示 ⊹ 按钮。跟随中的地图会跟着切换的笔记移动，并弹出它的气泡；不动查询条件，也不动缩放。',
	'settings.controls.followStart.name': '新地图默认跟随',
	'settings.controls.followStart.desc': '刚打开的地图上 ⊹ 的初始状态。地图关掉后不会记住。',
	'settings.controls.measure.name': '测距',
	'settings.controls.measure.desc': '显示尺子按钮。测量期间，读数就在按钮旁边展开。',
	'settings.controls.count': '{total} 个开了 {on} 个',

	'settings.pins.heading': '图钉',
	'settings.pins.intro': '笔记自身的标记在地图视图里的行为。',
	'settings.pins.spread.name': '散开重合的图钉',
	'settings.pins.spread.desc':
		'位置相同的笔记会叠成一个图钉，只有最上面那个点得开。放大到 {zoom} 级以上后散成一圈，每一个都能单独打开。只画在屏幕上，不写入任何内容。',

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
		'在内联地图下方显示距离、爬升和时间。文件里没记录的那几项直接不显示，而不是显示成 0。',
	'settings.tracks.profile.name': '显示高程剖面',
	'settings.tracks.profile.desc': '统计下面的小图，只对记录了高程的文件出现。',
	'settings.tracks.markers.name': '显示轨迹标记',
	'settings.tracks.markers.desc': '每条轨迹的起点和终点图钉、沿线的方向箭头，以及仅内联地图上悬停显示的途经点名称。',
	'settings.tracks.statsPrefix.name': '属性前缀',
	'settings.tracks.statsPrefix.desc':
		'「把轨迹数据写进属性」写出来的属性名怎么起：填 track 就是 track-distance-km、track-ascent-m 等等。',

	'settings.trackProps.heading': '轨迹属性',
	'settings.trackProps.intro':
		'「把轨迹数据写进属性」写哪几项，以及每项叫什么。关掉的那项不会写进去，笔记里已经有的也不会被删。名字留空就用框里显示的那个。',
	'settings.trackProps.count': '{total} 项里写 {on} 项',
	'settings.trackProps.figures.heading': '数据项',
	'settings.trackProps.write': '写入这一项',
	'settings.trackProps.distance.name': '距离',
	'settings.trackProps.ascent.name': '累计爬升',
	'settings.trackProps.descent.name': '累计下降',
	'settings.trackProps.lowest.name': '最低点',
	'settings.trackProps.highest.name': '最高点',
	'settings.trackProps.duration.name': '总时长',
	'settings.trackProps.moving.name': '移动时间',
	'settings.trackProps.speed.name': '平均速度',
	'settings.trackProps.start.name': '出发时间',

	'settings.photos.heading': '照片',
	'settings.photos.intro':
		'把笔记里链接的照片自身的位置画到地图上，读的是照片的 EXIF GPS 标签。照片只会被读取，也没有任何内容离开仓库。',
	'setting.showPhotos': '显示照片',
	'setting.showPhotos.desc': '在链接照片自身 EXIF GPS 标签给出的坐标处画一个图钉。',
	'setting.photoThumbnails': '显示照片缩略图',
	'setting.photoThumbnails.desc': '用照片自带的缩略图作为地图上的图标，代替一个普通的圆点。',
	'setting.photoDatum': '照片坐标系',
	'setting.photoDatum.desc':
		'EXIF GPS 坐标按规范应为 WGS-84。自动会在照片自己的 GPSMapDatum 标签给出坐标系时采信它，否则按 WGS-84 处理。',
	'setting.photoDatum.auto': '自动 · 采信照片自己的 GPSMapDatum（如果有）',
	'setting.photoDatum.wgs84': 'WGS-84 · EXIF 规范',
	'setting.photoDatum.gcj02': 'GCJ-02 · 强制指定',
	'setting.photoIndex': '清空照片索引',
	'setting.photoIndex.desc':
		'读过的照片会被记下来，下次打开库时不必再打开文件就能画出它的图钉。清空它不会改变任何一张地图，照片会在地图再要它们时重新读一遍。',
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
	} catch {
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
	const template = LOCALES[getLocale()][key];
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
		Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
	);
}

/** Exposed so a test can assert the tables stay in step. */
export const translations = LOCALES;
