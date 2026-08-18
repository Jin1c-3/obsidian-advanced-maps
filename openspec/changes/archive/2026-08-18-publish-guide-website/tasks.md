## 1. Restructure the guide source

- [x] 1.1 Move the eight English pages to `docs/guide/en/` and the eight Simplified Chinese pages to `docs/guide/zh-cn/`, dropping the `.zh-CN` suffix so both locales use the same eight file names, `README.md` among them
- [x] 1.2 Move the 18 figures from `docs/` to `docs/images/`, keeping every file name unchanged
- [x] 1.3 Add `title` and `description` frontmatter to all 16 pages in the locale's own language, keeping each page's existing `# Heading` line
- [x] 1.4 Wrap each page's "English · 简体中文 · Guide index" line in `<!-- nav:start -->` / `<!-- nav:end -->` and repoint it at the new sibling paths
- [x] 1.5 Fix every intra-guide link and image reference for the new depth (`../../images/…` for figures, `../zh-cn/<page>.md` across locales) and confirm each resolves on GitHub
- [x] 1.6 Update the guide index tables in `docs/guide/en/README.md` and `docs/guide/zh-cn/README.md` to the new file names

## 2. Rewrite the install instructions

- [x] 2.1 Replace the install section of `docs/guide/en/getting-started.md` with the in-app path — Settings → Community plugins → turn off Restricted mode → **Browse** → search _Advanced Maps_ → **Install** → **Enable** — linking <https://community.obsidian.md/plugins/advanced-maps>, and keep the Obsidian 1.13.1 / Bases / Maps prerequisites beside it
- [x] 2.2 Demote the manual `main.js`/`manifest.json`/`styles.css` copy and BRAT to a short "installing a build that is not in the store yet" note under the same section
- [x] 2.3 Mirror both edits in `docs/guide/zh-cn/getting-started.md`, using Obsidian's shipped Chinese labels for the same controls
- [x] 2.4 Apply the same rewrite to the "Requirements and install" sections of `README.md` and `README.zh-CN.md`
- [x] 2.5 Verify each named control against a running Obsidian 1.13 in both interface languages, so no step names a label that does not exist

## 3. Stand up the site project

- [x] 3.1 Spike the version ladder from `design.md`: current Starlight + Astro with `starlight-theme-obsidian`, falling back to the Starlight 0.35 / Astro 5 line, and last to Starlight alone with local Obsidian-palette CSS; record which rung passed
- [x] 3.2 Create `website/` with its own `package.json` pinning the chosen versions exactly, and commit `website/package-lock.json`
- [x] 3.3 Write `website/astro.config.mjs`: `site: 'https://jin1c-3.github.io'`, `base: '/obsidian-advanced-maps'`, `trailingSlash: 'always'`, `redirects: { '/': '/en/' }`, and Starlight with `defaultLocale: 'en'` and the `en` / `zh-cn` locales
- [x] 3.4 Declare the sidebar as one list of eight locale-agnostic slugs with English labels and `zh-cn` translations, in the guide index's order
- [x] 3.5 Set the site title, description, favicon, social links, and the "Edit this page" link pointing back at `docs/guide/` on `main`
- [x] 3.6 Add root scripts `docs:dev`, `docs:build`, and `docs:preview` that delegate with `npm --prefix website`

## 4. Sync the guide into the site

- [x] 4.1 Write `website/scripts/sync-docs.mjs` copying `docs/guide/en/` → `src/content/docs/en/`, `docs/guide/zh-cn/` → `src/content/docs/zh-cn/`, and `docs/images/` → `src/content/images/`, clearing the targets first
- [x] 4.2 Implement the four transforms: `README.md` → `index.md`; strip `<!-- nav:start -->…<!-- nav:end -->`; drop a leading H1 equal to the frontmatter title; rewrite `.md` links as `foo.md` → `../foo/`, `README.md` → `../`, `../zh-cn/foo.md` → `../../zh-cn/foo/`
- [x] 4.3 Wire the sync into `predev` and `prebuild`, and git-ignore its generated output
- [x] 4.4 Build the site and check both locales: every page renders, the sidebar and locale switcher land on the matching page, search returns results, and every figure and intra-guide link resolves under the `/obsidian-advanced-maps/` base
- [x] 4.5 Confirm the two animated GIFs still animate in the built output; if not, serve them from `website/public/` and extend the sync step to rewrite their two references with the configured base

