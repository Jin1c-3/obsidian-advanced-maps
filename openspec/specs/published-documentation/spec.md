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

The navigation SHALL group the guide's pages under headings, and each heading
SHALL be written in the locale being read. Every page SHALL additionally offer
a way to install the plugin: the community store page, which any reader can
open, and the plugin's own page inside a running Obsidian.

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

#### Scenario: Reader reads the navigation in Simplified Chinese

- **WHEN** a reader opens any page of the Chinese guide
- **THEN** the navigation's group headings are in Chinese, as its page titles
  already are

#### Scenario: Reader decides to install while reading

- **WHEN** a reader on any page of the site looks for how to install the plugin
- **THEN** the store page and the in-application path are offered from that
  page, without returning to where they came from

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
Markdown, from the project README, and from the published site. One set SHALL
serve every locale as well as every surface: a locale SHALL NOT carry figures of
its own. A figure SHALL carry alternative text describing what it shows.

Because one set is shared, a figure whose meaning depends on interface text SHALL
be described in the surrounding prose of each locale, so a reader of a locale the
figure is not in is not left to translate the picture.

#### Scenario: A figure is referenced from two surfaces

- **WHEN** the same figure illustrates a README section and a guide page
- **THEN** both reference the one stored image rather than separate copies

#### Scenario: A figure fails to load

- **WHEN** an image cannot be displayed
- **THEN** its alternative text states what the figure was showing

#### Scenario: A figure shows a named control

- **WHEN** a figure shows a command, setting, or menu label
- **THEN** each locale's page names that control in its own locale, rather than
  relying on the figure's text alone

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

### Requirement: The site's entry page presents the plugin

Each locale's entry page SHALL open by naming the plugin, stating in one
sentence of that locale what it does, and offering the reader somewhere to go:
the guide's first page, the plugin inside a running Obsidian, and the community
store page. That sentence SHALL come from the guide's own source, so that the
locale's translator owns it and no sentence about the plugin exists only in the
site project.

The entry page SHALL continue to carry the guide's own index prose below that
opening, and the list of workflows it offers SHALL be presented as links a
reader can scan rather than as rows of a table.

#### Scenario: A reader arrives having never seen the plugin

- **WHEN** the site's entry page opens in either locale
- **THEN** it states what Advanced Maps does before it lists what to read, and
  offers to install it

#### Scenario: The entry sentence is translated

- **WHEN** the Chinese entry page is read
- **THEN** the sentence under the title is the Chinese guide's own, not a
  translation carried in the site project

### Requirement: A shared link carries a preview of the guide

Every published page SHALL name a preview image, a title and a description for
the link previews that forums, chat clients and social sites build. The preview
image SHALL be served from the site's own origin and SHALL be addressed
absolutely, because the client that fetches it never runs the page.

#### Scenario: The site is linked in a forum post

- **WHEN** a reader pastes a link to any guide page into a client that builds
  link previews
- **THEN** the preview shows the guide's card, the page's title and its
  description, rather than a bare URL

### Requirement: A figure opens at the size it was captured

Every figure in the guide SHALL be openable at the largest size the site
publishes for it, and SHALL be closable again. The control that opens it SHALL
be reachable by keyboard and announced as a control. While a figure is open its
alternative text SHALL be shown, so that what the figure is meant to show is
stated for a reader who cannot make it out.

#### Scenario: A reader cannot read a control named in a figure

- **WHEN** a reader opens a figure showing a menu, a settings pane or a map
- **THEN** it is shown at the largest published size, with its alternative text,
  and closing it returns to the page

#### Scenario: A reader is not using a pointer

- **WHEN** a reader moves through a guide page by keyboard
- **THEN** each figure is reachable and can be opened and closed without a
  pointer

### Requirement: A figure is delivered at a size the screen can use

The site SHALL publish each figure at several widths and SHALL let the reader's
browser choose among them. A screen narrower than a figure's capture SHALL NOT
be sent the capture.

#### Scenario: A guide page is opened on a phone

