/*
 * EXIF — a photo's own coordinate, pulled out of whatever container it ships
 * in, with no dependency and no `obsidian` import: this is a pure byte reader,
 * exactly the shape `coords.ts` and `parse.ts` already are, so it can sit on
 * the 90 % coverage list and be tested with a hand-built buffer rather than a
 * fixture file.
 *
 * A photo becomes "a track file with one Point in it" — `photoTrack()` hands
 * back the same `ParsedTrack` shape `parse.ts`'s readers already produce, so
 * everything downstream (the track cache, `trackFeatures()`, the draw path)
 * needs nothing new to know about a photo.
 *
 * Four containers, one shared TIFF reader. `findExif()` is the part that
 * differs per format — JPEG segments, PNG/WebP chunks, an ISOBMFF box tree —
 * and it hands back nothing but the raw TIFF block; `readTiffExif()` never
 * learns which container it came from.
 *
 * The caller is very often handing this a *truncated* buffer — a head read of
 * a multi-megabyte file — so every offset this file follows is bounds-checked
 * against the array it is actually holding, and an offset that lands past the
 * end is treated as "not there", never thrown and never read as garbage. IFD
 * entry counts are capped and the IFD0→IFD1 pointer is required to move
 * forward, both so a corrupted file cannot turn into a long loop.
 *
 * The datum EXIF coordinates are written in is WGS-84 by the specification,
 * and that is what a real Xiaomi export measured out to — see `photoWgs84()`.
 */

import { gcj2wgs } from './coords';
import type { ParsedTrack } from './parse';
import type { Position } from 'geojson';

export interface ExifThumbnail {
	/** Raw JPEG bytes, ready to hand to a Blob. */
	bytes: Uint8Array;
	/** 0 when the tags did not state one. */
	width: number;
	height: number;
}

export interface PhotoExif {
	lng: number;
	lat: number;
	/** Metres. GPSAltitudeRef === 1 is already negated here. */
	alt?: number;
	/** Epoch ms. */
	time?: number;
	/** GPSMapDatum verbatim, when the file states one. */
	datum?: string;
	/** EXIF Orientation (IFD0 0x0112), 1 when absent. Applies to the thumbnail too. */
	orientation: number;
	thumbnail?: ExifThumbnail;
}

export type PhotoDatum = 'auto' | 'wgs84' | 'gcj02';

/* ---------------------------------------------------------------------- *
 * Byte-level helpers, shared by every container walker and by the TIFF
 * reader itself. Every one of these returns null/false on an out-of-range
 * read rather than throwing — that is what lets the rest of the file be
 * written as plain "if this failed, stand down" rather than a try/catch
 * wrapped around everything.
 * ---------------------------------------------------------------------- */

function ascii(bytes: Uint8Array, offset: number, length: number): string | null {
	if (offset < 0 || offset + length > bytes.length) return null;
	let s = '';
	for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
	return s;
}

function matchesBytes(bytes: Uint8Array, offset: number, pattern: readonly number[]): boolean {
	if (offset < 0 || offset + pattern.length > bytes.length) return false;
	for (let i = 0; i < pattern.length; i++) if (bytes[offset + i] !== pattern[i]) return false;
	return true;
}

function readU16(bytes: Uint8Array, offset: number, little: boolean): number | null {
	if (offset < 0 || offset + 2 > bytes.length) return null;
	const a = bytes[offset];
	const b = bytes[offset + 1];
	return little ? a | (b << 8) : (a << 8) | b;
}

function readU32(bytes: Uint8Array, offset: number, little: boolean): number | null {
	if (offset < 0 || offset + 4 > bytes.length) return null;
	const a = bytes[offset];
	const b = bytes[offset + 1];
	const c = bytes[offset + 2];
	const d = bytes[offset + 3];
	// The most-significant byte is combined by multiplication rather than `<<`,
	// which would treat a set high bit as a sign and hand back a negative
	// 32-bit number instead of the unsigned value the format actually holds.
	return little ? d * 0x1000000 + (c << 16) + (b << 8) + a : a * 0x1000000 + (b << 16) + (c << 8) + d;
}

/** A big-endian unsigned integer of 0, 4 or 8 bytes — the only sizes the
 *  ISOBMFF `iloc` box's own size fields ever declare. */
