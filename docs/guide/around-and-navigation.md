# Around views and navigation

**English** · [简体中文](around-and-navigation.zh-CN.md) · [Guide index](README.md)

One configured Base can power an embedded map of related notes, open a note in
its full collection, and follow notes as you switch between them.

## Show only the notes around the current note

In Advanced Maps settings, open **Open in map** and choose your reusable Base
under **Base file path**.
Run **Insert a map of the notes around this one**. The command adds an `Around`
map view to that Base when needed and inserts:

```markdown
![[places.base#Around]]
```

The view keeps only:

- the note containing the embed;
- notes it links to;
- notes that link back to it.

Tracks and photos linked from those matched notes are then drawn normally. A
trip index can be as simple as:

```markdown
# West Lake weekend

[[Broken Bridge]]
[[Leifeng Pagoda]]
[[Lingyin Temple]]
[[weekend.gpx]]

![[places.base#Around]]
```

Because `weekend.gpx` has no `!`, the note shows one Around map and the GPX line
appears on that map instead of creating another map below the link.

![A trip note whose ordinary wikilinks are rendered as markers in an embedded Around map](../around-map.png)

The Around view is the intersection of relationship context and the Base's own
global filters. If a linked note is excluded by the Base, Around does not bring
it back. The embed also stores the view name, so renaming the view requires
updating existing embeds.

## Reuse one Base everywhere

Set **Base file path** and **View name** once, under Advanced Maps settings →
**Open in map**. The same
Base then powers Open in map, Follow active note, and Around embeds.

| Question                                       | Defined by                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Which notes or direct photo files participate? | Base filters                                                               |
| What does a note marker look like?             | Base formulas and the map view's **Marker icon**/**Marker colour** options |
| Where is a note's coordinate?                  | The map view's **Coordinates** property                                    |

## Open in map

Notes carrying the coordinate property (`coords` by default) get an **Open in
map** item in their menu. It opens the configured Base, moves the camera to the
note, and opens its popup.

**Open in** chooses a normal tab, which opens the Base file itself and keeps any
view option you change there, or a pop-up window, which leaves your layout alone
but has nowhere to write a change back to.

![A configured Base map opened on one note while the other places remain visible](../open-in-map.png)

## Follow the active note

Press the ⊹ control beside zoom-to-fit and that map follows notes as you switch
between them. It keeps the current zoom and never rewrites the Base query.

![A note beside its Base map, with the map following the note and its popup open](../follow-active-note.png)

## Pins at the same coordinate

At close zoom, notes sharing an exact coordinate fan out into a ring so every
marker can be hovered and opened. Zoom out and they close back to the truthful
shared point. Nothing is written to the notes, and copied coordinates remain
unchanged. **Fan out pins that share a spot** disables it.
