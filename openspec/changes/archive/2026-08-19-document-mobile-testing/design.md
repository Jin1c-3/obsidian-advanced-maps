## Context

`isDesktopOnly` is `false`, and until now the only mobile surface in the
workflow was whatever the maintainer happened to open. `obsidian dev:mobile on`
exists and is already used — the memory of building the locate button records it
as "the only way to reach the built-in locate button" — but nothing said what it
does not reach, so it was easy to read an emulated pass as a mobile pass.

## Decisions

### Two passes, and the gap between them is the point

Emulation is a viewport and a set of platform flags. That is genuinely most of
what a phone changes for a plugin: `Platform.isMobile*` registrations appear,
hit targets grow, and a settings pane renders its mobile affordances. It is
cheap and it runs from the same CLI as everything else, so it goes first.

What it is not is Android. It does not draw Obsidian's own toolbars, and the
measuring readout bug is exactly that: `bottom-left` was chosen because the
corner is free, and on a phone the corner holds the application's navigation
bar. It also does not run the web view, so `Platform.resourcePathPrefix`,
a `Range` request against a resource URL, and a permission prompt are all
answered by a stand-in rather than by the thing that ships.

The requirement therefore names both surfaces and assigns claims to them, rather
than saying "test on mobile" and leaving each change to decide what that meant.

### The device path belongs in CONTRIBUTING, not in the spec

The spec says a maintainer must be able to get a build onto a phone and read its
console. Which of Syncthing, `adb push`, or Obsidian Sync does it, and the WSL
caveat that USB is not visible without forwarding, are facts about one machine
in one year. They go where the other commands are.

### The duplicated guide requirement

`maintainer-workflow` carries the guide requirement twice — the body and all
four scenarios, with a one-clause difference in the second copy's body (it omits
the published site's navigation). The first copy is the stronger one and the one
the website check enforces, so the delta restates that one and the duplicate
goes. Folded into this change rather than left for a tidy-up of its own: this
change is already the one editing that file.