function readUIntBE(bytes: Uint8Array, offset: number, size: number): number | null {
	if (size === 0) return 0;
	if (size === 4) return readU32(bytes, offset, false);
	if (size === 8) {
		const hi = readU32(bytes, offset, false);
		const lo = readU32(bytes, offset + 4, false);
		return hi == null || lo == null ? null : hi * 0x100000000 + lo;
	}
	return null;
}

const EXIF_PREFIX = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/* ---------------------------------------------------------------------- *
 * JPEG — walk segments from the SOI, stop at the first scan.
 * ---------------------------------------------------------------------- */

function findExifJpeg(bytes: Uint8Array): Uint8Array | null {
	let offset = 2; // past FF D8
	while (offset + 4 <= bytes.length) {
		if (bytes[offset] !== 0xff) return null; // not a marker where one is expected
		const marker = bytes[offset + 1];
		offset += 2;
		// TEM and the eight restart markers carry no length field at all.
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		// EOI, or the start of entropy-coded scan data — Exif always precedes
		// both, so there is nothing left to find past here.
		if (marker === 0xd9 || marker === 0xda) break;
		const len = readU16(bytes, offset, false);
		if (len == null || len < 2) return null;
		const payloadStart = offset + 2;
		const segEnd = offset + len; // the length field counts itself
		if (marker === 0xe1 && matchesBytes(bytes, payloadStart, EXIF_PREFIX)) {
			return bytes.slice(payloadStart + EXIF_PREFIX.length, Math.min(segEnd, bytes.length));
		}
		offset = segEnd;
	}
	return null;
}

/* ---------------------------------------------------------------------- *
 * PNG — walk chunks from the signature, look for `eXIf`. Its data is a bare
 * TIFF block per the PNG extensions spec, no "Exif\0\0" prefix.
 * ---------------------------------------------------------------------- */

function findExifPng(bytes: Uint8Array): Uint8Array | null {
	let offset = 8; // past the 8-byte signature
	let guard = 0;
	while (offset + 8 <= bytes.length && guard++ < 100000) {
		const len = readU32(bytes, offset, false);
		const type = ascii(bytes, offset + 4, 4);
		if (len == null || type == null) return null;
		const dataStart = offset + 8;
		if (type === 'eXIf') return bytes.slice(dataStart, Math.min(dataStart + len, bytes.length));
		if (type === 'IEND') return null;
		const next = dataStart + len + 4; // + CRC
		if (next <= offset) return null; // a corrupt, non-advancing length
		offset = next;
	}
	return null;
}

/* ---------------------------------------------------------------------- *
 * WebP — RIFF chunks, little-endian sizes. The EXIF chunk's payload may or
 * may not carry its own "Exif\0\0" prefix depending on the encoder; both are
 * seen in the wild, so both are handled.
 * ---------------------------------------------------------------------- */

function findExifWebp(bytes: Uint8Array): Uint8Array | null {
	let offset = 12; // past "RIFF" + size + "WEBP"
	let guard = 0;
	while (offset + 8 <= bytes.length && guard++ < 100000) {
		const fourCC = ascii(bytes, offset, 4);
		const size = readU32(bytes, offset + 4, true);
		if (fourCC == null || size == null) return null;
		const dataStart = offset + 8;
		if (fourCC === 'EXIF') {
			const dataEnd = Math.min(dataStart + size, bytes.length);
			const start = matchesBytes(bytes, dataStart, EXIF_PREFIX) ? dataStart + EXIF_PREFIX.length : dataStart;
			return bytes.slice(start, dataEnd);
		}
		const next = dataStart + size + (size % 2); // chunks are padded to even length
		if (next <= offset) return null;
		offset = next;
	}
	return null;
}

/* ---------------------------------------------------------------------- *
 * ISOBMFF (HEIC/HEIF/AVIF) — a box tree: `meta` → `iinf` names the item whose
 * type is "Exif", `iloc` says where that item's bytes live, and the item's
 * own payload carries a 4-byte offset in front of the "Exif\0\0" + TIFF data.
 * ---------------------------------------------------------------------- */

interface Box {
	type: string;
	end: number;
	bodyStart: number;
}

