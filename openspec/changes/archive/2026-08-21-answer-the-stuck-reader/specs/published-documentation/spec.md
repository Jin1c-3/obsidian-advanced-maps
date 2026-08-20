## ADDED Requirements

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
