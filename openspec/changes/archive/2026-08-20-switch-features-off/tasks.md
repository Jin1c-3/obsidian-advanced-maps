## 1. One shape for seven switches

- [x] 1.1 Add the seven keys to the settings type, each documented with what it
      takes away rather than what it turns on, and default the six behavioural
      ones to on so an absent key reads as the plugin behaves today
- [x] 1.2 Compute the offline basemap's default once where settings are read,
      beside the single-pack migration already there: on when at least one pack
      is configured after that migration, off otherwise, and written with the
      next settings write
- [x] 1.3 Route each flip through the pane's existing write dispatch, so each
      refreshes exactly what it changed and re-renders the pane, which decides
      whether the rows under it are inert

## 2. Offline basemap

- [x] 2.1 Answer with no packs while the feature is off, at the one method every
      consumer of "which packs are there" already reads through, and confirm the
      settings pane is unaffected because it reads the stored rows directly
- [x] 2.2 Install nothing in the host's settings object while the feature is off:
      no array swapped across `initializeMap`, so the host's control keeps its
      live reference to the host's own list
- [x] 2.3 Leave the background group out of a map's view options while the
      feature is off, and confirm a stored `offlineTiles` value in a base file is
      left in that file untouched
- [x] 2.4 Never hand the host a background of this plugin's: pass an id on to the
      native configuration only when it is not one of ours, which also covers a
      stale `pack:` id naming a pack that has been removed
- [x] 2.5 Keep the tile-set switch wrapper installed while the feature is off —
      its other branch reprojects the camera, replaces the location dot and
      redraws the tape for the host's own backgrounds
- [x] 2.6 Make the flip reach maps already open: a map drawing a pack returns to
      the background it would have without one, and the packs leave the control's
      menu, through the basemap refresh those maps already run

## 3. The note's own menus

- [x] 3.1 Gate the note-menu item and the open-in-map command on their switch,
      the command through the check it already runs so the palette hides it
- [x] 3.2 Gate the editor-menu item and the nearby-map command the same way, and
      confirm an Around view already written to a base and an embed already in a
      note are untouched either way

## 4. The map's own menu

- [x] 4.1 Gate the map menu's `New note here` on its switch, leaving the one
      read of the clicked coordinate that the remaining items share
- [x] 4.2 Gate every external destination, built-in and custom, on one switch
      above the per-provider arrangement, and confirm the arrangement itself is
      untouched by a flip
- [x] 4.3 Gate the map menu's `Export places` and the track file's
      `Import places` on the one switch they share

## 5. Inline route maps

- [x] 5.1 Claim the track extensions only while inline maps are on, recomputing
      which are unclaimed at the moment of claiming so an extension another
      plugin has taken meanwhile is left with its owner
- [x] 5.2 Release the extensions and tear down the inline maps on screen when the
      switch goes off, through the same teardown the plugin runs on unload, so no
      graphics context is left held by a feature that is off
- [x] 5.3 Establish what switching on reaches in the running app — a markdown
      preview asked to render again, an embed in the editing view — and state in
      the row what has to be reopened, whichever way it answers

## 6. The settings pane

- [x] 6.1 Put each switch on the page its feature is already configured on: the
      offline basemap page, the open-in-map page twice, the map-buttons page, the
      external maps page, and the tracks page
- [x] 6.2 Give the exchange of places a page of its own holding its one switch,
      the way pin spreading is one toggle on a page of its own
- [x] 6.3 Widen the map-buttons page's heading and intro from the buttons this
      plugin adds to what it adds to a map view, buttons and menu items alike
- [x] 6.4 Make a switched-off feature's own rows inert and leave them stating what
      they hold: the packs and the default pack, the providers and the custom
      destinations, the menu label, the Around view name, and the inline map's
      own rows — while the base path, the view name, the coordinate property and
      the place property stay live, being read by other features
- [x] 6.5 Verify `disabled` per control type used above, and leave a control live
      rather than hidden where it cannot be made inert
- [x] 6.6 Say where the offline basemap switch is that turning it on reaches a map
      already open through its own options, and its background control when that
      map is opened again
- [x] 6.7 Add a name and a description per switch to both locales, and the heading
      and intro for the new page

## 7. Tests

- [x] 7.1 Cover the offline basemap default: settings holding a pack read as on,
      settings holding none read as off, and an explicit value of either survives
      being read again
- [x] 7.2 Cover the six behavioural defaults: an absent key reads as on
- [x] 7.3 Cover the view options: the background group is present with the feature
      on and absent with it off, with the other groups in their existing places
- [x] 7.4 Cover the background handed to the host: a pack id, a stale pack id and
      the default background are never passed on as a native tile-set id, while a
      host id still is
- [x] 7.5 Cover the packs reader answering empty while the feature is off, and the
      default background falling back with it
- [x] 7.6 Cover the extensions claimed on a flip: only those unclaimed at that
      moment, and none while the feature is off

## 8. Verify against a running app

- [x] 8.1 With no pack configured, confirm the host's own background control lists
      exactly what the host configured, and that a background added in the Maps
      settings tab reaches an open map's control the next time it is opened —
      which is the defect this change exists to remove
- [x] 8.2 With a pack configured, switch the feature off and confirm the map
      returns to the background it would have without one, the packs leave the
      menu, and nothing is removed from the configuration
- [x] 8.3 Switch it back on and confirm the packs are pickable from the map's own
      options at once, and from the background control once that map is reopened
- [x] 8.4 Switch each menu feature off and confirm the item is gone from the next
      menu opened and its command is gone from the palette, and that the menus'
      other items are unchanged
- [x] 8.5 Switch inline maps off with an inline map on screen: confirm it is torn
      down, that a note embedding a track file afterwards shows the host's own
      embed, and that the extensions are released
- [x] 8.6 Confirm the host plugin's settings file is byte-identical after all of
      the above
- [x] 8.7 Repeat 8.1, 8.2 and 8.4 on the Android emulator, since the settings pane
      lays out differently there and a menu is a long-press; record what was
      measured and not any timing

## 9. Guide

- [x] 9.1 State each switch on the page its feature is documented on, saying what
      the feature stops doing rather than that a setting exists
- [x] 9.2 Say on the offline basemap page that the feature starts off for a reader
      who has no pack, and what it hands back to the host while it is off
- [x] 9.3 Add a table to the reference page naming every switch, the surface it
      governs and what is left when it is off
- [x] 9.4 Carry every edit into `docs/guide/zh-cn/`, in the guide's own Chinese
      voice

## 10. Verification

- [x] 10.1 Confirm the diff adds no reader of a switch that bypasses the one gate
      its feature is stated to have
- [x] 10.2 Run `node .github/scripts/check-docs-links.mjs`
- [x] 10.3 Run `openspec validate switch-features-off --strict`
- [x] 10.4 Run `npm run check`
