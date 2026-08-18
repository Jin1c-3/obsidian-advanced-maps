## Context

See `proposal.md` — Why. The constraints that shape the approach:

- The repository is an Obsidian plugin. Its `npm ci`, `eslint .`,
  `prettier --check .`, `tsc --noEmit`, and esbuild bundle all run from the root
  and must not gain a documentation toolchain's dependencies or files.
- The guide is 8 pages × 2 locales, 1673 lines total, plus 18 figures (4.6 MB)
  that `README.md`, `README.zh-CN.md`, and the guide all reference by relative
  path.
- `openspec/specs/maintainer-workflow/spec.md` already requires every
  user-visible change to update the guide in every locale; the site must not
  become a second place to remember.
- The published site's URL is fixed by GitHub project pages:
  `https://jin1c-3.github.io/obsidian-advanced-maps/`, i.e. everything is served
  under a base path, not at a domain root. Pages is not enabled on the
  repository yet.
- Figures are captured from a live Obsidian in the maintainer's own vault, and
  that vault holds private notes. ImageMagick is not available on the machine;
  ffmpeg is.

## Goals / Non-Goals

**Goals:**

- One Markdown source that both GitHub and the site render, with no manual copy.
- A site whose reading experience resembles Obsidian, with per-locale
  navigation, a locale switcher, and offline search.
- Documentation checks that fail a pull request, not the deploy.
- A figure pipeline that is cheap to repeat, so the next feature's screenshot is
  a small job rather than a rebuild of a throwaway vault.

**Non-Goals:**

- Publishing the OpenSpec capability specs, CHANGELOG, or ROADMAP as site pages.
  The site is the user guide; maintainer documentation stays in the repository.
- A custom domain, versioned documentation, or a documentation-only release
  cadence.
- A third locale. The structure must not obstruct one, but none is added here.
- Any change to the plugin's runtime, settings, or bundle.

## Decisions

### Astro Starlight with `starlight-theme-obsidian`

Chosen over Quartz 5 and VitePress. Quartz is the most Obsidian-native renderer
but ships as a clone-the-whole-repo scaffold that sits badly inside a plugin
repository, and it treats language as a UI-string setting rather than two
parallel content trees. VitePress has clean i18n but no Obsidian-styled theme,
so the look would be hand-written CSS. Starlight gives first-class i18n with a
locale switcher and per-locale sidebar, Pagefind search that ships as a static
index, and documented GitHub Pages deployment with a base path; the theme plugin
supplies the Obsidian Publish look and a site graph on top of it.

The theme is the risk in this choice, not the framework: `starlight-theme-obsidian@0.4.1`
was published 2025-08-31 with loose peers (`@astrojs/starlight >=0.33`,
`astro >=5.5`, `starlight-site-graph ^0.5.0`) and its own note that
compatibility with newer Starlight is not guaranteed, while current Starlight is
0.41.x on Astro 7. So the version choice is made by a spike with an explicit
ladder, and whichever rung passes is pinned exactly with a committed lockfile:

1. Current Starlight + Astro with the theme. Preferred — supported upstream.
2. The Starlight 0.35 / Astro 5 line the theme was published against.
3. Starlight alone, with the Obsidian palette and typography as local CSS. The
   site still meets every requirement in `published-documentation`; only the
   graph and some chrome are lost.

The spike passes when both locales build, the sidebar and locale switcher work,
search returns results, and the build emits no unresolved-component errors.

**Outcome: rung 3.** Rung 1 fails outright — Astro 7 ships zod 4, whose
`.default()` no longer parses its own default value, so the theme's
`starlightSiteGraphConfigSchema…default({})` hands the site-graph integration a
bare object where a `Map` is expected and `astro:config:setup` throws. Rung 2
builds (Astro 5.18.2, Starlight 0.37.0, theme 0.4.1, and `pixi-stats` dropped
because it is only an optional peer whose own dependency has been unpublished),
but every Astro at or below 7.0.9 carries eight high-severity advisories with no
fix available on the 5.x line: unreachable for a static site built from our own
Markdown, yet permanently red in `npm audit` and closed to Starlight 0.38+.
Rung 3 — Starlight 0.41.7 on Astro 7.2.2, `npm audit` clean, with the Obsidian
palette, radii, and 46rem reading column as `src/styles/obsidian.css` — is what
ships. The site graph is the only thing lost.

