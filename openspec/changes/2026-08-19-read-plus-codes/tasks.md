## 1. The decoder

- [x] 1.1 Add `src/pluscode.ts` with `isValid`/`isShort`/`isFull` transcribed from the reference implementation's rules, including the padding run, the lone separator, and the single-digit-after-separator cases
- [x] 1.2 Decode in integer units and divide once, so the published vectors land exactly rather than within a tolerance
- [x] 1.3 Ignore digits past the fifteenth, as the format says to
- [x] 1.4 Range-check the decoded box, since `isValid` checks shape and a well-formed code can spell a place off the map
- [x] 1.5 Put the "may this become a coordinate" policy in one function, `codeIssue`, stricter than the format: short and padded codes are refused

## 2. Reading it

- [x] 2.1 Add the `pluscode` provider and a bare-text reader to `src/geolink.ts`, ahead of the DMS and plain readers
- [x] 2.2 Read WGS-84 and deliberately not through `chinaAware`, with the provenance for that stated adjacent
- [x] 2.3 Consult `codeIssue` before decoding, so a refused code never reaches the preview as a coordinate
- [x] 2.4 Add a `plus.codes` host reader, decoding the path first so a percent-encoded separator still reads
- [x] 2.5 Report both refusals in `src/link-modal.ts` through the existing "failure with a cure" path, ahead of the shortened-link message

## 3. Proof

- [x] 3.1 Commit the hand-written half of Google's `decoding.csv` and the whole of `validityTests.csv` as vectors
- [x] 3.2 Verify the full 440-row `decoding.csv` and `validityTests.csv` once out of tree; commit the representative subset rather than the fixtures
- [x] 3.3 Cover `findPlusCode` on a code inside a sentence, in either script's trailing punctuation, and on text that only looks like one
- [x] 3.4 Cover the geolink seam: bare code, `plus.codes` URL, percent-encoded separator, a code decoding inside China staying WGS-84, and both refusals
- [x] 3.5 Add `src/pluscode.ts` to the coverage gate in `vitest.config.mts`

## 4. Documentation

- [x] 4.1 Extend the map-link section of the guide in both locales with the format, the datum, and why two kinds of code are refused
- [x] 4.2 Run `npm run check`
