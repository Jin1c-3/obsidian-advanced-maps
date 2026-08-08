import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
	{
		ignores: ['node_modules/', 'coverage/', 'main.js', 'main.js.map', 'dist/'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			globals: { ...globals.browser },
			parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
			],
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
		},
	},
	{
		files: ['tests/**/*.ts'],
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
	}
);
