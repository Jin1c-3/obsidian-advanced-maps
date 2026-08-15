## Context

See proposal.md — Why for how the byte got in and why the existing checks let it
through. The repository already has two standalone check scripts,
`check-manifest.mjs` and `smoke-bundle.mjs`, each run from both `npm run check`
and its own CI step; this follows that shape rather than inventing another.

## Goals / Non-Goals

**Goals:**

- Catch the characters that can differ between what a reviewer reads and what is
  compiled, at a cost of nothing to remember.
- Fail closed on anything the check cannot read, rather than quietly skipping it.

**Non-Goals:**

- General linting of the source. ESLint owns that.
- Policing non-ASCII text. The repository ships Chinese localization and em
  dashes in prose; only characters with no visible width are in scope.
- Checking the built bundle. If the source is clean, esbuild has nothing to
  copy in.

## Decisions

### 1. Which characters are rejected, and which are deliberately not

Rejected:

- **C0 controls except tab and newline.** This is the incident itself. It
  includes CR, which also holds the repository to the LF endings Prettier
  already writes.
- **DEL (`U+007F`).**
- **Bidirectional overrides `U+202A`–`U+202E` and isolates `U+2066`–`U+2069`.**
  These reorder how a line renders without changing what it compiles to — the
  Trojan Source class. They have no legitimate use here.
- **`U+200B` zero-width space and `U+FEFF`**, anywhere including the first byte:
  a BOM is not wanted in any file this repository tracks.

Deliberately not rejected:

- **`U+200C`/`U+200D` (zero-width non-joiner/joiner).** `U+200D` is how emoji
  sequences are written, so a README emoji would fail the check for no reason.
- **`U+200E`/`U+200F` (LRM/RLM).** These are ordinary marks in right-to-left
  text, which a future localization could legitimately carry.

Neither appears in the repository today, so this is a boundary chosen for what
could become a false positive rather than for what exists.

### 2. Binary files are named, not sniffed

The check needs to skip the screenshots under `docs/`, and the obvious way — try
to decode and skip whatever fails — makes the check silently weaker the moment a
file is added that it cannot read. Instead an explicit extension list declares
what is binary, and anything else that does not decode as UTF-8 is a failure.
Adding a new binary type is then a deliberate edit rather than a silent
exemption.

### 3. `git ls-files` decides what is checked

Only tracked files are read, so the check never walks `node_modules`, the build
output, or a maintainer's scratch files, and it needs no ignore list of its own.

### 4. Failures name the line and the character

A NUL is invisible in the terminal and in most editors, so a report that only
names the file leaves the reader hunting. Each hit is reported with its path,
line number, and the character's code point and name.

## Risks / Trade-offs

- **A future legitimate use of a rejected character** → the list lives in one
  named table in the script with a comment on each entry, so a considered
  exception is a small edit rather than a rewrite.
- **The check reads every tracked text file on each run** → 168 files, a few
  hundred kilobytes; well under the cost of any other step in `npm run check`.
- **It cannot catch a bad byte in a file nobody tracks** → out of scope by
  design; what is not committed cannot be reviewed or shipped.

## Open Questions

None.
