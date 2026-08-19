## ADDED Requirements

### Requirement: Mobile-visible behavior is verified on a mobile surface

A change that alters what a reader sees or touches on a phone SHALL be verified
beyond the desktop pane before it ships, and its pull request SHALL record what
was verified and where.

Maintainer documentation SHALL state what each surface can answer. Obsidian's own
mobile emulation is the first pass: it resizes the viewport and switches the
platform flags a plugin reads, so it reaches mobile-only registrations and
touch-sized layout. It draws none of the mobile application's own chrome and runs
none of the Android web view. A claim that only the chrome or the web view can
settle — whether a control sits under an application toolbar, what a resource URL
resolves to, how a permission prompt behaves, what a phone's graphics and memory
budgets allow — SHALL be settled on a device or SHALL NOT be recorded as
verified.

Maintainer documentation SHALL also state how a build reaches a device and how
that device's console is read, so the device pass is a procedure rather than an
exercise for the reader.

#### Scenario: A change moves something a reader touches on a phone

- **WHEN** a change alters a control, a readout, or a layout that appears on a map
- **THEN** it is exercised under mobile emulation, and its pull request says so

#### Scenario: The claim is one emulation cannot settle

- **WHEN** the change's claim concerns the mobile application's own chrome, a resource URL, a permission prompt, or a device's graphics budget
- **THEN** it is settled on a device, and an emulation-only check is not recorded as having verified it

#### Scenario: A maintainer needs the device path

- **WHEN** a maintainer has a build and a phone
- **THEN** the contributor documentation names how the built plugin reaches a vault on that device and how its console is read

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
