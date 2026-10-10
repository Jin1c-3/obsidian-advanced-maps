import { describe, expect, it } from 'vitest';
import { releaseSummaries, releaseText, type ReleaseSummary } from '../src/releases';

function entry(version: string): ReleaseSummary {
	return { version, en: `English ${version}`, zh: `中文 ${version}` };
}

describe('release summaries', () => {
	it('matches the installed version and orders only earlier releases numerically', () => {
		const releases = ['1.9.0', '1.11.0', '2.0.0', '1.10.0', '1.10.2'].map(entry);
		const result = releaseSummaries('1.10.2', releases);
		expect(result.current).toBe(releases[4]);
		expect(result.history.map((release) => release.version)).toEqual(['1.10.0', '1.9.0']);
		expect(releases.map((release) => release.version)).toEqual(['1.9.0', '1.11.0', '2.0.0', '1.10.0', '1.10.2']);
	});

	it('does not substitute another summary when the installed version is missing', () => {
		const result = releaseSummaries('1.10.1', ['1.11.0', '1.9.0'].map(entry));
		expect(result.current).toBeUndefined();
		expect(result.history.map((release) => release.version)).toEqual(['1.9.0']);
	});

	it('hides history for an unrecognized version without losing an exact match', () => {
		const release = entry('development');
		expect(releaseSummaries('development', [release, entry('1.0.0')])).toEqual({ current: release, history: [] });
	});

	it('orders prereleases before the stable release and numeric identifiers numerically', () => {
		const versions = ['1.0.0', '1.0.0-rc.10', '1.0.0-rc.2', '1.0.0-rc', '1.0.0-beta', '0.9.0'];
		const releases = versions.map(entry);
		expect(releaseSummaries('1.0.0', releases).history.map((release) => release.version)).toEqual(
			versions.slice(1)
		);
		expect(releaseSummaries('1.0.0-rc.10', releases).history.map((release) => release.version)).toEqual(
			versions.slice(2)
		);
	});

	it('ignores build metadata for precedence and excludes malformed historical versions', () => {
		const releases = ['1.0.0+build', '1.0.0', '1.0.0-1', '1.0.0-alpha', 'broken'].map(entry);
		expect(releaseSummaries('1.0.0+build', releases).history.map((release) => release.version)).toEqual([
			'1.0.0-alpha',
			'1.0.0-1',
		]);
	});

	it('selects the requested language from the same release', () => {
		const release = entry('1.0.0');
		expect(releaseText(release, 'en')).toBe('English 1.0.0');
		expect(releaseText(release, 'zh')).toBe('中文 1.0.0');
	});

	it('has no history before the first recorded release', () => {
		expect(releaseSummaries('1.0.0', [entry('1.0.0')]).history).toEqual([]);
	});
});
