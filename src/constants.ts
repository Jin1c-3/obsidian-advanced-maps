/** File extensions this plugin knows how to draw. */
export const TRACK_EXTS = new Set(['gpx', 'geojson', 'kml', 'tcx']);

/** File extensions this plugin will pull an EXIF GPS coordinate out of — see
 *  exif.ts. A photo is drawn through the exact same pipeline a track is: it
 *  becomes a one-Point ParsedTrack, so everywhere that already branches on
 *  TRACK_EXTS to decide "is this ours" needs PHOTO_EXTS beside it. */
export const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif']);

/**
 * How much of a photo file to read before giving up on finding EXIF in it.
 *
 * Measured on a real 3,052,138-byte Xiaomi motion photo: APP1(Exif) is the
 * very first segment, its own declared length is 3988 bytes counted from the
 * length field itself at offset 4, and everything EXIF states in that file —
 * GPS, orientation, the IFD1 thumbnail included — ends at byte 3992, 0.13% of
 * the file. Confirmed from the other direction by truncation: 1831 bytes is
 * the shortest prefix that yields the coordinate and 3992 the shortest that
 * yields the thumbnail. 65536 is 16x that measured figure:
 * headroom for a camera that writes a larger maker-note or a bigger embedded
 * thumbnail ahead of GPS, without ever reading anywhere near the whole photo.
 */
export const PHOTO_HEAD_BYTES = 65536;

/* This plugin's own source and layer ids. The native marker layer is
 * "marker-pins" on the "markers" source; tracks go in below it so a pin sitting
 * on its own track stays clickable. */
export const SRC = 'advanced-maps-tracks';
export const LINE_LAYER = 'advanced-maps-track-lines';
export const POINT_LAYER = 'advanced-maps-track-points';
/** Start/end pins and direction arrows — see layers.ts for why both are symbol
 *  layers sharing the track source rather than a source of their own. */
export const ENDPOINT_LAYER = 'advanced-maps-track-endpoints';
export const ARROW_LAYER = 'advanced-maps-track-arrows';
/** A photo's own layer — one Point per photo, sharing SRC (a photo is never
 *  given a source of its own; see HIT_SRC's comment above for the exact
 *  hazard that would create in removeTrackLayers()). Covers both a decoded
 *  thumbnail icon and, until one is ready or when the photo has none, a plain
 *  dot — POINT_LAYER's own filter excludes anything carrying amRole, which a
 *  photo always does. */
export const PHOTO_LAYER = 'advanced-maps-photos';
/**
 * The plain circle drawn under every photo, whether or not its thumbnail has
 * decoded yet — see `photoDotLayerSpec` in layers.ts for why two layers draw
 * one photo.
 *
 * It lived in layers.ts as a deliberately unexported private, on the reasoning
 * that `PHOTO_LAYER` was "the id whoever binds interactions to a photo
 * actually needs". Binding those interactions is what proved that wrong, and
 * exactly backwards: `PHOTO_LAYER` renders nothing at all for a photo whose
 * image is not registered — no thumbnail in the file, still decoding, or
 * `photoThumbnails` off — so a click bound only to it would leave precisely
 * the photos that are *only* a dot unclickable, which is the same set that is
 * hardest to tell apart from a track's own waypoints in the first place.
 */
export const PHOTO_DOT_LAYER = 'advanced-maps-photo-dots';
export const MARKER_LAYER = 'marker-pins';

/**
 * A photo's `map.addImage` id is this prefix plus the photo file's own vault
 * path — see track-cache.ts's `photoImageId`, the one place that formula is
 * written, so whoever registers the decoded bitmap and whoever's `icon-image`
 * expression looks it up can never drift apart on what the id is.
 */
export const PHOTO_ICON_PREFIX = 'advanced-maps-photo-';
/** CSS px a thumbnail icon draws at on the map. */
export const PHOTO_ICON_PX = 48;
/**
 * How many decoded thumbnails outside the current screen-space selection one
 * map keeps warm. Every selected visible icon is allowed; this bounds only the
 * LRU cache behind it and the conservative fallback when projection is absent.
 */
export const PHOTO_ICON_MAX = 240;

/* The elevation-profile hover link (inline embeds only — see embed.ts).
 * HIT_SRC/HIT_LAYER is a private copy of the track geometry under an
 * invisible, much wider line: MapLibre hits a line layer against its own
 * rendered width, and trackWeight's minimum (1 px, TRACK_KNOBS below) is not
 * something a reader can reliably point at. A private copy rather than a
 * second layer reading SRC: `removeTrackLayers()` in layers.ts (shared with
 * the base-view TrackLayer) does not know these ids exist and never touches
 * them, but it does call `removeSource(SRC)` — which throws if any layer
 * still references SRC, including a foreign one this module never told it
 * about. Its own source sidesteps that by construction rather than by a rule
 * to remember. CURSOR_SRC/CURSOR_LAYER is the moving dot itself. */
export const HIT_SRC = 'advanced-maps-track-hit-src';
export const HIT_LAYER = 'advanced-maps-track-hit';
export const CURSOR_SRC = 'advanced-maps-cursor-src';
export const CURSOR_LAYER = 'advanced-maps-cursor';

/**
 * How long to keep looking for the map a pop-up was opened to point at.
 *
 * A base opened in a leaf hands its TrackLayer back before `openFile` even
 * resolves, but an embedded base is built when the embed decides to load, and
 * there is no promise to await for that. Three seconds is far past what it takes
 * on a cold vault and is bounded rather than indefinite, because the thing being
 * waited for may never arrive at all — an embed of a base with no map view in it
 * never builds a map.
 */
export const FOCUS_RETRY_MS = 100;
export const FOCUS_TRIES = 30;

/**
 * The three track knobs, each stated once.
 *
 * `def` is the value `DEFAULT_SETTINGS` starts at and a blank view option falls
 * back to; `min`/`max`/`step` drive both the settings sliders and the per-view
 * option sliders, which offered the same range written out twice.
 *
 * `hardMax` is deliberately wider than `max` for two of the three, and is kept
 * as its own number rather than folded into it: the sliders are what a reader
 * can reach, but a base file is YAML somebody can edit by hand, and a value
 * typed in there is honoured up to this second bound rather than clipped back to
 * what the slider happens to offer. Collapsing the two would quietly re-clamp
 * every hand-written base.
 */
export const TRACK_KNOBS = {
	trackWeight: { def: 4, min: 1, max: 12, step: 1, hardMin: 1, hardMax: 24 },
	trackOpacity: { def: 85, min: 10, max: 100, step: 5, hardMin: 0, hardMax: 100 },
	fitMaxZoom: { def: 16, min: 1, max: 20, step: 1, hardMin: 1, hardMax: 22 },
} as const;

export type TrackKnob = keyof typeof TRACK_KNOBS;
