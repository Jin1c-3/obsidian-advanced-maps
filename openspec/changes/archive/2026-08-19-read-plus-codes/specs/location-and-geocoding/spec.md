## MODIFIED Requirements

### Requirement: Map links are parsed by provider

The plugin SHALL parse supported full map links and coordinate text using provider-specific axis order and datum rules, normalize successful results to WGS-84, and refuse recognized short links without resolving them over the network. A link SHALL be attributed to a provider only when its host is that provider's own domain or a subdomain of it, never merely because the provider's name appears somewhere in the host. Text SHALL also be parsed as an Open Location Code, in WGS-84 by that format's own definition and independently of where the code decodes to; a code that names no single place SHALL be refused with the reason rather than reported as unreadable text.

#### Scenario: Provider axis orders differ

- **WHEN** Gaode supplies longitude then latitude or Baidu supplies latitude then longitude
- **THEN** the parser returns the correct geographic point rather than applying one shared ambiguous pattern

#### Scenario: Recognized short link is pasted

- **WHEN** a supported provider link contains no coordinate until redirected
- **THEN** the plugin explains that a full link is required and sends no resolution request

#### Scenario: Geo URI declares an unsupported coordinate system

- **WHEN** a `geo:` URI explicitly names a CRS other than supported WGS-84
- **THEN** parsing fails terminally rather than relabeling the same numbers through a generic fallback

#### Scenario: A host imitates a provider domain

- **WHEN** a pasted link's host contains a provider's domain as a prefix or label of a domain someone else controls
- **THEN** it is not parsed with that provider's axis order and datum

#### Scenario: A regional provider domain is used

- **WHEN** a link uses a provider's country or regional domain
- **THEN** it is parsed with that provider's rules as before

#### Scenario: A full Plus Code is pasted

- **WHEN** a full Open Location Code is pasted on its own, among other words, or as a `plus.codes` link
- **THEN** the centre of the area it names is offered as the coordinate to write

#### Scenario: A Plus Code decodes to a mainland location

- **WHEN** a full Open Location Code decodes to a point inside China
- **THEN** it is read as WGS-84 rather than through the mainland-datum rule applied to provider links, and the reader can still override the datum by hand

#### Scenario: A Plus Code names no single place

- **WHEN** a pasted Open Location Code is short, or padded so that it names a region kilometres across
- **THEN** the plugin explains which of the two it is and offers no coordinate
