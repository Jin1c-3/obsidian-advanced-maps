## Context

See proposal.md — Why for the motivation and the measured flip-flop. Four facts
about the seams shape everything below; all were read off the first-party Maps
source and the running application.

`BackgroundSwitcherControl(tileSets, currentId, onSwitch)` keeps a **reference**
to the array it is handed and rebuilds its menu on every click, reading only each
entry's `id` and `name`. It is constructed inside the native `initializeMap()`,
and only when that array holds more than one entry.

`switchToTileSet(id)` resolves through `plugin.settings.tileSets.find(…)` and
returns early when the id is not there. It then writes `mapConfig.currentTileSetId`
and `mapConfig.mapTiles` directly and restyles — never through `loadConfig`, which
is why the substitution installed in the `loadConfig` wrapper does not survive it.

Native `loadConfig` precedence is the view's own `mapTiles` option, else the
selected tile set, else the default style. A background choice is ephemeral
there: `getEphemeralState` carries only center and zoom, so a native pick already
dies when the view is rebuilt.

`TileSet` is `{id, name, lightTiles, darkTiles}` — no zoom bounds — so a pack
offered through that menu still needs this plugin's own source-maxzoom and
camera-minzoom handling when it is picked.

## Goals / Non-Goals

**Goals:**

- One source of truth for "what background is this map on", read by every path
  that can change it, so the flip-flop cannot come back in another form.
- Nothing of this plugin's is written into the native plugin's settings, and no
  resolved URL is written anywhere at all.
- The feature degrades to today's behaviour, minus the defect, when the native
  control is absent or unrecognisable.

**Non-Goals:**

- Owning a background control of this plugin's own. A second layers button beside
  the native one is worse than not appearing in the native one.
- Changing how a pack is resolved to a URL, or how its bounds are applied. Both
  stay; they just take an argument saying which pack.
- Remembering a pick beyond the map it was made on. The native control does not,
  and a menu click that writes a `.base` file is a surprise.

## Decisions

**Hand the control an augmented array, do not push into the native settings.**
`initializeMap` is wrapped per view; for the duration of that call the native
plugin's `tileSets` property is a new array holding its own entries plus one per
configured pack, and it is restored when the call returns. The control keeps the
augmented array it was handed, so the menu shows the packs; the native plugin's
own array is the object it always was.

The swap is installed whether or not a pack is configured at that moment. The
control cannot be handed a different array afterwards, so a pack added while a
map is open — which the spec requires to reach that map — has to land in the
array the control already holds. Owning it from the start is the only way there
is. That ownership costs one thing and buys it back: the control used to hold a
_live_ reference to the host's own array, so a background the reader added in the
Maps settings tab appeared on the next menu click; now the augmented array is
rebuilt from the host's on every configuration reload, which is where that
background arrives instead. Our entries carry only `id` and `name` —
the two fields the control reads — so no resolved URL exists to be persisted even
if something did save. The alternative, appending to `plugin.settings.tileSets`
for good, writes our entries into another plugin's `data.json` the moment the
reader edits anything in the native Maps settings tab, and what it would write is
an `app://<token>` URL that dies at the next launch.

The second alternative, wrapping `map.addControl` and replacing the control's own
`tileSets` field, does not touch the native settings at all but depends on that
private field keeping its name through a minified build. Swapping the property
depends only on `maps.settings.tileSets`, which this plugin already reads.

**One chosen-background value per view, in memory, consulted by both paths.**
The layer holds what the reader picked, or nothing. `loadConfig` substitutes
according to it; `switchToTileSet` sets it. That is the whole fix for the
flip-flop: today the two paths disagree because only one of them knows about the
substitution. It is not written to a file and does not outlive the layer, which
is what the native control already does with `currentTileSetId`.

**Answer our own ids instead of letting the native decline them.** A pick of one
of our ids never reaches the native method — it would return early and leave the
map as it was. Our wrapper sets the chosen value, rebuilds the config and
restyles, which is the same sequence the native runs, and applies that pack's own
zoom bounds. A pick of a native id records that id and then runs the native
method as it does today.

