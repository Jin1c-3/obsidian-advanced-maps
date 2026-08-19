## ADDED Requirements

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
