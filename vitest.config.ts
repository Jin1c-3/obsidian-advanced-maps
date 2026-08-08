import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			// The published `obsidian` package is types only; give the runtime
			// something to import so a test can pull in modules that use it.
			obsidian: fileURLToPath(new URL('./tests/obsidian-stub.ts', import.meta.url)),
		},
	},
	test: {
		// parseGpx leans on the browser's own XML parser rather than shipping a
		// GPX library, so the tests need a DOM.
		environment: 'happy-dom',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reportsDirectory: 'coverage',
			reporter: ['text', 'lcov'],
			// Only the parts that can run outside Obsidian are worth a threshold;
			// the view wrappers need a live Bases map to mean anything.
			include: ['src/coords.ts', 'src/parse.ts', 'src/geometry.ts', 'src/view-options.ts', 'src/i18n.ts'],
			thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
		},
	},
});