### The site is a nested project at `website/`, invisible to the plugin toolchain

`website/` gets its own `package.json` and lockfile. The root scripts gain only
thin `docs:*` wrappers (`npm --prefix website run …`). `website/` is added to
the ESLint ignore list, `.prettierignore`, and `.gitignore` (`.astro/`,
`dist/`, generated content). Alternative considered: a workspace at the root, so
one `npm ci` installs both. Rejected — it puts Astro into the plugin's
dependency graph and its lockfile, which the release build and the manifest
check both read.

### Content is copied into the site by a sync step, not loaded in place

`website/scripts/sync-docs.mjs` runs before `dev` and `build`:

| From                | To                                |
| ------------------- | --------------------------------- |
| `docs/guide/en/`    | `website/src/content/docs/en/`    |
| `docs/guide/zh-cn/` | `website/src/content/docs/zh-cn/` |
| `docs/images/`      | `website/src/content/images/`     |

The target directories are generated and ignored by git.

Alternatives considered. A Starlight custom `docsLoader({ base: '../docs' })`
avoids the copy, but couples the site to a loader option that has moved across
Starlight minors, and puts content outside `src/` where Astro's asset pipeline
does not follow relative images. A symlink from `website/src/content/docs` works
on Linux and CI but is a footgun in a Windows checkout and leaves nowhere to
apply the transforms below. The copy is ~60 lines, deterministic, and
re-runnable.

Both locales keep a URL prefix (`/en/…`, `/zh-cn/…`) and `/` redirects to
`/en/`. Making English the unprefixed root locale would put its pages one
directory shallower than Chinese, and then `../../images/x.png` could not
resolve identically from both trees — the depth symmetry is what lets one image
path work in the repository and on the site without rewriting.

### Five transforms, each with a reason

The sync step is not a plain copy. It applies exactly these, and nothing
heuristic:

1. **`README.md` → `index.md`.** GitHub renders `README.md` when a reader
   browses `docs/guide/en/`; Starlight needs `index.md` for the locale root.
   Renaming at copy time keeps both.
2. **Strip `<!-- nav:start -->…<!-- nav:end -->`.** Each page currently opens
   with a hand-written "English · 简体中文 · Guide index" line. The site has a
   locale switcher and a sidebar, so it is noise there, but a GitHub reader
   still wants it. HTML comments are invisible on GitHub, so the boundary is
   explicit rather than a guess about which line is navigation.
3. **Drop a leading `# Title` that equals the frontmatter `title`.** Source
   pages gain `title`/`description` frontmatter for Starlight, and keep their H1
   so they read as documents on GitHub. Starlight renders the title itself, so
   the duplicate is removed on the way in.
4. **Rewrite intra-guide `.md` links.** `foo.md` → `../foo/`,
   `README.md` → `../`, `../zh-cn/foo.md` → `../../zh-cn/foo/`. The extra `../`
   is not a typo: with `trailingSlash: 'always'`, a page is served at
   `/en/photo-maps/`, so a sibling page is one level up. The rule is
   base-agnostic — it produces relative URLs, so the `/obsidian-advanced-maps`
   base never has to be threaded into the Markdown. Astro may resolve relative
   `.md` links on its own; the rewrite makes that irrelevant either way.

5. **Turn links that leave the guide into repository URLs.** `../../../CHANGELOG.md`
   and `../../../openspec/specs` are real files for a repository reader and
   nothing at all for the site, so they become `blob/main` and `tree/main` URLs
   on the way in.

Image references are not rewritten. `../../images/x.png` resolves in both trees,
and Astro optimizes it through its asset pipeline — including the two animated
GIFs, which come out as animated WebP, so the contingency below is not needed.

### Navigation and titles are declared once, in the site config

