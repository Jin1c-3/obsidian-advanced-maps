## MODIFIED Requirements

### Requirement: Tracks inherit note ownership

A track resolved through a note SHALL use that note's marker color and note
interaction target. Pointing at any feature this plugin draws on a native map
SHALL raise at most one note popup per pointer event, SHALL leave the popup
untouched while the pointer stays on the feature it is already showing, and
SHALL anchor it where the pointer entered that feature.

#### Scenario: User points at a base-map track

- **WHEN** the pointer hovers a track belonging to a note
- **THEN** the native note popup is shown for that note

#### Scenario: Pointer moves along one track

- **WHEN** the pointer keeps moving over the same track feature after its popup is shown
- **THEN** no further popup is raised and the popup stays anchored where the pointer entered that track

#### Scenario: Overlapping owned features deliver one pointer event

- **WHEN** a single pointer position lies on more than one feature this plugin draws, such as a photo sitting on its own track
- **THEN** that pointer event raises one popup rather than one per overlapping feature, and it describes the same feature a click at that position would act on

#### Scenario: Pointer crosses to a different feature

- **WHEN** the pointer leaves the feature its popup describes and reaches a different owned feature, including another photo of the same note
- **THEN** the popup is raised again for the newly pointed feature

#### Scenario: Pointer leaves and returns to the same feature

- **WHEN** the pointer leaves every owned feature, dismissing the popup, and then returns to the feature it was last showing
- **THEN** the popup is raised again rather than suppressed as unchanged

#### Scenario: Drawn features are rebuilt while pointed at

- **WHEN** the drawn tracks are redrawn or the enhancement is detached while a popup is showing
- **THEN** the next hover raises a popup for whatever is then under the pointer rather than being suppressed by what was pointed at before

#### Scenario: User clicks a base-map track

- **WHEN** the user clicks the track without a modifier
- **THEN** the owning note opens using the map's current navigation rules