function readBox(bytes: Uint8Array, offset: number, limit: number): Box | null {
	if (offset + 8 > limit) return null;
	let size = readU32(bytes, offset, false);
	if (size == null) return null;
	const type = ascii(bytes, offset + 4, 4);
	if (type == null) return null;
	let bodyStart = offset + 8;
	if (size === 1) {
		if (offset + 16 > limit) return null;
		const hi = readU32(bytes, offset + 8, false);
		const lo = readU32(bytes, offset + 12, false);
		if (hi == null || lo == null) return null;
		size = hi * 0x100000000 + lo;
		bodyStart = offset + 16;
	} else if (size === 0) {
		size = limit - offset; // extends to the end of its parent
	}
	if (size < 8) return null; // a zero/garbage size would otherwise never advance
	const end = Math.min(offset + size, limit);
	if (end <= bodyStart) return null;
	return { type, end, bodyStart };
}

function findTopBox(bytes: Uint8Array, want: string, from: number, to: number): Box | null {
	let offset = from;
	let guard = 0;
	while (offset + 8 <= to && guard++ < 10000) {
		const box = readBox(bytes, offset, to);
		if (!box) return null;
		if (box.type === want) return box;
		if (box.end <= offset) return null; // guards a non-advancing box
		offset = box.end;
	}
	return null;
}

/** Walks `iinf`'s `infe` children for the item whose type is "Exif" and
 *  answers its item id. Only `infe` version 2/3 is understood — the version
 *  every HEIC/AVIF encoder in the wild actually writes — so an older version
 *  0/1 box is skipped rather than mis-read. */
function findExifItemId(bytes: Uint8Array, iinf: Box): number | null {
	let offset = iinf.bodyStart;
	if (offset + 4 > iinf.end) return null;
	const version = bytes[offset];
	offset += 4; // full-box version + flags
	let count: number | null;
	if (version === 0) {
		count = readU16(bytes, offset, false);
		offset += 2;
	} else {
		count = readU32(bytes, offset, false);
		offset += 4;
	}
	if (count == null) return null;
	const maxIters = Math.min(count, 10000);
	for (let i = 0; i < maxIters && offset + 8 <= iinf.end; i++) {
		const infe = readBox(bytes, offset, iinf.end);
		if (!infe) return null;
		if (infe.type === 'infe') {
			const item = readInfeItem(bytes, infe);
			if (item && item.type === 'Exif') return item.itemId;
		}
		if (infe.end <= offset) return null;
		offset = infe.end;
	}
	return null;
}

function readInfeItem(bytes: Uint8Array, infe: Box): { itemId: number; type: string } | null {
	let offset = infe.bodyStart;
	if (offset + 4 > infe.end) return null;
	const version = bytes[offset];
	offset += 4;
	let itemId: number | null;
	if (version === 2) {
		itemId = readU16(bytes, offset, false);
		offset += 2;
	} else if (version === 3) {
		itemId = readU32(bytes, offset, false);
		offset += 4;
	} else {
		return null; // versions 0/1 predate a typed item and are not written today
	}
	if (itemId == null) return null;
	offset += 2; // item_protection_index
	const type = ascii(bytes, offset, 4);
	return type == null ? null : { itemId, type };
}

/** Walks `iloc`'s item entries for `itemId` and answers its first extent's
 *  absolute offset/length. Real encoders write exactly one extent per Exif
 *  item; a further extent (if present) is skipped rather than assembled. */
function findIlocExtent(bytes: Uint8Array, iloc: Box, itemId: number): { offset: number; length: number } | null {
	let offset = iloc.bodyStart;
	if (offset + 6 > iloc.end) return null;
	const version = bytes[offset];
	offset += 4;
	const sizesByte1 = bytes[offset];
	offset += 1;
	const offsetSize = sizesByte1 >> 4;
	const lengthSize = sizesByte1 & 0xf;
	const sizesByte2 = bytes[offset];
	offset += 1;
	const baseOffsetSize = sizesByte2 >> 4;
	const indexSize = sizesByte2 & 0xf;
	let itemCount: number | null;
	if (version < 2) {
		itemCount = readU16(bytes, offset, false);
		offset += 2;
	} else {
		itemCount = readU32(bytes, offset, false);
		offset += 4;
	}
	if (itemCount == null) return null;
	const maxIters = Math.min(itemCount, 10000);
	for (let i = 0; i < maxIters; i++) {
		let curItemId: number | null;
		if (version < 2) {
			curItemId = readU16(bytes, offset, false);
			offset += 2;
		} else {
			curItemId = readU32(bytes, offset, false);
			offset += 4;
		}
		if (curItemId == null) return null;
		if (version === 1 || version === 2) offset += 2; // construction_method
		const dataRefIndex = readU16(bytes, offset, false);
		offset += 2;
		if (dataRefIndex == null) return null;
		const baseOffset = readUIntBE(bytes, offset, baseOffsetSize);
		offset += baseOffsetSize;
		if (baseOffset == null) return null;
		const extentCount = readU16(bytes, offset, false);
		offset += 2;
		if (extentCount == null) return null;
		let firstOffset: number | null = null;
		let firstLength: number | null = null;
		for (let e = 0; e < extentCount; e++) {
			if ((version === 1 || version === 2) && indexSize > 0) offset += indexSize;
			const extOffset = readUIntBE(bytes, offset, offsetSize);
			offset += offsetSize;
			const extLength = readUIntBE(bytes, offset, lengthSize);
			offset += lengthSize;
			if (extOffset == null || extLength == null) return null;
			if (e === 0) {
				firstOffset = extOffset;
				firstLength = extLength;
			}
		}
		if (offset > iloc.end) return null;
		if (curItemId === itemId && firstOffset != null && firstLength != null) {
			return { offset: baseOffset + firstOffset, length: firstLength };
		}
	}
	return null;
}

