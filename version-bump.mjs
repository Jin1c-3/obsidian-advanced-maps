/*
 * Run by `npm version <x.y.z>`: carries the new version into manifest.json and
 * records which Obsidian release it needs in versions.json, which is how the
 * community store decides what to offer an older app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
	console.error('Run this through `npm version`, not directly.');
	process.exit(1);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');

const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');

console.log(`manifest.json and versions.json → ${targetVersion} (needs Obsidian ${minAppVersion})`);
