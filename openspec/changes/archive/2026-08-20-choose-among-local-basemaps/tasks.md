## 1. Several packs in settings

- [x] 1.1 Replace the single path and its two zoom numbers with a list of named
      packs, each carrying a name, a path template and its own two bounds, and a
      statement of which one is the plugin's default background
- [x] 1.2 Migrate on load: a non-empty old path becomes the first entry, named
      after the last segment of its path, and becomes the default background; an
      empty one produces an empty list and no visible change
- [x] 1.3 Drop the old keys when the settings are next written, and confirm a
      reader who never configured a pack ends up with no new rows to read
- [x] 1.4 Keep the placeholder check per pack, reported where that pack's path is
      entered rather than once for the whole list

## 2. Resolving a pack

- [x] 2.1 Take the pack to resolve as an argument rather than reading the one
      setting, keeping the prefix derivation, the vault base and the never-store
      rule exactly as they are
- [x] 2.2 Carry each pack's own zoom bounds through to the source bound and the
      camera bound, so a map changing packs is bounded by the one it now draws
- [x] 2.3 Bring a camera left outside the new pack's range back into it when a
      map changes to a pack with a different range

## 3. What background a map is on

- [x] 3.1 Hold the reader's picked background per view, in memory, cleared when
      the enhancement detaches and never written to a file
- [x] 3.2 Read that one value everywhere the background is decided, so the
      `loadConfig` path and the pick path cannot disagree
- [x] 3.3 Resolve the background for a map as: the reader's pick if there is one,
      else what the view names, else the plugin's default background
- [x] 3.4 Confirm the measured flip-flop is gone: a pick survives a configuration
      reload, and what is offered reports the background actually drawn

## 4. Offering packs where the host offers backgrounds

- [x] 4.1 Wrap the native map initialisation per view and, for the duration of
      that call only, hand it a tile-set array holding the host's own entries
      plus one `{id, name}` per configured pack
- [x] 4.2 Restore the host's own array in a `finally`, so it is restored on the
      throwing path too, and assert nothing of this plugin's is left in it
- [x] 4.3 Add an entry standing for the background the native view resolves, only
      when the host has no backgrounds of its own, so a pack is always reversible
      from the map
- [x] 4.4 Answer this plugin's own ids in the tile-set switch rather than letting
      the native method decline them: set the picked background, rebuild the
      config, restyle, and apply that pack's bounds
- [x] 4.5 Record the host's own id when the reader picks one of the host's
      backgrounds, and let the native method run as it does today — clearing it
      instead would leave the next configuration reload substituting the pack
      they just switched away from, which is the defect this change removes
- [x] 4.6 Shape-check before installing any of this, stand down when the shape is
      absent, and restore on unload, so the host's menu is exactly what it was

## 5. The view's own choice

- [x] 5.1 Turn the per-view row into a picker over the backgrounds that exist
      when the pane is opened: the default background, each host background, each
      pack
- [x] 5.2 Read a stored `off` as naming the default background, so a base file
      written before this change keeps drawing what it drew
- [x] 5.3 Fall back to the default background when a stored value names nothing,
      and report that where the choice is made rather than change its meaning
- [x] 5.4 Keep an inline track map following the plugin's default background,
      since it has no view options of its own

## 6. Tests

- [x] 6.1 Cover the settings migration: one old path becomes one named default
      pack, an empty one becomes an empty list, and neither loses a zoom bound
- [x] 6.2 Cover resolving and bounding a named pack, including two packs whose
      ranges differ
- [x] 6.3 Cover choosing a background: a pick wins over the view's own choice, a
      view's choice wins over the plugin default, and a name that resolves to
      nothing falls back to the default background
- [x] 6.4 Cover the augmented list: the host's own array is unchanged afterwards,
      the default entry appears only when the host has none, and an absent or
      unexpected shape adds nothing

## 7. Verify against a running map

- [x] 7.1 With two packs of different colours and different ranges configured,
      pick each from the map's own menu and confirm the map draws it and bounds
      to its range
- [x] 7.2 Reproduce the original defect's steps and confirm the outcome changed:
      pick a host background, force a configuration reload, and confirm the map
      still draws what was picked
- [x] 7.3 Confirm a pick does not survive closing and reopening the view, and
      that no file changed
- [x] 7.4 With no host backgrounds configured, confirm the control appears and
      offers the default background beside the packs
- [x] 7.5 Confirm the host's own tile sets still switch as they do today, and
      that its settings file is byte-identical afterwards
- [x] 7.6 Repeat the pick and the reload on the Android emulator, since that is
      where the defect was measured — and note that on this machine it was the
      _only_ surface that could draw: WSL lost its WebGL context, so the desktop
      was verified to the configuration and the picker but not to the pixels

## 8. Guide

- [x] 8.1 Rewrite `offline-basemap.md` for several packs and for picking one from
      the map, keeping the sync-or-not guidance and the dot-folder layout
- [x] 8.2 Say what a view's background choice does and what happens to a base
      file that names a background the vault does not have
- [x] 8.3 Carry both edits into `docs/guide/zh-cn/`, in the guide's own Chinese
      voice
- [x] 8.4 Refresh any figure that shows the single-pack settings row — there is
      none: the page carries no figures, and no other page shows those rows

## 9. Verification

- [x] 9.1 Confirm the diff leaves the packs read-only and writes nothing into the
      host plugin's settings
- [x] 9.2 Run `node .github/scripts/check-docs-links.mjs`
- [x] 9.3 Run `openspec validate choose-among-local-basemaps --strict`
- [x] 9.4 Run `npm run check`
