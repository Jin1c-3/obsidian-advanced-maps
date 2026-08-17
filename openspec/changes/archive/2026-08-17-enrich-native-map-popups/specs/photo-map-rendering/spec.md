## MODIFIED Requirements

### Requirement: Photo interactions preserve both photo and note context

On a base map, hovering a photo SHALL show its owning note together with a
preview of the photo itself, a normal click SHALL open a photo modal without
replacing the map, and a modifier click SHALL retain Obsidian's new-tab behavior
for the image. A hovered preview SHALL be bounded so it cannot push the rest of
the popup out of view, and a photo whose image cannot be resolved SHALL leave a
usable note popup behind rather than an empty or broken preview.

#### Scenario: User clicks a thumbnail and its fallback dot fires too

- **WHEN** one pointer event is delivered for both photo layers
- **THEN** exactly one photo modal opens

#### Scenario: Photo modal belongs to a base map

- **WHEN** a base-map photo modal opens
- **THEN** it offers a route to the owning note using the map's current note-opening behavior

#### Scenario: User hovers a photo on a base map

- **WHEN** the pointer raises a note popup by pointing at a photo drawn on a base map
- **THEN** that popup shows a bounded preview of the photo pointed at, alongside what it already says about the owning note

#### Scenario: A hovered photo's image cannot be resolved

- **WHEN** the file behind a pointed photo cannot supply a displayable image
- **THEN** the popup still describes the owning note and shows no empty or broken preview in place of the photo