/** The Exif item's own payload: a 4-byte big-endian offset, then (usually
 *  right away) "Exif\0\0" followed by the TIFF block. The declared offset is
 *  trusted first; a plain "starts right after the offset field" layout — the
 *  common case — is the fallback when it does not resolve. */
function extractExifPayload(payload: Uint8Array): Uint8Array | null {
	if (payload.length < 4) return null;
	const declared = readU32(payload, 0, false);
	if (declared != null) {
		const p = 4 + declared;
		if (matchesBytes(payload, p, EXIF_PREFIX)) return payload.slice(p + EXIF_PREFIX.length);
	}
	if (matchesBytes(payload, 4, EXIF_PREFIX)) return payload.slice(4 + EXIF_PREFIX.length);
	return null;
}

function findExifIsobmff(bytes: Uint8Array): Uint8Array | null {
	const meta = findTopBox(bytes, 'meta', 0, bytes.length);
	if (!meta) return null;
	const childStart = meta.bodyStart + 4; // meta is itself a full box: version + flags
	if (childStart > meta.end) return null;
	const iinf = findTopBox(bytes, 'iinf', childStart, meta.end);
	const iloc = findTopBox(bytes, 'iloc', childStart, meta.end);
	if (!iinf || !iloc) return null;
	const itemId = findExifItemId(bytes, iinf);
	if (itemId == null) return null;
	const extent = findIlocExtent(bytes, iloc, itemId);
	if (!extent || extent.offset < 0 || extent.offset >= bytes.length) return null;
	const payload = bytes.slice(extent.offset, Math.min(extent.offset + extent.length, bytes.length));
	return extractExifPayload(payload);
}

/** The TIFF block out of whatever container this is, or null. */
export function findExif(bytes: Uint8Array): Uint8Array | null {
	if (bytes.length < 4) return null;
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return findExifJpeg(bytes);
	if (bytes.length >= 8 && matchesBytes(bytes, 0, PNG_SIG)) return findExifPng(bytes);
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
		return findExifWebp(bytes);
	}
	if (bytes.length >= 8 && ascii(bytes, 4, 4) === 'ftyp') return findExifIsobmff(bytes);
	return null;
}

/* ---------------------------------------------------------------------- *
 * TIFF — one reader, either byte order.
 * ---------------------------------------------------------------------- */

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

interface RawEntry {
	type: number;
	count: number;
	/** Absolute offset into the TIFF block where this entry's value data
	 *  begins — either the inline 4-byte field itself (value ≤ 4 bytes) or
	 *  wherever that field points. */
	start: number;
}

/** Corrupt files have claimed absurd entry counts (0xFFFF is in the test
 *  suite); this bounds the work without ever throwing or hanging. */
const MAX_IFD_ENTRIES = 4096;

