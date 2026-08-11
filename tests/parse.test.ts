import { describe, expect, it } from 'vitest';
import { parseGeoJson, parseGpx, parseKml, parseTcx, parseTrack } from '../src/parse';

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
		// GPX_TRACK's first point carries <ele>44</ele>; the rest do not, so this
		// also demonstrates a mixed-length LineString, which is legal GeoJSON.
		expect((features[0].geometry as { coordinates: number[][] }).coordinates[0]).toEqual([
			116.397428, 39.90923, 44,
		]);
		expect((features[0].geometry as { coordinates: number[][] }).coordinates[1]).toEqual([116.398, 39.91]);
	});

	it('reads segments, routes and waypoints together', () => {
		const { features, waypoints } = parseGpx(GPX_EVERYTHING);
		const types = features.map((f) => f.geometry.type);
		// two trksegs, one rte, one wpt
		expect(types.filter((t) => t === 'LineString')).toHaveLength(3);
		expect(types.filter((t) => t === 'Point')).toHaveLength(1);
		expect(waypoints).toBe(1);
		// GPX_EVERYTHING's <wpt> carries <name>Bund</name> — the waypoint's own
		// name, threaded through the same buildProperties() a KML placemark's
		// name already goes through.
		const point = features.find((f) => f.geometry.type === 'Point');
		expect(point?.properties).toEqual({ name: 'Bund' });
	});

	it('drops a segment that cannot make a line', () => {
		const single = `<gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk><wpt lat="3" lon="4"/></gpx>`;
		const { features } = parseGpx(single);
		expect(features).toHaveLength(1);
		expect(features[0].geometry.type).toBe('Point');
		// This <wpt> has no <name>, so the established null-properties contract
		// holds — not {} and not { name: undefined }.
		expect(features[0].properties).toBeNull();
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

describe('parseGpx elevation and time', () => {
	it('reads <ele> and <time> into 3-member positions and an aligned times array', () => {
		const gpx = `<gpx><trk><trkseg>
			<trkpt lat="39.9" lon="116.4"><ele>50</ele><time>2024-01-01T00:00:00Z</time></trkpt>
			<trkpt lat="39.91" lon="116.41"><ele>55</ele><time>2024-01-01T00:00:10Z</time></trkpt>
		</trkseg></trk></gpx>`;
		const { features } = parseGpx(gpx);
		const geometry = features[0].geometry as { coordinates: number[][] };
		expect(geometry.coordinates).toEqual([
			[116.4, 39.9, 50],
			[116.41, 39.91, 55],
		]);
		expect(features[0].properties).toEqual({
			times: [Date.parse('2024-01-01T00:00:00Z'), Date.parse('2024-01-01T00:00:10Z')],
		});
	});

	it('keeps properties null and positions 2-member when neither <ele> nor <time> is present', () => {
		const gpx = `<gpx><trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="3" lon="4"/></trkseg></trk></gpx>`;
		const { features } = parseGpx(gpx);
		expect(features[0].properties).toBeNull();
		expect((features[0].geometry as { coordinates: number[][] }).coordinates).toEqual([
			[2, 1],
			[4, 3],
		]);
	});

	it('leaves a hole — null, not a dropped point — where a point has no time', () => {
		const gpx = `<gpx><trk><trkseg>
			<trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt>
			<trkpt lat="3" lon="4"></trkpt>
			<trkpt lat="5" lon="6"><time>2024-01-01T00:00:20Z</time></trkpt>
		</trkseg></trk></gpx>`;
		const { features } = parseGpx(gpx);
		expect((features[0].properties as { times: (number | null)[] }).times).toEqual([
			Date.parse('2024-01-01T00:00:00Z'),
			null,
			Date.parse('2024-01-01T00:00:20Z'),
		]);
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

const TCX_NS = 'xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"';

describe('parseTcx', () => {
	it('reads a <Track> as one LineString, with altitude where a trackpoint states one', () => {
		const tcx = `<TrainingCenterDatabase ${TCX_NS}><Activities><Activity Sport="Running">
			<Lap StartTime="2024-01-01T00:00:00Z"><Track>
				<Trackpoint>
					<Time>2024-01-01T00:00:00Z</Time>
					<Position><LatitudeDegrees>39.9</LatitudeDegrees><LongitudeDegrees>116.4</LongitudeDegrees></Position>
					<AltitudeMeters>50.5</AltitudeMeters>
				</Trackpoint>
				<Trackpoint>
					<Time>2024-01-01T00:00:10Z</Time>
					<Position><LatitudeDegrees>39.91</LatitudeDegrees><LongitudeDegrees>116.41</LongitudeDegrees></Position>
				</Trackpoint>
			</Track></Lap>
		</Activity></Activities></TrainingCenterDatabase>`;
		const { features } = parseTcx(tcx);
		expect(features).toHaveLength(1);
		const geometry = features[0].geometry as { coordinates: number[][] };
		expect(geometry.coordinates[0]).toEqual([116.4, 39.9, 50.5]);
		expect(geometry.coordinates[1]).toEqual([116.41, 39.91]);
		expect((features[0].properties as { times: (number | null)[] }).times).toEqual([
			Date.parse('2024-01-01T00:00:00Z'),
			Date.parse('2024-01-01T00:00:10Z'),
		]);
	});

	it('skips a trackpoint with no <Position> rather than reading it as 0,0', () => {
		const tcx = `<TrainingCenterDatabase ${TCX_NS}><Activities><Activity Sport="Running">
			<Lap StartTime="2024-01-01T00:00:00Z"><Track>
				<Trackpoint>
					<Time>2024-01-01T00:00:00Z</Time>
					<Position><LatitudeDegrees>39.9</LatitudeDegrees><LongitudeDegrees>116.4</LongitudeDegrees></Position>
				</Trackpoint>
				<Trackpoint>
					<Time>2024-01-01T00:00:05Z</Time>
					<HeartRateBpm><Value>150</Value></HeartRateBpm>
				</Trackpoint>
				<Trackpoint>
					<Time>2024-01-01T00:00:10Z</Time>
					<Position><LatitudeDegrees>39.91</LatitudeDegrees><LongitudeDegrees>116.41</LongitudeDegrees></Position>
				</Trackpoint>
			</Track></Lap>
		</Activity></Activities></TrainingCenterDatabase>`;
		const { features } = parseTcx(tcx);
		const geometry = features[0].geometry as { coordinates: number[][] };
		expect(geometry.coordinates).toHaveLength(2);
		expect(geometry.coordinates).toEqual([
			[116.4, 39.9],
			[116.41, 39.91],
		]);
	});

	it('refuses input that is not XML at all', () => {
		expect(() => parseTcx('{"definitely": "json"}')).toThrow();
	});

	it('refuses a TCX with no track in it', () => {
		expect(() => parseTcx(`<TrainingCenterDatabase ${TCX_NS}></TrainingCenterDatabase>`)).toThrow(/no track/);
	});
});

const KML_NS = 'xmlns="http://www.opengis.net/kml/2.2"';

describe('parseKml', () => {
	it('reads a <LineString>, carrying the enclosing <Placemark> name, with and without elevation', () => {
		const kml = `<kml ${KML_NS}><Document>
			<Placemark>
				<name>Trail A</name>
				<LineString>
					<coordinates>
						116.397,39.909,44
						116.398,39.910,46
					</coordinates>
				</LineString>
			</Placemark>
			<Placemark>
				<LineString><coordinates>121.40,31.20 121.41,31.21</coordinates></LineString>
			</Placemark>
		</Document></kml>`;
		const { features } = parseKml(kml);
		expect(features).toHaveLength(2);
		expect((features[0].geometry as { coordinates: number[][] }).coordinates).toEqual([
			[116.397, 39.909, 44],
			[116.398, 39.91, 46],
		]);
		expect(features[0].properties).toEqual({ name: 'Trail A' });
		expect((features[1].geometry as { coordinates: number[][] }).coordinates).toEqual([
			[121.4, 31.2],
			[121.41, 31.21],
		]);
		expect(features[1].properties).toBeNull();
	});

	it('reads a bare <LineString> with no enclosing <Placemark> at all', () => {
		const kml = `<kml ${KML_NS}><LineString><coordinates>121.0,31.0 121.1,31.1</coordinates></LineString></kml>`;
		const { features } = parseKml(kml);
		expect(features).toHaveLength(1);
		expect(features[0].properties).toBeNull();
	});

	it('reads a <LinearRing> — a Polygon boundary — as a line', () => {
		const kml = `<kml ${KML_NS}><Placemark><Polygon><outerBoundaryIs><LinearRing>
			<coordinates>121.0,31.0 121.1,31.0 121.1,31.1 121.0,31.0</coordinates>
		</LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
		const { features } = parseKml(kml);
		expect(features).toHaveLength(1);
		expect(features[0].geometry.type).toBe('LineString');
	});

	it('reads a <Point>, carrying the placemark name', () => {
		const kml = `<kml ${KML_NS}><Placemark><name>Home</name><Point><coordinates>116.4,39.9</coordinates></Point></Placemark></kml>`;
		const { features } = parseKml(kml);
		expect(features).toHaveLength(1);
		expect(features[0].geometry.type).toBe('Point');
		expect((features[0].geometry as { coordinates: number[] }).coordinates).toEqual([116.4, 39.9]);
		expect(features[0].properties).toEqual({ name: 'Home' });
	});

	it('reads a <gx:Track>, pairing <when> with <gx:coord> into the times contract', () => {
		const kml = `<kml ${KML_NS} xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark>
			<name>Ride</name>
			<gx:Track>
				<when>2024-01-01T00:00:00Z</when>
				<gx:coord>116.4 39.9 50</gx:coord>
				<when>2024-01-01T00:00:10Z</when>
				<gx:coord>116.41 39.91 55</gx:coord>
			</gx:Track>
		</Placemark></kml>`;
		const { features } = parseKml(kml);
		expect(features).toHaveLength(1);
		expect((features[0].geometry as { coordinates: number[][] }).coordinates).toEqual([
			[116.4, 39.9, 50],
			[116.41, 39.91, 55],
		]);
		expect(features[0].properties).toEqual({
			name: 'Ride',
			times: [Date.parse('2024-01-01T00:00:00Z'), Date.parse('2024-01-01T00:00:10Z')],
		});
	});

	it('skips a malformed <gx:coord> and marks an unparseable <when> as null', () => {
		const kml = `<kml ${KML_NS} xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark>
			<gx:Track>
				<when>2024-01-01T00:00:00Z</when>
				<gx:coord>116.4 39.9</gx:coord>
				<when>not-a-date</when>
				<gx:coord>116.41 39.91</gx:coord>
				<when>2024-01-01T00:00:20Z</when>
				<gx:coord>oops</gx:coord>
			</gx:Track>
		</Placemark></kml>`;
		const { features } = parseKml(kml);
		const geometry = features[0].geometry as { coordinates: number[][] };
		expect(geometry.coordinates).toEqual([
			[116.4, 39.9],
			[116.41, 39.91],
		]);
		expect((features[0].properties as { times: (number | null)[] }).times).toEqual([
			Date.parse('2024-01-01T00:00:00Z'),
			null,
		]);
	});

	it('finds gx:Track, <when> and <gx:coord> by local name regardless of the alias a document gives the gx namespace', () => {
		// Nothing requires "gx" specifically — the namespace URI is what's fixed —
		// so a document is free to alias it as "ext" instead.
		const kml = `<kml ${KML_NS} xmlns:ext="http://www.google.com/kml/ext/2.2"><Placemark>
			<ext:Track>
				<when>2024-01-01T00:00:00Z</when>
				<ext:coord>116.4 39.9</ext:coord>
				<when>2024-01-01T00:00:10Z</when>
				<ext:coord>116.41 39.91</ext:coord>
			</ext:Track>
		</Placemark></kml>`;
		const { features } = parseKml(kml);
		expect(features).toHaveLength(1);
		expect((features[0].geometry as { coordinates: number[][] }).coordinates).toEqual([
			[116.4, 39.9],
			[116.41, 39.91],
		]);
	});

	it('reads a KML document whose every element carries a namespace prefix', () => {
		const kml = `<?xml version="1.0"?><kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Document>
			<kml:Placemark>
				<kml:name>Prefixed</kml:name>
				<kml:LineString>
					<kml:coordinates>116.4,39.9 116.41,39.91 116.42,39.92</kml:coordinates>
				</kml:LineString>
			</kml:Placemark>
		</kml:Document></kml:kml>`;
		const { features } = parseKml(kml);
		expect(features).toHaveLength(1);
		expect((features[0].geometry as { coordinates: number[][] }).coordinates).toHaveLength(3);
		expect(features[0].properties).toEqual({ name: 'Prefixed' });
	});

	it('refuses input that is not XML at all', () => {
		expect(() => parseKml('{"definitely": "json"}')).toThrow();
	});

	it('refuses a KML with nothing drawable in it', () => {
		expect(() => parseKml(`<kml ${KML_NS}></kml>`)).toThrow(/no drawable geometry/);
	});
});

describe('parseTrack', () => {
	it('picks the reader by extension', () => {
		expect(parseTrack(GPX_TRACK, 'gpx').features).toHaveLength(1);
		expect(parseTrack(JSON.stringify({ type: 'Point', coordinates: [1, 2] }), 'geojson').features).toHaveLength(1);
	});

	it('routes .kml to parseKml and .tcx to parseTcx', () => {
		const kml = `<kml ${KML_NS}><Placemark><LineString><coordinates>121.0,31.0 121.1,31.1</coordinates></LineString></Placemark></kml>`;
		expect(parseTrack(kml, 'kml').features).toHaveLength(1);

		const tcx = `<TrainingCenterDatabase ${TCX_NS}><Activities><Activity Sport="Running"><Lap><Track>
			<Trackpoint><Position><LatitudeDegrees>1</LatitudeDegrees><LongitudeDegrees>2</LongitudeDegrees></Position></Trackpoint>
			<Trackpoint><Position><LatitudeDegrees>3</LatitudeDegrees><LongitudeDegrees>4</LongitudeDegrees></Position></Trackpoint>
		</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
		expect(parseTrack(tcx, 'tcx').features).toHaveLength(1);
	});
});

/*
 * One walk, four formats.
 *
 * The point of a shared fixture is that geometry, elevation and time are
 * identical across all four by construction, so anything the readers disagree
 * about is a reader's fault. Each format alone can pass its own tests while
 * quietly transposing an axis or dropping a decimal; only a comparison catches
 * that. It is also what makes a fifth format cheap — write it, put it here, and
 * the numbers either match or they do not.
 */
const WALK = [
	{ lon: 120.101392, lat: 30.252234, ele: 12, time: '2026-03-21T00:12:00Z' },
	{ lon: 120.103, lat: 30.2535, ele: 48, time: '2026-03-21T00:24:30Z' },
	{ lon: 120.1045, lat: 30.2551, ele: 104, time: '2026-03-21T00:39:10Z' },
	{ lon: 120.1061, lat: 30.2566, ele: 195, time: '2026-03-21T00:58:45Z' },
];

const asGpx = () => `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
	${WALK.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele><time>${p.time}</time></trkpt>`).join('')}
</trkseg></trk></gpx>`;

const asTcx = () => `<TrainingCenterDatabase ${TCX_NS}><Activities><Activity Sport="Hiking"><Lap><Track>
	${WALK.map(
		(p) => `<Trackpoint><Time>${p.time}</Time><Position>
			<LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lon}</LongitudeDegrees>
		</Position><AltitudeMeters>${p.ele}</AltitudeMeters></Trackpoint>`
	).join('')}
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;

const asKml = () => `<kml ${KML_NS}><Document><Placemark><LineString><coordinates>
	${WALK.map((p) => `${p.lon},${p.lat},${p.ele}`).join('\n\t')}
</coordinates></LineString></Placemark></Document></kml>`;

const asGxKml = () => `<kml ${KML_NS} xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Placemark><gx:Track>
	${WALK.map((p) => `<when>${p.time}</when><gx:coord>${p.lon} ${p.lat} ${p.ele}</gx:coord>`).join('')}
</gx:Track></Placemark></Document></kml>`;

describe('one walk, four formats', () => {
	const expected = WALK.map((p) => [p.lon, p.lat, p.ele]);
	const expectedTimes = WALK.map((p) => Date.parse(p.time));
	const lineOf = (text: string, ext: string) => {
		const line = parseTrack(text, ext).features.find((f) => f.geometry.type === 'LineString');
		if (!line) throw new Error(`${ext} produced no LineString`);
		return line;
	};

	it.each([
		['gpx', asGpx(), 'gpx'],
		['tcx', asTcx(), 'tcx'],
		['kml', asKml(), 'kml'],
		['kml gx:Track', asGxKml(), 'kml'],
	])('%s reads the same coordinates and elevations', (_name, text, ext) => {
		expect(lineOf(text, ext).geometry).toMatchObject({ type: 'LineString', coordinates: expected });
	});

	it.each([
		['gpx', asGpx(), 'gpx'],
		['tcx', asTcx(), 'tcx'],
		['kml gx:Track', asGxKml(), 'kml'],
	])('%s reads the same timestamps', (_name, text, ext) => {
		expect(lineOf(text, ext).properties?.times).toEqual(expectedTimes);
	});

	it('plain KML carries no time, and says so by leaving the key off', () => {
		expect(lineOf(asKml(), 'kml').properties?.times).toBeUndefined();
	});
});