Recording it, rather than clearing the chosen value, is the correction this
design needed. Clearing would leave the background resolved from the view's own
choice or the plugin default — which is exactly the pack the reader just switched
away from — so the next configuration reload would substitute it back and
reproduce the defect this change exists to remove. The chosen value is _which
background the reader picked_, not _which pack_, and a host background is one of
the things they can pick. It is also what the spec's "picks their way back"
scenario asks for: the map stays on what they chose until they ask for something
else.

**Which ids are ours is asked of the host, not of our prefix.** The rule that
matters is not "does this start with `pack:`" but "would the native method
decline this", since a declined pick leaves the map unchanged and the menu
saying otherwise. So the wrapper answers any id absent from
`maps.settings.tileSets` — our packs, the default-background entry, and anything
else the host has since removed.

**Ids are `pack:<name>` for ours and the native's own id for theirs.** A view
stores this string, so it has to survive being read in a vault that is not the
one it was written in. A pack's name is what the reader typed and is stable; a
native tile set's id is a timestamp minted in one vault and meaningless in
another. Rather than paper over that, a stored value naming nothing falls back to
the default background and says so where the choice is made — which the spec
requires and which is the only honest answer for a base file that travelled.

**Offer a "default background" entry only when the host offers none of its own.**
The reader must be able to get back to what they would have with no pack. With at
least one native tile set that is already the first entry in the menu; with none,
there is nothing to pick, so one entry standing for the background the native
view resolves is added. This also carries the `length > 1` gate: no native tile
sets plus one pack is two entries, and the control appears.

**Migrate the single pack on load, and keep `off` meaning what it says.** The one
path and two numbers become one entry in the list, named after the last segment
of its path so it has something to be called, and marked as the plugin's default
background. A view already storing `off` keeps drawing the background the native
view resolves — the value is simply read as naming that background now. No base
file needs editing, which is why this is not a breaking change.

## Risks / Trade-offs

- **A background added in the host's own settings tab no longer reaches an open
  map's menu on the next click**, but on the next configuration reload → the
  augmented array is rebuilt from the host's own on every `loadConfig`, which is
  what `onDataUpdated` calls; the exposure is one settings edit with no data
  update after it, against the requirement that a pack added reaches an open map.
- **The control keeps the array after the swap is undone**, so restoring the
  host's settings object does not take this plugin's entries out of a menu that
  is already built → the array handed to the control is this plugin's own, and it
  is emptied back to the host's entries in place when the layer detaches. Where
  the host had no backgrounds of its own the menu is then empty, which is what
  there is: that control exists only because of the entries it is losing.
- **The window where the native settings property is swapped spans an `await`**
  (`initializeMap` awaits the style) → the restore runs in a `finally`, so it
  happens on the throwing path too; the exposure is the few hundred milliseconds
  of one map's construction, and what is exposed carries no URL. A save landing
  inside it would write two harmless `{id, name}` rows.
- **The native control may be absent, renamed, or gated differently in a future
  build** → the swap is shape-checked before it installs and is a no-op when the
  shape is absent; the packs stay reachable from the view's own setting, which is
  the requirement the spec states for this case.
- **The view options function may be answered from a cache** rather than called
  each time the pane opens → then a pack added while a pane is open is missing
  from the picker until the view is reopened. The registration wraps it as a
  closure that rebuilds on every call, so this is a question about the host, not
  about this plugin; a task verifies it and the fallback is the refresh this
  plugin already runs when its settings change.
- **A base file that travels can name a background the new vault does not have**
  → covered above and in the spec: fall back to the default background and say
  so, rather than draw nothing or silently pick something else.
- **More configuration than before** → the list replaces one row with a row per
  pack, which is the cost of the thing being asked for; the single-pack reader
  ends up with one row that reads the way the old one did.

## Migration Plan

Settings migrate on load, once: a non-empty old path becomes the first entry in
the new list and the plugin's default background, and the old keys are dropped
when the settings are next written. A reader who never configured a pack gets an
empty list and sees no change anywhere. Rolling back to the previous version
leaves the new keys unread and the old ones absent, so a pack configured after
the upgrade would have to be retyped — worth saying in the release note rather
than solving, since the previous version could hold only one pack anyway.
