# CLAUDE.md

Technical entry point for Advanced Maps. The [README](README.md) is the concise
project landing page; user-facing behavior belongs in the
[user guide](docs/guide/en/README.md); setup and contribution workflow belong in
[CONTRIBUTING.md](CONTRIBUTING.md); stable technical contracts belong in the
[OpenSpec capabilities](#capability-specs).

## What this plugin is

Advanced Maps extends the first-party Maps view registered by Bases. It does
not subclass, fork, or vendor that view, and it bundles no map renderer. The
native view supplies MapLibre, backgrounds, controls, markers, and popups.

The plugin requires Obsidian 1.13.1 or newer with Bases enabled and the
first-party Maps plugin installed. If the expected native registration is not
available, Advanced Maps reports or skips the unavailable enhancement and
leaves the host usable.

## Commands

```bash
npm run dev         # watch build into OBSIDIAN_PLUGIN_DIR, with .hotreload
npm run build       # typecheck, then create a minified production bundle
npm run deploy      # one-off production build into the configured vault
npm test            # run Vitest once (also test:watch and test:coverage)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (lint:fix applies fixes)
npm run format      # Prettier (format:check verifies)
npm run check       # CI-equivalent format, lint, types, tests, build, smoke
npm run docs:dev    # serve the documentation site from docs/guide
npm run docs:build  # build the documentation site into website/dist
```

Copy `.env.example` to the ignored `.env` and point `OBSIDIAN_PLUGIN_DIR` at a
test vault's `.obsidian/plugins/advanced-maps` directory. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full branch, PR, test, and release
workflow.

## Source map

```text
src/
  main.ts, track-layer.ts        plugin lifecycle and one native map enhancement
  layers.ts, geometry.ts         owned MapLibre sources, layers, icons, bounds
  basemap.ts                     a tile pack on disk as one map's background
  track-cache.ts, parse.ts       cached GPX/GeoJSON/KML/TCX/photo ingestion
  exif.ts                        bounded EXIF/container reader
  embed.ts, photo-modal.ts       inline track maps and photo presentation
  coords.ts, spread.ts, stats.ts pure coordinate, pin, and route arithmetic
  map-block.ts, modal.ts         Around views and open-in-map presentation
  geolink.ts, link-modal.ts      coordinates parsed from pasted map links
  geocode.ts, search-modal.ts    place search and reverse-geocoding boundary
  maplinks.ts                    external-map URL construction
  places.ts, places-modal.ts     saved places into notes, and back out as files
  locate.ts                      device-location policy and session breaker
  settings.ts, view-options.ts   declarative settings and native view options
  map-events.ts                  paired MapLibre listener ownership
  i18n.ts                        English and Chinese localization tables
  constants.ts                   extensions, ids, limits, and visual knobs
  types/obsidian-internals.d.ts  undocumented host shapes and provenance
tests/                            Vitest suites; no vault required
docs/
  guide/en, guide/zh-cn          the user guide, one directory per locale
  images/                        every published figure, shared by all surfaces
website/
  astro.config.mjs               Starlight, both locales, sidebar, base path
  scripts/sync-docs.mjs          copies docs/guide into the content collection
  src/styles/obsidian.css        Starlight tuned to look like Obsidian
```

The guide is written in `docs/` and only rendered by `website/`. Add a page under
both `docs/guide/en/` and `docs/guide/zh-cn/`, link it from each locale's
`README.md`, and add its slug to the sidebar in `website/astro.config.mjs`;
`node .github/scripts/check-docs-links.mjs` fails if any of the three is missed.

## Non-negotiable rules

- Extend the native Maps registration; do not introduce a replacement map view
  or bundled map dependency.
- Wrap methods on individual view/manager instances, never prototypes. Restore
  saved own properties, delete inherited wrappers, and pair every direct
  MapLibre `on` with its exact `off` through `MapEventBindings`.
- Treat every undocumented internal as optional at runtime. Shape-check before
  use, stand down safely when it changes, and declare new assumptions with
  provenance in `src/types/obsidian-internals.d.ts` instead of casting to
  `any` at the call site.
- Vault coordinates and supported track files remain WGS-84. Transform only at
  the map boundary: once into the tile datum for drawing, once back to WGS-84
  for values read, shown, copied, or written.
- Resolve note attachments from `cache.embeds`, `cache.links`, and
  `cache.frontmatterLinks` separately. All three count on a base map; only an
  actual embed creates an inline map. Preserve de-duplication and cache
  invalidation across create, rename, delete, mtime, and photo-datum changes.
- Preserve source/layer removal order, style-recovery gates, newest-revision
  checks, and async cancellation. A native map may outlive this plugin, while
  an inline map owns a bounded WebGL and decoded-image lifecycle.
- Keep settings declarative and route writes through the typed update seam.
  Visual changes must explicitly refresh existing and lazy views; unresolved
  asynchronous data is not the same as a confirmed empty result.
- Keep source comments adjacent and narrow: units, bounds, malformed-input
  handling, async order, resource ownership, security, and undocumented API
  provenance. Put observable behavior in specs, cross-cutting rationale in a
  change design, repeatable proof in tests, and setup/workflow in contributor
  docs.
- Do not mix comment/documentation cleanup with executable refactors. For a
  behavior-preservation change, inspect TypeScript diffs and run
  `npm run check` before the PR.

## Capability specs

- [Native map integration](openspec/specs/native-map-integration/spec.md)
- [Track map rendering](openspec/specs/track-map-rendering/spec.md)
- [Photo map rendering](openspec/specs/photo-map-rendering/spec.md)
- [Pin spreading](openspec/specs/pin-spreading/spec.md)
- [Coordinate datum](openspec/specs/coordinate-datum/spec.md)
- [Offline basemap](openspec/specs/offline-basemap/spec.md)
- [Note and map navigation](openspec/specs/note-map-navigation/spec.md)
- [Location and geocoding](openspec/specs/location-and-geocoding/spec.md)
- [Inline track maps](openspec/specs/inline-track-maps/spec.md)
- [External map links](openspec/specs/external-map-links/spec.md)
- [Place interchange](openspec/specs/place-interchange/spec.md)
- [Published documentation](openspec/specs/published-documentation/spec.md)
- [Maintainer workflow](openspec/specs/maintainer-workflow/spec.md)

During an unarchived OpenSpec change, proposed deltas live under
`openspec/changes/<change>/specs/`; archiving promotes them to the stable paths
above.
