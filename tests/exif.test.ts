import { describe, expect, it } from 'vitest';
import { findExif, parseExif, photoTrack, photoWgs84, readTiffExif } from '../src/exif';
import type { PhotoExif } from '../src/exif';
import { gcj2wgs, wgs2gcj } from '../src/coords';

/* ------------------------------------------------------------------------ *
 * A byte-level TIFF/EXIF builder, independent of src/exif.ts's own reading
 * code — this constructs fixtures the way a camera would write them, so a
 * passing test says the reader understands the real format rather than its
 * own writer's shortcuts. Same reasoning as parse.ts's "same track in four
 * formats" tests: geometry built once by hand and read back through four
 * different decoders is a stronger proof than each decoder checking itself.
 * ------------------------------------------------------------------------ */

function u16be(v: number): number[] {
	return [(v >>> 8) & 0xff, v & 0xff];
}
function u32be(v: number): number[] {
	return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}
function asciiBytes(s: string): number[] {
	return [...s].map((c) => c.charCodeAt(0));
}

const EXIF_PREFIX = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

function writeU16(buf: number[], off: number, v: number, little: boolean): void {
	const b0 = v & 0xff;
	const b1 = (v >> 8) & 0xff;
	if (little) {
		buf[off] = b0;
		buf[off + 1] = b1;
	} else {
		buf[off] = b1;
		buf[off + 1] = b0;
	}
}
function writeU32(buf: number[], off: number, v: number, little: boolean): void {
	const b0 = v & 0xff;
	const b1 = (v >>> 8) & 0xff;
	const b2 = (v >>> 16) & 0xff;
	const b3 = (v >>> 24) & 0xff;
	if (little) {
		buf[off] = b0;
		buf[off + 1] = b1;
		buf[off + 2] = b2;
		buf[off + 3] = b3;
	} else {
		buf[off] = b3;
		buf[off + 1] = b2;
		buf[off + 2] = b1;
		buf[off + 3] = b0;
	}
}

type Entry =
	| { tag: number; type: 1; values: number[] } // BYTE
	| { tag: number; type: 2; text: string } // ASCII, null-terminated
	| { tag: number; type: 3; values: number[] } // SHORT
	| { tag: number; type: 4; values: number[] } // LONG
	| { tag: number; type: 5; values: Array<[number, number]> }; // RATIONAL, [num, den]

function entryCount(e: Entry): number {
	return e.type === 2 ? e.text.length + 1 : e.values.length;
}
function entrySize(e: Entry): number {
	switch (e.type) {
		case 1:
			return e.values.length;
		case 2:
			return e.text.length + 1;
		case 3:
			return e.values.length * 2;
		case 4:
			return e.values.length * 4;
		case 5:
			return e.values.length * 8;
	}
}
function writeEntryValue(buf: number[], pos: number, e: Entry, little: boolean): void {
	switch (e.type) {
		case 1:
			e.values.forEach((v, i) => (buf[pos + i] = v & 0xff));
			return;
		case 2: {
			const bytes = asciiBytes(e.text);
			bytes.forEach((b, i) => (buf[pos + i] = b));
			buf[pos + bytes.length] = 0;
			return;
		}
		case 3:
			e.values.forEach((v, i) => writeU16(buf, pos + i * 2, v, little));
			return;
		case 4:
			e.values.forEach((v, i) => writeU32(buf, pos + i * 4, v, little));
			return;
		case 5:
			e.values.forEach(([num, den], i) => {
				writeU32(buf, pos + i * 8, num, little);
				writeU32(buf, pos + i * 8 + 4, den, little);
			});
			return;
	}
}

/** One IFD: entry count, each 12-byte entry (inline or offset to `dataOffset`
 *  onward), and the trailing next-IFD pointer. `start` and the entries'
 *  shapes are all the caller supplies; this only knows how to lay one out. */
function writeIfdAt(buf: number[], start: number, entries: Entry[], nextIfd: number, little: boolean): void {
	writeU16(buf, start, entries.length, little);
	let dataOffset = start + 2 + entries.length * 12 + 4;
	let p = start + 2;
	for (const e of entries) {
		writeU16(buf, p, e.tag, little);
		writeU16(buf, p + 2, e.type, little);
		writeU32(buf, p + 4, entryCount(e), little);
		const size = entrySize(e);
		if (size <= 4) {
			writeEntryValue(buf, p + 8, e, little);
		} else {
			writeU32(buf, p + 8, dataOffset, little);
			writeEntryValue(buf, dataOffset, e, little);
			dataOffset += size;
		}
		p += 12;
	}
	writeU32(buf, p, nextIfd, little);
}

function ifdByteSize(entries: Entry[]): number {
	const dataSize = entries.reduce((s, e) => s + (entrySize(e) > 4 ? entrySize(e) : 0), 0);
	return 2 + entries.length * 12 + 4 + dataSize;
}

/** Decimal degrees -> the three unsigned RATIONALs GPSLatitude/GPSLongitude
 *  are written as. The sign lives in the Ref tag, never here — real files
 *  never write a negative rational. */
function toDms(decimal: number): Array<[number, number]> {
	const abs = Math.abs(decimal);
	const d = Math.floor(abs);
	const mFull = (abs - d) * 60;
	const m = Math.floor(mFull);
	const sFull = (mFull - m) * 60;
	const denom = 1000000;
	return [
		[d, 1],
		[m, 1],
		[Math.round(sFull * denom), denom],
	];
}

interface GpsOpts {
	lat: number;
	latRef: 'N' | 'S';
	lng: number;
	lngRef: 'E' | 'W';
	alt?: number;
	altRef?: 0 | 1;
	dateStamp?: string;
	timeStamp?: [number, number, number];
	datum?: string;
}

function gpsEntries(opts: GpsOpts): Entry[] {
	const entries: Entry[] = [
		{ tag: 0x0001, type: 2, text: opts.latRef },
		{ tag: 0x0002, type: 5, values: toDms(opts.lat) },
		{ tag: 0x0003, type: 2, text: opts.lngRef },
		{ tag: 0x0004, type: 5, values: toDms(opts.lng) },
	];
	if (opts.alt != null) {
		entries.push({ tag: 0x0005, type: 1, values: [opts.altRef ?? 0] });
		entries.push({ tag: 0x0006, type: 5, values: [[Math.round(Math.abs(opts.alt) * 10000), 10000]] });
	}
	if (opts.timeStamp) entries.push({ tag: 0x0007, type: 5, values: opts.timeStamp.map((v) => [v, 1]) });
	if (opts.dateStamp) entries.push({ tag: 0x001d, type: 2, text: opts.dateStamp });
	if (opts.datum) entries.push({ tag: 0x0012, type: 2, text: opts.datum });
	return entries;
}

interface TiffOpts {
	little: boolean;
	orientation?: number;
	gps?: GpsOpts;
	exif?: { dateTimeOriginal?: string; offsetTimeOriginal?: string };
	thumbnail?: { bytes: number[]; width?: number; height?: number };
	/** Overrides IFD0's own next-IFD pointer — used to test a
	 *  backward/self-referencing pointer without a real IFD1 behind it. */
	ifd0NextOverride?: number;
}

interface BuiltTiff {
	bytes: Uint8Array;
	ifd0Start: number;
	ifd1Start: number;
	thumbStart: number;
}

