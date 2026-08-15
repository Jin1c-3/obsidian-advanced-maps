/** File extensions this plugin knows how to draw. */
export const TRACK_EXTS = new Set(['gpx', 'geojson', 'kml', 'tcx']);

/** Photo extensions accepted by the EXIF-to-Point pipeline. */
export const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif']);

/** Maximum prefix retained while looking for EXIF metadata and its thumbnail. */
export const PHOTO_HEAD_BYTES = 65536;

/* This plugin's own source and layer ids. The native marker layer is
 * "marker-pins" on the "markers" source; tracks go in below it so a pin sitting
 * on its own track stays clickable. */
export const SRC = 'advanced-maps-tracks';
export const LINE_LAYER = 'advanced-maps-track-lines';
export const POINT_LAYER = 'advanced-maps-track-points';
/** Start/end pins and direction arrows sharing the track source. */
export const ENDPOINT_LAYER = 'advanced-maps-track-endpoints';
export const ARROW_LAYER = 'advanced-maps-track-arrows';
/** Decoded photo thumbnails; their Points share SRC with track features. */
export const PHOTO_LAYER = 'advanced-maps-photos';
/** Always-visible photo fallback and interaction target beneath PHOTO_LAYER. */
export const PHOTO_DOT_LAYER = 'advanced-maps-photo-dots';
export const MARKER_LAYER = 'marker-pins';

/** Prefix used only by `photoImageId()` for MapLibre image ids. */
export const PHOTO_ICON_PREFIX = 'advanced-maps-photo-';
/** CSS px a thumbnail icon draws at on the map. */
export const PHOTO_ICON_PX = 48;
/**
 * How many decoded thumbnails outside the current screen-space selection one
 * map keeps warm. Every selected visible icon is allowed; this bounds only the
 * LRU cache behind it and the conservative fallback when projection is absent.
 */
export const PHOTO_ICON_MAX = 240;

/* Inline profile hover uses a private wide hit source so shared track cleanup
 * can remove SRC without leaving a foreign layer attached. */
export const HIT_SRC = 'advanced-maps-track-hit-src';
export const HIT_LAYER = 'advanced-maps-track-hit';
export const CURSOR_SRC = 'advanced-maps-cursor-src';
export const CURSOR_LAYER = 'advanced-maps-cursor';

/** Bounded retry window for a lazily-created map targeted by a pop-up. */
export const FOCUS_RETRY_MS = 100;
export const FOCUS_TRIES = 30;

/** Pin spreading constants in CSS pixels; offsets ramp from `fromZoom` to `toZoom`. */
export const SPREAD = {
	fromZoom: 15,
	toZoom: 18,
	/** Centre-to-centre px, at `toZoom`, below which two pins are "the same spot". */
	groupPx: 26,
	/** The tightest ring drawn, for the two-note case that needs no more room. */
	ringMinPx: 24,
	/** Centre-to-centre spacing along a ring, and the gap between rings. */
	ringStepPx: 34,
	/** How wide the first ring may grow before a second one is opened outside it. */
	ringMaxPx: 140,
	/** Fallback native marker scale when its layout expression cannot be read. */
	iconScale: 0.24,
} as const;

/** Shared defaults, UI ranges, and wider bounds accepted from hand-edited YAML. */
export const TRACK_KNOBS = {
	trackWeight: { def: 4, min: 1, max: 12, step: 1, hardMin: 1, hardMax: 24 },
	trackOpacity: { def: 85, min: 10, max: 100, step: 5, hardMin: 0, hardMax: 100 },
	fitMaxZoom: { def: 16, min: 1, max: 20, step: 1, hardMin: 1, hardMax: 22 },
} as const;

export type TrackKnob = keyof typeof TRACK_KNOBS;
