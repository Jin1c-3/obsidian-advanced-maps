/*
 * Type-aware, and with Obsidian's own plugin rules on.
 *
 * Both are here because the community-plugin scorecard lints with them, and a
 * finding that only shows up on a web page after a release is a finding nobody
 * sees. `recommendedTypeChecked` is what catches the `any` flowing out of
 * JSON.parse and out of the undeclared internals; `eslint-plugin-obsidianmd` is
 * what catches using `document.createElement` over `createEl`, casting to
 * `TFile` instead of narrowing, and calling deprecated settings API.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default tseslint.config(
	{
		ignores: ['node_modules/', 'coverage/', 'main.js', 'main.js.map', 'dist/'],
	},
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...obsidianmd.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			globals: { ...globals.browser },
			parserOptions: { ecmaVersion: 2022, sourceType: 'module', projectService: true },
		},
		rules: {
			// `caughtErrors: 'all'` is the default and is the one worth keeping:
			// an unused `catch (e)` is a binding that says nothing an optional
			// catch binding does not say better.
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			// TypeScript resolves names itself, and does it correctly inside a
			// `declare module` augmentation, where this rule does not.
			'no-undef': 'off',
			// The Bases view registry, the marker manager and MapLibre are all
			// undocumented; src/types/obsidian-internals.d.ts describes the parts
			// this plugin touches, and `any` is the honest type for the rest.
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
			eqeqeq: ['error', 'smart'],
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'prefer-const': 'error',
		},
	},
	{
		files: ['**/*.mjs', 'vitest.config.ts'],
		languageOptions: {
			globals: { ...globals.node },
		},
		rules: {
			'no-console': 'off',
			// Build scripts, not plugin code: they run in Node by definition, and
			// a build that says nothing while it works is worse, not better.
			'obsidianmd/no-nodejs-modules': 'off',
			'obsidianmd/rule-custom-message': 'off',
		},
	},
	{
		files: ['**/*.mjs'],
		extends: [tseslint.configs.disableTypeChecked],
	},
	{
		files: ['tests/**/*.ts'],
		rules: {
			// The stub stands in for Obsidian itself, so it cannot be written with
			// Obsidian's own helpers — `createDiv` is the very thing it provides.
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/prefer-get-language': 'off',
		},
	},
	{
		files: ['tests/**/*.ts'],
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
	}
);
