/** File extensions this plugin knows how to draw. */
export const TRACK_EXTS = new Set(['gpx', 'geojson', 'kml', 'tcx']);

/* This plugin's own source and layer ids. The native marker layer is
 * "marker-pins" on the "markers" source; tracks go in below it so a pin sitting
 * on its own track stays clickable. */
export const SRC = 'advanced-maps-tracks';
export const LINE_LAYER = 'advanced-maps-track-lines';
export const POINT_LAYER = 'advanced-maps-track-points';
export const MARKER_LAYER = 'marker-pins';
