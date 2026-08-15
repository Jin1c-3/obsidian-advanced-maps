## MODIFIED Requirements

### Requirement: Map links are parsed by provider

The plugin SHALL parse supported full map links and coordinate text using provider-specific axis order and datum rules, normalize successful results to WGS-84, and refuse recognized short links without resolving them over the network. A link SHALL be attributed to a provider only when its host is that provider's own domain or a subdomain of it, never merely because the provider's name appears somewhere in the host.

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

### Requirement: Place search respects provider contracts

Place search SHALL support Nominatim without a key and Gaode with a Web-service key, normalize result coordinates to WGS-84, debounce typing, reject superseded responses, cache answers for the modal lifetime, and honor Nominatim's provider-wide request interval. Writing the chosen place into the note SHALL report its own failure rather than announcing a write that did not happen.

#### Scenario: User types several revisions quickly

- **WHEN** an older network response finishes after the query has changed or cleared
- **THEN** the older response is neither displayed nor reported as the current query's failure

#### Scenario: Gaode reports failure with HTTP success

- **WHEN** Gaode returns HTTP 200 with an unsuccessful provider status
- **THEN** the provider's error information is surfaced instead of treating the response as an empty successful result

#### Scenario: Nominatim request is built for Electron compatibility

- **WHEN** a forward or reverse Nominatim request is made
- **THEN** it identifies the plugin with the supported user-agent header and omits the Referer header that Electron may block

#### Scenario: The note cannot be written after a place is chosen

- **WHEN** writing the chosen coordinate into the note fails
- **THEN** the user is told the write failed instead of being shown the success notice, and the failure does not escape as an unhandled rejection

### Requirement: Device location writes only by explicit policy

Automatic location SHALL run only when location is enabled, the active markdown note contains the configured property with an empty value, and the property remains empty after the asynchronous location request; the manual command MAY overwrite an existing value. The guard that keeps one note from being filled twice at once SHALL follow the note itself, not the path it had when the request started.

#### Scenario: Property is absent

- **WHEN** the active note has no configured coordinate property
- **THEN** automatic location does not create one

#### Scenario: User fills the property while waiting

- **WHEN** a location request is in flight and the note gains a value or loses the property
- **THEN** the automatic path does not overwrite the current frontmatter

#### Scenario: Location succeeds

- **WHEN** the platform returns a fix
- **THEN** the note receives WGS-84 `lat,lng` rounded to six decimal places

#### Scenario: Platform cannot provide location

- **WHEN** the first session request fails before any success
- **THEN** automatic requests stop for the session until a manual command resets the breaker

#### Scenario: Note path matches an automatic-fill exclusion

- **WHEN** the active note's path contains a configured exclusion fragment
- **THEN** automatic location does not request a fix or write the note

#### Scenario: Device location is disabled

- **WHEN** location is disabled in settings
- **THEN** neither automatic location nor the manual device-location command requests a fix

#### Scenario: The note is renamed while a fix is in flight

- **WHEN** a note is renamed or moved between the start of an automatic location request and its completion
- **THEN** the guard for that note is released when the request finishes and a later edit of the same note can be filled again
