---
name: new-deck
description: Start a new deck or memo in sl-ide. Checks setup and the format (16:9 slides or a US Letter memo), runs impeccable to capture the audience (PRODUCT.md) and learn the visual style from a brand source (DESIGN.md and the tokens in src/styles.css), then outlines the story (action titles, or a memo's headings) and replaces the starter pages. Use when the user says "new deck", "start a deck", "new memo", "write a memo", "set up the deck", "learn the style", "/new-deck", or when PRODUCT.md or DESIGN.md is missing and they ask for slides.
---

# New deck

Takes the sl-ide starter to a real deck in four stages. Each stage ends with
something on disk, so the run can stop and resume. Read `AGENTS.md` first;
its rules apply throughout.

## 0. Check setup

Run `node scripts/doctor.js --json`.

- **Skills missing** (`impeccable` especially): offer to run
  `pnpm skills`. It restores the skills in
  `skills-lock.json` into `.agents/skills/` and `.claude/skills/`, which are
  gitignored. If the user declines, or there is no network, say impeccable is
  unavailable and do steps 1 and 2 by hand: run the interview below yourself
  and write PRODUCT.md and DESIGN.md from the answers, inventing nothing.
- Make sure `pnpm dev` is running in the background, so the user watches
  pages change. Give them the URL Vite prints.

If PRODUCT.md and DESIGN.md both exist, this is not a new deck: ask whether
to redo the style, redo the story, or stop.

**Format.** Read `META.format` in `src/deck/content.js` (missing means
`'slides'`). A project is one format: 16:9 slides, or a memo on US Letter
paper whose body flows across pages (`src/components/Flow.jsx`). If the
project still has a starter (slide or memo) and the user hasn't said which
they want, ask first, before the interview: "Slides (16:9 pages) or a memo
(US Letter pages, text flowing from page to page)?" If they want a memo and
the project has the slide starter, run `pnpm use-format memo`; it swaps in
the memo starter. `pnpm create sl-ide --format memo` will have done this
already. Never switch a project whose
pages are already the user's own. Where the steps below differ for a memo,
they say so.

## 1. Product truth: PRODUCT.md

Use the **impeccable** skill's `init` flow. It interviews and writes
PRODUCT.md. Before it asks, give it what sl-ide already fixes, so the user
is not asked these:

- Platform `web`; stack: the sl-ide harness (Vite + React, fixed
  13.333 × 7.5 in pages, vector PDF through headless Chrome, pnpm).
- The deliverable is a slide deck, not a site. Its surface is a page at
  1280 × 720 px with type floors of 16 px body and 12 px footer.
- **For a memo** instead: 8.5 × 11 in pages (816 × 1056 px), 1 in margins,
  an 11 pt serif body that flows from page to page, read on paper or as a
  PDF. Density is set by `META.pageBudget` (a one-pager, a two-to-four page
  memo, a longer paper), not a word budget.

What the interview must settle (impeccable asks; make sure these are
covered):

1. **Who reads it, and how**: a pre-read PDF that must stand without a
   voice-over, or slides presented live? This sets density and the word
   budget (`META.wordBudget`: about 340 for a pre-read, 120 for presenting).
2. **What it must do**: the decision or belief the reader should leave with.
3. **What exists**: the facts, figures and sources on hand, and the ones
   still missing (those become `[TBD: …]`, never invented).
4. **Brand commitments**: whose deck it looks like (the user's company, a
   client's, a neutral house style), and any logo that must appear.

Fill `META` in `src/deck/content.js` from the answers: `deckTitle`,
`author`, `date`, `pdfName`, `mark`, `wordBudget` (and `pageBudget` for a
memo). Leave `watermark` on.

Then publishing to sl-ide cloud. Check `sl-ide.config.json` (`pnpm create sl-ide`
usually wrote it). If the file is missing, ask for the team's slug and write it
as `{ "slug": "<deck>", "team": "<team>" }`. New decks are team-only; if the
user wants anyone with the link to open it, tell them to save “Anyone with the
link” under Sharing on `app.sl-ide.com/decks/<slug>` after the first publish. Confirm the
repo has the `SL_IDE_PUBLISH_TOKEN` secret
(`gh secret list -R "$(git remote get-url origin)"`); if not, have
the user run `! pnpm create sl-ide login` and set it from the token saved in
`~/.config/sl-ide/credentials.json`, under `servers["https://app.sl-ide.com"].teams.<team>.token`
(never print the token).

## 2. Visual system: DESIGN.md and the tokens

Ask for the brand source if the interview didn't name one. In order of
preference:

1. **A website**: read its CSS, not a screenshot. Fetch the stylesheet and
   pull the real values: ink, ground, brand colours, rules, type families
   and weights, corner radii. Record where each token came from.
2. **An existing deck or PDF**: `pdffonts` for type, and colours sampled
   from rendered pages (`pdftoppm`), checked against any brand guide.
3. **A brand guide**: take its values as written.
4. **Nothing**: let impeccable choose a world from PRODUCT.md (its
   new-work flow, mode **Read** for a pre-read, **Persuade** for a pitch).

Then use the **impeccable** skill to write DESIGN.md (`document` when
recording an existing brand, new-work when choosing a world). Hold it to
the harness:

- Tokens are CSS custom properties on `:root` in `src/styles.css`, under
  the starter's names (`--ink`, `--paper`, `--accent`, `--accent-ink`,
  `--on-accent`, `--card`, `--rule`, `--muted`, `--chrome`, `--confirm`,
  `--draft`, `--sans`, `--serif`, `--mono`, `--body`, `--foot`, `--title`,
  and for a memo the `--memo-*` type tokens).
  Add tokens rather than renaming these; the building blocks read them.
  Don't touch the `--ide-*` tokens, which style sl-ide itself.
- Type must be self-hosted, so the PDF never falls back. A licensed face
  (Adobe Fonts, a foundry font) cannot be: pick the nearest OFL face on
  Google Fonts, say so in DESIGN.md, then edit `FACES` in
  `scripts/fonts.sh`, run `pnpm fonts`, and update the `@font-face` rules.
  Delete font files the deck no longer uses.
- Contrast: text tokens at least 4.5:1 on the grounds they sit on. Never
  signal with red vs. green, or with colour alone.
- Emphasis is one pattern, used once per page at most (the starter's is an
  outline, `.is-outline`). Say in DESIGN.md what the deck's is.
- DESIGN.md gets a token table (token, value, source and role), type
  scale, signature patterns, and layout (title zone, content top, footer).

Set `META.mark`. A real logo goes in as an inline SVG in
`src/components/DeckMark.jsx` so it stays vector; never trace or invent one.

Run `pnpm run audit` and `pnpm shots`, look at every page, and fix what the
new type and colours broke (a heavier face sets wider, so titles may wrap).

## 3. Story: the action titles

Draft the deck as titles only, one line each, in a numbered list in chat:
cover, the main pages, then any appendix. Each title states the page's
point as a full sentence; read in order, the titles alone tell the story.
Ask the user to approve or edit the list. Don't build pages yet.

**For a memo**, draft the outline instead: the `Re:` line, then each
section heading as a sentence stating the section's point, with a line
under each on what it says. Read in order, the headings tell the argument.
Name any fixed pages (an exhibit, an appendix table) at the end.

## 4. Replace the starter pages

Once the titles are approved:

1. Delete the starter's page components (`StartHereSlide`, `AnatomySlide`,
   `ChecksSlide`, `FilesSlide`), their modules in `src/deck/pages/` and
   their CSS blocks. Keep the cover and the divider and adapt them.
