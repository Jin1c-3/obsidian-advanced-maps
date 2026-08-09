# Contributing

## Getting set up

```bash
npm install
cp .env.example .env      # OBSIDIAN_PLUGIN_DIR → a vault's plugin folder
npm run dev
```

Install [pjeby/hot-reload](https://github.com/pjeby/hot-reload) in that vault
and saves take effect without restarting Obsidian. `npm run dev` writes the
`.hotreload` marker it looks for.

You need a vault with **Bases** on and the first-party **Maps** plugin
installed; there is nothing for this plugin to extend otherwise.

## Before opening a PR

```bash
npm run check     # prettier, eslint, tsc, vitest — the same set CI runs
```

## What the tests cover, and what they cannot

`src/coords.ts`, `src/parse.ts`, `src/geometry.ts`, `src/view-options.ts` and
`src/i18n.ts` run outside Obsidian and are held above 90 % coverage. Anything
touching the coordinate maths or a parser needs a test in the same PR.

The view wrappers cannot be tested here — they need a live Bases map. Try them
in a real vault and say in the PR what you tried.

## House rules for the patching code

This plugin reaches into undocumented Obsidian internals. Two rules keep that
survivable:

- **Wrap instances, never prototypes.** An instance wrapper dies with the view
  and `delete` restores the original. A prototype patch outlives the plugin.
- **Check before you reach.** Every entry point verifies the shape it expects
  and stands down quietly when Obsidian has moved on. A missing internal is an
  expected outcome, not an exception to throw.

`src/types/obsidian-internals.d.ts` is the written record of what is assumed.
If you lean on a new internal, declare it there with a note on where it came
from, rather than casting to `any` at the call site.

[CLAUDE.md](CLAUDE.md) is the architecture document: the registry patch, the
coordinate pipeline, and a "non-obvious things to leave alone" list that exists
because each entry looks like dead weight and is not. Read it before simplifying.

## Translations

Add a table to `src/i18n.ts` and a line to `LOCALES`. English is the source of
truth: its keys are the key type, so the compiler will list what is missing, and
`tests/i18n.test.ts` checks placeholders match across languages.

## Releasing

Maintainers only:

```bash
npm version patch|minor|major
git push --follow-tags
```

`version-bump.mjs` keeps `manifest.json` and `versions.json` in step; CI refuses
a release where the tag and the manifest disagree.