The sidebar is one list of 8 entries by locale-agnostic slug. Starlight resolves
each entry to the page of the locale being read and takes its label from that
page's own `title`, so neither the order nor the labels can drift between
locales, and no translation table has to be maintained beside the pages. The
guide index page keeps its table for GitHub readers; the site's sidebar is the
same list.

### Checks are a local script, matching the repository's existing style

`.github/scripts/check-docs-links.mjs`, in the shape of the existing
`check-source-bytes.mjs` and `check-manifest.mjs` — plain Node, no dependency,
runnable from `npm run check` and as its own CI step. It verifies:

- every relative Markdown link and image reference in `docs/**`, `README.md`,
  `README.zh-CN.md`, `CLAUDE.md`, and `CONTRIBUTING.md` resolves to a file that
  exists;
- the two locale directories hold the same page names;
- every page is listed in the site's sidebar config, and every sidebar entry
  exists as a page.

External URLs are not fetched: a documentation check that fails when a third
party is briefly down is a check people learn to ignore.

The site build itself stays out of `npm run check` — it needs `website/`'s
dependencies installed, and plugin work should not pay for that. CI runs it as a
separate step, so a pull request that breaks the build still fails.

### Publishing

A `docs.yml` workflow with `pages`/`id-token` permissions, triggered by pushes
to `main` that touch `docs/**`, `website/**`, or the workflow, plus manual
dispatch. It runs the same link check and site build as CI before
`actions/deploy-pages`, so a failure publishes nothing and leaves the previous
site up. A concurrency group keeps two merges from racing the deploy. The
repository's Pages source must be switched to GitHub Actions, and its homepage
field set to the site — both are one-time settings, recorded as tasks because
they are not in the repository.

### Figures: one persistent demo folder, English UI

`advanced-maps-demo/` in the jot vault, kept between sessions. It is
self-contained — its own notes, tracks, `.base` files, and copies of the
face-free photos — so no figure can show a personal note, and the vault's
`moments.base` filter (`moments` and `assets` folders) cannot see it. Obsidian's
interface language is a per-app setting; it is switched to English once, and the
recapture is done in that session.

All 18 figures are recaptured under their existing file names, so the only path
churn is the `docs/` → `docs/images/` move. Framing, cropping, and the
attribution strip follow the existing ffmpeg recipe; map graphics stay PNG
quantised to 256 colours, photographic frames stay JPEG.

## Risks / Trade-offs

- ~~**The Obsidian theme does not support current Starlight**~~ → confirmed, and
  the ladder resolved it to rung 3. The look is now ours to maintain: roughly a
  hundred lines of CSS that no upstream release can break, at the cost of not
  tracking Obsidian's own theme if it changes. Versions are pinned exactly with a
  committed lockfile, so the site does not drift on the next install.
- **A second npm project doubles Dependabot's surface** → `website/` is added as
  its own ecosystem entry with the same monthly grouped-minor policy, so it is
  one extra PR a month rather than an unwatched tree. With the theme gone the
  tree is three direct dependencies deep, which is most of why it stays cheap.
- ~~**Astro's image pipeline may drop GIF animation**~~ → measured: both animated
  GIFs are re-encoded as animated WebP, so no fallback is needed.
- **Moving `docs/*.png` to `docs/images/` breaks external deep links** to
  existing images and to `docs/guide/<page>.md` — CHANGELOG entries and any
  outside blog post keep pointing at the old paths. Accepted: the repository has
  no redirect mechanism, the guide is nine months old, and the link check
  guarantees nothing inside the repository is left dangling.
- **Recapturing 18 figures is the bulk of the work** and cannot be verified by
  CI → each figure is checked against the passage it illustrates, and the demo
  folder persists, so a re-shoot is cheap the next time.
- **Screenshots come from one person's machine** → the demo folder's contents
  and the capture recipe are described well enough in the tasks that a rebuild
  does not depend on memory, but the figures themselves remain maintainer-only
  output.
- **The site adds a build to every documentation change** → the link check runs
  in seconds locally and catches the common failure (a moved page), so the Astro
  build failing in CI should be rare.
