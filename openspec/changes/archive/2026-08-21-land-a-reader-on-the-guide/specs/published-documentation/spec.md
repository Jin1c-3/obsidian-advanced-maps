## MODIFIED Requirements

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

## ADDED Requirements

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