## 5. Guard the documentation in CI

- [x] 5.1 Write `.github/scripts/check-docs-links.mjs` — plain Node, no dependency — resolving every relative Markdown link and image in `docs/**`, `README.md`, `README.zh-CN.md`, `CLAUDE.md`, and `CONTRIBUTING.md`, and reporting the referring file and missing target
- [x] 5.2 Extend it to fail when the two locale directories hold different page names, or when a page is missing from the sidebar config or a sidebar entry has no page
- [x] 5.3 Add it to `npm run check` and as its own CI step beside "Invisible bytes"
- [x] 5.4 Add a CI step that installs `website/` and runs the site build, so a pull request that breaks the site fails before merge
- [x] 5.5 Add `website/` to the ESLint ignore list and `.prettierignore`, and `.astro/` plus the generated content directories to `.gitignore`; confirm `npm run check` still passes unchanged for plugin work
- [x] 5.6 Add `website/` as a second npm ecosystem in `.github/dependabot.yml` with the same monthly grouped-minor policy

## 6. Publish

- [x] 6.1 Add `.github/workflows/docs.yml` with `pages` and `id-token` permissions, triggered on pushes to `main` touching `docs/**`, `website/**`, or the workflow, plus `workflow_dispatch`, and a concurrency group
- [x] 6.2 Have the workflow run the link check and the site build before `actions/deploy-pages`, so a failure publishes nothing
- [x] 6.3 Enable GitHub Pages on the repository with GitHub Actions as the source, and set the repository homepage to <https://jin1c-3.github.io/obsidian-advanced-maps/>
- [x] 6.4 After the first deploy, load the live site and confirm both locales, the locale switcher, search, and the figures work over the real base path

## 7. Build the persistent demo folder

- [x] 7.1 Create `advanced-maps-demo/` in the jot vault as the one persistent demo home, laid out so notes, tracks, photos, and `.base` files are self-contained, and confirm `moments.base` does not match it
- [x] 7.2 Populate it with the cases the guide illustrates: place notes with real WGS-84 coordinates, a GPX route, a GeoJSON area, a note linking a track, a note linking photos, and copies of the face-free photos — no personal note, property, or name
- [x] 7.3 Add the `.base` files the figures need — an atlas, an Around view, and a track-focused view — filtered to the demo folder and to `file.ext == "md"` where a `.base` would otherwise count itself as a row
- [x] 7.4 Switch Obsidian's interface language to English and confirm the demo `.base` views still render after a reload
- [x] 7.5 Record the folder's layout, the capture window size, and the crop rectangle in `CONTRIBUTING.md`, so the next recapture does not depend on recall

## 8. Recapture the figures in English

- [x] 8.1 Base and navigation: `map-view.png`, `around-map.png`, `follow-active-note.png`, `open-in-map.png`, `stamp-note.png`
- [x] 8.2 Services and coordinates: `place-search.png`, `link-modal.png`, `external-map.png`, `coordinate-systems.gif`
- [x] 8.3 Tracks and areas: `track-markers.png`, `track-stats-properties.png`, `area-fill.png`, `inline-embed.png`
- [x] 8.4 Photos: `photo-album.png`, `photo-map.jpg`, `photo-popup.jpg`, `photo-embed.png`, `photo-thinning.gif`
- [x] 8.5 Keep every file name and the established framing; map graphics stay PNG quantised to 256 colours, photographic frames stay JPEG, all through ffmpeg
- [x] 8.6 Check each figure against the passage it illustrates in both locales, and confirm the alternative text still describes what the new capture shows

## 9. Point the rest of the repository at the new layout

- [x] 9.1 Update the guide tables and figure paths in `README.md` and `README.zh-CN.md`, and add the site link near the top of both
- [x] 9.2 Update the user-guide references in `CLAUDE.md` and `CONTRIBUTING.md`, including where a contributor adds a page and how the site is built and previewed
- [x] 9.3 Add a CHANGELOG entry for the documentation site, the new guide paths, and the install-instruction change
- [x] 9.4 Run `npm run check`, `npm run docs:build`, and `openspec validate publish-guide-website --strict`, and confirm no tracked file outside documentation, workflows, and the site project changed
