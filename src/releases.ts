import entries from './releases.json';
import type { Locale } from './i18n';

export interface ReleaseSummary {
	version: string;
	en: string;
	zh: string;
}

interface Version {
	parts: number[];
	prerelease: string[];
}

function versionParts(version: string): Version | null {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/.exec(version);
	return match ? { parts: match.slice(1, 4).map(Number), prerelease: match[4]?.split('.') ?? [] } : null;
}

function compareVersions(a: Version, b: Version): number {
	for (let i = 0; i < 3; i++) {
		if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
	}
	if (a.prerelease.length === 0 || b.prerelease.length === 0) {
		return Number(b.prerelease.length > 0) - Number(a.prerelease.length > 0);
	}
	for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
		const left = a.prerelease[i];
		const right = b.prerelease[i];
		if (left === undefined) return -1;
		if (right === undefined) return 1;
		if (left === right) continue;
		const leftNumeric = /^\d+$/.test(left);
		const rightNumeric = /^\d+$/.test(right);
		if (leftNumeric && rightNumeric) return Number(left) - Number(right);
		if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
		return left < right ? -1 : 1;
	}
	return 0;
}

export function releaseSummaries(
	installed: string,
	releases: readonly ReleaseSummary[] = entries
): {
	current: ReleaseSummary | undefined;
	history: ReleaseSummary[];
} {
	const current = releases.find((entry) => entry.version === installed);
	const version = versionParts(installed);
	const history = version
		? releases
				.map((entry) => ({ entry, version: versionParts(entry.version) }))
				.filter(
					(item): item is { entry: ReleaseSummary; version: Version } =>
						item.version !== null && compareVersions(item.version, version) < 0
				)
				.sort((a, b) => compareVersions(b.version, a.version))
				.map(({ entry }) => entry)
		: [];
	return { current, history };
}

export function releaseText(release: ReleaseSummary, locale: Locale): string {
	return release[locale];
}