function buildTiff(opts: TiffOpts): BuiltTiff {
	const little = opts.little;
	const hasGps = opts.gps != null;
	const hasExif = opts.exif != null;
	const hasThumb = opts.thumbnail != null;

	const ifd0Count = (opts.orientation != null ? 1 : 0) + (hasExif ? 1 : 0) + (hasGps ? 1 : 0);
	const ifd0Size = 2 + ifd0Count * 12 + 4;

	let cursor = 8;
	const ifd0Start = cursor;
	cursor += ifd0Size;

	let gpsStart = 0;
	let gEntries: Entry[] = [];
	if (hasGps) {
		gEntries = gpsEntries(opts.gps!);
		gpsStart = cursor;
		cursor += ifdByteSize(gEntries);
	}

	let exifStart = 0;
	const eEntries: Entry[] = [];
	if (hasExif) {
		if (opts.exif!.dateTimeOriginal) eEntries.push({ tag: 0x9003, type: 2, text: opts.exif!.dateTimeOriginal });
		if (opts.exif!.offsetTimeOriginal) eEntries.push({ tag: 0x9011, type: 2, text: opts.exif!.offsetTimeOriginal });
		exifStart = cursor;
		cursor += ifdByteSize(eEntries);
	}

	let ifd1Start = 0;
	let ifd1Entries: Entry[] = [];
	let thumbStart = 0;
	if (hasThumb) {
		const thumb = opts.thumbnail!;
		ifd1Entries = [{ tag: 0x0103, type: 3, values: [6] }];
		if (thumb.width != null) ifd1Entries.push({ tag: 0x0100, type: 3, values: [thumb.width] });
		if (thumb.height != null) ifd1Entries.push({ tag: 0x0101, type: 3, values: [thumb.height] });
		ifd1Entries.push({ tag: 0x0201, type: 4, values: [0] }); // patched below
		ifd1Entries.push({ tag: 0x0202, type: 4, values: [thumb.bytes.length] });
		ifd1Start = cursor;
		cursor += 2 + ifd1Entries.length * 12 + 4; // every field above is inline; no data segment
		thumbStart = cursor;
		cursor += thumb.bytes.length;
		const offEntry = ifd1Entries.find((e) => e.tag === 0x0201)!;
		(offEntry as { values: number[] }).values = [thumbStart];
	}

	const total = cursor;
	const buf = new Array<number>(total).fill(0);
	buf[0] = little ? 0x49 : 0x4d;
	buf[1] = little ? 0x49 : 0x4d;
	writeU16(buf, 2, 42, little);
	writeU32(buf, 4, ifd0Start, little);

	const ifd0Entries: Entry[] = [];
	if (opts.orientation != null) ifd0Entries.push({ tag: 0x0112, type: 3, values: [opts.orientation] });
	if (hasExif) ifd0Entries.push({ tag: 0x8769, type: 4, values: [exifStart] });
	if (hasGps) ifd0Entries.push({ tag: 0x8825, type: 4, values: [gpsStart] });

	const ifd0Next = opts.ifd0NextOverride ?? (hasThumb ? ifd1Start : 0);
	writeIfdAt(buf, ifd0Start, ifd0Entries, ifd0Next, little);
	if (hasGps) writeIfdAt(buf, gpsStart, gEntries, 0, little);
	if (hasExif) writeIfdAt(buf, exifStart, eEntries, 0, little);
	if (hasThumb) {
		writeIfdAt(buf, ifd1Start, ifd1Entries, 0, little);
		opts.thumbnail!.bytes.forEach((b, i) => (buf[thumbStart + i] = b));
	}

	return { bytes: new Uint8Array(buf), ifd0Start, ifd1Start, thumbStart };
}

/* ---- Container wrappers, one per format the real feature must read. ---- */

function wrapJpeg(tiff: Uint8Array): Uint8Array {
	const len = 2 + EXIF_PREFIX.length + tiff.length; // the length field counts itself
	return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...u16be(len), ...EXIF_PREFIX, ...tiff, 0xff, 0xd9]);
}

function pngChunk(type: string, data: number[]): number[] {
	return [...u32be(data.length), ...asciiBytes(type), ...data, 0, 0, 0, 0]; // CRC unchecked by our reader
}

function wrapPng(tiff: Uint8Array): Uint8Array {
	const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	return new Uint8Array([...sig, ...pngChunk('eXIf', Array.from(tiff))]);
}

function wrapWebp(tiff: Uint8Array, withPrefix: boolean): Uint8Array {
	const data = withPrefix ? [...EXIF_PREFIX, ...Array.from(tiff)] : Array.from(tiff);
	const padded = data.length % 2 === 1 ? [...data, 0] : data;
	const chunk = [...asciiBytes('EXIF'), ...u32be(padded.length).slice().reverse(), ...padded];
	const riffSize = 4 + chunk.length; // "WEBP" + chunk
	return new Uint8Array([...asciiBytes('RIFF'), ...u32be(riffSize).reverse(), ...asciiBytes('WEBP'), ...chunk]);
}

function fullBoxHeader(version: number): number[] {
	return [version, 0, 0, 0];
}
function isobmffBox(type: string, body: number[]): number[] {
	return [...u32be(8 + body.length), ...asciiBytes(type), ...body];
}

