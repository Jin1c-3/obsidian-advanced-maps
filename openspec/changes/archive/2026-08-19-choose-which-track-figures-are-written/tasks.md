## 1. The set of figures

- [x] 1.1 Add `StatsWrite` and let `statsProperties()` take it, returning only the figures that are on and defaulting an absent one to on
- [x] 1.2 Add `statsWrite` to the settings shape and defaults, with every figure on

## 2. The page

- [x] 2.1 Add a switch per figure on the Track properties page, above the name box it governs
- [x] 2.2 Hide a figure's name box while its switch is off, and re-render when a switch flips
- [x] 2.3 Read and write `statsWrite.<figure>` on the same declarative seam `statsNames.<figure>` uses, storing the whole record
- [x] 2.4 State a count on the page's entry once any figure is off, and the distance property's name while they are all on

## 3. The command

- [x] 3.1 Write, remove and clash-check only the figures that are on
- [x] 3.2 Report when every figure is off rather than writing nothing quietly

## 4. Proof

- [x] 4.1 Cover the filtered `statsProperties()` in `tests/stats.test.ts`, including an absent record and a partially stored one
- [x] 4.2 Verify the page and the command in a live vault: a figure switched off keeps its existing property untouched, and every figure off reports rather than writes

## 5. Documentation

- [x] 5.1 Say what the switches do, and that switching one off leaves what is already in a note, on the tracks page in both locales
