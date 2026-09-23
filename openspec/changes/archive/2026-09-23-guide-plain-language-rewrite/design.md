# Design

## Context

See proposal.md — Why. Two constraints shape the rewrite beyond the prose itself.

First, the guide is a linked artifact, not a folder of pages. `common-questions.md`
links into five headings on four other pages by anchor; `photo-maps.md` links back
into its own subsection; each page links the sibling locale; and
`.github/scripts/check-docs-links.mjs` requires the two locales to hold identical
file names, every page to appear as a slug in `website/astro.config.mjs`, and
every relative link to resolve. The check resolves `#anchor` targets by file, not
by heading, so a renamed heading silently breaks a reader's jump without failing
CI — the rewrite has to hold heading text where another page links to it, or move
both ends together.

Second, the prose is already the reference for behavior that exists nowhere else:
the settings table on `reference-and-privacy.md`, the nine track properties and
their units, the icon-name table, the pack path and zoom rules. That content is
load-bearing and correct; the defect is the voice around it, not the facts.

## Goals / Non-Goals

**Goals:**

- Rewrite the prose of all 22 guide pages and both READMEs in plain language,
  keeping every fact, figure, link, and shipped label.
- Delete implementation detail from user-facing prose without deleting behavior
  the reader needs.
- Keep the rewrite reviewable: one commit-visible unit of work per page-group, so
  a reviewer reads a diff of prose rather than of structure.
- Leave the repository's checks green — link check, both-locales check, sidebar
  check, formatting — with no change to any file the checks read besides the
  prose.

**Non-Goals:**

- No new page, no removal of a page, no rename of a page file. The sidebar and
  the locale-pairing check stay untouched by construction.
- No new figure, and no change to `docs/images/` or to `website/` beyond a slug
  if a page heading a link targets is reworded.
- No change to plugin behavior, settings, commands, or i18n strings. A label the
  UI shows stays exactly as shipped, including its capitalization.
- No change to `CONTRIBUTING.md` or the specs beyond the requirement set this
  change adds.

## Decisions

**1. Rewrite page by page, locale-paired, ordered by dependency.**

Each pass rewrites one English page and its Chinese counterpart in the same
commit. `common-questions.md` goes last, because it links into headings on four
other pages and its symptom entries quote what the plugin says on screen; writing
it first would mean revisiting it after every anchor it points at moves.

Order: `getting-started` → `photo-maps` → `tracks-and-areas` →
`marker-icons-and-colors` → `places-in-and-out` → `around-and-navigation` →
`offline-basemap` → `coordinates-and-services` → `reference-and-privacy` →
`common-questions` → both `README.md` files.

The Chinese pages are rewritten from the new English text, not translated from
the old Chinese text. The old Chinese pages carry the same voice defect in
Chinese; a word-for-word translation of the new English would produce a page that
reads as translated, which is the defect in a different form.

**2. Keep the heading a link targets; reword the prose under it.**

Five anchors are targets today:

- `photo-maps.md#photo-index-and-file-reads`
- `reference-and-privacy.md#turning-a-feature-off`
- `around-and-navigation.md#open-the-current-note-in-that-map`
- `coordinates-and-services.md#search-and-reverse-geocode`
- `getting-started.md#on-mobile`

None of these headings exists on its page today: `around-and-navigation.md`
carries "Open in map", not "Open the current note in that map"; `photo-maps.md`
carries "Photo index and file reads"; `coordinates-and-services.md` carries
"Search and reverse geocoding". Two of the five are already broken jumps, and the
check cannot see it because it resolves the file and discards the fragment.

Fix them by moving both ends: reword the heading to a question the reader asks
and update the one link that points at it, in the same pass. Where the target
heading cannot be reworded without losing meaning, keep the heading and update
nothing.

**3. Cut implementation detail by category, not by sentence.**

The prose carries five kinds of internal, and each has a different replacement:

| What is in the prose today                                         | Replacement                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Read sizes, cache layout, index invalidation, head reads           | State the outcome: later runs place photos faster; a changed file is re-read    |
| Internal thresholds that shape a figure (5 m climb, 0.9 km/h)      | Keep, as one clause — the reader sees the figure move and would misattribute it |
| Host routes and resource schemes (`_capacitor_file_`)              | Delete; the sentence says the photo appears on the map                          |
| Emulator and version narration ("verified on Android 16 … 1.13.7") | State the outcome for that platform, and what the other platform shows          |
| Self-description ("this plugin", "Advanced Maps does not …")       | Address the reader; say what happens, not who is doing it                       |

The thresholds stay because they are the exception the requirement allows: a
reader who sees a climb of 40 m where their watch says 60 m needs the clause.

**4. Restructure inside a page, not between pages.**

The user allowed section reshuffles. Sections move within a page so the order is
what the reader does first — setup, action, result, troubleshooting — and a
section that only repeats another page's content is deleted in favour of a link.
Content does not move between pages, so each page keeps the topic its index row
and its sidebar entry promise.

**5. Record the rules in the schema, so the next change inherits them.**

Two places, because they act on different people:

- `published-documentation` gains the requirement set: it is the contract the
  guide is checked against, and it is what a reviewer cites.
- `openspec/config.yaml` gains per-artifact rules under `rules.proposal` and
  `rules.tasks`, so the wording of a future change's own artifacts follows the
  same discipline. Guide prose rules stay in the spec, where they are testable
  against the pages.

## Risks / Trade-offs

[Risk] A rewrite drops a fact a reader depended on. → Mitigation: the pass for
each page is diffed against the old page for facts, not for wording, before it
moves on; deleted sentences are only the five categories in Decision 3.

[Risk] Rewording a heading breaks a jump from another page. → Mitigation: the
five anchors in Decision 2 are the complete set, and both ends move in one pass;
`node .github/scripts/check-docs-links.mjs` re-run after each page-group.

[Risk] The Chinese page drifts from the English one in content. → Mitigation:
same pass, same commit, and the locale-pairing check enforces equal file sets;
the two pages keep section-for-section correspondence.

[Risk] Plain language becomes vague language, and a limit the reader needs is
lost. → Mitigation: every callout, prerequisite, and platform limit stays in
place; the requirement states the answer comes before the caveat, not that the
caveat goes away.

[Risk] The rewrite is too large to review as one diff. → Mitigation: 11
page-groups plus one README group, each its own task and its own commit, in the
order of Decision 1.

## Migration Plan

Documentation only; there is nothing to migrate and nothing to roll forward. Each
page-group is a commit, so a bad rewrite reverts as one commit. `npm run check`
and `node .github/scripts/check-docs-links.mjs` must pass at the end of every
group, which is the rollback signal: a group that fails them is either fixed or
reverted before the next one starts.

## Open Questions

None. The two decisions the user made before planning — the scope covers the
READMEs, and page sections may be restructured — are settled.