function wrapIsobmff(tiff: Uint8Array): Uint8Array {
	const ftypBytes = isobmffBox('ftyp', [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')]);
	const infeBytes = isobmffBox('infe', [...fullBoxHeader(2), ...u16be(1), ...u16be(0), ...asciiBytes('Exif')]);
	const iinfBytes = isobmffBox('iinf', [...fullBoxHeader(0), ...u16be(1), ...infeBytes]);

	const buildIloc = (extOffset: number, extLength: number) =>
		isobmffBox('iloc', [
			...fullBoxHeader(0),
			0x44, // offsetSize=4, lengthSize=4
			0x00, // baseOffsetSize=0, indexSize=0
			...u16be(1), // item_count
			...u16be(1), // item_ID
			...u16be(0), // data_reference_index
			...u16be(1), // extent_count (no base_offset field: baseOffsetSize is 0)
			...u32be(extOffset),
			...u32be(extLength),
		]);

	const ilocLenProbe = buildIloc(0, 0).length; // structural length; value-independent
	const metaBoxLen = 8 + 4 + iinfBytes.length + ilocLenProbe; // header + fullbox + children
	const exifPayloadOffset = ftypBytes.length + metaBoxLen;
	const exifPayload = [...u32be(0), ...EXIF_PREFIX, ...Array.from(tiff)];
	const ilocBytes = buildIloc(exifPayloadOffset, exifPayload.length);
	const metaBytes = isobmffBox('meta', [...fullBoxHeader(0), ...iinfBytes, ...ilocBytes]);

	return new Uint8Array([...ftypBytes, ...metaBytes, ...exifPayload]);
}

/* ---- A more tunable ISOBMFF builder, for the box-tree's own edge cases:
 * alternate `infe`/`iloc` versions, multi-byte field sizes, an extra
 * non-matching item ahead of the real one, and a 64-bit box size — the shapes
 * `findExifIsobmff`'s helpers exist to survive, not just the one shape a real
 * HEIC/AVIF encoder happens to write today. ---- */

function reframe64(type: string, body: number[]): number[] {
	// size field == 1 signals "read a 64-bit size next"; the 32-bit field
	// itself is unused and conventionally zero.
	return [...u32be(1), ...asciiBytes(type), ...u32be(0), ...u32be(16 + body.length), ...body];
}

function buildInfe(itemId: number, itemType: string, version: 2 | 3): number[] {
	const idBytes = version === 3 ? u32be(itemId) : u16be(itemId);
	return isobmffBox('infe', [...fullBoxHeader(version), ...idBytes, ...u16be(0), ...asciiBytes(itemType)]);
}

function buildIinfCustom(items: number[][], version: number): number[] {
	const countBytes = version === 0 ? u16be(items.length) : u32be(items.length);
	return isobmffBox('iinf', [...fullBoxHeader(version), ...countBytes, ...items.flat()]);
}

interface IlocShape {
	version: number;
	offsetSize: number;
	lengthSize: number;
	baseOffsetSize: number;
	indexSize: number;
}

function ilocEntry(shape: IlocShape, itemId: number, extentOffset: number, extentLength: number): number[] {
	const sized = (size: number, v: number) => (size === 8 ? [...u32be(0), ...u32be(v)] : size === 4 ? u32be(v) : []);
	const idBytes = shape.version < 2 ? u16be(itemId) : u32be(itemId);
	const constructionMethod = shape.version === 1 || shape.version === 2 ? u16be(0) : [];
	const indexBytes =
		(shape.version === 1 || shape.version === 2) && shape.indexSize > 0
			? new Array<number>(shape.indexSize).fill(0)
			: [];
	return [
		...idBytes,
		...constructionMethod,
		...u16be(0), // data_reference_index
		...sized(shape.baseOffsetSize, 0),
		...u16be(1), // extent_count
		...indexBytes,
		...sized(shape.offsetSize, extentOffset),
		...sized(shape.lengthSize, extentLength),
	];
}

function buildIlocCustom(
	shape: IlocShape,
	items: Array<{ itemId: number; extentOffset: number; extentLength: number }>
): number[] {
	const sizesByte1 = (shape.offsetSize << 4) | shape.lengthSize;
	const sizesByte2 = (shape.baseOffsetSize << 4) | shape.indexSize;
	const countBytes = shape.version < 2 ? u16be(items.length) : u32be(items.length);
	const itemBytes = items.flatMap((it) => ilocEntry(shape, it.itemId, it.extentOffset, it.extentLength));
	return isobmffBox('iloc', [...fullBoxHeader(shape.version), sizesByte1, sizesByte2, ...countBytes, ...itemBytes]);
}

interface HeicOpts {
	ftyp64?: boolean;
	iinfVersion?: number;
	infeVersion?: 2 | 3;
	iloc?: Partial<IlocShape>;
	itemId?: number;
	itemType?: string;
	/** A second, non-matching item ahead of the real one in both `iinf` and
	 *  `iloc` — exercises the "skip and keep looking" branch in each walker. */
	extraItem?: boolean;
	/** Inserts an "Exif\0\0" padding marker before TIFF; a valid declared
	 *  offset still points past it directly to the TIFF header. */
	exifPrefixBeforeTiff?: boolean;
	/** Writes a bogus, non-resolving declared offset in the Exif item's own
	 *  4-byte header field. */
	badDeclaredOffset?: boolean;
}

function buildHeic(tiff: Uint8Array, opts: HeicOpts = {}): Uint8Array {
	const iinfVersion = opts.iinfVersion ?? 0;
	const infeVersion = opts.infeVersion ?? 2;
	const shape: IlocShape = {
		version: 0,
		offsetSize: 4,
		lengthSize: 4,
		baseOffsetSize: 0,
		indexSize: 0,
		...opts.iloc,
	};
	const itemId = opts.itemId ?? 1;
	const itemType = opts.itemType ?? 'Exif';

	const ftypBody = [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')];
	const ftypBytes = opts.ftyp64 ? reframe64('ftyp', ftypBody) : isobmffBox('ftyp', ftypBody);

	const infeItems: number[][] = [];
	const ilocItems: Array<{ itemId: number; extentOffset: number; extentLength: number }> = [];
	if (opts.extraItem) {
		infeItems.push(buildInfe(9, 'mime', infeVersion));
		ilocItems.push({ itemId: 9, extentOffset: 0, extentLength: 0 });
	}
	infeItems.push(buildInfe(itemId, itemType, infeVersion));
	ilocItems.push({ itemId, extentOffset: 0, extentLength: 0 }); // offset patched below

	const iinfBytes = buildIinfCustom(infeItems, iinfVersion);
	const probe = buildIlocCustom(shape, ilocItems).length; // value-independent structural length

	const metaBoxLen = 8 + 4 + iinfBytes.length + probe;
	const exifPayloadOffset = ftypBytes.length + metaBoxLen;
	const padding = opts.exifPrefixBeforeTiff ? EXIF_PREFIX : [];
	const declaredOffset = opts.badDeclaredOffset ? 999999 : padding.length;
	const exifPayload = [...u32be(declaredOffset), ...padding, ...Array.from(tiff)];

	ilocItems[ilocItems.length - 1] = { itemId, extentOffset: exifPayloadOffset, extentLength: exifPayload.length };
	const ilocBytes = buildIlocCustom(shape, ilocItems);
	const metaBytes = isobmffBox('meta', [...fullBoxHeader(0), ...iinfBytes, ...ilocBytes]);

	return new Uint8Array([...ftypBytes, ...metaBytes, ...exifPayload]);
}

/* ------------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------------ */

const HANGZHOU: GpsOpts = {
	lat: 30.269453,
	latRef: 'N',
	lng: 120.118832,
	lngRef: 'E',
	alt: 12.5,
	altRef: 0,
	dateStamp: '2026:08:12',
	timeStamp: [6, 19, 10],
};

const TINY_JPEG = [0xff, 0xd8, 0xff, 0xd9]; // the shortest byte string that starts FFD8 and ends FFD9

function fullTiff(little: boolean, extra: Partial<TiffOpts> = {}): BuiltTiff {
	return buildTiff({
		little,
		orientation: 6,
		gps: HANGZHOU,
		exif: { dateTimeOriginal: '2026:08:12 14:19:07', offsetTimeOriginal: '+08:00' },
		thumbnail: { bytes: TINY_JPEG, width: 240, height: 320 },
		...extra,
	});
}

/* ------------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------------ */

describe('findExif + parseExif across containers', () => {
	it('reads the identical coordinate out of JPEG, PNG, WebP and ISOBMFF', () => {
		// Same reasoning as parse.test.ts's cross-format checks: one TIFF block,
		// four wrappers, one answer proves the container walkers rather than
		// each one merely agreeing with itself.
		const { bytes: tiff } = fullTiff(false);
		const jpeg = parseExif(wrapJpeg(tiff));
		const png = parseExif(wrapPng(tiff));
		const webp = parseExif(wrapWebp(tiff, true));
		const isobmff = parseExif(wrapIsobmff(tiff));

		for (const exif of [jpeg, png, webp, isobmff]) {
			expect(exif).not.toBeNull();
			expect(exif!.lat).toBeCloseTo(30.269453, 6);
			expect(exif!.lng).toBeCloseTo(120.118832, 6);
		}
	});

	it('reads a WebP EXIF chunk whose payload has no Exif\\0\\0 prefix', () => {
		const { bytes: tiff } = fullTiff(true);
		const exif = parseExif(wrapWebp(tiff, false));
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
	});

	it('skips a non-Exif APP1 (e.g. XMP) and still finds the Exif one', () => {
		const { bytes: tiff } = fullTiff(false);
		const xmpPayload = asciiBytes('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>');
		const xmpLen = 2 + xmpPayload.length;
		const xmpSegment = [0xff, 0xe1, ...u16be(xmpLen), ...xmpPayload];
		const exifSegment = Array.from(wrapJpeg(tiff)).slice(2); // drop this copy's own SOI
		const bytes = new Uint8Array([0xff, 0xd8, ...xmpSegment, ...exifSegment]);
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lng).toBeCloseTo(120.118832, 6);
	});

	it('finds nothing in a JPEG with no APP1 at all', () => {
		expect(parseExif(new Uint8Array(TINY_JPEG))).toBeNull();
	});

	it('finds nothing in a container findExif does not recognise', () => {
		expect(findExif(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
	});
});

describe('JPEG — segment walking edges', () => {
	it('a restart marker (no length field) is skipped without derailing the walk', () => {
		const { bytes: tiff } = fullTiff(false);
		const exifSegment = Array.from(wrapJpeg(tiff)).slice(2, -2); // the APP1 segment, SOI/EOI stripped
		const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd0, ...exifSegment, 0xff, 0xd9]);
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
	});

	it('a byte that is not 0xFF where a marker is expected stops the walk cleanly', () => {
		// A marker's own two bytes (0xFF, code) are always adjacent; splicing a
		// stray non-marker byte in between corrupts the stream the way a torn
		// read might.
		expect(parseExif(new Uint8Array([0xff, 0xd8, 0x00, 0xe1, 1, 2]))).toBeNull();
	});

	it('a start-of-scan with no Exif seen yet answers null rather than reading pixel data as segments', () => {
		expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 0, 1, 2, 3]))).toBeNull();
	});

	it('a segment claiming a length under the 2-byte minimum is refused', () => {
		expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01]))).toBeNull();
	});

	it('never throws for any truncation length of a well-formed JPEG', () => {
		const { bytes: tiff } = fullTiff(false);
		const full = wrapJpeg(tiff);
		for (let n = 0; n <= full.length; n++) {
			expect(() => parseExif(full.slice(0, n))).not.toThrow();
		}
	});
});

