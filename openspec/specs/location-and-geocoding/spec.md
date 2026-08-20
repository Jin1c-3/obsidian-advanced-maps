## Purpose

Defines explicit coordinate acquisition and place lookup tools, including provider quirks, privacy boundaries, credential storage, and safe note writes.

## Requirements

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

### Requirement: Place search respects provider contracts

Place search SHALL support Nominatim without a key and Gaode with a Web-service key, normalize result coordinates to WGS-84, debounce typing, reject superseded responses, and cache answers for the modal lifetime. The request interval it keeps to is the provider's, stated below, not this feature's. Writing the chosen place into the note SHALL report its own failure rather than announcing a write that did not happen.

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

### Requirement: Nominatim's usage policy is kept by every request

Nominatim's usage policy SHALL be kept by every request this plugin sends to it,
whichever feature sends it. Both halves belong to the provider rather than to one
caller: requests SHALL identify the plugin with the supported user-agent header,
and SHALL be spaced by at least the provider's published minimum interval.

The interval SHALL be counted across the plugin as a whole and SHALL outlive any
one caller, so that two features cannot each keep to it separately and together
exceed it — a search box left open and a command bound to a hotkey draw on one
budget. A request abandoned before it was sent SHALL NOT consume the interval it
was waiting for.

A provider the policy is not about SHALL NOT be delayed by it.

#### Scenario: Two features ask in the same second

- **WHEN** a reverse-geocode request is made within the interval of a place-search
  request, or the other way round
- **THEN** the second request waits out the remainder of the interval before it is
  sent, rather than being sent because the feature sending it had not asked before

#### Scenario: A request is superseded while it waits

- **WHEN** a request waiting out the interval is superseded before it is sent
- **THEN** it is abandoned without claiming the interval, and the request that
  replaced it is not made to wait for one it never used

### Requirement: A stored setting outside its own list is read as the default

A setting whose value must be one of a fixed list SHALL be read as its default
whenever the stored value is not on that list. What is on disk outlives the
build that wrote it: a settings file may have been hand-edited, restored from a
backup, or synced from a build that knows one more provider than the one reading
it. The reader SHALL stand down onto the default rather than carry an
unrecognized value into code entitled to assume the list.

The correction SHALL be made in memory and SHALL NOT be written back, so that a
value this build cannot name is still there for a build that can.

#### Scenario: Stored provider is one this build does not know

- **WHEN** the settings file names a search provider outside the supported list
- **THEN** searching and reverse geocoding use the default provider and report
  what they normally would, rather than the command failing with nothing shown

#### Scenario: The unknown value is left where it was found

- **WHEN** a setting has been read as its default because the stored value was
  not on the list
- **THEN** the settings file still holds what it held, and a later build that
  recognizes the value reads it back unchanged

### Requirement: Gaode credentials follow the chosen storage policy

A Gaode key SHALL be resolved at use time from either Obsidian SecretStorage or plugin settings, and the configured secret identifier SHALL contain only a secret name, never the key itself.

#### Scenario: User switches from plain storage to secret storage

- **WHEN** a plain key exists and the user chooses secret storage
- **THEN** the key is adopted into the named secret when appropriate and the plain settings copy is removed

#### Scenario: User switches back to plugin settings

- **WHEN** the user leaves secret storage
- **THEN** the secret is not copied to plain text as a side effect and the user must explicitly enter a settings key if desired

#### Scenario: Referenced secret is missing

- **WHEN** the stored secret name was renamed or deleted
- **THEN** the command reports that a key is required before making a Gaode request

### Requirement: Reverse geocoding writes a separate place property

Reverse geocoding SHALL read the configured WGS-84 coordinate, send the provider-appropriate datum, and write the returned address only to a distinct configured place property.

#### Scenario: Coordinate and place properties collide

- **WHEN** both settings name the same note property
- **THEN** reverse geocoding refuses before the request and does not overwrite the coordinate

#### Scenario: Gaode reverse geocoding is used

- **WHEN** the selected provider is Gaode
- **THEN** the WGS-84 note coordinate is converted to GCJ-02 for the request and the returned address is written only after a successful provider response

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

### Requirement: Photo metadata can populate coordinates on demand

