## ADDED Requirements

### Requirement: Guide prose is written in plain language

Guide prose SHALL be written for a reader who wanted a map in their vault and has
not read this repository, not for the person who built the plugin. A sentence
SHALL carry one idea, and SHALL state the answer before the exception, the
caveat, or the reason behind it.

Prose SHALL address the reader directly and SHALL NOT carry the maintainer's
voice: no rhetorical asides, no conversational commentary on a design decision,
no sentence that exists to show why a behavior is reasonable, and no passage
written as a reply to a criticism the reader has not made. Where a behavior has a
reason the reader needs, it SHALL be stated as one plain clause, not as an
argument.

A sentence longer than roughly three clauses SHALL be split, and a paragraph
SHALL be broken where it changes what the reader is reading about. Every guide
page SHALL be readable as continuous prose, in both locales.

#### Scenario: A reader meets a sentence with a caveat

- **WHEN** a guide passage states behavior and then qualifies it
- **THEN** the behavior is stated first in its own sentence, and the
  qualification follows as a separate sentence, rather than arriving inside the
  first one as a subordinate clause

#### Scenario: A passage explains why a limitation exists

- **WHEN** the reasons behind a limit are worth knowing
- **THEN** they are given in one plain clause after the limit, and the passage
  does not argue the reader out of wanting the limit lifted

#### Scenario: A page is read for the first time

- **WHEN** a reader who has never opened the repository reads a guide page
  end to end
- **THEN** no sentence in it presumes vocabulary, code, or history that page has
  not already introduced

### Requirement: Guide prose carries no implementation detail

User-facing prose SHALL NOT describe how the plugin does its work. Internal
buffer and read sizes, cache layout and invalidation, the internal thresholds a
calculation applies, host routes and resource schemes, source file and module
names, the versions or emulator builds a claim was measured against, and the
maintainer's own verification procedure SHALL NOT appear in the guide.

A number SHALL appear in guide prose only where the reader can act on it or where
it explains something they can see: a property name, a setting's range, a value
they type, or a threshold whose effect they would otherwise notice and
misattribute. A property name, setting label, or command name the reader must
find SHALL stay, verbatim, in the form the plugin ships.

A fact that belongs to the plugin's engineering rather than its use SHALL be
recorded in a capability spec or in contributor documentation instead, and the
guide SHALL link that documentation rather than restate it.

#### Scenario: A passage describes how a value is obtained

- **WHEN** the current prose explains the mechanism behind a behavior, such as
  how many bytes of a photo are read or which route serves a file
- **THEN** the rewritten passage states what the reader gets, and the mechanism
  is left to the capability spec

#### Scenario: A number would appear in a sentence

- **WHEN** a guide passage would carry a number the reader neither types nor
  observes
- **THEN** the number is dropped, and the sentence says what happens instead

#### Scenario: A behavior is named in both the guide and a spec

- **WHEN** the same behavior is described in a capability spec and in the guide
- **THEN** the guide states what the reader does and sees, and leaves the
  contract wording, its boundaries, and its rationale to the spec

### Requirement: A term the reader may not know is explained where it first appears

A term that belongs to Obsidian, to mapping, or to this plugin SHALL be explained
in the same page where it first appears, in one clause at that point, rather than
by a glossary page a reader must leave for. Such terms include Base and its
views, frontmatter, a Base formula, EXIF, a tile pack, a coordinate datum
(WGS-84, GCJ-02, BD-09), and Lucide.

An explanation SHALL be enough to let the reader keep reading, and SHALL NOT
expand into a tutorial on the term itself. Where the plugin is not the term's
owner, the explanation SHALL say what the term is for here and, where one
exists, link the owner's own documentation.

The two locales SHALL explain the same term at the same place, in the reader's
own language, and each locale's wording SHALL carry the shipped label of any
control the term names.

#### Scenario: A page introduces a term of art

- **WHEN** a guide page first uses a term a vault user may not know
- **THEN** the sentence that uses it also says what it is, and the page does not
  depend on the reader having met it earlier in the guide

#### Scenario: A term is owned by another project

- **WHEN** a term such as EXIF or Lucide belongs to something else
- **THEN** the guide says what it supplies here in one clause, and links its
  owner's documentation rather than teaching it

#### Scenario: One locale explains a term

- **WHEN** a rewrite explains a term in one locale's page
- **THEN** the other locale's page explains it at the same place, in its own
  words

### Requirement: A guide page leads with the reader's outcome

Each guide page SHALL open by saying, in one or two sentences, what the reader
gets from the feature the page is about, before it explains how to configure it.
The body SHALL then be ordered as the steps a reader takes to get that outcome:
what to set up, what to do, what to expect, and, last, what to do when it does
not happen.

A heading SHALL name what the reader is trying to do at that point, rather than
naming the plugin's own concept or the setting the section describes. A section
that only restates a behavior already covered elsewhere in the guide SHALL be
removed rather than repeated.

Where a passage constrains the reader, it SHALL stay set apart as the callout it
already is; the rewrite SHALL NOT turn a callout into prose or prose into a
callout merely for length.

#### Scenario: A reader opens a page to learn a feature

- **WHEN** a reader opens any guide page
- **THEN** the first thing under the title is what the feature gives them, and
  the configuration steps follow it

#### Scenario: A reader follows a page top to bottom

- **WHEN** a reader works through a page in order
- **THEN** each section is the next thing they would do, and the last section is
  what to check when the result does not appear

#### Scenario: Two pages describe the same behavior

- **WHEN** a behavior is fully described on the page that owns its feature
- **THEN** another page that mentions it links there instead of carrying a
  second explanation

### Requirement: A verified platform claim is stated as the outcome

Where the guide describes what a reader gets on a platform the plugin is
published for, the passage SHALL state the outcome the reader gets there, and
SHALL NOT narrate how it was verified: no emulator, build number, host version,
or measurement procedure belongs in the sentence. Where a claim was settled on
one platform and not another, the passage SHALL say which platform it describes
and what the reader on the other platform sees, rather than what the maintainer
did.

Where the plugin cannot settle a claim on any available surface, the existing
rule for that case still governs: the passage names what is unknown and what the
reader falls back to.

#### Scenario: A platform behavior has been measured

- **WHEN** a guide passage describes behavior measured on one platform
- **THEN** it says what the reader on that platform gets, and names the platform
  without naming the device, build, or version used to measure it

#### Scenario: A claim covers one platform only

- **WHEN** a claim was settled on one platform and not the other
- **THEN** the passage says which platform it describes and what a reader on the
  other sees, rather than that the maintainer tested one and not the other

### Requirement: Entry documentation follows the same writing rules

`README.md`, `README.zh-CN.md`, and every other entry document that a reader
reaches before the guide SHALL follow the plain-language, no-implementation-detail,
term-on-first-use, and outcome-first rules this capability states for guide prose.
Each SHALL keep its role as a landing page: what the plugin does, what the reader
can make with it, how to install it, and where to read further.

The two locales' entry documents SHALL carry the same information in the same
order, so that switching locale does not change what a reader is offered.

#### Scenario: A reader arrives at the repository

- **WHEN** a reader opens either locale's README
- **THEN** it states what the plugin does in plain language, names no internal
  mechanism in doing so, and sends the reader to the guide for the detail

#### Scenario: A reader switches locale on the landing page

- **WHEN** a reader moves between the two READMEs
- **THEN** both present the same sections in the same order, each in its own
  language
