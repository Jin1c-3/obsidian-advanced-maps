## MODIFIED Requirements

### Requirement: Shipped user-facing behavior reaches the user guide

A change that adds, removes, or alters behavior a reader can invoke, see, or configure SHALL update the user guide in the same change, in every locale the guide supports, by extending an existing page or adding a new one; a change that adds a page SHALL add it under every locale's guide directory and make both the guide index and the published site's navigation point at it. Guide passages naming a command, setting, property, or the place a setting is found SHALL match what the change ships. A change with no user-visible behavior SHALL record that no guide update is needed rather than leaving the question unanswered.

#### Scenario: A change ships user-visible behavior

- **WHEN** a change adds a command, setting, property, or visible map behavior
- **THEN** the same change updates the user guide in English and Simplified Chinese, extending an existing page or adding a new one that the guide index links

#### Scenario: A shipped label or location changes

- **WHEN** a change renames a setting or command, or moves where a setting is found
- **THEN** every guide passage that names it is corrected in the same change, so the guide never directs a reader to a label or place that no longer exists

#### Scenario: A change is not user-visible

- **WHEN** a change is confined to refactoring, tests, tooling, or maintainer documentation
- **THEN** it records that the guide needs no update, rather than leaving the guide silently behind

#### Scenario: A page is added to the guide

- **WHEN** a change adds a guide page
- **THEN** the page exists under each locale's guide directory and is reachable from that locale's guide index and from the published site's navigation, so no locale carries an orphaned page

## ADDED Requirements

### Requirement: Figures come from a persistent demo folder

Documentation figures SHALL be captured from one persistent demo folder in the maintainer's local vault that is kept between sessions rather than built and deleted per figure. The folder SHALL be self-contained, SHALL be excluded from the vault's personal bases and note queries, and SHALL be the only part of the vault that appears in a published figure. Invented places, coordinates, and geometry inside it SHALL be real WGS-84 locations rather than hand-typed approximations, so a figure cannot make a correct coordinate conversion look broken. A figure SHALL NOT show a private note, a personal property, a real person, or a name from the maintainer's own notes.

#### Scenario: A new figure is needed

- **WHEN** a change needs a figure for the guide
- **THEN** it is captured from the existing demo folder, extending that folder if the case is not yet covered, rather than by rebuilding a throwaway one

#### Scenario: A figure would show personal content

- **WHEN** the case being illustrated only occurs in the maintainer's personal notes
- **THEN** an equivalent case is created inside the demo folder and captured there instead

#### Scenario: A demo coordinate is invented

- **WHEN** a demo note or track needs a location
- **THEN** it uses a real WGS-84 coordinate for a real place, so a datum error remains visually distinguishable from correct output

### Requirement: Figures are captured against an English interface

Published figures SHALL show Obsidian's English interface, and one figure set SHALL serve every locale of the documentation rather than one set per locale. A figure whose meaning depends on interface text SHALL be described in the surrounding prose of each locale, so a reader of another locale is not left to translate the picture.

#### Scenario: A figure is captured

- **WHEN** a figure showing Obsidian's interface is captured
- **THEN** the interface language is English, and the same file is referenced by every locale of the guide

#### Scenario: A figure shows a named control

- **WHEN** a figure shows a command, setting, or menu label
- **THEN** the page's prose names that control in the page's own locale, rather than relying on the figure's English text alone
