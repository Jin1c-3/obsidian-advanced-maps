## ADDED Requirements

### Requirement: Inline route maps can be switched off

The reader SHALL be able to switch inline route maps off. With them off, this
plugin SHALL claim no track extension at all, so an embed of a track file is the
embed the host makes of it with no plugin installed, and SHALL release the
extensions it had claimed rather than holding them inert — an extension this
plugin is not drawing is one another plugin may own.

The setting SHALL default to on, so a reader who never opens it keeps the plugin
they had. Switching it off SHALL take down the inline maps that are on screen,
releasing each one's map and event resources the way closing the note does, so
that no graphics context is left held by a feature that is off. Switching it on
SHALL claim the extensions again, taking only those no other embed handler owns
by then, and SHALL state where an already-rendered note has to be reopened for
its embed to become a map.

Everything an inline map is configured with SHALL be kept while the feature is
off, and SHALL stay on screen where it is configured, so a reader can see what
they will get back.

#### Scenario: Inline maps are switched off

- **WHEN** the reader switches inline route maps off
- **THEN** the inline maps on screen are torn down with their resources released,
  and a note embedding a track file afterwards shows the host's own embed of that
  file

#### Scenario: Another plugin claimed an extension in the meantime

- **WHEN** inline route maps are switched on again and another embed handler now
  owns one of the track extensions
- **THEN** that extension is left with its owner and the others are claimed, the
  same way an extension already owned is left alone at load
