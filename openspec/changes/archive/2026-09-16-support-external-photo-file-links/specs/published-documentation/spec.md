## ADDED Requirements

### Requirement: The guide explains explicit external photo links

The photo-map guide in both locales SHALL document how a matched note can link
an individual external photo with an inline Markdown `file:` destination. It
SHALL show normal-link and image-embed syntax, explain that only destinations
readable on the current device participate, and explain that a synchronized
note may carry different absolute destinations for different devices.

The same passage SHALL distinguish this behavior from a linked directory:
Advanced Maps does not traverse external folders, and whole-album directory
links or junctions remain a desktop filesystem setup rather than a result of
writing a folder `file:` URL in a note.

#### Scenario: Reader keeps device-specific photo paths

- **WHEN** a reader consults the guide to use one synchronized note on multiple
  devices
- **THEN** both locales show that the note can contain multiple `file:` photo
  links and that each device uses only the destinations it can read

#### Scenario: Reader chooses between a link and an embed

- **WHEN** a reader wants an external photo to appear on the map with or without
  also appearing in the note
- **THEN** the guide shows the ordinary Markdown link and image-embed forms and
  states that both count for the map

#### Scenario: Reader links an external folder

- **WHEN** a reader considers replacing the individual photo destination with
  a directory `file:` URL
- **THEN** the guide states that the directory is not scanned and points to the
  existing desktop directory-link approach for a whole album

#### Scenario: Current device cannot read a destination

- **WHEN** a linked external path belongs to another device or is unavailable
  on the current one
- **THEN** the guide explains that the link is skipped while other readable
  photos and tracks continue to participate
