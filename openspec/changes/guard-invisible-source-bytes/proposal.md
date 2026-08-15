## Why

A stray NUL byte reached `src/track-layer.ts` twice — once before 1.13.1, and
again while implementing the hover-popup fix, where two `U+0000` landed inside a
template literal that was meant to hold spaces. Nothing in `npm run check`
noticed either time: NUL is a legal character in a TypeScript string, so
Prettier, ESLint, `tsc`, the tests and the smoke check all passed and the byte
went into the bundle.

The second one was found by accident — `grep` treats a file containing NUL as
binary and silently reports no matches, so an unrelated search over that file
came back empty. That is not a detection method anybody should rely on twice.

## What Changes

- Add a repository check that reads every tracked text file and fails on
  characters that are never intended in this repository's source: the C0 control
  characters other than tab and newline (which covers NUL and, with it, CR), DEL,
  the bidirectional formatting overrides used by source-spoofing attacks, and a
  zero-width space or byte-order mark anywhere in a file.
- Require every tracked file that is not a known binary asset to decode as UTF-8,
  so a new binary file type has to be declared rather than silently skipped.
- Run it from `npm run check` and as its own CI step, so the guard applies to
  contributions and not only to a maintainer who remembers to look.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `maintainer-workflow`: adds a requirement that the repository's checks reject
  invisible or undecodable bytes in tracked source, alongside the existing
  formatting, lint, type, test and release safeguards.

## Impact

- New `.github/scripts/check-source-bytes.mjs`, wired into the `check` script in
  `package.json` and into `.github/workflows/ci.yml`.
- No plugin code, settings, or published behavior changes; nothing here reaches
  the bundle.
- The repository is clean today: of 168 tracked files, only the 13 images under
  `docs/` are binary, and no text file contains a control character beyond tab
  and newline, a CR, or any bidirectional or zero-width character.
