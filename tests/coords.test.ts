import { describe, expect, it } from 'vitest';
import {
	COORD_MODES,
	bd2gcj,
	gcj2bd,
	gcj2wgs,
	knownMode,
	outOfChina,
	projectCenter,
	projectGeometry,
	resolveSystem,
	systemFromTiles,
	toTileSpace,
	toWgs84,
	wgs2gcj,
} from '../src/coords';

/* Metres per degree, near enough for asserting that an offset is the size the
 * literature says it is. */
const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

function metres(a: readonly [number, number], b: readonly [number, number]): number {
	const lat = (a[1] + b[1]) / 2;
	return Math.hypot((a[0] - b[0]) * mPerDegLng(lat), (a[1] - b[1]) * M_PER_DEG_LAT);
}

const TIANANMEN: [number, number] = [116.397428, 39.90923];
const SHANGHAI: [number, number] = [121.4737, 31.2304];
const TOKYO: [number, number] = [139.6917, 35.6895];
const NEW_YORK: [number, number] = [-74.006, 40.7128];

describe('outOfChina', () => {
	it('covers the mainland and rejects everywhere else', () => {
		expect(outOfChina(...TIANANMEN)).toBe(false);
		expect(outOfChina(...SHANGHAI)).toBe(false);
		expect(outOfChina(...TOKYO)).toBe(true);
		expect(outOfChina(...NEW_YORK)).toBe(true);
	});
});

describe('wgs2gcj / gcj2wgs', () => {
	/* Regression guards, produced by this implementation. They exist to catch a
	 * refactor silently changing the arithmetic, not to certify the constants. */
	it.each([
		['Tiananmen', TIANANMEN, [116.40367163, 39.91063351]],
		['Shanghai', SHANGHAI, [121.47822306, 31.22845774]],
	])('shifts %s to a fixed GCJ-02 position', (_name, wgs, expected) => {
		const gcj = wgs2gcj(wgs[0], wgs[1]);
		expect(gcj[0]).toBeCloseTo(expected[0], 7);
		expect(gcj[1]).toBeCloseTo(expected[1], 7);
	});

	it('offsets Chinese positions by the several hundred metres the offset is known to be', () => {
		expect(metres(TIANANMEN, wgs2gcj(...TIANANMEN))).toBeGreaterThan(300);
		expect(metres(TIANANMEN, wgs2gcj(...TIANANMEN))).toBeLessThan(700);
		expect(metres(SHANGHAI, wgs2gcj(...SHANGHAI))).toBeGreaterThan(300);
		expect(metres(SHANGHAI, wgs2gcj(...SHANGHAI))).toBeLessThan(700);
	});

	it('is the identity outside China', () => {
		expect(wgs2gcj(...TOKYO)).toEqual(TOKYO);
		expect(wgs2gcj(...NEW_YORK)).toEqual(NEW_YORK);
		expect(gcj2wgs(...TOKYO)).toEqual(TOKYO);
	});

	it('round-trips to well under a millimetre', () => {
		for (const point of [TIANANMEN, SHANGHAI]) {
			const back = gcj2wgs(...wgs2gcj(...point));
			expect(metres(point, back)).toBeLessThan(0.001);
		}
	});
});

describe('gcj2bd / bd2gcj', () => {
	/* BD-09's inverse is closed-form but the trigonometry is not quite exact, so
	 * the residual is centimetres rather than the nanometres GCJ manages. */
	it('round-trips to within 0.2 m', () => {
		for (const point of [TIANANMEN, SHANGHAI, TOKYO, NEW_YORK]) {
			const back = bd2gcj(...gcj2bd(...point));
			expect(metres(point, back)).toBeLessThan(0.2);
		}
	});

	it('moves Baidu positions about a kilometre from GPS', () => {
		const bd = toTileSpace('bd09', ...TIANANMEN);
		expect(metres(TIANANMEN, bd)).toBeGreaterThan(1000);
		expect(metres(TIANANMEN, bd)).toBeLessThan(1600);
	});
});

describe('toTileSpace / toWgs84', () => {
	it('is the identity for wgs84', () => {
		expect(toTileSpace('wgs84', ...TIANANMEN)).toEqual(TIANANMEN);
		expect(toWgs84('wgs84', ...TIANANMEN)).toEqual(TIANANMEN);
	});

	it('round-trips through every system, in China and out of it', () => {
		for (const system of ['wgs84', 'gcj02', 'bd09'] as const) {
			for (const point of [TIANANMEN, SHANGHAI, TOKYO, NEW_YORK]) {
				const back = toWgs84(system, ...toTileSpace(system, ...point));
				// BD-09 stacks its own residual on top of GCJ's; both stay far
				// below GPS noise, which is what actually matters on a map.
				expect(metres(point, back), `${system} at ${point.join(',')}`).toBeLessThan(0.2);
			}
		}
	});
});

