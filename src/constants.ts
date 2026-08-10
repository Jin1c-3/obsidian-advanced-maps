/** File extensions this plugin knows how to draw. */
export const TRACK_EXTS = new Set(['gpx', 'geojson', 'kml', 'tcx']);

/* This plugin's own source and layer ids. The native marker layer is
 * "marker-pins" on the "markers" source; tracks go in below it so a pin sitting
 * on its own track stays clickable. */
export const SRC = 'advanced-maps-tracks';
export const LINE_LAYER = 'advanced-maps-track-lines';
export const POINT_LAYER = 'advanced-maps-track-points';
export const MARKER_LAYER = 'marker-pins';

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
