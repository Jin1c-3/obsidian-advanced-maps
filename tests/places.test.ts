import { describe, expect, it } from 'vitest';
import { parseGpx, parseKml } from '../src/parse';
import {
	descriptionText,
	noteName,
	placesFrom,
	valueText,
	writeCsv,
	writeGpx,
	writeKml,
	writePlaces,
	type Place,
} from '../src/places';

function place(over: Partial<Place> = {}): Place {
	return { name: 'Bund', description: '', lat: 31.2304, lng: 121.4737, ...over };
}

describe('placesFrom', () => {
	it('takes the points and leaves the routes and areas', () => {
		const kml = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Bund</name><Point><coordinates>121.4737,31.2304</coordinates></Point></Placemark>
  <Placemark><name>Ridge</name><LineString><coordinates>121.4,31.2 121.5,31.3</coordinates></LineString></Placemark>
  <Placemark><name>Park</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
    121.0,31.0 121.1,31.0 121.1,31.1 121.0,31.0
  </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
  <Placemark><name>Nanjing Road</name><Point><coordinates>121.48,31.24</coordinates></Point></Placemark>
</Document></kml>`;
		const places = placesFrom(parseKml(kml).features, 'shanghai');

		expect(places.map((p) => p.name)).toEqual(['Bund', 'Nanjing Road']);
		expect(places[0]).toMatchObject({ lat: 31.2304, lng: 121.4737 });
	});

	it('names a nameless place after the file and its position among the points', () => {
		const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="31.1" lon="121.1"/>
  <wpt lat="31.2" lon="121.2"><name>Named</name></wpt>
  <wpt lat="31.3" lon="121.3"/>
</gpx>`;
		const places = placesFrom(parseGpx(gpx).features, 'saved');

		// Numbered by position among the points, so two unnamed ones stay apart.
		expect(places.map((p) => p.name)).toEqual(['saved 1', 'Named', 'saved 3']);
	});

	it('carries the description as the note body will hold it', () => {
		const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="31.1" lon="121.1"><name>Bund</name><desc>Go at night</desc></wpt>
</gpx>`;
		expect(placesFrom(parseGpx(gpx).features, 'x')[0].description).toBe('Go at night');
	});

	it('answers empty for a file holding no point at all', () => {
		const gpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
  <trkpt lat="31.1" lon="121.1"/><trkpt lat="31.2" lon="121.2"/>
</trkseg></trk></gpx>`;
		expect(placesFrom(parseGpx(gpx).features, 'x')).toEqual([]);
	});

	it('skips a point whose numbers are not usable', () => {
		const places = placesFrom(
			[
				{ type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [NaN, 31] } },
				{ type: 'Feature', properties: { name: 'Real' }, geometry: { type: 'Point', coordinates: [121, 31] } },
			],
			'x'
		);
		expect(places.map((p) => p.name)).toEqual(['Real']);
	});
});

