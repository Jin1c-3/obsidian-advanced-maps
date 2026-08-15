## 1. The check

- [x] 1.1 Add `.github/scripts/check-source-bytes.mjs` reading tracked files from
      `git ls-files`, skipping the declared binary extensions, and requiring the
      rest to decode as UTF-8
- [x] 1.2 Reject the character set from design.md — Decision 1, with a named
      table carrying the reason each one is listed
- [x] 1.3 Report every hit with path, line number, and the character's code point
      and name, and exit non-zero

## 2. Wiring

- [x] 2.1 Add it to the `check` script in `package.json`
- [x] 2.2 Add it as its own step in `.github/workflows/ci.yml`

## 3. Proof

- [x] 3.1 Confirm it passes on the repository as it stands
- [x] 3.2 Plant a NUL in a source file, confirm the check fails and names the
      right file, line and character, then remove it — the byte that shipped
      twice must be the one this is proven against
- [x] 3.3 Plant a bidirectional override and an undecodable non-declared file,
      confirm each is reported, then remove them
- [x] 3.4 Run `npm run check` end to end
