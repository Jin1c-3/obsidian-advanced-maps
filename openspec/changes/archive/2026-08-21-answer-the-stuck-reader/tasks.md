## 1. The page

- [x] 1.1 Collect the symptoms worth answering from the plugin's own notice
      strings, the guide's stated limits, and the one question filed against the
      repository
- [x] 1.2 Write the English page: symptom headings grouped into sections, each
      entry naming the cause and linking the page that owns the feature
- [x] 1.3 Write the Simplified Chinese page with the same entries in the same
      order, using each label as Obsidian's Chinese interface writes it
- [x] 1.4 Close both with what to include in a report

## 2. Where it is reached from

- [x] 2.1 Add the page to both locales' guide index, as one more workflow row
- [x] 2.2 Add its slug to the site's sidebar, in the reference group
- [x] 2.3 Confirm the cross-page anchors it uses resolve in both locales,
      including the Chinese heading anchors

## 3. Proof

- [x] 3.1 `node .github/scripts/check-docs-links.mjs`
- [x] 3.2 `npm run docs:build`, and read the published page in both locales
- [x] 3.3 `npm run check`