The plugin SHALL offer an explicit command for an active markdown note that references supported photos, scan distinct embed, body-link, and frontmatter-link targets in note order, interpret them through the configured photo datum, and write the first usable GPS coordinate as WGS-84.

#### Scenario: Photo display and device location are disabled

- **WHEN** the user invokes the photo-coordinate command while Show photos and device location are disabled
- **THEN** the command still reads local EXIF metadata and may write the coordinate because it neither draws the album nor requests the device location

#### Scenario: Earlier photo has no GPS metadata

- **WHEN** the first referenced photo has no usable coordinate and a later photo does
- **THEN** the later photo's coordinate is written using the same six-decimal `lat,lng` shape as other coordinate commands

#### Scenario: No referenced photo yields a coordinate

- **WHEN** every referenced photo lacks GPS metadata or cannot be read
- **THEN** the note is left unchanged and the user receives an appropriate no-coordinate or read-failure notice

### Requirement: Network disclosure is user initiated

Search and reverse-geocoding requests SHALL occur only after the user invokes the corresponding feature, and documentation SHALL state that reverse geocoding sends the note's coordinate to the selected provider.

#### Scenario: Location feature is disabled

- **WHEN** location permission is disabled but the user explicitly invokes link parsing or reverse geocoding
- **THEN** those non-device-location tools, including local photo-coordinate extraction, remain available under their own privacy and credential rules

### Requirement: A point on the map can be written into a note that already exists

The map's own context menu SHALL offer to write the clicked coordinate into a
note the reader chooses from the vault, and that coordinate SHALL be the same
WGS-84 value the menu's other coordinate consumers use — converted out of the
tile datum and back into longitude range exactly once for the click. The chooser
SHALL show, for each candidate, the value its coordinate property already holds,
and SHALL leave out the notes in the vault's own template folder.
A note that already holds a coordinate SHALL NOT have it replaced until the
reader is shown the note, the existing value and the replacement and confirms.
The write SHALL set only the configured coordinate property, and SHALL report
the note and the value that reached it.

#### Scenario: A note with no coordinate is placed

- **WHEN** the reader picks a note that has no coordinate property value
- **THEN** the clicked coordinate is written to that note's coordinate property and reported, with nothing else asked

#### Scenario: A note that is already placed is chosen

- **WHEN** the reader picks a note that already holds a coordinate
- **THEN** the note, its current value and the new one are shown first, and nothing is written unless the reader confirms

#### Scenario: The reader declines the replacement

- **WHEN** the confirmation is dismissed
- **THEN** the note is left exactly as it was

#### Scenario: The vault keeps a template folder

- **WHEN** the chooser is opened in a vault whose template folder is configured
- **THEN** the notes inside that folder are not offered, while a folder whose name merely begins the same way still is

#### Scenario: The map is on tiles of a different datum

- **WHEN** the coordinate is taken from a map drawn on Chinese-datum tiles
- **THEN** the value written matches what the same click reports as coordinates, rather than being shifted twice or not at all

#### Scenario: The camera has been carried past the 180th meridian

- **WHEN** the click happens after the map has been panned past ±180°
- **THEN** the written longitude is within range

#### Scenario: The chosen note is outside the map's own query

- **WHEN** a stamped note is not among the results the map is drawing
- **THEN** the write is still reported, rather than appearing to have done nothing because no pin arrived

### Requirement: Writing a clicked point into a note can be switched off

Switched off under the shared policy in the feature-switches capability, which states what a switch takes away, what it keeps, and how it defaults. What follows is only what is specific to this feature.

With it off, that item SHALL NOT be added to the map's menu, and no other item on
that menu SHALL move or change — the clicked coordinate is still read once for the
items that remain. The coordinate property it would have written SHALL be
untouched, other features reading and writing it.

#### Scenario: The item is switched off

- **WHEN** the reader switches it off and opens the context menu of a map already
  on screen
- **THEN** the item is not there, and the menu's other coordinate items are
  present and carry the same coordinate they would have carried

#### Scenario: The item is switched back on

- **WHEN** the reader switches it on again
- **THEN** the item is on the next menu opened, and confirms before replacing a
  coordinate exactly as it did before