2. One component per page in `src/slides/`, one module per page in
   `src/deck/pages/<key>.js` exporting `<key>`, one CSS block per page in
   `styles.css`. Register them in `src/slides/index.jsx`.
3. Write first-pass copy from what the user gave you. Every fact or figure
   you don't have becomes `[TBD: what is needed]`. Never invent numbers,
   names, quotes or results.
4. `pnpm run audit` must read ok on every page. Look at the shots.
5. Update `AGENTS.md`'s "This deck" section: the page list and the
   standing decisions so far, each dated and attributed.
6. Rewrite `README.md` for this project, as the note at its top says: a
   line linking to [sl-ide](https://github.com/dberm312/sl-ide-template) and what
   it is, then the deck's purpose, audience, published link and how to
   run it. Drop the copied harness docs.
7. Suggest a next step: `/copy-pass` once the content is in, `/slide-lab`
   for any page they're unsure of, `/ship-it` when they want a PDF.

**For a memo**, replace `memo.body` in `src/deck/pages/memo.js` with the approved
outline as blocks (the shapes are listed at the top of
`src/components/Flow.jsx`): the `memohead`, then a heading and paragraphs
per section. Never hand-break the copy to fit a page; the paginator does
that. Replace the starter's appendix page, or remove it from
`src/slides/index.jsx` if the memo has none. Then steps 3 to 7 as above;
the audit's RUNT note means the last page holds a line or two, usually a
sentence to cut.

Don't commit unless the user asks.
