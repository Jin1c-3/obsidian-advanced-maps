import { describe, expect, it } from 'vitest';
import { parseGeoJson, parseGpx, parseTrack } from '../src/parse';

const GPX_TRACK = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Morning</name><trkseg>
    <trkpt lat="39.90923" lon="116.397428"><ele>44</ele></trkpt>
    <trkpt lat="39.91" lon="116.398"></trkpt>
    <trkpt lat="39.911" lon="116.399"></trkpt>
  </trkseg></trk>
</gpx>`;

const GPX_EVERYTHING = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="31.2304" lon="121.4737"><name>Bund</name></wpt>
  <rte>
    <rtept lat="31.20" lon="121.40"/>
    <rtept lat="31.21" lon="121.41"/>
  </rte>
  <trk><trkseg>
    <trkpt lat="31.1" lon="121.3"/>
    <trkpt lat="31.2" lon="121.4"/>
  </trkseg>
  <trkseg>
    <trkpt lat="31.3" lon="121.5"/>
    <trkpt lat="31.4" lon="121.6"/>
  </trkseg></trk>
</gpx>`;

describe('parseGpx', () => {
	it('reads a track segment as one LineString, longitude first', () => {
		const { features } = parseGpx(GPX_TRACK);
		expect(features).toHaveLength(1);
		expect(features[0].geometry.type).toBe('LineString');
		expect((features[0].geometry as { coordinates: number[][] }).coordinates[0]).toEqual([116.397428, 39.90923]);
	});

	it('reads segments, routes and waypoints together', () => {
		const { features, waypoints } = parseGpx(GPX_EVERYTHING);
		const types = features.map((f) => f.geometry.type);
		// two trksegs, one rte, one wpt
		expect(types.filter((t) => t === 'LineString')).toHaveLength(3);
		expect(types.filter((t) => t === 'Point')).toHaveLength(1);
		expect(waypoints).toBe(1);
	});

	it('drops a segment that cannot make a line', () => {
		const single = `<gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk><wpt lat="3" lon="4"/></gpx>`;
		const { features } = parseGpx(single);
		expect(features).toHaveLength(1);
		expect(features[0].geometry.type).toBe('Point');
	});

	it('ignores points with unusable coordinates', () => {
		const messy = `<gpx><trk><trkseg>
			<trkpt lat="39.9" lon="116.4"/>
			<trkpt lat="oops" lon="116.5"/>
			<trkpt lon="116.6"/>
			<trkpt lat="39.95" lon="116.45"/>
		</trkseg></trk></gpx>`;
		const { features } = parseGpx(messy);
		expect((features[0].geometry as { coordinates: number[][] }).coordinates).toEqual([
			[116.4, 39.9],
			[116.45, 39.95],
		]);
	});

	it('refuses a GPX with nothing drawable in it', () => {
		expect(() => parseGpx('<gpx></gpx>')).toThrow(/no track, route or waypoint/);
	});

	it('refuses input that is not XML at all', () => {
		expect(() => parseGpx('{"definitely": "json"}')).toThrow();
	});
});

describe('parseGeoJson', () => {
	it('takes a FeatureCollection and drops geometry-less members', () => {
		const text = JSON.stringify({
			type: 'FeatureCollection',
			features: [
				{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
				{ type: 'Feature', geometry: null, properties: {} },
				null,
			],
		});
		expect(parseGeoJson(text).features).toHaveLength(1);
	});

	it('takes a bare Feature', () => {
		const text = JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } });
		expect(parseGeoJson(text).features).toHaveLength(1);
	});

	it('takes a Feature with no geometry as nothing to draw', () => {
		expect(parseGeoJson(JSON.stringify({ type: 'Feature', geometry: null })).features).toEqual([]);
	});

	it('wraps a bare geometry in a Feature', () => {
		const { features } = parseGeoJson(JSON.stringify({ type: 'LineString', coordinates: [[1, 2]] }));
		expect(features).toHaveLength(1);
		expect(features[0].geometry.type).toBe('LineString');
	});

	it('refuses an object with no type, and non-objects', () => {
		expect(() => parseGeoJson('{"features": []}')).toThrow(/not a GeoJSON object/);
		expect(() => parseGeoJson('null')).toThrow(/not a GeoJSON object/);
		expect(() => parseGeoJson('"a string"')).toThrow(/not a GeoJSON object/);
	});

	it('lets a JSON syntax error through', () => {
		expect(() => parseGeoJson('{oops')).toThrow();
	});
});

describe('parseTrack', () => {
	it('picks the reader by extension', () => {
		expect(parseTrack(GPX_TRACK, 'gpx').features).toHaveLength(1);
		expect(parseTrack(JSON.stringify({ type: 'Point', coordinates: [1, 2] }), 'geojson').features).toHaveLength(1);
	});
});
