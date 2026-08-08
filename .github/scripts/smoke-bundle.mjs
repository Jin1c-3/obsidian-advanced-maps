/*
 * Loads the built main.js the way Obsidian does and checks the shape it gets.
 *
 * Type checking says nothing about the bundle: a bad esbuild format, a
 * dependency that got inlined instead of externalised, or a default export that
 * did not survive would all typecheck cleanly and then fail as "this plugin
 * could not be loaded" in a vault. Cheap to catch here.
 *
 * Usage: node .github/scripts/smoke-bundle.mjs   (from the repo root)
 */
import Module from 'node:module';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const bundle = path.resolve('main.js');
const source = readFileSync(bundle, 'utf8');

/* Obsidian supplies these at runtime; anything else being required means the
 * externals list and the imports have drifted apart. */
const ALLOWED_REQUIRES = new Set(['obsidian', 'electron']);

const required = new Set();
for (const match of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) required.add(match[1]);
const unexpected = [...required].filter((name) => !ALLOWED_REQUIRES.has(name));
if (unexpected.length > 0) {
	console.error(`The bundle requires modules Obsidian will not provide: ${unexpected.join(', ')}`);
	process.exit(1);
}

class Plugin {}
const obsidianStub = new Proxy(
	{ Plugin, Component: class {}, Modal: class {}, PluginSettingTab: class {} },
	{
		// The bundle destructures whatever it imported at load time; answer
		// anything else with a harmless function.
		get: (target, prop) => (prop in target ? target[prop] : function stub() {}),
		has: () => true,
	}
);

const realLoad = Module._load;
Module._load = function load(request, ...rest) {
	if (request === 'obsidian') return obsidianStub;
	return realLoad.call(this, request, ...rest);
};

const exported = createRequire(import.meta.url)(bundle);
const PluginClass = exported?.default ?? exported;

if (typeof PluginClass !== 'function') {
	console.error('main.js does not export a plugin class; Obsidian would refuse to load it.');
	process.exit(1);
}
if (Object.getPrototypeOf(PluginClass) !== Plugin) {
	console.error('The exported class does not extend Obsidian’s Plugin.');
	process.exit(1);
}

console.log(
	`main.js loads, exports ${PluginClass.name}, and requires only: ${[...required].join(', ') || '(nothing)'}.`
);
