---
name: slide-lab
description: Explore rival takes on a deck page in a temporary comparison page (lab.html), iterate on the user's verdicts and notes, then promote the winner into the deck. Use when the user asks for options, takes, variants or ideas for a page, to compare versions, to merge or redesign pages, says "lab", "slide lab", or "lab feedback", or asks to put a chosen take into the deck.
---

# Slide lab

The lab is a dev-server page, `lab.html`, that shows 2–4 takes on one deck
page stacked down one scrolling page, each with its notes beside it. An
S/M/L control sets the slide size, and today's page(s) follow at the bottom
for reference. The user marks each take **Pick**, **Keep going** or **Cut**,
writes notes, and clicks **Send to agent**, which writes
`.lab/feedback.json`. Nothing in the lab reaches `dist/`, the audit or the
PDF: `vite build` reads `index.html` only.

| File | What it is | Lifetime |
|---|---|---|
| `lab.html`, `src/lab/main.jsx`, `LabApp.jsx`, `lab.css` | the board | permanent |
| `vite.config.js` `labFeedback()` | `POST /__lab/feedback` → `.lab/feedback.json` (plus a timestamped copy per send) | permanent |
| `scripts/lab.sh` (`pnpm lab`) | fit report for every take, screenshots to `output/lab/<id>.png` | permanent |
| `src/lab/takes/` | `index.js` (the session), one `Take*.jsx` per take, `takes.css` | **temporary**: emptied on promotion |

## 1. Start a session

1. Read the page(s) in question: the slide component, its block in
   `src/deck/content.js`, its CSS block in `src/styles.css`, and any hand
   references to it listed in `AGENTS.md`.
2. Ask only what blocks you (e.g. which content must survive). Otherwise
   state your assumptions in each take's `idea` and let the board settle them.
3. If `src/lab/takes/` holds another session, ask before replacing it.
4. Write `src/lab/takes/index.js`: `slug`, `round: 1`, `brief: { title, ask }`
   (the request in the user's words), `takes`, and `reference` (today's
   pages, so the board shows what the takes replace). Each take is
   `{ id, key: 'A', name, idea, changes?, Component }`; a reference entry is
   `{ id, label: '3', name, Component }`.

## 2. Write the takes

- **Differ in structure, not wording.** Each take answers the brief with a
  different layout or argument: where the content sits, what gets cut, what
  leads. Three is the default; never more than four.
- Each take is a real slide: `SlideShell` with the page's kind, regions
  placed with `box([x, y, w, h])`, copy in a `const c = {…}` at the top of
  the file in `content.js`'s shape, so promotion is a move, not a rewrite.
  Reuse existing content objects and classes where the take keeps them.
- Every rule in `AGENTS.md` and `DESIGN.md` applies as in the deck: tokens
  only, title size, type floors, one emphasis per page, no colour-only
  signals, placeholders as written.
- **In a memo**, a fixed page is labbed as above, on the Letter page. For
  a flowing section, each take is a `MemoPage` (from
  `components/Flow.jsx`) showing that section's blocks, with no `part`s, so
  the takes compare how the section reads. Promotion replaces those blocks
  in `memo.body`; the paginator re-flows the pages.
- New CSS goes in `takes.css` under a per-take prefix (`ta-`, `tb-`, …).
- The `idea` line tells the user what the take does and what it gives up,
  in one or two sentences.

## 3. Check before showing

Run `pnpm lab`. Every take must read `ok` (no CLIPPED, SPILL, OVERLAP or
WORDY). Then **look at every screenshot** in `output/lab/` and fix what the
checks can't see: ragged wraps, a range broken across lines, dead space,
misaligned cells. Don't show a take you haven't looked at.

## 4. Show it

Start the dev server if it isn't running (`pnpm dev`, in the background) and
give the URL: `http://localhost:5173/lab.html` (use the port Vite prints).
Say in a line per take what each one tries, and how to answer: scroll and
compare, mark each take, add notes, **Send to agent**, then say "lab
feedback".

## 5. Iterate

On "lab feedback" (or notes in chat), read `.lab/feedback.json`, then:

- **Cut** → delete that take's file, CSS block and entry.
- **Keep going** / **Pick** with notes → revise the take; fill its `changes`
  field with what changed and why, in one sentence.
- Mixing instructions ("A's strip with C's band") → a new take with the next
  free key; say which takes it draws on in its `idea`.
- Bump `round` (this also clears the board's verdicts, which are stored per
  round), re-run step 3, and say what changed per take.

If a note is ambiguous, ask rather than guess. Keep going until the user
says a take is the one.

## 6. Promote

Only when the user says which take goes in.

1. Copy → `src/deck/content.js` as the page's block (replace, or add for a
   new page), with dated comments for anything cut or changed.
2. Component → `src/slides/` (replacing the old one, or new), reading from
   `content.js`. CSS → the page's block in `src/styles.css`, renamed from the
   take prefix to the page's own.
3. `src/slides/index.jsx`: entries and appendix `SHORT` names. For removed
   pages, delete their component, content block and CSS.
4. Fix hand references to page labels (`AGENTS.md` lists them; `grep` for
   the old labels in `content.js`). Update the page list in `AGENTS.md`.
5. Look at the page with `pnpm check <label>`, then `pnpm run audit` must pass.
6. Empty `src/lab/takes/` back to the idle session (an `index.js` with
   `takes: []`, `reference: []`) and delete `.lab/`.
7. Don't commit unless asked; offer `/ship-it`.
