# Tasks

## 1. The contract

- [x] 1.1 Add the six writing requirements to `openspec/specs/published-documentation/spec.md` via the delta in `specs/published-documentation/spec.md`, and verify `openspec validate --changes` passes
- [x] 1.2 Add per-artifact prose rules to `openspec/config.yaml` under `rules.proposal` and `rules.tasks`, so a future change's own artifacts are written in plain language and name no implementation detail
- [x] 1.3 Verify the spec delta's requirement set covers plain language, no implementation detail, term on first use, outcome-first page, platform claim as outcome, and entry documentation

## 2. Getting started

- [x] 2.1 Rewrite `docs/guide/en/getting-started.md`: lead with what the reader gets, split every sentence carrying a clause-caveat, explain Base, frontmatter, and EXIF at first use, and drop the plugin's self-description — keep the complete `.base` sample, the four view keys, and both figures
- [x] 2.2 Rewrite `docs/guide/zh-cn/getting-started.md` from the new English text, section for section, in Chinese as written rather than as translated
- [x] 2.3 Keep the `## On mobile` heading and its text, and verify `common-questions.md`'s `getting-started.md#on-mobile` link still names a heading the page has

## 3. Photo maps

- [x] 3.1 Rewrite `docs/guide/en/photo-maps.md`: remove the 64 KiB head read, the cache-invalidation and file-revision passages, the Android emulator and Obsidian-version narration, and the `_capacitor_file_` route; state each as the outcome the reader sees
- [x] 3.2 Rewrite `docs/guide/zh-cn/photo-maps.md` from the new English text
- [x] 3.3 Reword the `### Photo index and file reads` heading and update the `photo-maps.md#photo-index-and-file-reads` link in `common-questions.md` in the same pass, and verify the jump lands on a heading that exists

## 4. Tracks and areas

- [x] 4.1 Rewrite `docs/guide/en/tracks-and-areas.md`: cut the rhetorical passages ("a boundary is not a distance travelled", "a number that describes neither"), keep the 5 m and 0.9 km/h thresholds as one clause each, and keep all nine property names, units, and sources
- [x] 4.2 Rewrite `docs/guide/zh-cn/tracks-and-areas.md` from the new English text
- [x] 4.3 Verify the syntax table, the statistics table, and both warning callouts carry the same facts as before, and that the top-to-bottom order is setup, action, result, troubleshooting

## 5. Marker icons and colors

- [x] 5.1 Rewrite `docs/guide/en/marker-icons-and-colors.md`: say what Base and frontmatter are at first use, keep the Lucide-name table and the color table verbatim, and drop the trailing version note
- [x] 5.2 Rewrite `docs/guide/zh-cn/marker-icons-and-colors.md` from the new English text

## 6. Places in and out

- [x] 6.1 Rewrite `docs/guide/en/places-in-and-out.md`: turn the six import rules into plain sentences a reader can act on, and state the datum claim as what the file holds rather than as an argument
- [x] 6.2 Rewrite `docs/guide/zh-cn/places-in-and-out.md` from the new English text

## 7. Around views and navigation

- [x] 7.1 Rewrite `docs/guide/en/around-and-navigation.md`: explain Around, Base, and the follow and measure controls at first use, keep every gesture and platform difference, and drop the "never measure anything?" aside
- [x] 7.2 Rewrite `docs/guide/zh-cn/around-and-navigation.md` from the new English text
- [x] 7.3 Reword the `## Open in map` heading to "Open the current note in that map" and verify the `common-questions.md` link naming `around-and-navigation.md#open-the-current-note-in-that-map` now lands on a heading the page has

## 8. Offline basemap

- [x] 8.1 Rewrite `docs/guide/en/offline-basemap.md`: explain what a tile pack is in one clause, keep the path template, zoom-level, and layout rules, and state the Android claim as an outcome without the emulator or version narration
- [x] 8.2 Rewrite `docs/guide/zh-cn/offline-basemap.md` from the new English text

## 9. Coordinates and services

- [x] 9.1 Rewrite `docs/guide/en/coordinates-and-services.md`: explain WGS-84, GCJ-02, and BD-09 in one clause each at first use, keep every URL template and setting label, and keep both warning callouts
- [x] 9.2 Rewrite `docs/guide/zh-cn/coordinates-and-services.md` from the new English text
- [x] 9.3 Reword the `## Search and reverse geocoding` heading and update the `coordinates-and-services.md#search-and-reverse-geocode` link in `common-questions.md` in the same pass

## 10. Reference and privacy

- [x] 10.1 Rewrite `docs/guide/en/reference-and-privacy.md`: keep the settings table, the seven-switch table, the ownership table, and the disclosure table verbatim in content, and cut the explanation of why a switch exists from each row
- [x] 10.2 Rewrite `docs/guide/zh-cn/reference-and-privacy.md` from the new English text
- [x] 10.3 Keep the `## Turning a feature off` heading and verify `common-questions.md`'s link to `reference-and-privacy.md#turning-a-feature-off` still resolves to it

## 11. Common questions

- [x] 11.1 Rewrite `docs/guide/en/common-questions.md` last, after every heading it links to is settled: keep each symptom as a heading a reader recognises, and keep the notice text a reader sees on screen
- [x] 11.2 Rewrite `docs/guide/zh-cn/common-questions.md` from the new English text
- [x] 11.3 Verify all five in-guide anchors point at headings their pages actually carry

## 12. Entry documentation

- [x] 12.1 Rewrite `README.md`: same facts and same sections in the same order, plainer sentences, no MapLibre or renderer internals in the pitch
- [x] 12.2 Rewrite `README.zh-CN.md` from the new English README, keeping the same section order

## 13. Proof

- [x] 13.1 Run `node .github/scripts/check-docs-links.mjs` and confirm every reference resolves and both locales carry the same page set
- [x] 13.2 Run `npm run format:check` and `npm run lint` and confirm both pass with no executable change
- [x] 13.3 Run `npm run docs:build` and confirm the site builds from the rewritten prose
- [x] 13.4 Reread each rewritten page for facts deleted in error, and confirm no shipped label, property name, or command name changed
