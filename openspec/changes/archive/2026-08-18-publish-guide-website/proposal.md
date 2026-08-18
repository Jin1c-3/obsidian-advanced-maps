## Why

The user guide is eight bilingual Markdown pages that only exist inside the
repository, so a reader who finds the plugin in Obsidian's community store lands
on a GitHub file browser rather than on a navigable, searchable site. The guide
also still tells people to copy release files by hand, even though Advanced Maps
is listed at <https://community.obsidian.md/plugins/advanced-maps> and installs
from inside Obsidian. The figures illustrating it were captured against a
Chinese Obsidian UI from a demo folder that is rebuilt and deleted every time,
which makes every new figure expensive and the existing set unusable for an
English site.

## What Changes

- Publish the guide as a documentation website on GitHub Pages at
  `https://jin1c-3.github.io/obsidian-advanced-maps/`, built with Astro
  Starlight and the `starlight-theme-obsidian` plugin so the site reads like
  Obsidian Publish, with a language switcher, sidebar, and offline search.
- Reorganize `docs/` so the same Markdown serves GitHub and the site:
  `docs/guide/en/` and `docs/guide/zh-cn/` replace the `*.md` / `*.zh-CN.md`
  suffix pairs, and the figures move from `docs/*.png` to `docs/images/`.
  **BREAKING** for anyone who has bookmarked a `docs/guide/<page>.md` URL.
- Rewrite the install instructions in both READMEs and both `getting-started`
  pages to the in-app path — turn off Restricted mode, **Browse**, search
  _Advanced Maps_, **Install**, **Enable** — with the community-store link, and
  demote the manual release copy and BRAT to a fallback for pre-release builds.
- Add a nested `website/` npm project and a Pages deployment workflow, and gate
  the site build plus a link check in CI so a broken guide link fails a pull
  request instead of the deploy.
- Establish one persistent demo folder in the maintainer's jot vault as the only
  source of screenshots, captured against an English Obsidian UI, and recapture
  all eighteen existing figures from it so both locales share one English set.

## Capabilities

### New Capabilities

- `published-documentation`: the guide as a published bilingual website — its
  source layout, locale parity, navigation, figures, install guidance, the
  deployment that publishes it, and the checks that keep it honest.

### Modified Capabilities

- `maintainer-workflow`: the guide-update rule now names the per-locale
  directories and requires a new page to reach the site's navigation; the local
  vault requirement gains the persistent demo folder; screenshots gain an
  English-UI and no-private-data rule.

## Impact

- Documentation: `docs/guide/**` restructured into `en/` and `zh-cn/`,
  `docs/*.png|jpg|gif` moved to `docs/images/`, all eighteen figures recaptured;
  link updates in `README.md`, `README.zh-CN.md`, `CLAUDE.md`, `CONTRIBUTING.md`,
  and the `maintainer-workflow` spec.
- Build and CI: new `website/` project with its own pinned `package.json`
  (Astro 5/Starlight and `starlight-theme-obsidian` are peer-pinned together);
  new `.github/workflows/docs.yml`; a site-build and link-check step added to
  `CI / format · lint · types · tests · build`; `.gitignore`, `.prettierignore`,
  and the ESLint ignore list extended so the nested project's output does not
  enter the plugin's lint, format, or bundle paths.
- Repository settings: GitHub Pages must be enabled with the GitHub Actions
  source, and the repository homepage set to the site.
- Plugin runtime: none. No TypeScript under `src/`, no setting, no persisted
  data, and no bundle semantics change.