describe('systemFromTiles', () => {
	it.each([
		['https://webrd01.is.autonavi.com/appmaptile?x={x}', 'gcj02'],
		['https://rt0.map.gtimg.com/tile?z={z}', 'gcj02'],
		['https://mt1.google.cn/vt/lyrs=m&x={x}', 'gcj02'],
		['https://maponline0.bdimg.com/tile/?qt=vtile', 'bd09'],
		['https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'wgs84'],
		['https://t0.tianditu.gov.cn/vec_w/wmts', 'wgs84'],
	])('reads %s as %s', (url, expected) => {
		expect(systemFromTiles(url)).toBe(expected);
	});

	it('accepts a list and takes the first match', () => {
		expect(systemFromTiles(['https://tile.openstreetmap.org/x', 'https://webrd01.is.autonavi.com/y'])).toBe(
			'gcj02'
		);
	});

	it('falls back to wgs84 for nothing, junk and non-strings', () => {
		expect(systemFromTiles(undefined)).toBe('wgs84');
		expect(systemFromTiles([])).toBe('wgs84');
		expect(systemFromTiles([null as unknown as string, 42 as unknown as string])).toBe('wgs84');
	});
});

describe('knownMode', () => {
	it('accepts every offered mode, trimmed', () => {
		for (const mode of COORD_MODES) expect(knownMode(` ${mode} `)).toBe(mode);
	});

	it('rejects anything else', () => {
		expect(knownMode('')).toBeNull();
		expect(knownMode('mars')).toBeNull();
		expect(knownMode(undefined)).toBeNull();
		expect(knownMode(7)).toBeNull();
	});
});

describe('resolveSystem', () => {
	it('takes an explicit mode over the tiles', () => {
		expect(resolveSystem('wgs84', { mapTiles: 'https://webrd01.is.autonavi.com/x' })).toBe('wgs84');
		expect(resolveSystem('bd09', { mapTiles: 'https://tile.openstreetmap.org/x' })).toBe('bd09');
	});

	it('reads the tiles under auto, light or dark', () => {
		expect(resolveSystem('auto', { mapTiles: 'https://webrd01.is.autonavi.com/x' })).toBe('gcj02');
		expect(resolveSystem('auto', { mapTilesDark: ['https://maponline0.bdimg.com/x'] })).toBe('bd09');
		expect(resolveSystem('auto', { mapTiles: 'https://tile.openstreetmap.org/x' })).toBe('wgs84');
	});

	it('treats an unknown mode as auto, and no config as wgs84', () => {
		expect(resolveSystem('nonsense', { mapTiles: 'https://webrd01.is.autonavi.com/x' })).toBe('gcj02');
		expect(resolveSystem('auto', null)).toBe('wgs84');
		expect(resolveSystem(undefined, undefined)).toBe('wgs84');
	});
});

describe('projectGeometry', () => {
	it('returns the same object untouched for wgs84', () => {
		const geometry = { type: 'Point', coordinates: TIANANMEN } as const;
		expect(projectGeometry(geometry, 'wgs84')).toBe(geometry);
	});

	it('moves a LineString without mutating the original', () => {
		const original = { type: 'LineString' as const, coordinates: [TIANANMEN.slice(), SHANGHAI.slice()] };
		const moved = projectGeometry(original, 'gcj02');
		expect(original.coordinates[0]).toEqual(TIANANMEN);
		expect(moved.coordinates[0]).toEqual(wgs2gcj(...TIANANMEN));
		expect(moved.coordinates[1]).toEqual(wgs2gcj(...SHANGHAI));
	});

	it('keeps elevation and any other trailing members', () => {
		const moved = projectGeometry({ type: 'Point', coordinates: [...TIANANMEN, 43.5, 99] }, 'gcj02');
		expect(moved.coordinates.slice(2)).toEqual([43.5, 99]);
	});

	it('recurses into MultiPolygon rings and GeometryCollections', () => {
		const polygon = projectGeometry(
			{ type: 'MultiPolygon', coordinates: [[[TIANANMEN.slice(), SHANGHAI.slice(), TIANANMEN.slice()]]] },
			'gcj02'
		);
		expect(polygon.coordinates[0][0][0]).toEqual(wgs2gcj(...TIANANMEN));

		const collection = projectGeometry(
			{
				type: 'GeometryCollection',
				geometries: [{ type: 'Point', coordinates: TIANANMEN.slice() }],
			},
			'gcj02'
		);
		expect(collection.geometries[0]).toEqual({ type: 'Point', coordinates: wgs2gcj(...TIANANMEN) });
	});

	it('leaves empty coordinate lists alone', () => {
		expect(projectGeometry({ type: 'LineString', coordinates: [] }, 'gcj02').coordinates).toEqual([]);
	});
});

describe('projectCenter', () => {
	it('gives back the shape it was handed, still latitude-first', () => {
		const gcj = wgs2gcj(116.397428, 39.90923);
		expect(projectCenter('39.90923,116.397428', 'gcj02')).toBe(`${gcj[1]},${gcj[0]}`);
		const asArray = projectCenter([39.90923, 116.397428], 'gcj02') as number[];
		expect(asArray[0]).toBeCloseTo(gcj[1], 10);
		expect(asArray[1]).toBeCloseTo(gcj[0], 10);
	});

	it('tolerates the bracketed form a base file may hold', () => {
		expect(projectCenter('[39.90923, 116.397428]', 'gcj02')).toBe(projectCenter('39.90923,116.397428', 'gcj02'));
	});

	it('passes through anything it cannot read', () => {
		expect(projectCenter(undefined, 'gcj02')).toBeUndefined();
		expect(projectCenter(null, 'gcj02')).toBeNull();
		expect(projectCenter('somewhere', 'gcj02')).toBe('somewhere');
		expect(projectCenter('a,b', 'gcj02')).toBe('a,b');
	});

	it('is the identity for wgs84', () => {
		expect(projectCenter('39.9,116.4', 'wgs84')).toBe('39.9,116.4');
	});
});
