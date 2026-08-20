## Why

Every page of the guide is organized by feature, which is the right shape for
someone deciding what to build and the wrong shape for someone whose map is
already not doing what they expected. A reader looking at an empty map does not
know whether they have a Bases problem, a coordinate-property problem, or a
plugin that never loaded, so they cannot tell which of the ten pages is theirs.

The answers exist and are scattered. A question already filed against this
repository — a note drawing two maps, the base view's and the inline one — was
answered in a comment thread, and the rule behind it (`!` is the whole
difference between an embed and a link) lives in the middle of a page about
tracks. The seven feature switches that shipped in 1.18.5 can each remove a menu
item a reader used yesterday, and the table listing them sits on the reference
page, under a heading few readers open unless they already suspect a switch.

The plugin also says a great deal when something is wrong — it names the missing
Base, the view a Base does not have, the figure list nobody switched on, the
provider key it needs — and none of those sentences appears anywhere in the
guide, so a reader who reads one has nowhere to look it up.

## What Changes

- **A page organized by symptom**, in both locales: what the reader sees, what
  is actually happening, and which page owns the feature. Thirteen entries under
  six headings, from "nothing is on the map" to "nothing here matches".
- **The two-maps rule gets a table.** Embed, link, and property, against what
  each one draws — the answer that was previously only in an issue thread.
- **A missing command is treated as a first symptom**, not a footnote, because
  a switch takes the whole feature and the reader has no way to know that.
- **The plugin's own notices are named** where they are the fastest route to the
  cause, so a reader who reads one recognises it in the guide.
- **A closing section says what to put in a report**, so an issue arrives with
  the versions, the filter, the property and the screenshot already in it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `published-documentation`: a new requirement covers the symptom-organized
  page, what an entry has to be traceable to, and telling a reader what to
  report when nothing matches.

## Impact

- `docs/guide/en/common-questions.md` and `docs/guide/zh-cn/common-questions.md`:
  new, one per locale.
- `docs/guide/en/README.md` and `docs/guide/zh-cn/README.md`: one more workflow
  row, which the site draws as one more card.
- `website/astro.config.mjs`: the page's slug, in the sidebar's reference group.
