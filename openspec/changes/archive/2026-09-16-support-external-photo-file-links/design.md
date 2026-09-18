## Context

See `proposal.md` for motivation and the three delta specs for behavior.

Obsidian's metadata cache exposes internal Markdown links and embeds, but an
inline destination carrying a URI scheme remains an external link and is not
resolved by `getFirstLinkpathDest` to a vault `TFile`. Advanced Maps currently
discovers attachments synchronously from that cache, reads every mapped input
through vault APIs, keys parsed records and photo features by vault path, and
resolves that path back to a `TFile` for previews and opening.

The host already provides the other half of the boundary. On desktop it serves
local paths behind the per-launch `app://` resource prefix. On Android the
published platform prefix is not fetchable from the web-view origin, but
`localResourcePrefix` already derives the host's working
`http://localhost/_capacitor_file_/` prefix from adapter answers and has been
measured with files outside the vault. The existing photo reader already knows
how to request and slice a bounded byte range.

External files do not participate in vault create, modify, rename, or delete
events. A note may intentionally contain several device-specific absolute
destinations, so failure to read one destination is an expected availability
answer rather than a failure of the note or map.

## Goals / Non-Goals

**Goals:**

- Keep vault and external file authority explicit at the type boundary.
- Reuse the existing EXIF, projection, drawing, interaction, concurrency,
  cancellation, and resource-lifetime paths after source acquisition.
- Preserve current synchronous attachment and command behavior for vault files
  while introducing asynchronous source discovery only where maps need it.
- Validate and canonicalize untrusted Markdown destinations once, before they
  become internal source objects.
- Detect external changes on a later synchronization without adding a watcher.

**Non-Goals:**

- Walking an external directory, making external photos direct Base results, or
  maintaining a second file index beside Obsidian.
- Automatically creating symlinks or junctions.
- Supporting external tracks, network URLs, raw HTML media, reference-style
  links, or `file:` values in frontmatter in this change.
- Promising an immediate redraw when another application modifies an external
  file while no map synchronization occurs.
- Expanding commands that explicitly resolve vault photo attachments, such as
  setting note coordinates from a photo; this change concerns mapped sources.

## Decisions

### Represent map inputs as a discriminated source union

Add a small source module with a union shaped conceptually as:

```ts
type MapSource =
  | { kind: 'vault'; file: TFile }
  | {
      kind: 'external-photo';
      key: string;
      uri: string;
      name: string;
      extension: string;
      resourceUrl: string;
    };
```

The module owns helpers for source identity, display name, extension, current
resource URL, and bounded photo reads. Callers switch on `kind`; an external
path is never cast to `TFile` and vault APIs are never handed an external URL.
The external key is namespaced from vault paths and derived from the canonical
URI, while the URI itself remains available only to source-specific behavior.

TrackCache accepts the union but retains the existing TFile path unchanged for
vault tracks and photos. The external branch can only be a supported photo, so
track parsing, track-stat commands, and track embeds keep their current vault
types.

Alternative considered: give an external object the same fields as `TFile` and
use a structural union. Rejected because it makes unsupported vault operations
type-check and spreads authority checks across every consumer.

### Add an asynchronous map-source seam beside synchronous vault resolution

Keep the existing synchronous `resolveTracks` and `resolvePhotos` answers for
vault files. Add an asynchronous map-source resolver that wraps those answers
as vault variants and, for a Markdown note while photos are enabled, reads its
cached text and appends valid external photo variants.

The external result promise is memoized against the note's `CachedMetadata`
object. Obsidian replaces that object after re-indexing an edit, so the same
identity boundary that invalidates existing attachment answers also invalidates
the source-text answer. Base-layer collection awaits source resolution with a
bounded pool. Inline host-photo comparison becomes asynchronous and keeps its
newest-operation and liveness checks around every await.

Existing vault sources retain their current relative order. External sources
are appended in body occurrence order and deduplicated by canonical key. This
adds no reordering to an existing note's current mapped inputs.

Alternative considered: make every existing attachment method asynchronous.
Rejected because command check callbacks and track-stat resolution do not need
external files and would take a broad compatibility change for no user-visible
benefit in this scope.

### Parse only the supported inline Markdown surface

Implement a narrow, dependency-free scanner over note source. It recognizes
inline link and image destinations, including angle-bracket destinations with
spaces and the Windows backslash form that Obsidian accepts. It skips YAML
frontmatter, fenced code, and inline code before interpreting candidates. It
does not render Markdown or invoke post-processors.

At the scanner boundary, parse the destination with `URL`, require the `file:`
scheme, reject credentials, query, fragment, and unsupported authority forms,
normalize backslashes through URL canonicalization, decode the path once, and
admit only the existing photo-extension allowlist. A destination without a
supported filename is not probed, which also makes a directory link inert.

Alternative considered: render each note into a detached DOM and inspect its
links. Rejected because rendering may run plugin post-processors, resolve
embeds, decode media, and create side effects merely to discover a path.