describe('PNG/WebP/ISOBMFF/TIFF — truncation never throws', () => {
	it('PNG', () => {
		const { bytes: tiff } = fullTiff(false);
		const full = wrapPng(tiff);
		for (let n = 0; n <= full.length; n++) expect(() => parseExif(full.slice(0, n))).not.toThrow();
	});

	it('WebP', () => {
		const { bytes: tiff } = fullTiff(true);
		const full = wrapWebp(tiff, true);
		for (let n = 0; n <= full.length; n++) expect(() => parseExif(full.slice(0, n))).not.toThrow();
	});

	it('ISOBMFF, including a version-2/8-byte-field iloc and an extra leading item', () => {
		const { bytes: tiff } = fullTiff(false);
		const full = buildHeic(tiff, {
			extraItem: true,
			iloc: { version: 2, offsetSize: 8, lengthSize: 8, baseOffsetSize: 8, indexSize: 1 },
		});
		for (let n = 0; n <= full.length; n++) expect(() => parseExif(full.slice(0, n))).not.toThrow();
	});

	it('bare TIFF, with a full GPS/Exif/thumbnail set', () => {
		const { bytes } = fullTiff(false);
		for (let n = 0; n <= bytes.length; n++) expect(() => readTiffExif(bytes.slice(0, n))).not.toThrow();
	});

	it('PNG answers null when its chunks simply run out with no eXIf and no IEND', () => {
		const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		const bytes = new Uint8Array([...sig, ...pngChunk('IHDR', [1, 2, 3, 4])]);
		expect(parseExif(bytes)).toBeNull();
	});
});

describe('readTiffExif — mistyped tags are not misread', () => {
	it('an Orientation tag written as LONG instead of SHORT is ignored, not misread', () => {
		// buildTiff always writes Orientation as SHORT; there is no `TiffOpts`
		// knob for the wrong type, so this builds the IFD by hand instead.
		const gEntries = gpsEntries({ lat: 10, latRef: 'N', lng: 20, lngRef: 'E' });
		const ifd0Entries: Entry[] = [
			{ tag: 0x0112, type: 4, values: [6] },
			{ tag: 0x8825, type: 4, values: [0] },
		];
		const little = false;
		const ifd0Size = 2 + ifd0Entries.length * 12 + 4;
		const gpsStart = 8 + ifd0Size;
		(ifd0Entries[1] as { values: number[] }).values = [gpsStart];
		const buf = new Array<number>(gpsStart + ifdByteSize(gEntries)).fill(0);
		buf[0] = 0x4d;
		buf[1] = 0x4d;
		writeU16(buf, 2, 42, little);
		writeU32(buf, 4, 8, little);
		writeIfdAt(buf, 8, ifd0Entries, 0, little);
		writeIfdAt(buf, gpsStart, gEntries, 0, little);
		const exif = readTiffExif(new Uint8Array(buf))!;
		expect(exif.orientation).toBe(1); // getShortAt refuses the LONG-typed entry; no LONG fallback here
	});

	it('GPSLatitude written as SHORT instead of RATIONAL yields no coordinate, not a misread one', () => {
		const gEntries: Entry[] = [
			{ tag: 0x0001, type: 2, text: 'N' },
			{ tag: 0x0002, type: 3, values: [10, 0, 0] }, // wrong type: SHORT, not RATIONAL
			{ tag: 0x0003, type: 2, text: 'E' },
			{
				tag: 0x0004,
				type: 5,
				values: [
					[20, 1],
					[0, 1],
					[0, 1],
				],
			},
		];
		const little = false;
		const ifd0Entries: Entry[] = [{ tag: 0x8825, type: 4, values: [0] }];
		const ifd0Size = 2 + ifd0Entries.length * 12 + 4;
		const gpsStart = 8 + ifd0Size;
		(ifd0Entries[0] as { values: number[] }).values = [gpsStart];
		const buf = new Array<number>(gpsStart + ifdByteSize(gEntries)).fill(0);
		buf[0] = 0x4d;
		buf[1] = 0x4d;
		writeU16(buf, 2, 42, little);
		writeU32(buf, 4, 8, little);
		writeIfdAt(buf, 8, ifd0Entries, 0, little);
		writeIfdAt(buf, gpsStart, gEntries, 0, little);
		expect(readTiffExif(new Uint8Array(buf))).toBeNull();
	});

	it('a GPSAltitudeRef of the wrong type is treated as absent, not misread as negative', () => {
		const gEntries: Entry[] = [
			{ tag: 0x0001, type: 2, text: 'N' },
			{
				tag: 0x0002,
				type: 5,
				values: [
					[10, 1],
					[0, 1],
					[0, 1],
				],
			},
			{ tag: 0x0003, type: 2, text: 'E' },
			{
				tag: 0x0004,
				type: 5,
				values: [
					[20, 1],
					[0, 1],
					[0, 1],
				],
			},
			{ tag: 0x0005, type: 3, values: [1] }, // wrong type: SHORT, not BYTE/UNDEFINED
			{ tag: 0x0006, type: 5, values: [[500000, 10000]] },
		];
		const little = false;
		const ifd0Entries: Entry[] = [{ tag: 0x8825, type: 4, values: [0] }];
		const ifd0Size = 2 + ifd0Entries.length * 12 + 4;
		const gpsStart = 8 + ifd0Size;
		(ifd0Entries[0] as { values: number[] }).values = [gpsStart];
		const buf = new Array<number>(gpsStart + ifdByteSize(gEntries)).fill(0);
		buf[0] = 0x4d;
		buf[1] = 0x4d;
		writeU16(buf, 2, 42, little);
		writeU32(buf, 4, 8, little);
		writeIfdAt(buf, 8, ifd0Entries, 0, little);
		writeIfdAt(buf, gpsStart, gEntries, 0, little);
		const exif = readTiffExif(new Uint8Array(buf))!;
		expect(exif.alt).toBeCloseTo(50, 3); // ref not read as 1, so not negated
	});

	it('a GPS IFD pointer written as SHORT instead of LONG is not followed', () => {
		const little = false;
		const ifd0Entries: Entry[] = [{ tag: 0x8825, type: 3, values: [8] }]; // SHORT, not LONG
		const buf = new Array<number>(8 + ifdByteSize(ifd0Entries)).fill(0);
		buf[0] = 0x4d;
		buf[1] = 0x4d;
		writeU16(buf, 2, 42, little);
		writeU32(buf, 4, 8, little);
		writeIfdAt(buf, 8, ifd0Entries, 0, little);
		expect(readTiffExif(new Uint8Array(buf))).toBeNull();
	});
});

