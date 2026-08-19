## Why

The pane reads as if it were arguing with the reader. Descriptions explain
themselves — "which is what makes…", "rather than…", an em-dash aside per
sentence — and several run to five lines for a switch. `settings.trackProps.intro`
is six lines about nine switches. A settings row has room for what a thing does
and what happens when it is off; the reasoning belongs in the guide, which has
pictures and worked examples for exactly that.

Three shapes are wrong too:

- **Track properties is eighteen rows for nine figures.** A switch, then the box
  it hides and shows, then the next switch. Flipping one re-renders the pane
  because a row appears or disappears.
- **The skip list is a comma-separated box.** The setting it feeds is a list of
  paths, and the reader has to type them from memory — while Obsidian has a
  folder suggester, the one the core Templates plugin uses for its folder.
- **That box could not be emptied.** It was placeholder-backed, so clearing it
  restored `templates`. That was a guard against an accidentally cleared box
  stamping every template; as a list, deleting the last row is an answer.

## What Changes

- Rewrite every settings description and page introduction in both locales:
  shorter, plainer, one thing per sentence. Several row names go with them —
  **Base file path** → **Base file**, **Enable location** → **Use device
  location**, **Skip paths containing** → **Skip these folders**, **Shallowest /
  Deepest level in the pack** → **Lowest / Highest zoom level**, **Track property
  prefix** → **Property prefix**, **Show photos on the map** → **Show photos**,
  **Fan out pins that share a spot** → **Fan out overlapping pins**, and the nine
  "Distance property" rows to "Distance". Every guide passage naming one is
  corrected in both locales.
- Give each track figure one row: the name it is written under, with its switch
  beside it. The box is disabled rather than removed while the switch is off, and
  the nine sit under their own heading below the prefix.
- Make the skip list a list: one folder row apiece, each with the vault's folder
  suggester, with add and delete. What is stored is the same comma-separated
  string, so nothing about matching changes and no vault needs migrating.
- Drop `autoFillExclude` from the placeholder-backed keys. An emptied list now
  means nothing is skipped, and the list says so where its rows would be.

## Impact

- Affected specs: `maintainer-workflow`.
- Affected code: `src/i18n.ts`, `src/settings.ts`, `styles.css`.
- Affected docs: `docs/guide/{en,zh-cn}/` — around-and-navigation,
  coordinates-and-services, offline-basemap, photo-maps, tracks-and-areas,
  reference-and-privacy.
- No settings key, default or stored value changes. One behavior does: an empty
  skip list is now empty rather than restored to `templates`.