function readIfd(
	bytes: Uint8Array,
	offset: number,
	little: boolean
): { entries: Map<number, RawEntry>; next: number } | null {
	const count = readU16(bytes, offset, little);
	if (count == null) return null;
	const entries = new Map<number, RawEntry>();
	let p = offset + 2;
	const capped = Math.min(count, MAX_IFD_ENTRIES);
	for (let i = 0; i < capped; i++) {
		if (p + 12 > bytes.length) break; // a truncated head read — stop, keep what was found
		const tag = readU16(bytes, p, little);
		const type = readU16(bytes, p + 2, little);
		const entryCount = readU32(bytes, p + 4, little);
		if (tag == null || type == null || entryCount == null) break;
		const unitSize = TYPE_SIZE[type];
		if (unitSize) {
			const size = unitSize * entryCount;
			// A value that fits in the entry's own 4-byte field is stored there,
			// left-justified, in both byte orders; anything larger is an offset
			// to where the real data lives.
			const start = size > 0 && size <= 4 ? p + 8 : size > 4 ? readU32(bytes, p + 8, little) : null;
			if (start != null) entries.set(tag, { type, count: entryCount, start });
		}
		p += 12;
	}
	const next = readU32(bytes, p, little);
	return { entries, next: next ?? 0 };
}

function getAscii(bytes: Uint8Array, e: RawEntry): string | undefined {
	if (e.type !== 2 || e.start < 0 || e.start + e.count > bytes.length) return undefined;
	let end = e.start;
	const limit = e.start + e.count;
	while (end < limit && bytes[end] !== 0) end++;
	let s = '';
	for (let i = e.start; i < end; i++) s += String.fromCharCode(bytes[i]);
	return s;
}

function getByteAt(bytes: Uint8Array, e: RawEntry, index: number): number | undefined {
	if (e.type !== 1 && e.type !== 7) return undefined;
	const off = e.start + index;
	return off < 0 || off >= bytes.length ? undefined : bytes[off];
}

function getShortAt(bytes: Uint8Array, e: RawEntry, index: number, little: boolean): number | undefined {
	if (e.type !== 3) return undefined;
	return readU16(bytes, e.start + index * 2, little) ?? undefined;
}

function getLongAt(bytes: Uint8Array, e: RawEntry, index: number, little: boolean): number | undefined {
	if (e.type !== 4) return undefined;
	return readU32(bytes, e.start + index * 4, little) ?? undefined;
}

function getRationalAt(bytes: Uint8Array, e: RawEntry, index: number, little: boolean): number | undefined {
	if (e.type !== 5) return undefined;
	const off = e.start + index * 8;
	const num = readU32(bytes, off, little);
	const den = readU32(bytes, off + 4, little);
	return num == null || den == null || den === 0 ? undefined : num / den;
}

/** GPSLatitude/GPSLongitude: three RATIONALs, degrees/minutes/seconds. */
function dms(bytes: Uint8Array, e: RawEntry, little: boolean): number | undefined {
	const d = getRationalAt(bytes, e, 0, little);
	const m = getRationalAt(bytes, e, 1, little);
	const s = getRationalAt(bytes, e, 2, little);
	return d == null || m == null || s == null ? undefined : d + m / 60 + s / 3600;
}

/** "YYYY:MM:DD HH:MM:SS" plus "±HH:MM" → epoch ms. Undefined on anything that
 *  does not parse cleanly — this is the branch that must not guess. */
function parseDateTimeWithOffset(dateTime: string, offset: string): number | undefined {
	const dt = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(dateTime.trim());
	const off = /^([+-])(\d{2}):(\d{2})$/.exec(offset.trim());
	if (!dt || !off) return undefined;
	const offMinutes = (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3]));
	const ms =
		Date.UTC(Number(dt[1]), Number(dt[2]) - 1, Number(dt[3]), Number(dt[4]), Number(dt[5]), Number(dt[6])) -
		offMinutes * 60000;
	return isFinite(ms) ? ms : undefined;
}

/** "YYYY:MM:DD" (UTC) plus GPSTimeStamp's three UTC RATIONALs → epoch ms. */
function gpsDateTime(dateStamp: string, hours: number, minutes: number, seconds: number): number | undefined {
	const m = /^(\d{4}):(\d{2}):(\d{2})$/.exec(dateStamp.trim());
	if (!m) return undefined;
	const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + (hours * 3600 + minutes * 60 + seconds) * 1000;
	return isFinite(ms) ? ms : undefined;
}

const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LNG_REF = 0x0003;
const GPS_LNG = 0x0004;
const GPS_ALT_REF = 0x0005;
const GPS_ALT = 0x0006;
const GPS_TIMESTAMP = 0x0007;
const GPS_MAP_DATUM = 0x0012;
const GPS_DATESTAMP = 0x001d;
const TAG_ORIENTATION = 0x0112;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_THUMB_COMPRESSION = 0x0103;
const TAG_THUMB_OFFSET = 0x0201;
const TAG_THUMB_LENGTH = 0x0202;
const TAG_THUMB_WIDTH = 0x0100;
const TAG_THUMB_HEIGHT = 0x0101;