Alternative considered: add a general Markdown parser dependency. Rejected for
the first supported grammar because it enlarges the shipped bundle and the
project can cover this deliberately narrow syntax with a bounded scanner and a
focused conformance suite. If the accepted syntax later expands to references
or raw HTML, that decision should be revisited rather than extending ad-hoc
patterns indefinitely.

### Convert file URLs through the host's local-resource boundary

Promote the local path encoding needed by offline basemaps into a shared helper.
For an external URI, canonicalize and decode its absolute path, then build a
fetchable URL from:

1. `localResourcePrefix(app.vault.adapter)` when it can derive the host prefix;
2. `Platform.resourcePathPrefix` on the desktop when derivation intentionally
   fails because the host's resource URL carries a cache query; or
3. no source when neither answer produces a safe local-resource prefix.

This yields `app://<token>/...` on desktop and the Capacitor local-file route on
the measured Android host without importing Node, Electron, or a mobile-only
API. The resulting URL is computed per running application and is never stored
in a note, setting, feature collection, or persistent index because its prefix
may change at restart.

### Probe external revisions and reuse the bounded photo pipeline

An external load first requests a minimal byte range from the resource URL. A
successful response that carries a valid total size and Last-Modified value
provides the same `(size, mtime)` trust tuple used by the photo index. On an
index hit, the point is restored and the embedded thumbnail remains deferred.
On a miss, the loader requests the configured photo-head range, slices the
response even when the host ignores Range, parses it through the existing EXIF
reader, and stores only derived metadata.

External index keys are namespaced separately from vault paths. Startup pruning
continues to remove missing vault paths, while external entries are retained
only by the existing bounded least-recently-used policy; they are trusted only
after a current readable source reports the matching revision. Removing a link
therefore leaves at most a harmless bounded cache row, not a discoverable file.

If the resource is readable but lacks a trustworthy revision, the current
bounded head is parsed and used for that synchronization without consulting or
writing a persistent entry. In-flight loads are keyed by source identity and
datum, and the existing newest-request rule prevents an older read or datum
interpretation from overwriting the current answer.

An unavailable external resource produces no source record and no user notice.
It may log one concise diagnostic per source state for troubleshooting, but it
must not log repeatedly on every map operation because an unavailable
device-specific link is expected.

Alternative considered: call `FileSystemAdapter.readLocalFile` directly.
Rejected as the primary route because it reads the full file, does not provide
portable revision metadata, and is not the resource boundary already proven on
mobile.

### Resolve interactions through the current source, not through a path cast

Features carry a stable source key in addition to their owning item index. Base
map draw items and inline photo entries retain the source objects for the
current revision. Click and hover handlers look up that key in the current item
before acting:

- vault sources keep `workspace.openLinkText` and vault resource URLs;
- external sources use their current resource URL for preview and modal image;
- modifier opening uses the original canonical file URI through the host's
  external-link behavior;
- normal modal opening receives a small `{name, resourceUrl}` presentation
  value rather than requiring a `TFile`.

Source lookup failure is treated as stale event delivery. Base popups keep the
owning note content, and inline tooltips keep the source name even if image load
fails. No resource URL or external path is fetched merely because a pointer
moves over a non-photo feature.

## Risks / Trade-offs

- **[Risk] Scanning note text adds asynchronous work to large Base results.** →
  Memoize by metadata identity, skip source reads when photos are disabled or
  the row is not Markdown, and bound concurrent note reads with the existing
  pool.
- **[Risk] A hand-written Markdown scanner diverges from an obscure CommonMark
  form.** → Keep the accepted grammar explicit, test the exact documented
  forms plus escapes/code exclusions, and revisit a parser dependency before
  broadening the grammar.
- **[Risk] Local-resource response headers differ by platform.** → Persist only
  when size and mtime are both trustworthy; otherwise use a current bounded
  read and no persistent cache assumption.
- **[Risk] External files change without a vault event.** → Revalidate them at
  each data synchronization and document that no immediate watch is promised.
- **[Risk] A synced note contains paths that expose local directory names.** →
  The plugin creates no path automatically and stores no new path in the note;
  documentation states that `file:` destinations are absolute and sync as note
  content.
- **[Risk] A malicious note links arbitrary local files.** → Admit only an
  explicit inline `file:` destination with a supported photo extension, perform
  read-only bounded access, never recurse, and never upload or modify the file.
- **[Risk] Two different paths name the same physical file.** → Deduplicate
  canonical destinations only. Inode-level identity would require platform
  APIs and would make device-specific behavior less predictable.

## Migration Plan

No settings or note migration is required. Ship the new source path as additive
behavior behind the existing Show photos setting. Existing vault-only notes,
cache rows, Base filters, and inline track embeds keep their current meaning.

If the implementation must be rolled back, remove external source discovery
and interaction support. Namespaced external photo-index rows are derivable and
bounded, so an older build may ignore them; clearing the photo index removes
them without affecting photos or notes.