describe('readTiffExif — remaining header-level guards', () => {
	it('a TIFF byte-order mark with the wrong magic number (not 42) is refused', () => {
		const buf = [0x4d, 0x4d, 0x00, 0x2a + 1, 0, 0, 0, 8, 0, 0];
		expect(readTiffExif(new Uint8Array(buf))).toBeNull();
	});

	it('an IFD0 offset of 0 is refused', () => {
		const buf = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 0];
		expect(readTiffExif(new Uint8Array(buf))).toBeNull();
	});

	it('an IFD0 offset at or past the end of the buffer is refused', () => {
		const buf = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 200];
		expect(readTiffExif(new Uint8Array(buf))).toBeNull();
	});

	it('an IFD0 whose own entry count cannot be read at all answers null', () => {
		// ifd0Offset points at the very last byte — not even the 2-byte count
		// field fits, so readIfd itself fails outright rather than reading a
		// truncated entry list.
		const buf = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0];
		expect(readTiffExif(new Uint8Array(buf))).toBeNull();
	});

	it('a latitude/longitude outside the valid range is refused', () => {
		const north: GpsOpts = { lat: 95, latRef: 'N', lng: 20, lngRef: 'E' };
		const east: GpsOpts = { lat: 10, latRef: 'N', lng: 190, lngRef: 'E' };
		expect(readTiffExif(buildTiff({ little: false, gps: north }).bytes)).toBeNull();
		expect(readTiffExif(buildTiff({ little: false, gps: east }).bytes)).toBeNull();
	});
});

describe('date parsing — malformed strings never guess', () => {
	it('a DateTimeOriginal that does not match the expected shape is ignored', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' },
			exif: { dateTimeOriginal: 'not a date', offsetTimeOriginal: '+08:00' },
		});
		expect(readTiffExif(bytes)!.time).toBeUndefined();
	});

	it('an OffsetTimeOriginal that does not match ±HH:MM is ignored', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' },
			exif: { dateTimeOriginal: '2026:08:12 14:19:07', offsetTimeOriginal: '8:00' },
		});
		expect(readTiffExif(bytes)!.time).toBeUndefined();
	});

	it('a GPSDateStamp that does not match YYYY:MM:DD is ignored, even with a valid GPSTimeStamp', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E', dateStamp: 'garbage', timeStamp: [1, 2, 3] },
		});
		expect(readTiffExif(bytes)!.time).toBeUndefined();
	});
});

describe('readTiffExif — byte order', () => {
	it('reads the same coordinate in II and MM', () => {
		const le = readTiffExif(fullTiff(true).bytes);
		const be = readTiffExif(fullTiff(false).bytes);
		expect(le).not.toBeNull();
		expect(be).not.toBeNull();
		expect(le!.lat).toBeCloseTo(be!.lat, 9);
		expect(le!.lng).toBeCloseTo(be!.lng, 9);
		expect(le!.lat).toBeCloseTo(30.269453, 6);
		expect(le!.lng).toBeCloseTo(120.118832, 6);
	});
});

describe('readTiffExif — GPS refs and sign', () => {
	it('N/E stay positive', () => {
		const { bytes } = buildTiff({ little: false, gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' } });
		const exif = readTiffExif(bytes)!;
		expect(exif.lat).toBeGreaterThan(0);
		expect(exif.lng).toBeGreaterThan(0);
	});

	it('S/W negate, even though the rationals themselves are unsigned', () => {
		const { bytes } = buildTiff({ little: false, gps: { lat: 10, latRef: 'S', lng: 20, lngRef: 'W' } });
		const exif = readTiffExif(bytes)!;
		expect(exif.lat).toBeCloseTo(-10, 4);
		expect(exif.lng).toBeCloseTo(-20, 4);
	});

	it('refuses (0, 0) — the null island a failed parse produces', () => {
		const { bytes } = buildTiff({ little: false, gps: { lat: 0, latRef: 'N', lng: 0, lngRef: 'E' } });
		expect(readTiffExif(bytes)).toBeNull();
	});
});

describe('readTiffExif — altitude', () => {
	it('GPSAltitudeRef 1 negates the altitude', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E', alt: 50, altRef: 1 },
		});
		const exif = readTiffExif(bytes)!;
		expect(exif.alt).toBeCloseTo(-50, 3);
	});

	it('GPSAltitudeRef 0 leaves it positive, including a genuine 0 m', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E', alt: 0, altRef: 0 },
		});
		const exif = readTiffExif(bytes)!;
		expect(exif.alt).toBe(0);
	});
});

describe('readTiffExif — time precedence', () => {
	it('GPS date/time beats DateTimeOriginal when both are present', () => {
		const { bytes } = fullTiff(false);
		const exif = readTiffExif(bytes)!;
		// 2026-08-12T06:19:10Z — GPSDateStamp/GPSTimeStamp, not the
		// 14:19:07+08:00 (== 06:19:07Z) DateTimeOriginal also carries.
		expect(exif.time).toBe(Date.UTC(2026, 7, 12, 6, 19, 10));
	});

	it('falls back to DateTimeOriginal when OffsetTimeOriginal states an offset', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' }, // no GPS timestamp
			exif: { dateTimeOriginal: '2026:08:12 14:19:07', offsetTimeOriginal: '+08:00' },
		});
		const exif = readTiffExif(bytes)!;
		expect(exif.time).toBe(Date.UTC(2026, 7, 12, 6, 19, 7));
	});

	it('carries no time at all when there is no GPS time and no stated offset', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' },
			exif: { dateTimeOriginal: '2026:08:12 14:19:07' }, // no OffsetTimeOriginal
		});
		const exif = readTiffExif(bytes)!;
		expect(exif.time).toBeUndefined();
	});
});

describe('readTiffExif — no GPS IFD', () => {
	it('returns null when EXIF exists but names no GPS IFD', () => {
		const { bytes } = buildTiff({ little: false, orientation: 1 });
		expect(readTiffExif(bytes)).toBeNull();
	});
});