/** Everything above, out of a TIFF block whose offset 0 is the byte order mark. */
export function readTiffExif(tiff: Uint8Array): PhotoExif | null {
	if (tiff.length < 8) return null;
	let little: boolean;
	if (tiff[0] === 0x49 && tiff[1] === 0x49)
		little = true; // "II"
	else if (tiff[0] === 0x4d && tiff[1] === 0x4d)
		little = false; // "MM"
	else return null;
	if (readU16(tiff, 2, little) !== 42) return null;
	const ifd0Offset = readU32(tiff, 4, little);
	if (ifd0Offset == null || ifd0Offset <= 0 || ifd0Offset >= tiff.length) return null;
	const ifd0 = readIfd(tiff, ifd0Offset, little);
	if (!ifd0) return null;

	const orientEntry = ifd0.entries.get(TAG_ORIENTATION);
	const orientation = (orientEntry && getShortAt(tiff, orientEntry, 0, little)) || 1;

	let lat: number | undefined;
	let lng: number | undefined;
	let alt: number | undefined;
	let gpsTime: number | undefined;
	let datum: string | undefined;

	const gpsOffEntry = ifd0.entries.get(TAG_GPS_IFD);
	const gpsOffset = gpsOffEntry && getLongAt(tiff, gpsOffEntry, 0, little);
	if (gpsOffset != null && gpsOffset > 0 && gpsOffset < tiff.length) {
		const gps = readIfd(tiff, gpsOffset, little);
		if (gps) {
			const latRefE = gps.entries.get(GPS_LAT_REF);
			const latE = gps.entries.get(GPS_LAT);
			const lngRefE = gps.entries.get(GPS_LNG_REF);
			const lngE = gps.entries.get(GPS_LNG);
			const altRefE = gps.entries.get(GPS_ALT_REF);
			const altE = gps.entries.get(GPS_ALT);
			const tsE = gps.entries.get(GPS_TIMESTAMP);
			const dsE = gps.entries.get(GPS_DATESTAMP);
			const datumE = gps.entries.get(GPS_MAP_DATUM);

			const latAbs = latE && dms(tiff, latE, little);
			const lngAbs = lngE && dms(tiff, lngE, little);
			if (latAbs != null && lngAbs != null) {
				// The sign lives entirely in the Ref tag — the three rationals
				// themselves are always unsigned. Get this backwards and a photo
				// taken south or west of the equator/prime meridian lands in the
				// wrong hemisphere instead.
				const latRef = latRefE && getAscii(tiff, latRefE);
				const lngRef = lngRefE && getAscii(tiff, lngRefE);
				lat = latRef?.trim().toUpperCase().startsWith('S') ? -latAbs : latAbs;
				lng = lngRef?.trim().toUpperCase().startsWith('W') ? -lngAbs : lngAbs;
			}

			if (altE) {
				const altAbs = getRationalAt(tiff, altE, 0, little);
				if (altAbs != null) {
					const ref = altRefE ? getByteAt(tiff, altRefE, 0) : 0;
					alt = ref === 1 ? -altAbs : altAbs;
				}
			}

			if (dsE && tsE) {
				const dateStr = getAscii(tiff, dsE);
				const h = getRationalAt(tiff, tsE, 0, little);
				const m = getRationalAt(tiff, tsE, 1, little);
				const s = getRationalAt(tiff, tsE, 2, little);
				if (dateStr != null && h != null && m != null && s != null) gpsTime = gpsDateTime(dateStr, h, m, s);
			}

			if (datumE) {
				const d = getAscii(tiff, datumE);
				if (d) datum = d.trim();
			}
		}
	}

	if (lat == null || lng == null) return null; // no usable coordinate
	if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	if (lat === 0 && lng === 0) return null; // the null island a failed read so often produces

	// GPSDateStamp/GPSTimeStamp are UTC and unambiguous; they win outright.
	// DateTimeOriginal is local and only usable once OffsetTimeOriginal states
	// how far from UTC — a bare local time with no offset is not a moment in
	// time, so it is left alone rather than guessed at.
	let time = gpsTime;
	if (time == null) {
		const exifOffEntry = ifd0.entries.get(TAG_EXIF_IFD);
		const exifOffset = exifOffEntry && getLongAt(tiff, exifOffEntry, 0, little);
		if (exifOffset != null && exifOffset > 0 && exifOffset < tiff.length) {
			const exifIfd = readIfd(tiff, exifOffset, little);
			if (exifIfd) {
				const dtoE = exifIfd.entries.get(TAG_DATETIME_ORIGINAL);
				const offE = exifIfd.entries.get(TAG_OFFSET_TIME_ORIGINAL);
				const dto = dtoE && getAscii(tiff, dtoE);
				const off = offE && getAscii(tiff, offE);
				if (dto && off) time = parseDateTimeWithOffset(dto, off);
			}
		}
	}

	// IFD1: the thumbnail, when the tags say there is a compressed (JPEG) one.
	// `ifd0.next` must move strictly forward — a backward or self pointer is
	// refused rather than followed, which is what keeps a corrupted file from
	// being read as its own thumbnail IFD.
	let thumbnail: ExifThumbnail | undefined;
	if (ifd0.next > ifd0Offset && ifd0.next < tiff.length) {
		const ifd1 = readIfd(tiff, ifd0.next, little);
		if (ifd1) {
			const compE = ifd1.entries.get(TAG_THUMB_COMPRESSION);
			const comp = compE && getShortAt(tiff, compE, 0, little);
			if (comp === 6) {
				const offE = ifd1.entries.get(TAG_THUMB_OFFSET);
				const lenE = ifd1.entries.get(TAG_THUMB_LENGTH);
				// Both are relative to the TIFF block's own start, not to IFD1.
				const off = offE && getLongAt(tiff, offE, 0, little);
				const len = lenE && getLongAt(tiff, lenE, 0, little);
				if (off != null && len != null && len > 0 && off >= 0 && off + len <= tiff.length) {
					if (tiff[off] === 0xff && tiff[off + 1] === 0xd8) {
						const wE = ifd1.entries.get(TAG_THUMB_WIDTH);
						const hE = ifd1.entries.get(TAG_THUMB_HEIGHT);
						const width = wE
							? (getShortAt(tiff, wE, 0, little) ?? getLongAt(tiff, wE, 0, little))
							: undefined;
						const height = hE
							? (getShortAt(tiff, hE, 0, little) ?? getLongAt(tiff, hE, 0, little))
							: undefined;
						thumbnail = { bytes: tiff.slice(off, off + len), width: width ?? 0, height: height ?? 0 };
					}
				}
			}
		}
	}

	return { lng, lat, alt, time, datum, orientation, thumbnail };
}

