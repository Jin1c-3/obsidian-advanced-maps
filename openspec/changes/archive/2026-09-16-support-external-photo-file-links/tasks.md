## 1. External Source Boundary

- [x] 1.1 Add the discriminated vault/external map-source contract and shared
      identity, filename, extension, and resource-URL helpers; verify unit tests
      cover canonical POSIX, Windows drive-letter, space, Unicode, unsupported
      authority, query, fragment, scheme, and extension cases.
- [x] 1.2 Add the dependency-free inline Markdown destination scanner, including
      frontmatter, fenced-code, inline-code, escape, angle-bracket, bare-destination,
      link, and embed handling; verify focused parser tests cover the documented
      syntax and prove folders, unsupported files, raw HTML, references, and
      code-shaped examples are ignored.
- [x] 1.3 Add asynchronous map-source resolution beside the existing synchronous
      vault attachment methods, memoized by metadata identity with stable ordering
      and canonical de-duplication; verify attachment tests cover mixed vault and
      external sources, disabled photos, repeated destinations, note edits, and
      notes with no external links.

## 2. Bounded Reads and Cache Trust

- [x] 2.1 Extend the photo-loading boundary to probe and range-read external
      resource URLs while preserving read concurrency, cancellation, datum, and
      newest-request behavior; verify track-cache tests cover index hits, misses,
      ignored oversized responses, unavailable device paths, overlapping reads,
      and sources without trustworthy revision headers.
- [x] 2.2 Namespace external photo-index entries and retain them through
      vault-path pruning only under the existing size bound, while trusting them
      solely after matching current size and mtime; verify photo-index tests cover
      unchanged, changed, removed-link, clear, prune, and eviction behavior without
      regressing existing vault entries.
- [x] 2.3 Share the proven local-path encoding and host-prefix derivation with
      external photos without persisting per-launch resource URLs; verify basemap
      and source tests cover desktop `app://`, Android `_capacitor_file_`, an
      unavailable prefix, and unchanged offline-basemap URL behavior.

## 3. Map and Interaction Integration

- [x] 3.1 Make native Base-map collection await bounded map-source resolution
      and key uploads, signatures, icons, and stale-event lookup by source identity;
      verify track-layer tests cover mixed tracks/photos, unreadable external
      siblings, external revisions, canceled synchronization, and unchanged vault
      drawing.
- [x] 3.2 Make inline track maps load external host-note photos and compare their
      order-sensitive source sequence asynchronously under the existing revision
      gates; verify embed tests cover initial drawing, link addition/replacement,
      an unrelated host edit, unavailable device links, camera preservation, and
      route statistics remaining photo-free.
- [x] 3.3 Generalize photo preview and modal presentation away from `TFile` while
      retaining vault opening and base-note navigation; verify interaction, popup,
      and embed tests cover normal and modifier clicks, base and inline modals,
      failed external image loads, fallback names, and duplicate layer events.

## 4. Documentation

- [x] 4.1 Update the English and Simplified Chinese photo-map guides with normal
      link and embed examples, the per-device readable-source pattern, absolute-path
      privacy/portability notes, refresh timing, and the no-folder-traversal
      boundary; verify the two locales remain structurally aligned and the docs
      link checker passes.

## 5. Verification

- [x] 5.1 Run focused unit suites while implementing, then run `npm run check`
      and inspect the TypeScript diff to verify formatting, lint, types, tests,
      production build, smoke checks, source-size policy, and behavior-preservation
      constraints all pass.
- [x] 5.2 In a running desktop Obsidian, verify the exact Issue #74 Windows-style
      Markdown alongside a vault GPX, including map point, preview, modal, note
      navigation, an unreadable second-device link, and external-file refresh;
      record that developer errors and console errors remain empty.
- [x] 5.3 On the maintained Android verification surface, verify a readable
      external-storage `file:` photo uses the derived Capacitor resource route and
      an unavailable desktop link stands down; record the observed result in the
      guide rather than publishing an unverified mobile claim.