describe('readTiffExif — thumbnail', () => {
	it('extracts the right byte length, starting FF D8', () => {
		const jpegLike = [0xff, 0xd8, 1, 2, 3, 4, 5, 6, 7, 8, 0xff, 0xd9];
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' },
			thumbnail: { bytes: jpegLike, width: 4, height: 3 },
		});
		const exif = readTiffExif(bytes)!;
		expect(exif.thumbnail).toBeDefined();
		expect(exif.thumbnail!.bytes.length).toBe(jpegLike.length);
		expect(exif.thumbnail!.bytes[0]).toBe(0xff);
		expect(exif.thumbnail!.bytes[1]).toBe(0xd8);
	});

	it('defaults orientation to 1 when the tag is absent', () => {
		const { bytes } = buildTiff({ little: false, gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' } });
		expect(readTiffExif(bytes)!.orientation).toBe(1);
	});

	it('reads a stated orientation', () => {
		const { bytes } = buildTiff({
			little: false,
			orientation: 6,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' },
		});
		expect(readTiffExif(bytes)!.orientation).toBe(6);
	});
});

describe('readTiffExif — truncation and malformed input never throw', () => {
	it('a truncated buffer keeps the coordinate and drops only the thumbnail', () => {
		const { bytes, thumbStart } = fullTiff(false);
		// Cut well inside the thumbnail's own bytes — the coordinate lives
		// entirely before this point, in the GPS IFD.
		const truncated = bytes.slice(0, thumbStart + 3);
		let exif: PhotoExif | null = null;
		expect(() => (exif = readTiffExif(truncated))).not.toThrow();
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
		expect(exif!.thumbnail).toBeUndefined();
	});

	it('garbage bytes never throw and answer null', () => {
		const garbage = new Uint8Array(200);
		for (let i = 0; i < garbage.length; i++) garbage[i] = (i * 37 + 11) % 256;
		expect(() => parseExif(garbage)).not.toThrow();
		expect(parseExif(garbage)).toBeNull();
	});

	it('an absurd IFD entry count (0xFFFF) does not throw or hang', () => {
		// A valid TIFF header pointing at an IFD whose declared count wildly
		// exceeds what the buffer actually holds.
		const buf = new Array<number>(10).fill(0);
		buf[0] = 0x49;
		buf[1] = 0x49; // "II"
		writeU16(buf, 2, 42, true);
		writeU32(buf, 4, 8, true); // IFD0 at offset 8
		writeU16(buf, 8, 0xffff, true); // entry count, with no entries actually present
		const bytes = new Uint8Array(buf);
		let result: PhotoExif | null = null;
		expect(() => (result = readTiffExif(bytes))).not.toThrow();
		expect(result).toBeNull();
	});

	it('an IFD1 pointer that points at IFD0 itself is refused, not followed', () => {
		// buildTiff always places IFD0 at offset 8; pointing "next" back at it
		// is the self-reference this guards against.
		const { bytes } = buildTiff({
			little: false,
			gps: HANGZHOU,
			ifd0NextOverride: 8,
		});
		let exif: PhotoExif | null = null;
		expect(() => (exif = readTiffExif(bytes))).not.toThrow();
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
		expect(exif!.thumbnail).toBeUndefined();
	});

	it('rejects a TIFF block with neither "II" nor "MM" at its head', () => {
		expect(readTiffExif(new Uint8Array([0x58, 0x58, 0, 42, 0, 0, 0, 8]))).toBeNull();
	});

	it('rejects a buffer too short to hold even the TIFF header', () => {
		expect(readTiffExif(new Uint8Array([0x49, 0x49, 42]))).toBeNull();
	});
});

describe('photoWgs84', () => {
	const base: PhotoExif = { lng: 120.118832, lat: 30.269453, orientation: 1 };

	it("'wgs84' leaves the coordinate exactly as written", () => {
		expect(photoWgs84(base, 'wgs84')).toEqual([base.lng, base.lat]);
	});

	it("'gcj02' converts GCJ-02 input to WGS-84, moving it by roughly 500 m in Hangzhou", () => {
		const gcj = wgs2gcj(base.lng, base.lat);
		const asGcj: PhotoExif = { ...base, lng: gcj[0], lat: gcj[1] };
		const back = photoWgs84(asGcj, 'gcj02');
		expect(back[0]).toBeCloseTo(base.lng, 8);
		expect(back[1]).toBeCloseTo(base.lat, 8);

		// The size of the correction 'gcj02' just applied: comparing the raw
		// GCJ-02 value against the WGS-84 answer should be ~500 m apart, the
		// figure CLAUDE.md's coords.ts section measures for this region.
		const mPerDegLat = 110540;
		const mPerDegLng = 111320 * Math.cos((base.lat * Math.PI) / 180);
		const dist = Math.hypot((gcj[0] - back[0]) * mPerDegLng, (gcj[1] - back[1]) * mPerDegLat);
		expect(dist).toBeGreaterThan(300);
		expect(dist).toBeLessThan(700);
	});

	it("'wgs84' moves a GCJ-02-shaped value by exactly zero — it is not reinterpreted", () => {
		const gcj = wgs2gcj(base.lng, base.lat);
		const asGcj: PhotoExif = { ...base, lng: gcj[0], lat: gcj[1] };
		expect(photoWgs84(asGcj, 'wgs84')).toEqual([gcj[0], gcj[1]]);
	});

	it("'auto' trusts a GCJ datum tag", () => {
		const gcj = wgs2gcj(base.lng, base.lat);
		const tagged: PhotoExif = { ...base, lng: gcj[0], lat: gcj[1], datum: 'GCJ-02' };
		const back = photoWgs84(tagged, 'auto');
		const expected = gcj2wgs(gcj[0], gcj[1]);
		expect(back[0]).toBeCloseTo(expected[0], 9);
		expect(back[1]).toBeCloseTo(expected[1], 9);
	});

	it("'auto' treats an absent datum as WGS-84 — the EXIF default, and what the real Xiaomi export turned out to be", () => {
		expect(photoWgs84(base, 'auto')).toEqual([base.lng, base.lat]);
	});

	it("'auto' treats a stated non-GCJ datum (e.g. WGS-84) as WGS-84", () => {
		const stated: PhotoExif = { ...base, datum: 'WGS-84' };
		expect(photoWgs84(stated, 'auto')).toEqual([base.lng, base.lat]);
	});
});

describe('photoTrack', () => {
	it('produces a one-Point ParsedTrack with name and times in the parse.ts shape', () => {
		const exif: PhotoExif = { lng: 120.118832, lat: 30.269453, alt: 12.5, time: 1786004350000, orientation: 1 };
		const track = photoTrack(exif, 'Summit selfie', 'wgs84');
		expect(track.features).toHaveLength(1);
		const [feature] = track.features;
		expect(feature.geometry).toEqual({ type: 'Point', coordinates: [120.118832, 30.269453, 12.5] });
		expect(feature.properties).toEqual({ name: 'Summit selfie', times: [1786004350000] });
	});

	it('omits properties entirely when there is no name and no time', () => {
		const exif: PhotoExif = { lng: 120.118832, lat: 30.269453, orientation: 1 };
		const track = photoTrack(exif, '', 'wgs84');
		expect(track.features[0].properties).toBeNull();
	});

	it('drops the third coordinate when there is no altitude', () => {
		const exif: PhotoExif = { lng: 120.118832, lat: 30.269453, orientation: 1 };
		const track = photoTrack(exif, 'x', 'wgs84');
		expect(track.features[0].geometry).toEqual({ type: 'Point', coordinates: [120.118832, 30.269453] });
	});

	it('projects through the requested datum before building the feature', () => {
		const gcj = wgs2gcj(120.118832, 30.269453);
		const exif: PhotoExif = { lng: gcj[0], lat: gcj[1], orientation: 1 };
		const track = photoTrack(exif, 'x', 'gcj02');
		const coords = (track.features[0].geometry as { coordinates: number[] }).coordinates;
		expect(coords[0]).toBeCloseTo(120.118832, 6);
		expect(coords[1]).toBeCloseTo(30.269453, 6);
	});
});

