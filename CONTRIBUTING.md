# Contributing

## Getting set up

```bash
npm install
cp .env.example .env      # point OBSIDIAN_PLUGIN_DIR at a test vault
npm run dev
```

The target vault must have Bases enabled and the first-party Maps plugin
installed. Installing [pjeby/hot-reload](https://github.com/pjeby/hot-reload)
in that vault lets the `.hotreload` marker written by `npm run dev` apply saved
builds without restarting Obsidian. Keep personal vault paths in the ignored
`.env`; committed examples must remain machine-independent.

## Architecture and changes

[CLAUDE.md](CLAUDE.md) is the concise technical entry point and links all
capability specs. The [user guide](docs/guide/en/README.md) is the canonical home
for user-facing instructions; keep the root README as a concise landing page.
The guide is also published at
<https://jin1c-3.github.io/obsidian-advanced-maps/>, built from those same files
by the Astro Starlight project in `website/` — nothing under `website/src/content`
is edited by hand.
Read the specs for observable contracts, the relevant active or archived
OpenSpec design for cross-cutting rationale, and adjacent source comments for
narrow implementation constraints.

Use an OpenSpec change when work adds or changes a stable behavior, invariant,
compatibility boundary, or maintainer contract. Keep executable proof in tests
rather than copying transcripts into documentation.

The patching code reaches undocumented Obsidian internals. Wrap instances rather
than prototypes, validate every runtime shape before use, and record any new
internal in `src/types/obsidian-internals.d.ts` with its provenance. A missing
internal is an expected compatibility outcome, not an exception to throw.

## Branch and pull-request workflow

Ordinary work follows this loop:

1. Update local `main` from the remote.
2. Create a focused short-lived branch.
3. Implement and validate one coherent change.
4. Push the branch and open a pull request.
5. Resolve conversations and wait for
   `CI / format · lint · types · tests · build` to pass.
6. Squash-merge into `main`; the remote deletes the merged branch.

Do not push ordinary changes directly to `main`. This is a solo-maintained
repository, so pull requests require zero approving reviews; the PR and required
CI are still mandatory. Administrator bypass is for emergencies only. Record
the reason and run the same checks before, or immediately after, any bypass.
Dependabot and routine automation use pull requests and the same CI rather than
a broad direct-push exemption.

Keep a PR focused and squashable. Link its OpenSpec change or explain why the
change has no specification impact. For behavior-preservation work, include the
diff review or live-vault evidence that supports that claim.

## Before opening a PR

```bash
npm run check
```

This is the CI sequence: formatting, type-aware lint (including
`eslint-plugin-obsidianmd`), typecheck, Vitest and coverage gates, manifest
validation, production build, bundle smoke loading, and the documentation
reference check.

A change that touches the guide should also build the site, which CI does on
every pull request:

```bash
npm --prefix website ci   # once
npm run docs:build        # or docs:dev to read it at localhost:4321
```

A new guide page needs the same file name under `docs/guide/en/` and
`docs/guide/zh-cn/`, a link from each locale's `README.md`, and its slug in the
`sidebar` list in `website/astro.config.mjs`. Figures live in `docs/images/` and
are referenced as `../../images/<name>`, which resolves both in this repository
and on the site.

Pure modules and their per-file coverage thresholds are configured in
`vitest.config.ts`. Changes to coordinate conversion, parsers, statistics,
external links, geometry, event binding, location decisions, view options,
Around views, geolink/geocoding, pin spreading, or localization need focused
tests in the same PR.

View wrappers also need a real vault with a live Bases map. Exercise the changed
seam there when relevant and record what was tried and observed in the PR.

## Figures

Every figure in `docs/images/` is captured from one persistent demo folder in a
local vault — never from real notes. The folder is self-contained and excluded
from the vault's own bases, so nothing personal can reach a screenshot.

```text
<vault>/advanced-maps-demo/
  places/   13 landmark notes: coords + a kind property the base colours by
  routes/   6 GPX walks and rides, West Lake as GeoJSON with island holes,
            3 lakeside parks as KML
  trips/    a note per route; two embed their track, one is the Around demo
  photos/   36 geotagged JPEGs, each with an embedded thumbnail
  atlas.base  Atlas / Tracks / Areas / Photos maps and the Rides table
  _build/   the generators and the OSM, OSRM and SRTM data they ran on
```

Rules that keep the figures honest:

- **Real coordinates only.** Landmarks come from Nominatim, paths from OSRM,
  elevation from SRTM. A hand-typed coordinate a few hundred metres out looks
  exactly like the broken datum conversion several figures exist to disprove.
- **English interface.** One figure set serves both locales, so Obsidian's
  language is English when capturing. Each locale's prose names the controls in
  its own language.
- **Nothing personal.** No real note, property, name, or face. The demo
  photographs are face-free and re-tagged onto the demo walk.

Capturing, on a 1.5× display with the sidebars collapsed: size the window to
1100×792, drive the app through `obsidian eval`, take the shot with
`obsidian dev:screenshot`, then crop to the element's own rectangle with ffmpeg
(image pixels are CSS pixels × 1.5). Map graphics stay PNG quantised to 256
colours; photographic frames are JPEG. A basemap that requires attribution gets
a black strip under it, drawn with `pad` + `drawtext` — use a font with both
Latin and CJK glyphs, such as `wqy-zenhei`.

## Translations

English in `src/i18n.ts` is the source of truth. Add a complete locale table and
its `LOCALES` entry together; `tests/i18n.test.ts` verifies matching keys and
placeholders.

## Releasing

Releases are cut from `main`. Add the matching changelog section and compare
links first, confirm version metadata and CI are current, then run:

```bash
npm version patch|minor|major
git push --follow-tags
```

`version-bump.mjs` synchronizes `package.json`, `manifest.json`, and
`versions.json`. The tag workflow reruns checks, requires tag/manifest agreement,
and publishes `main.js`, `manifest.json`, and `styles.css` with build provenance.
