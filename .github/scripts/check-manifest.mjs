/*
 * Guards the three places a version lives. Obsidian installs from the release
 * tag, reads manifest.json, and consults versions.json to decide whether an
 * older app may take the update — so any drift between them ships a release
 * somebody cannot install.
 *
 * Usage: node .github/scripts/check-manifest.mjs [expected-version]
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const manifest = read('manifest.json');
const versions = read('versions.json');
const pkg = read('package.json');

const problems = [];
const expected = process.argv[2];

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(manifest.version)) {
	problems.push(`manifest.json version "${manifest.version}" is not a plain semver`);
}
if (pkg.version !== manifest.version) {
	problems.push(`package.json is ${pkg.version} but manifest.json is ${manifest.version}`);
}
if (!versions[manifest.version]) {
	problems.push(
		`versions.json has no entry for ${manifest.version} — run \`npm version\` rather than editing by hand`
	);
} else if (versions[manifest.version] !== manifest.minAppVersion) {
	problems.push(
		`versions.json says ${manifest.version} needs Obsidian ${versions[manifest.version]}, manifest.json says ${manifest.minAppVersion}`
	);
}
// Obsidian's own guidance: no "obsidian" or "plugin" in the display name, and
// an id that stays put across releases.
if (/obsidian|plugin/i.test(manifest.name)) {
	problems.push(`manifest.json name "${manifest.name}" should not contain "Obsidian" or "plugin"`);
}
for (const field of ['id', 'name', 'version', 'minAppVersion', 'description', 'author']) {
	if (!manifest[field]) problems.push(`manifest.json is missing ${field}`);
}
if (expected && expected !== manifest.version) {
	problems.push(`tag ${expected} does not match manifest.json version ${manifest.version}`);
}

try {
	const releases = read('src/releases.json');
	if (!Array.isArray(releases)) {
		problems.push('src/releases.json must contain an array of { version, en, zh } records');
	} else {
		const seen = new Set();
		for (const release of releases) {
			if (typeof release?.version !== 'string' || !release.version.trim()) {
				problems.push('src/releases.json has a record without a non-empty version string');
				continue;
			}
			if (seen.has(release.version)) {
				problems.push(`src/releases.json has duplicate version ${release.version}`);
			}
			seen.add(release.version);
		}
		const current = releases.find((release) => release?.version === manifest.version);
		if (!current) {
			problems.push(`src/releases.json has no summary for ${manifest.version}`);
		} else {
			for (const language of ['en', 'zh']) {
				const summary = current[language];
				if (typeof summary !== 'string' || !summary.trim() || /[\r\n\u2028\u2029]/.test(summary)) {
					problems.push(
						`src/releases.json summary for ${manifest.version} (${language}) must be a non-empty single-line string`
					);
				}
			}
		}
	}
} catch (error) {
	problems.push(`src/releases.json could not be read as JSON: ${error.message}`);
}

if (problems.length > 0) {
	console.error('Version metadata is inconsistent:');
	for (const problem of problems) console.error(`  · ${problem}`);
	process.exit(1);
}

console.log(`manifest.json, versions.json and package.json all agree on ${manifest.version}.`);