/* ------------------------------------------------------------------------ *
 * The remaining suites exist for branch coverage on the container walkers'
 * own defensive edges — a real file mostly takes the first branch each of
 * these tries, so these are the ones a plain "read a real photo" pass would
 * never reach.
 * ------------------------------------------------------------------------ */

describe('PNG — chunk walking', () => {
	it('skips a chunk before the one that matters', () => {
		const { bytes: tiff } = fullTiff(false);
		const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		const bytes = new Uint8Array([
			...sig,
			...pngChunk('IHDR', [1, 2, 3, 4]),
			...pngChunk('eXIf', Array.from(tiff)),
		]);
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
	});

	it('stops at IEND and answers null when no eXIf chunk ever appeared', () => {
		const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		const bytes = new Uint8Array([...sig, ...pngChunk('IHDR', [1, 2, 3, 4]), ...pngChunk('IEND', [])]);
		expect(parseExif(bytes)).toBeNull();
	});
});

describe('WebP — chunk walking', () => {
	it('skips a chunk before the one that matters', () => {
		const { bytes: tiff } = fullTiff(true);
		const vp8x = [...asciiBytes('VP8X'), ...u32be(4).reverse(), 0, 0, 0, 0];
		const exifChunk = wrapWebp(tiff, true).slice(12); // drop this copy's own RIFF/WEBP header
		const body = [...vp8x, ...Array.from(exifChunk)];
		const bytes = new Uint8Array([
			...asciiBytes('RIFF'),
			...u32be(4 + body.length).reverse(),
			...asciiBytes('WEBP'),
			...body,
		]);
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
	});

	it('answers null when the chunks run out with no EXIF chunk', () => {
		const vp8x = [...asciiBytes('VP8X'), ...u32be(4).reverse(), 0, 0, 0, 0];
		const bytes = new Uint8Array([
			...asciiBytes('RIFF'),
			...u32be(4 + vp8x.length).reverse(),
			...asciiBytes('WEBP'),
			...vp8x,
		]);
		expect(parseExif(bytes)).toBeNull();
	});
});