describe('descriptionText', () => {
	it('keeps text that carries no markup', () => {
		expect(descriptionText('Go at night')).toBe('Go at night');
	});

	it('reduces markup to what it renders as, keeping the breaks', () => {
		// A `<br>` is a break inside a paragraph; a `</p>` ends one. Markdown tells
		// the two apart by how many newlines are there, so this has to as well.
		expect(descriptionText('<b>Go</b> at night.<br>Closed Mondays.')).toBe('Go at night.\nClosed Mondays.');
		expect(descriptionText('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
		expect(descriptionText('<ul><li>One</li><li>Two</li></ul>')).toBe('One\nTwo');
	});

	it('decodes entities exactly once', () => {
		expect(descriptionText('Tea &amp; cake')).toBe('Tea & cake');
		// Not twice: what was written as an escaped entity stays visible as one.
		expect(descriptionText('Tea &amp;amp; cake')).toBe('Tea &amp; cake');
	});

	it('leaves at most one blank line between paragraphs', () => {
		expect(descriptionText('<p>One</p><p></p><p></p><p>Two</p>')).toBe('One\n\nTwo');
	});

	it('survives markup a strict parser would reject', () => {
		// An unclosed tag is ordinary in a real KML description; an XML parse of
		// this throws away the whole description rather than its markup.
		expect(descriptionText('<p>Ask for the <i>set menu')).toBe('Ask for the set menu');
	});

	it('answers empty for nothing at all', () => {
		expect(descriptionText('')).toBe('');
		expect(descriptionText('   \n  ')).toBe('');
	});
});

describe('noteName', () => {
	it('replaces the characters a vault file name cannot hold', () => {
		const taken = new Set<string>();
		// A space rather than nothing, so the words do not run together.
		expect(noteName('Café: Sud', 'x', taken)).toBe('Café Sud');
		expect(noteName('a/b*c?', 'x', taken)).toBe('a b c');
	});

	it('falls back when a name sanitizes away to nothing', () => {
		expect(noteName('///', 'saved 3', new Set())).toBe('saved 3');
		expect(noteName('', '', new Set())).toBe('place');
	});

	it('gives two places of one name two note names', () => {
		const taken = new Set<string>();
		expect(noteName('Home', 'x', taken)).toBe('Home');
		expect(noteName('Home', 'x', taken)).toBe('Home 2');
		expect(noteName('Home', 'x', taken)).toBe('Home 3');
	});

	it('steps around a name the vault already holds, whatever its case', () => {
		const taken = new Set(['home']);
		expect(noteName('Home', 'x', taken)).toBe('Home 2');
	});

	it('drops the leading dot and the trailing dot a file system would', () => {
		expect(noteName('.hidden', 'x', new Set())).toBe('hidden');
		expect(noteName('trailing.', 'x', new Set())).toBe('trailing');
	});

	it('bounds the length', () => {
		expect(noteName('x'.repeat(400), 'y', new Set()).length).toBeLessThanOrEqual(80);
	});
});

describe('valueText', () => {
	it('reads whatever a Bases value stringifies to', () => {
		expect(valueText({ isTruthy: () => true, toString: () => 'Hangzhou' })).toBe('Hangzhou');
		expect(valueText({ isTruthy: () => true, toString: () => '2025-04-05T16:27:00' })).toBe('2025-04-05T16:27:00');
	});

	it('answers empty for a value that holds nothing', () => {
		expect(valueText(null)).toBe('');
		expect(valueText(undefined)).toBe('');
		// An empty value stringifies to "", a null one to the literal "null".
		expect(valueText({ isTruthy: () => false, toString: () => '' })).toBe('');
		expect(valueText({ toString: () => 'null' })).toBe('');
	});

	it('reads a value class that carries no isTruthy at all', () => {
		expect(valueText({ toString: () => '1' })).toBe('1');
	});
});

describe('the three writers', () => {
	const places = [
		place({ name: 'Bund', description: 'Go at night', path: 'places/Bund.md' }),
		place({ name: 'Park', lat: -3.5, lng: -60.25, path: 'places/Park.md' }),
	];

	it('writes GPX waypoints, latitude first', () => {
		const gpx = writeGpx(places);
		expect(gpx).toContain('<wpt lat="31.230400" lon="121.473700">');
		expect(gpx).toContain('<name>Bund</name>');
		expect(gpx).toContain('<desc>Go at night</desc>');
		// A place with no description writes no element for one.
		expect(gpx.match(/<desc>/g)).toHaveLength(1);
	});

	it('writes KML placemarks, longitude first', () => {
		const kml = writeKml(places);
		expect(kml).toContain('<coordinates>121.473700,31.230400</coordinates>');
		expect(kml).toContain('<coordinates>-60.250000,-3.500000</coordinates>');
		expect(kml).toContain('<description>Go at night</description>');
	});

	it('writes a CSV header and one row per place, saying which note each came from', () => {
		const rows = writeCsv(places).split('\r\n');
		expect(rows[0]).toBe('name,latitude,longitude,note');
		expect(rows[1]).toBe('Bund,31.230400,121.473700,places/Bund.md');
		expect(rows[2]).toBe('Park,-3.500000,-60.250000,places/Park.md');
	});

	it('routes each format through one entry point', () => {
		expect(writePlaces(places, 'gpx')).toBe(writeGpx(places));
		expect(writePlaces(places, 'kml')).toBe(writeKml(places));
		expect(writePlaces(places, 'csv')).toBe(writeCsv(places));
	});

	it('writes an empty list as a valid empty file', () => {
		expect(writeGpx([])).toContain('</gpx>');
		expect(writeKml([])).toContain('</kml>');
		expect(writeCsv([])).toBe('name,latitude,longitude,note\r\n');
	});
});

describe('escaping', () => {
	const awkward = place({ name: 'Tea & "cake" <here>', description: 'a & b', path: 'p/a,b.md' });

	it('escapes what XML reserves, and the ampersand exactly once', () => {
		const gpx = writeGpx([awkward]);
		expect(gpx).toContain('<name>Tea &amp; &quot;cake&quot; &lt;here&gt;</name>');
		expect(gpx).not.toContain('&amp;amp;');
	});

	it('quotes a CSV field holding a separator, a quote or a break', () => {
		const rows = writeCsv([
			place({ name: 'a,b' }),
			place({ name: 'say "hi"' }),
			place({ name: 'two\nlines' }),
		]).split('\r\n');
		expect(rows[1].startsWith('"a,b",')).toBe(true);
		expect(rows[2].startsWith('"say ""hi""",')).toBe(true);
		expect(rows[3].startsWith('"two\nlines",')).toBe(true);
	});
});

describe('a written file reads back', () => {
	const places = [
		place({ name: 'Tea & "cake" <here>', description: 'a & b' }),
		place({ name: '西湖', lat: 30.242, lng: 120.149 }),
	];

	it("through this plugin's own GPX reader", () => {
		const back = placesFrom(parseGpx(writeGpx(places)).features, 'x');
		expect(back.map((p) => p.name)).toEqual(['Tea & "cake" <here>', '西湖']);
		expect(back.map((p) => [p.lat, p.lng])).toEqual([
			[31.2304, 121.4737],
			[30.242, 120.149],
		]);
		expect(back[0].description).toBe('a & b');
	});

	it("through this plugin's own KML reader", () => {
		const back = placesFrom(parseKml(writeKml(places)).features, 'x');
		expect(back.map((p) => p.name)).toEqual(['Tea & "cake" <here>', '西湖']);
		expect(back.map((p) => [p.lat, p.lng])).toEqual([
			[31.2304, 121.4737],
			[30.242, 120.149],
		]);
	});
});
