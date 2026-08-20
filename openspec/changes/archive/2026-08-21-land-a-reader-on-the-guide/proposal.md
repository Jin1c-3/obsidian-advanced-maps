## Why

The guide is published, bilingual, searchable and current — and it still meets a
reader as a file listing with a stylesheet.

Someone arriving from the community store lands on a heading and a two-column
table. Nothing on that page says what the plugin is, and the store page they
just left is not linked from anywhere on the site, so the one question a reader
has at that moment — how do I get this — is the one question the site does not
answer. The sidebar lists nine pages flat, in no order a newcomer can read a
shape out of.

A link to the site pasted into the Obsidian forum, a Discord, or a post renders
as a bare URL: the pages declare `twitter:card=summary_large_image` and never
name an image, so the card a reader would have seen is blank.

Every figure is a screenshot of an interface drawn into a 46rem column, where a
menu label the sentence beside it names can be four pixels tall, and there is no
way to open one. The same figure is delivered to a phone at its desktop size:
`srcset` was empty on every image the site published.

Across 1425 lines of guide prose there is not one blockquote. The sentence that
says a step is desktop-only reads exactly like the sentence next to it, and so
does the one that says a request leaves the vault.

Finally, no page says when its prose was last written, so a reader cannot tell
whether "requires Obsidian 1.13.1" is this month's sentence or last year's.

## What Changes

The guide's prose, its two locales, and its single source stay exactly as they
are. What changes is what the site does with them.

- **A landing page.** Each locale's entry page becomes a hero: the plugin's
  name, one sentence from that locale's own index page, and three actions —
  read the guide, open the plugin in a running Obsidian, and the community store
  page. The nine workflows below it become cards instead of table rows.
- **A link preview.** A card is published from the site's own origin and named
  by every page, so a shared link arrives with a picture, a title and a
  description.
- **A figure opens.** Any figure can be opened at the largest size the build
  produced, by pointer or by keyboard, with its own alternative text as the
  caption. The site draws this itself; it loads nothing to do it.
- **A figure is sized for the screen.** Responsive images are switched on, so a
  phone downloads a phone-sized copy of a desktop capture rather than the
  capture.
- **A passage can be set apart.** The guide gains callouts, written in the alert
  syntax that GitHub and Obsidian both render, so the same passage is a callout
  in a file browser, in a vault, and on the site. Both locales mark the same
  passages.
- **A date.** Every page states when its own prose last changed, read from that
  page's history rather than from the deploy.
- **Grouped navigation, and a way in.** The sidebar's nine pages are grouped
  under four headings named in the locale being read, and every page carries the
  two install links.
- **Plain text.** The guide is additionally published as `llms.txt`, for a
  reader who would rather hand it to an assistant than read it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `published-documentation`: the site's navigation gains groups and an install
  path; new requirements cover the landing page a reader arrives on, the preview
  a shared link carries, figures that open and figures sized for the screen, a
  passage set apart in both locales, the date a page states, and the plain-text
  copy of the guide.

## Impact

- `docs/guide/en` and `docs/guide/zh-cn`: `README.md` in both locales gains the
  one sentence the hero says; selected paragraphs across the guide become
  callouts, with no word changed.
- `website/astro.config.mjs`: responsive images, the preview card and the icons
  beside it, the grouped sidebar, the install links, and the two integrations
  the landing page and the plain-text guide need.
- `website/scripts/sync-docs.mjs`: alerts become asides, the index page becomes
  a hero over the same prose, its workflow table becomes cards, and every page
  carries the date of its own last commit.
- `website/scripts/make-social-card.mjs`: new, and run by hand — the card and
  the touch icon are committed files, so no build depends on a machine's fonts.
- `website/src/scripts/image-zoom.js`, `website/src/styles/obsidian.css`: the
  figure dialog and everything it looks like.
- `.github/workflows/docs.yml`: the publishing checkout fetches full history,
  which is where a page's date comes from.