- **WHEN** a page carrying a desktop screenshot is opened on a narrow screen
- **THEN** the copy fetched is one sized for that screen, not the desktop
  capture

### Requirement: A passage that constrains the reader is set apart

Where a guide passage states a prerequisite, a platform limit, something that
leaves the vault, or an action that cannot be undone, it MAY be marked as a
callout. A callout SHALL be written in a syntax that renders as a callout in the
repository file browser and in Obsidian, and as an ordinary quotation in any
other Markdown viewer, so that no reader is shown markup. The published site
SHALL render it as the site's own callout.

A passage marked in one locale SHALL be marked in the other, so the two locales
emphasise the same things.

#### Scenario: A page is read in the repository

- **WHEN** a guide page carrying a callout is opened in a file browser or a
  vault
- **THEN** the passage reads as a callout there too, and never as literal markup

#### Scenario: Only one locale marks a passage

- **WHEN** a change marks a passage in one locale and leaves the other's
  counterpart unmarked
- **THEN** the two locales no longer emphasise the same passages, which the
  change is expected to correct before it merges

### Requirement: Each page states when its prose last changed

Every published guide page SHALL state the date its own prose last changed,
written in the locale being read. The date SHALL be taken from the history of
the guide page the site was built from, not from the moment of publication, so
that republishing the site for an unrelated reason does not make every page look
new.

#### Scenario: A page has not changed in months

- **WHEN** the site is rebuilt and republished after a change to another page
- **THEN** the untouched page still states the date its own prose last changed

#### Scenario: The publishing checkout carries no history

- **WHEN** the site is built where the guide's commit history is unavailable
- **THEN** pages publish without a date rather than with the date of the build

### Requirement: The guide is also published as plain text

The site SHALL additionally publish the guide as plain text at a stable path,
so that a reader can hand the documentation to a tool rather than read it. The
plain-text copy SHALL be generated from the same published pages, SHALL be
served from the site's own origin, and SHALL state which documentation it
carries.

#### Scenario: A reader wants the guide as text

- **WHEN** the plain-text path is opened
- **THEN** it describes the project and links the fuller plain-text copies, all
  from this site's own origin

#### Scenario: Only one locale is carried

- **WHEN** the plain-text copy is generated for a site with more than one locale
- **THEN** it carries the default locale's pages, and does not present a partial
  translation as the guide

### Requirement: The guide answers a reader whose map is not what they expected

The guide SHALL carry a page organized by symptom rather than by feature, in
both locales, whose headings are what a reader sees when something is wrong.
Each entry SHALL state the cause and SHALL send the reader to the page that owns
that feature, rather than becoming a second copy of it.

An entry SHALL be traceable to something the plugin does: a notice it shows, a
setting it reads, or a limit stated elsewhere in the guide. Where the plugin
shows a notice, the entry SHALL name the part of it a reader will recognise, so
that the sentence on their screen and the sentence in the guide meet.

A feature that a reader can switch off SHALL be treated as a symptom in its own
right, because a reader whose menu item has gone has no reason to suspect a
setting they never turned on.

The page SHALL close by saying what to include when nothing on it matches, so
that a report arrives carrying the versions, the filter, the property, and the
picture a maintainer would otherwise have to ask for.

#### Scenario: A reader's map is empty

- **WHEN** a reader whose map draws nothing opens the guide
- **THEN** a page lists that symptom, names what to check and in what order, and
  links the page that owns each check

#### Scenario: A command a reader used is gone

- **WHEN** a reader looks for a menu item or command that is no longer offered
- **THEN** the symptom page names the feature switches as the first thing to
  check, and links the table that lists all of them

#### Scenario: A reader has a notice on screen

- **WHEN** a reader reads a notice the plugin showed and looks it up
- **THEN** the symptom page carries the recognisable part of that notice, and
  says what the plugin was unable to find or do

#### Scenario: Nothing on the page matches

- **WHEN** a reader reaches the end without finding their symptom
- **THEN** the page tells them what to include in a report, and links where to
  file it
