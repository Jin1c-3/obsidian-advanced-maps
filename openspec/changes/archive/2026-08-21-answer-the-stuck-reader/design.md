## Context

Ten guide pages, each owning a feature. Nothing owns the reader who does not yet
know which feature is at fault. The material for that page already exists in
three places that a reader cannot search across: the pages themselves, the
plugin's notice strings in `src/i18n.ts`, and one issue thread.

## Goals / Non-Goals

Goals:

- A reader can find their symptom in one page and leave it knowing which page
  answers it.
- Every entry is traceable to something the plugin does: a notice it shows, a
  setting it reads, or a limit already stated in the guide.
- A report that arrives after this page carries what a maintainer needs.

Non-Goals:

- Restating the feature pages. An entry names the cause and links; it does not
  become a second copy of the page that owns it.
- A general FAQ. Questions about what the plugin is for belong on the pages that
  answer them, and on the landing page.
- Answering symptoms that belong to Obsidian, Bases, or a basemap provider,
  beyond saying which of them owns the answer.

## Decisions

**Organized by symptom, and titled as a question.** Each entry's heading is the
sentence a reader would type into search — "one note draws two maps", "a marker
is a solid circle with no icon" — rather than the feature's name, which is what the ten
feature pages are already titled with. The page is grouped into six sections so
that its table of contents is readable as a list of symptoms.

**Entries name the plugin's own words.** Where a notice exists, the entry quotes
the part of it a reader will recognise, so that the sentence on their screen and
the sentence in the guide meet. This is why the page has to be written against
`src/i18n.ts` rather than from memory, and why the requirement says an entry is
traceable rather than plausible.

**A missing menu item is the third section, not a footnote.** Seven switches can
each remove something a reader used, and a reader whose menu item vanished has
no reason to suspect a setting they never turned on. _Alternative:_ leaving it
on the reference page, where it is, and where nobody looks first.

**The page links; it does not re-explain.** Each entry ends in the page that owns
the feature, and the anchors it uses are checked by the repository's own
documentation check, so a renamed page cannot leave the symptom page pointing at
nothing.

## Risks / Trade-offs

- **A symptom page goes stale in a way a feature page does not** → an entry that
  names a notice is anchored to a string in `src/i18n.ts`; if that string is
  reworded, the entry reads oddly rather than wrongly, and the requirement makes
  the traceability explicit so the next author knows what to re-check.
- **Two places now describe the feature switches** → the entry states only the
  symptom and the rule that a switch takes the whole feature, and sends the
  reader to the one table that lists them.
- **The page can grow into a dumping ground** → entries are symptoms a reader
  can see, not everything that can go wrong; anything that needs more than a
  paragraph belongs on the page that owns it.