/** findExif + readTiffExif. Null unless a usable coordinate came out. */
export function parseExif(bytes: Uint8Array): PhotoExif | null {
	const tiff = findExif(bytes);
	return tiff ? readTiffExif(tiff) : null;
}

/** A photo's WGS-84 [lng, lat], whatever datum it was written in. */
export function photoWgs84(exif: PhotoExif, setting: PhotoDatum): [number, number] {
	if (setting === 'wgs84') return [exif.lng, exif.lat];
	if (setting === 'gcj02') return gcj2wgs(exif.lng, exif.lat);
	// 'auto': trust a datum the file actually states when it names GCJ-02;
	// otherwise WGS-84, which is both what the EXIF specification calls for
	// and what the measured Xiaomi export turned out to be written in.
	return exif.datum && /gcj/i.test(exif.datum) ? gcj2wgs(exif.lng, exif.lat) : [exif.lng, exif.lat];
}

/** Mirrors `buildProperties` in `parse.ts`: `name` only when non-empty,
 *  `times` only when there is a real timestamp to carry — not re-exported
 *  from there because `parse.ts` keeps it private to its own readers. */
function photoProperties(name: string, time: number | undefined): Record<string, unknown> | null {
	const props: Record<string, unknown> = {};
	if (name) props.name = name;
	if (time != null) props.times = [time];
	return Object.keys(props).length > 0 ? props : null;
}

/** The one-Point ParsedTrack the track pipeline already knows how to draw. */
export function photoTrack(exif: PhotoExif, name: string, setting: PhotoDatum): ParsedTrack {
	const [lng, lat] = photoWgs84(exif, setting);
	const coordinates: Position = exif.alt != null ? [lng, lat, exif.alt] : [lng, lat];
	return {
		features: [
			{
				type: 'Feature',
				properties: photoProperties(name, exif.time),
				geometry: { type: 'Point', coordinates },
			},
		],
	};
}
