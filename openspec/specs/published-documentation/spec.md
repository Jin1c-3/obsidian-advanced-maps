## Purpose

Defines how the Advanced Maps user guide is organized, illustrated, and
published as a bilingual website, so that a reader arriving from the community
plugin store finds a navigable, searchable, current guide, and the same source
stays readable inside the repository.

## Requirements

### Requirement: The guide is published as a bilingual website

The user guide SHALL be published as a static website at a stable public URL
that the repository's entry documentation links. The site SHALL present every
guide page in English and Simplified Chinese, offer navigation listing the
guide's pages, offer a search that runs in the reader's browser without a
server, and offer a control that moves from a page to the same page in the
other locale.

#### Scenario: Reader arrives from the plugin store

- **WHEN** a reader follows the documentation link from the plugin's community
  store page or repository entry documentation
- **THEN** the guide opens as a browsable site with page navigation and search,
  not as a repository file listing

#### Scenario: Reader switches locale mid-page

- **WHEN** a reader on a guide page selects the other locale
- **THEN** the corresponding page of that locale opens, not the site root

#### Scenario: Reader searches for a feature

- **WHEN** a reader searches the site for a term that appears in a guide page
- **THEN** the matching pages of the locale being read are listed, and the
  search resolves without contacting a search service

### Requirement: Guide source stays readable in the repository

Guide prose SHALL live in the repository as Markdown, one directory per locale
under the guide directory, and the published site SHALL be built from exactly
that source. No guide page SHALL exist only in the site project's own content.
Each page SHALL stay readable in a plain Markdown viewer, with locale-relative
links between guide pages that resolve both in the repository file browser and
on the published site.

#### Scenario: Page is read in the repository

- **WHEN** a contributor opens a guide page from the repository file browser
- **THEN** its prose, figures, and links to sibling guide pages resolve without
  the site build

#### Scenario: Prose is edited

- **WHEN** a guide page's Markdown is edited in the repository
- **THEN** the next site build publishes the edited prose, with no second copy
  of the page to keep in step

### Requirement: Both locales stay in step

Every guide page SHALL exist in both supported locales, and the site's
navigation SHALL offer the same entries in each. A page present in one locale
and absent from the other SHALL fail the repository's checks rather than
publish a locale switch that leads nowhere.

#### Scenario: A page is added in one locale only

- **WHEN** a change adds a guide page in English without its Simplified Chinese
  counterpart
- **THEN** the documentation check fails, naming the missing page

#### Scenario: Navigation is generated

- **WHEN** the site is built
- **THEN** each locale's navigation lists that locale's pages in the guide's
  own order, with each entry titled in that locale

### Requirement: One figure set serves every surface

Guide figures SHALL live in a single directory under the documentation root and
SHALL be referenced by a path that resolves unchanged from the repository
Markdown, from the project README, and from the published site. A figure SHALL
carry alternative text describing what it shows.

#### Scenario: A figure is referenced from two surfaces

- **WHEN** the same figure illustrates a README section and a guide page
- **THEN** both reference the one stored image rather than separate copies

#### Scenario: A figure fails to load

- **WHEN** an image cannot be displayed
- **THEN** its alternative text states what the figure was showing

### Requirement: Install guidance names the in-app path

Documentation that tells a reader how to install Advanced Maps SHALL describe
installing from inside Obsidian: turning off Restricted mode, browsing community
plugins, searching for the plugin by name, installing it, and enabling it. It
SHALL link the plugin's community store page. Copying release files by hand and
installing a pre-release through a beta installer SHALL be presented as
secondary paths, not as the primary instruction. The stated prerequisites —
the minimum Obsidian version, Bases enabled, and the first-party Maps plugin —
SHALL remain alongside the install steps.

#### Scenario: A first-time reader installs the plugin

- **WHEN** a reader follows the install section of the README or the guide's
  first page
- **THEN** the steps are the ones performed inside Obsidian's community plugin
  browser, and the community store link is available for confirmation

#### Scenario: A reader wants an unreleased build

- **WHEN** a reader needs a build that is not in the community store
- **THEN** the manual and beta-installer paths are still documented, marked as
  the alternative to the store

#### Scenario: An interface label is renamed by Obsidian

- **WHEN** Obsidian renames a control named in the install steps
- **THEN** the documentation is corrected to the shipped label, so no step
  names a control the reader cannot find

### Requirement: The guide covers every platform the plugin is published for

