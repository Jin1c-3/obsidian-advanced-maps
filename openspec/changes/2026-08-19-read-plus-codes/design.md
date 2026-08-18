## Context

The reader table in `geolink.ts` is ordered: provider hosts first, then the
datum-free text shapes. A code is a text shape, so it joins the second group;
a `plus.codes` URL is provider-owned input and joins the first.

## Decisions

### The datum is the format's, not the point's

Stated in the proposal and repeated here because it is the one thing a future
reader will want to re-litigate: a Plus Code is WGS-84 wherever it decodes to,
including inside China, on the format maintainer's own recommendation
(google/open-location-code#359). `chinaAware()` is for provider artifacts that
declare no datum. A Plus Code declares one by being an Open Location Code, the
same way a `geo:` URI declares one by RFC 5870.

This is a recommendation about the format, not a measurement of what Google
Maps' own China UI computes the code it displays from. That remains unmeasured,
needs a live Google Maps at a mainland location, and does not change the
default: every non-Google producer of a code — `plus.codes`, any OLC library,
anything encoding from a stored coordinate — is WGS-84, and the modal's datum
dropdown answers the one case that is not.

### Integer arithmetic, not degrees

Decoding accumulates in integer units — 25 000 000 per degree of latitude,
8 192 000 per degree of longitude, the finest resolution the fifteen-digit form
reaches — and divides once at the end. Google's `decoding.csv` pins box edges at
exact values like `20.370113`; accumulating in degrees puts several of them an
epsilon off and turns a boundary test into a tolerance argument.

### Refusing two legal codes

`decode` answers for anything the format calls a full code, including a padded
one, because that is what decoding means. The _policy_ — which codes may become
a note's coordinate — sits in one function, `codeIssue`, and is stricter:

- **short** (`9G8F+6W`): recovering it needs a reference location, and the
  nearest match to the wrong reference is a different place, not a vaguer one.
  Refused rather than resolved against the map centre, which the modal does not
  have anyway.
- **imprecise** (`8FVC0000+`): legal, and a box 5.5 km across; `84000000+` is
  2200 km. Writing the middle of either into a coordinate property would record
  a place nobody chose.

Both are reported through the modal's existing "the one failure with a cure"
path, beside the shortened-link message that already works this way.

`geolink.ts` consults `codeIssue` before decoding, so the modal cannot show a
confident coordinate for a code the same modal would otherwise explain away.

### Range is checked where shape is not

`isValid` is transcribed from the reference implementation and checks shape
only. The alphabet can spell a first pair that walks off the top of the world —
`FFX30000+` is well formed and nowhere — so `decode` range-checks its own answer
and returns null. `point()` in `geolink.ts` would have caught it too; catching
it in the module keeps `decodeCenter` from ever returning a latitude that does
not exist.

## Risks

- **A padded code is a legal code we refuse.** Someone pasting `8FVC0000+`
  deliberately gets a message instead of a coordinate. Judged the better error:
  the alternative writes a coordinate that is silently kilometres off.
- **Google Maps in China.** If its displayed code turns out to be computed from
  GCJ-02, a user pasting one gets a point ~500 m off until they move the datum
  dropdown. Recoverable, visible in the preview, and the alternative default
  would be wrong for every other producer of a code.
