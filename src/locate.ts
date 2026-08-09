/*
 * Where the device thinks it is, for stamping into a note.
 *
 * The only source is `navigator.geolocation` — the same Web API the browser
 * offers, which Obsidian inherits on every platform it ships on. Both map
 * plugins that came before this one register their location features on mobile
 * only, on the grounds that the desktop has no provider to ask; that was true of
 * older Electron builds, where Chromium's only fallback was Google's network
 * service and the API key for it is a build-time secret Electron does not ship.
 * Current Chromium asks the operating system instead — the Windows location
 * service, CoreLocation on macOS — so the desktop is worth asking too, and this
 * module is deliberately platform-blind.
 *
 * What it is not is optimistic. A platform that cannot answer would otherwise be
 * asked once per note opened, forever, so the first failure that arrives before
 * any success trips a breaker and no further attempt is made this session.
 * Explicitly invoking the command resets it: asking by hand is a statement that
 * something has changed.
 *
 * Fixes are WGS-84, which is exactly what the vault stores — see coords.ts, and
 * do not "fix" this by converting. The GCJ-02/BD-09 shift belongs on the way to
 * the tiles, not on the way to disk.
 */

import { t, type TranslationKey } from './i18n';

/** A position fix. WGS-84, like everything this plugin writes down. */
export interface Fix {
	lat: number;
	lng: number;
	/** The platform's own 68 %-confidence radius, in metres. */
	accuracy: number;
	timestamp: number;
}

/**
 * Six decimals is about 11 cm — well past what any GPS delivers, but it is what
 * the vault already holds, and rounding harder would make every re-stamp look
 * like the note moved.
 */
export const COORD_DIGITS = 6;

/** The shape stored in frontmatter: "lat,lng", no space, matching what is there. */
export function formatFix(fix: Fix, digits: number = COORD_DIGITS): string {
	return `${fix.lat.toFixed(digits)},${fix.lng.toFixed(digits)}`;
}

/**
 * Is this property value waiting to be filled in?
 *
 * `coords:` with nothing after it parses as null, which is the signal a template
 * uses to say "somebody please fill this in". An empty string and an empty list
 * mean the same thing to a human, so they count too. A value that is already
 * there is never touched.
 */
export function isBlank(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0 || value.every(isBlank);
	return false;
}

/** Which of the four failures this was, as something a person can read. */
export function errorKey(error: Pick<GeolocationPositionError, 'code'>): TranslationKey {
	switch (error.code) {
		case 1:
			return 'notice.locate.denied';
		case 2:
			return 'notice.locate.unavailable';
		case 3:
			return 'notice.locate.timeout';
		default:
			return 'notice.locate.failed';
	}
}

/**
 * A denied permission is the one failure that will not right itself: the answer
 * is stored per-origin and nothing this plugin does will change it. The rest —
 * no fix indoors, a timeout — are transient in principle, but a platform with no
 * provider at all reports them identically, so they are only forgiven once the
 * platform has proved it can answer at least once.
 */
export function shouldGiveUp(error: Pick<GeolocationPositionError, 'code'>, everSucceeded: boolean): boolean {
	if (error.code === 1) return true;
	return !everSucceeded;
}

/**
 * `maximumAge` lets Chromium hand back a fix it already has, which is what keeps
 * stamping three notes in a row from costing three cold GPS acquisitions. The
 * timeout is generous because a cold fix on a phone genuinely takes that long.
 */
export const GEOLOCATION_OPTIONS: PositionOptions = {
	enableHighAccuracy: true,
	timeout: 15000,
	maximumAge: 30000,
};

export interface LocatorHost {
	/** `null` on a platform with no geolocation at all. */
	geolocation: Geolocation | null;
	/** Told once, when the breaker trips, so the silent path can explain itself. */
	onGiveUp?: (message: string) => void;
}

export class Locator {
	private everSucceeded = false;
	private broken = false;
	/** The most recent failure, breaker-tripping or not, for the caller to report. */
	private lastError: TranslationKey | null = null;
	/** One request in flight is plenty: `file-open` and `changed` both fire. */
	private inflight: Promise<Fix | null> | null = null;

	constructor(private readonly host: LocatorHost) {}

	/** Worth asking? False once the breaker has tripped, or with no provider. */
	available(): boolean {
		return this.host.geolocation !== null && !this.broken;
	}

	/** Why the last attempt came back empty-handed. */
	lastFailure(): TranslationKey | null {
		return this.lastError;
	}

	/** Asking by hand says something changed; believe it and try again. */
	reset(): void {
		this.broken = false;
	}

	/**
	 * A fix, or null with the reason already reported. Concurrent callers share
	 * one request rather than racing the platform for the same answer.
	 */
	locate(): Promise<Fix | null> {
		if (this.inflight) return this.inflight;
		const request = this.request().finally(() => {
			this.inflight = null;
		});
		this.inflight = request;
		return request;
	}

	private request(): Promise<Fix | null> {
		const geolocation = this.host.geolocation;
		if (!geolocation) {
			this.fail('notice.locate.noProvider', true);
			return Promise.resolve(null);
		}
		return new Promise<Fix | null>((resolve) => {
			geolocation.getCurrentPosition(
				(position) => {
					this.everSucceeded = true;
					this.lastError = null;
					resolve({
						lat: position.coords.latitude,
						lng: position.coords.longitude,
						accuracy: position.coords.accuracy,
						timestamp: position.timestamp,
					});
				},
				(error) => {
					console.warn('Advanced Maps: geolocation failed', error);
					this.fail(errorKey(error), shouldGiveUp(error, this.everSucceeded));
					resolve(null);
				},
				GEOLOCATION_OPTIONS
			);
		});
	}

	private fail(reason: TranslationKey, giveUp: boolean): void {
		this.lastError = reason;
		if (!giveUp || this.broken) return;
		this.broken = true;
		this.host.onGiveUp?.(t('notice.locate.gaveUp', { reason: t(reason) }));
	}
}