Where the plugin is offered to a platform, the guide SHALL tell a reader on
that platform whether it runs there and what it looks like, and SHALL carry at
least one figure captured on that platform rather than describing it only in
prose. The statement SHALL sit on the page a reader arriving from the store
reads first, not only in a later caveat.

A platform figure SHALL show the plugin as that platform draws it, including
the host application's own chrome, so that a reader can match the figure to
what is on their screen.

#### Scenario: A reader arrives from the store on a phone

- **WHEN** a reader opens the guide's first page having installed the plugin on
  a mobile device
- **THEN** the page states that the plugin runs in the mobile application, and
  shows a figure of a map view as that application draws it

#### Scenario: A feature is unavailable on a supported platform

- **WHEN** a feature documented in the guide cannot work on a platform the
  plugin is published for
- **THEN** the page documenting that feature says so where the feature is
  described, rather than leaving the limitation to a single remark elsewhere in
  the guide

### Requirement: Instructions name a gesture the reader's device has

An instruction that tells a reader to perform an input gesture SHALL name a
gesture available on every platform the plugin is published for, or SHALL name
each platform's own gesture. Where a step exists on one platform only, the
instruction SHALL say which, so that a reader who cannot perform it knows the
step is absent rather than broken.

#### Scenario: A step is written for a pointer

- **WHEN** an instruction names a gesture that requires a mouse, such as
  right-clicking, hovering, or double-clicking
- **THEN** the same passage names what a reader without a pointer does instead,
  or states that the step is available on desktop only

#### Scenario: A reader cannot reproduce a documented step

- **WHEN** a reader on a supported platform reaches an instruction that their
  device cannot perform
- **THEN** the guide has already told them so at that instruction, and they are
  not left to decide whether the plugin is at fault

### Requirement: The guide does not publish an unsettled platform claim

Where the guide describes what happens on a supported platform, it SHALL state
the outcome a reader gets there. A passage SHALL NOT publish an untested or
unverified hedge for behavior the maintainer's verification surfaces can
settle. Where an outcome genuinely cannot be settled, the passage SHALL name
what is unknown and what the reader loses if it does not work, so the reader
can judge the risk rather than only be warned of it.

#### Scenario: A platform difference can be measured

- **WHEN** a guide passage would describe a supported platform's behavior as
  untested, and a verification surface named by the maintainer workflow can
  settle it
- **THEN** the passage states the measured outcome instead of the hedge

#### Scenario: A platform difference cannot be measured

- **WHEN** an outcome cannot be settled on any available surface
- **THEN** the passage names what is unknown and what the reader falls back to,
  rather than stating only that it is untested

### Requirement: Documentation links resolve

The repository's checks SHALL verify that every internal link and image
reference in the guide, the READMEs, and the entry documentation resolves to an
existing target, and that the built site contains no internal link to a page it
does not publish. A broken reference SHALL fail the check before merge.

#### Scenario: A page is renamed without updating its referrers

- **WHEN** a guide page is renamed or moved and another document still points
  at the old path
- **THEN** the link check fails, naming the referring file and the missing
  target

#### Scenario: An anchor is used

- **WHEN** a document links to a heading within another guide page
- **THEN** the check resolves the target file, and a link to a file that does
  not exist fails regardless of its anchor

### Requirement: Publication is automatic and gated

The site SHALL be published from the repository's default branch by an
automated workflow after the repository's checks pass, and a proposed change
SHALL build the site without publishing it. A failed site build SHALL block the
change rather than publish a broken site.

#### Scenario: A change breaks the site build

- **WHEN** a pull request contains documentation that the site cannot build
- **THEN** the pull request's checks fail and nothing is published

#### Scenario: A documentation change merges

- **WHEN** a change touching the guide merges to the default branch
- **THEN** the workflow rebuilds and republishes the site without a manual step

#### Scenario: A change does not touch documentation

- **WHEN** a merged change leaves the guide, figures, and site project untouched
- **THEN** the published site remains the last successfully built one

### Requirement: The site keeps the plugin's privacy promise

The published site SHALL serve its content, styles, scripts, fonts, and search
index from its own origin, and SHALL NOT embed analytics, telemetry, or any
third-party tracker. Documentation prose MAY link to external sites, and such a
link SHALL only be followed when the reader selects it.

#### Scenario: A reader loads a guide page

- **WHEN** a guide page is opened with a network monitor
- **THEN** the requests it issues are to the site's own origin

#### Scenario: An external service is documented

- **WHEN** a page documents an external map or geocoding service
- **THEN** the service is named and linked, and no request is made to it until
  the reader follows the link
