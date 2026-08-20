## 1. A figure a reader can use

- [x] 1.1 Switch on responsive images in the site config, and confirm on the
      built output that every wide figure carries a `srcset` with more than one
      candidate where one exists to make
- [x] 1.2 Open a figure at the widest candidate of its own `srcset`, in a
      dialog closed by Escape or a click, with the figure's alternative text as
      the caption
- [x] 1.3 Wrap each figure in a real button so the keyboard reaches it, skipping
      any figure already inside a link or a button, and label the button in the
      locale the page is drawn in
- [x] 1.4 Style the trigger so it does not look like a button, and the dialog so
      it looks like the rest of the site in both themes

## 2. A page that says when it was written

- [x] 2.1 Read each guide page's last commit date in the sync script and write
      it into the generated copy's frontmatter as a timestamp, since the
      generated copy carries no history of its own
- [x] 2.2 Publish with the full history, so a shallow checkout cannot date every
      page from the tip commit
- [x] 2.3 Confirm both locales render the date in their own locale

## 3. A way in, and a shape to the guide

- [x] 3.1 Group the sidebar's nine pages under four headings, each carrying its
      Chinese translation, leaving page labels to come from each locale's own
      title as before
- [x] 3.2 Offer the store page and the in-application path from every page, and
      mark a navigation entry that leaves the guide as one that does
- [x] 3.3 Keep the repository's documentation check working against the grouped
      sidebar

## 4. A link worth sharing

- [x] 4.1 Draw the preview card from the guide's own hero screenshot and commit
      it, together with the raster icon a home screen keeps
- [x] 4.2 Name the card, its dimensions and its alternative text on every page,
      absolutely, and add the theme colour the browser chrome follows
- [x] 4.3 Keep the generator in the site project and runnable by hand, so the
      card can be redrawn when the screenshot or the colours change

## 5. A landing page

- [x] 5.1 Carry one `tagline:` line per locale in the guide's index frontmatter,
      and read it in the sync script
- [x] 5.2 Emit the index page as a hero over the same prose, with the three
      actions, and centre a hero that has no picture of its own
- [x] 5.3 Convert the index's workflow table into cards when it has exactly that
      shape, leaving any other table alone, and emit that one page as MDX
- [x] 5.4 Check that both locales' cards link to the pages they name, from the
      locale root they are served at

## 6. A passage set apart

- [x] 6.1 Convert GitHub alerts into the site's own asides in the sync script,
      mapping two alert kinds onto one aside and leaving every other quotation
      as a quotation
- [x] 6.2 Mark the passages that state a prerequisite, a platform limit, a
      network consequence or an irreversible action, in both locales, changing
      no word of the prose
- [x] 6.3 Confirm on the published pages that each marked passage is an aside,
      and in the repository that it is a callout

## 7. The guide as plain text

- [x] 7.1 Publish `llms.txt` and its fuller copies from the built pages, naming
      the project, its description and the two links a reader may want
- [x] 7.2 Confirm the published paths resolve under the site's base path

## 8. Proof

- [x] 8.1 `node .github/scripts/check-docs-links.mjs`, before and after the site
      build
- [x] 8.2 `npm run docs:build`, and the repository's format, lint and test checks
- [x] 8.3 Read both locales' landing pages, one figure dialog, and one aside, on
      a wide screen and a narrow one