describe('ISOBMFF — box-tree edges', () => {
	it('reads through a box whose size uses the 64-bit largesize form', () => {
		const { bytes: tiff } = fullTiff(false);
		const bytes = buildHeic(tiff, { ftyp64: true });
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
	});

	it('a top-level box declaring size 0 ("runs to end of file") hides everything after it', () => {
		// ftyp with size 0 swallows the rest of the buffer, including `meta` —
		// proving readBox's "extends to the end" branch without silently
		// mis-parsing what follows.
		const ftyp0 = [...u32be(0), ...asciiBytes('ftyp'), ...asciiBytes('heic')];
		const { bytes: tiff } = fullTiff(false);
		const normalFtypLen = isobmffBox('ftyp', [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')]).length;
		const rest = buildHeic(tiff).slice(normalFtypLen); // meta + iinf/iloc + payload, unchanged
		const bytes = new Uint8Array([...ftyp0, ...rest]);
		expect(parseExif(bytes)).toBeNull();
	});

	it('a meta box with fewer than 8 declared bytes is refused, not read as empty', () => {
		const ftypBytes = isobmffBox('ftyp', [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')]);
		const brokenMeta = [...u32be(4), ...asciiBytes('meta')]; // size 4 < the 8-byte minimum
		expect(parseExif(new Uint8Array([...ftypBytes, ...brokenMeta]))).toBeNull();
	});

	it('a meta box with zero declared body bytes is refused, not read as empty', () => {
		const ftypBytes = isobmffBox('ftyp', [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')]);
		const brokenMeta = [...u32be(8), ...asciiBytes('meta')]; // size 8 == header only, no body at all
		expect(parseExif(new Uint8Array([...ftypBytes, ...brokenMeta]))).toBeNull();
	});

	it('answers null when ftyp is present but there is no meta box at all', () => {
		const ftypBytes = isobmffBox('ftyp', [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')]);
		expect(parseExif(new Uint8Array(ftypBytes))).toBeNull();
	});

	it('answers null when meta has less than 4 bytes of body after its own header', () => {
		// A meta box whose declared size clears readBox's own >=8 minimum but
		// still leaves less than the 4-byte full-box version/flags field meta
		// itself requires — `childStart > meta.end`, not readBox refusing the
		// box outright the way the two tests above do.
		const ftypBytes = isobmffBox('ftyp', [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')]);
		const shortMeta = [...u32be(9), ...asciiBytes('meta'), 0]; // 1 body byte, not the 4 meta needs
		expect(parseExif(new Uint8Array([...ftypBytes, ...shortMeta]))).toBeNull();
	});

	it('iinf version 1 (u32 entry count) and infe version 3 (u32 item id) both read correctly', () => {
		const { bytes: tiff } = fullTiff(true);
		const bytes = buildHeic(tiff, { iinfVersion: 1, infeVersion: 3, itemId: 300 });
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lng).toBeCloseTo(120.118832, 6);
	});

	it('an infe of an unsupported version (0/1) is skipped, and the item is not found', () => {
		const { bytes: tiff } = fullTiff(false);
		// version 0 doesn't carry a typed item_type field the way this reader
		// expects, so the Exif item is invisible to it — same as it not being
		// in the file at all.
		const bytes = buildHeic(tiff, { infeVersion: 2 });
		const raw = Array.from(bytes);
		// The infe box's own version byte, located by the same arithmetic
		// buildHeic used to place it: ftyp, then meta's 12-byte header, then
		// iinf's 8-byte box header + 4-byte full-box header + a u16 entry
		// count (iinfVersion defaults to 0), then infe's own 8-byte box
		// header — whose first body byte is the version this test flips.
		const ftypLen = isobmffBox('ftyp', [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')]).length;
		const infeVersionOffset = ftypLen + 12 + (8 + 4 + 2) + 8;
		expect(raw[infeVersionOffset]).toBe(2); // sanity: this really is infe's version byte
		raw[infeVersionOffset] = 0;
		expect(parseExif(new Uint8Array(raw))).toBeNull();
	});

	it('skips a non-matching item in both iinf and iloc to find the real one', () => {
		const { bytes: tiff } = fullTiff(false);
		const bytes = buildHeic(tiff, { extraItem: true });
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
	});

	it('reads an iloc using version 2 (u32 ids), 8-byte offset/length/base-offset fields and a non-zero index size', () => {
		const { bytes: tiff } = fullTiff(true);
		const bytes = buildHeic(tiff, {
			extraItem: true,
			iloc: { version: 2, offsetSize: 8, lengthSize: 8, baseOffsetSize: 8, indexSize: 1 },
		});
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lng).toBeCloseTo(120.118832, 6);
	});

	it('an iloc field size that is neither 0, 4 nor 8 is refused rather than mis-read', () => {
		const { bytes: tiff } = fullTiff(false);
		const bytes = buildHeic(tiff, { iloc: { offsetSize: 2, lengthSize: 2 } });
		expect(parseExif(bytes)).toBeNull();
	});

	it('reads the standard zero-offset layout whose field points directly to TIFF', () => {
		const { bytes: tiff } = fullTiff(false);
		const exif = parseExif(buildHeic(tiff));
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
	});

	it('reads a non-zero offset that points past padding directly to TIFF', () => {
		const { bytes: tiff } = fullTiff(false);
		const exif = parseExif(buildHeic(tiff, { exifPrefixBeforeTiff: true }));
		expect(exif).not.toBeNull();
		expect(exif!.lng).toBeCloseTo(120.118832, 6);
	});

	it('falls back to an immediate legacy "Exif\\0\\0" marker when the declared offset does not resolve', () => {
		const { bytes: tiff } = fullTiff(false);
		const bytes = buildHeic(tiff, { badDeclaredOffset: true, exifPrefixBeforeTiff: true });
		const exif = parseExif(bytes);
		expect(exif).not.toBeNull();
		expect(exif!.lat).toBeCloseTo(30.269453, 6);
	});

	it('answers null when a bad declared offset has no immediate legacy marker', () => {
		const { bytes: tiff } = fullTiff(false);
		const bytes = buildHeic(tiff, { badDeclaredOffset: true });
		expect(parseExif(bytes)).toBeNull();
	});

	it("answers null when the item iinf names is not among iloc's own entries", () => {
		// iinf names item 1 as the Exif item; iloc only ever talks about item 2
		// — a file `findExifItemId` can name an item in that `findIlocExtent`'s
		// own loop then exhausts without matching.
		const ftypBytes = isobmffBox('ftyp', [...asciiBytes('heic'), ...u32be(0), ...asciiBytes('mif1')]);
		const iinfBytes = buildIinfCustom([buildInfe(1, 'Exif', 2)], 0);
		const ilocShape: IlocShape = { version: 0, offsetSize: 4, lengthSize: 4, baseOffsetSize: 0, indexSize: 0 };
		const ilocBytes = buildIlocCustom(ilocShape, [{ itemId: 2, extentOffset: 0, extentLength: 0 }]);
		const metaBytes = isobmffBox('meta', [...fullBoxHeader(0), ...iinfBytes, ...ilocBytes]);
		expect(parseExif(new Uint8Array([...ftypBytes, ...metaBytes]))).toBeNull();
	});
});

describe('readTiffExif — remaining defensive branches', () => {
	it('an altitude with no GPSAltitudeRef tag at all defaults to positive', () => {
		const gEntries = gpsEntries({ lat: 10, latRef: 'N', lng: 20, lngRef: 'E' });
		// Build the fixture by hand rather than through GpsOpts.alt, which
		// always writes a Ref entry alongside — this is specifically the case
		// where GPSAltitude exists and GPSAltitudeRef does not.
		gEntries.push({ tag: 0x0006, type: 5, values: [[500000, 10000]] }); // 50 m
		const little = false;
		const ifd0Count = 1;
		const ifd0Size = 2 + ifd0Count * 12 + 4;
		const gpsStart = 8 + ifd0Size;
		const total = gpsStart + ifdByteSize(gEntries);
		const buf = new Array<number>(total).fill(0);
		buf[0] = 0x4d;
		buf[1] = 0x4d;
		writeU16(buf, 2, 42, little);
		writeU32(buf, 4, 8, little);
		writeIfdAt(buf, 8, [{ tag: 0x8825, type: 4, values: [gpsStart] }], 0, little);
		writeIfdAt(buf, gpsStart, gEntries, 0, little);
		const exif = readTiffExif(new Uint8Array(buf))!;
		expect(exif.alt).toBeCloseTo(50, 3);
	});

	it('an empty GPSMapDatum is treated as no datum at all', () => {
		// GpsOpts.datum can't express this directly — gpsEntries() itself skips
		// writing the tag when the string is falsy — so this pushes a genuinely
		// empty (but present) GPSMapDatum entry by hand, to reach the
		// `if (d) datum = d.trim()` branch with a `d` that decoded to ''.
		const gEntries = gpsEntries({ lat: 10, latRef: 'N', lng: 20, lngRef: 'E' });
		gEntries.push({ tag: 0x0012, type: 2, text: '' });
		const little = false;
		const ifd0Size = 2 + 1 * 12 + 4;
		const gpsStart = 8 + ifd0Size;
		const buf = new Array<number>(gpsStart + ifdByteSize(gEntries)).fill(0);
		buf[0] = 0x4d;
		buf[1] = 0x4d;
		writeU16(buf, 2, 42, little);
		writeU32(buf, 4, 8, little);
		writeIfdAt(buf, 8, [{ tag: 0x8825, type: 4, values: [gpsStart] }], 0, little);
		writeIfdAt(buf, gpsStart, gEntries, 0, little);
		const exif = readTiffExif(new Uint8Array(buf))!;
		expect(exif.datum).toBeUndefined();
	});

	it('carries a stated datum through untouched', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E', datum: 'WGS-84' },
		});
		expect(readTiffExif(bytes)!.datum).toBe('WGS-84');
	});

	it('carries no time when there is no GPS IFD timestamp and no Exif SubIFD at all', () => {
		const { bytes } = buildTiff({ little: false, gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' } });
		expect(readTiffExif(bytes)!.time).toBeUndefined();
	});

	it('a thumbnail whose IFD1 itself lies past the end of the buffer is dropped', () => {
		const { bytes, ifd1Start } = fullTiff(false);
		// Cut before IFD1 itself, not merely before the thumbnail bytes it
		// points to — this is `ifd0.next < tiff.length`'s own false branch,
		// distinct from the "off + len <= tiff.length" guard the "truncated
		// buffer" test above exercises once IFD1 has already been read.
		const truncated = bytes.slice(0, ifd1Start - 2);
		const exif = readTiffExif(truncated);
		expect(exif).not.toBeNull();
		expect(exif!.thumbnail).toBeUndefined();
	});

	it('a thumbnail IFD with Compression other than 6 (JPEG) is not read as one', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' },
			thumbnail: { bytes: [0xff, 0xd8, 1, 2, 0xff, 0xd9], width: 2, height: 1 },
		});
		// Flip Compression's inline value from 6 to 1 (uncompressed) without
		// touching anything else — same trick as the infe-version test above.
		const raw = Array.from(bytes);
		const idx = raw.findIndex(
			(_, i) => raw[i] === 0x01 && raw[i + 1] === 0x03 && raw[i + 2] === 0 && raw[i + 3] === 3
		);
		expect(idx).toBeGreaterThan(-1);
		raw[idx + 8] = 0; // the inline SHORT value, big-endian: high byte, then low byte at +9
		raw[idx + 9] = 1;
		const exif = readTiffExif(new Uint8Array(raw))!;
		expect(exif.thumbnail).toBeUndefined();
	});

	it('thumbnail bytes not actually starting FF D8 are refused', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' },
			thumbnail: { bytes: [0x00, 0x00, 1, 2, 3, 4], width: 2, height: 1 },
		});
		expect(readTiffExif(bytes)!.thumbnail).toBeUndefined();
	});

	it('reads a thumbnail whose IFD1 states no width/height tags', () => {
		const { bytes } = buildTiff({
			little: false,
			gps: { lat: 10, latRef: 'N', lng: 20, lngRef: 'E' },
			thumbnail: { bytes: [0xff, 0xd8, 1, 2, 0xff, 0xd9] }, // no width/height
		});
		const thumb = readTiffExif(bytes)!.thumbnail!;
		// Only the bytes are wanted; the dimension tags are advisory and skipped.
		expect(Array.from(thumb.bytes)).toEqual([0xff, 0xd8, 1, 2, 0xff, 0xd9]);
	});
});
