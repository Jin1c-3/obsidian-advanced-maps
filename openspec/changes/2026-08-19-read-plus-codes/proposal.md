## Why

`geolink.ts` reads a coordinate out of pasted text for six providers, a `geo:`
URI, degrees/minutes/seconds and a bare pair. One text format people actually
hold a location in is missing: the Open Location Code, which Google Maps shows
as a **Plus Code** under every place and which `plus.codes` shares as a URL.
Asked for upstream as obsidianmd/obsidian-maps#16.

It is a small, closed piece of work — pure offline arithmetic with published
test vectors, landing in a reader table that already exists — and it raised
exactly one question worth answering before writing any of it.

**Which datum is a Plus Code in?** It matters here more than it would in most
plugins: `chinaAware()` exists in this file because Google and Apple hand out
GCJ-02 inside China and declare nothing, so their coordinates have to answer for
themselves. If a Plus Code were the same kind of artifact it would need the same
treatment, and getting it wrong is a silent ~500 m error.

It is not the same kind of artifact. A provider URL is one company's output; an
Open Location Code is a specification, and its author states the datum. From the
format's maintainer at Google, asked directly whether it would accommodate
GCJ-02 (google/open-location-code#359, closed):

> No, no plans. […] our recommendation is that a plus code should be based on
> WGS-84, since it is vastly more likely that any system you use a plus code
> with is going to assume the decoded values are WGS-84.

So a Plus Code is read as WGS-84 and is **not** passed through `chinaAware`,
which is the rule `readGeoUri` already follows for a `geo:` URI that names its
CRS. The residual case — a code copied off a map that draws China shifted — is
answered by the modal's existing datum override, the same escape hatch every
other reader already has.

## What Changes

- Add `src/pluscode.ts`: validation and decoding of Open Location Codes, pure
  and offline, integer-based so the published vectors land exactly.
- Add a `pluscode` provider to `geolink.ts`, read from bare text and from a
  `plus.codes` URL, in WGS-84 for the reason above.
- Refuse, with the reason named rather than as "no coordinate here", the two
  legal codes that do not stand for a place: a short code, which has dropped the
  digits saying where in the world it is, and a padded code, which names a
  region kilometres across.
- Decode only. Writing a Plus Code for a point on the map is not added: sharing
  a location is what the external-map links in `maplinks.ts` already do.

## Impact

- Affected specs: `location-and-geocoding`.
- Affected code: `src/pluscode.ts` (new), `src/geolink.ts`, `src/link-modal.ts`,
  `src/i18n.ts`, `vitest.config.mts`.
- Affected docs: `docs/guide/{en,zh-cn}/coordinates-and-services.md`.
- No settings, no storage format, and no change to what any existing input
  parses to.
