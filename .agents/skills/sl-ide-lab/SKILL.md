---
name: sl-ide-lab
description: Explore rival takes on a deck page in a temporary comparison page (lab.html), iterate on the user's verdicts and notes, then promote the winner into the deck. Use when the user asks for options, takes, variants, alternatives or ideas for a page, to make a page bolder, quieter, simpler or laid out differently, to compare versions, to merge or redesign pages, says "lab", "slide lab", or "lab feedback", or asks to put a chosen take into the deck.
---

# Slide lab

The lab is a dev-server page, `lab.html`, that shows 2–4 takes on one deck
page. **Focus** (the default) shows one take as large as the window allows,
with its notes beside it: ←/→ or 1–4 switch takes, R shows the page today,
P/K/X mark it, G switches to **Compare**, which stacks every take down one
page at S/M/L size. The user marks each take **Pick**, **Keep going** or
**Cut**, writes notes, and clicks **Send to agent**, which writes
`.lab/feedback.json`. Nothing in the lab reaches `dist/`, the audit or the
PDF: `vite build` reads `index.html` only.

| File | What it is | Lifetime |
|---|---|---|
| `lab.html`, `src/lab/main.jsx`, `LabApp.jsx`, `lab.css` | the board | permanent |
| `vite.config.js` `labFeedback()` | `POST /__lab/feedback` → `.lab/feedback.json` (plus a timestamped copy per send) | permanent |
| `scripts/lab.sh` (`pnpm lab [ids]`) | fit report for every take (or the named ones), screenshots to `output/lab/<id>.png` | permanent |
| `.claude/agents/take-worker.md` | the subagent role that writes one take | permanent |
| `src/lab/takes/` | `index.js` (the session), one `Take*.jsx` and one `t*.css` per take | **temporary**: emptied on promotion |

## 1. Start a session

1. Read the page(s) in question: the slide component, its module in
   `src/deck/pages/`, its CSS block in `src/styles.css`, and any hand
   references to it listed in `AGENTS.md`.
2. If `src/lab/takes/` holds another session, ask before replacing it.
3. **Pick the direction.** Map the user's words onto one of: *bolder*
   (more scale, contrast, commitment), *quieter* (less colour, ornament,
   noise), *distill* (cut content or structure), *layout* (a different
   arrangement), *typeset* (type scale and weight), *colorize* (which
   palette role carries the page), or *open* (intent without a direction:
   "make it feel more premium"; pass the words on). If the ask names no
   direction at all ("some options", "ideas", "better"), ask once: "Which
   way should the takes go: bolder, quieter, simpler, a new layout, type,
   colour, or anything?" Ask nothing else unless it blocks you (e.g. which
   content must survive); state other assumptions in each take's `idea`.
4. **Pick the mode.** *Default* keeps the deck's look and varies how the
   page uses it; that's right almost every time. *Departure* rejects the
   look; only when the user asks for it in this request ("redesign this",
   "something completely different"). When unsure, default: three on-brand
   takes that feel alike can be pushed further, three off-brand ones can't be
   used.
5. **Pin down the identity.** One sentence of what is actually on the page
   today, read from `DESIGN.md`, the `:root` tokens and the page's CSS: the
   surface and accent tokens (names and values), the fonts, the layout
   (stacked, side by side, grid, asymmetric), the surface treatment
   (corners, rules, cards), and the copy's voice. Facts, not a style name. In
   default mode every take must read as the same deck as this sentence.

## 2. Plan the takes

Each take commits to a different **primary axis**: what it changes most.

| Axis | What changes |
|---|---|
| hierarchy | which element commands the eye, and what's demoted |
| layout | the arrangement: stacked, side by side, grid, asymmetric, overlay |
| type | scale ratio, weight and case, within the deck's fonts |
| colour | which existing token carries the surface: restrained, committed, drenched |
| density | sparse, comfortable or dense: how much is on the page |
| structure | merge, split or cut: what the page argues and what goes to the appendix |

Three takes, three different axes; never more than four takes. The
direction narrows which axes fit (*bolder*: hierarchy, colour, scale of the
lead; *distill*: density, structure; *layout*: layout, structure, hierarchy).
In departure mode, each take instead names a concrete real-world referent
derived from `PRODUCT.md`'s brand words ("an annual report's financial
highlights spread", not "clean and modern"), and no two share one.

Write `src/lab/takes/index.js`: `slug`, `round: 1`, `brief: { title, ask }`
(the request in the user's words), `identity` (the sentence), `mode`,
`takes`, and `reference` (today's pages, so the board shows what the takes
replace). Each take is
`{ id: 'ta', key: 'A', name, axis, idea, load: () => import('./TakeA.jsx') }`;
a reference entry is `{ id, label: '3', name, Component }`, imported.

**Squint test**, before writing any code: read the takes' `idea` lines side
by side. Two that rhyme, two on the same axis, or (default mode) one whose
palette, type or voice drifts from the identity: rework the plan.

## 3. Write the takes

With 2 or more takes, write them with parallel subagents, one per take, in
this checkout: use the `take-worker` role (`.claude/agents/take-worker.md`;
for another agent, pass its body as the instructions). Give each worker the
brief, the identity sentence and mode, its take's key, name, axis and `idea`,
its two files (`TakeA.jsx`, `ta.css`) and class prefix (`ta-`), and the
page's files to read. Workers share no file and `pnpm lab <id>` imports
only the named take, so they can't break each other. You write `index.js`
before launching them; they never touch it.

The rules every take follows (also in the role file):

- Each take is a real slide: `SlideShell` with the page's kind, regions
  placed with `box([x, y, w, h])`, copy in a `const c = {…}` at the top of
  the file in its page module's shape, so promotion is a move, not a rewrite.
  Reuse existing content objects and classes where the take keeps them.
- Every rule in `AGENTS.md` and `DESIGN.md` applies as in the deck: tokens
  only, title size, type floors, one emphasis per page, no colour-only
  signals, placeholders as written. A departure take may propose new token
  *values* in its own CSS file, scoped to its prefix, and says so in `idea`.
- **In a memo**, a fixed page is labbed as above, on the Letter page. For
  a flowing section, each take is a `MemoPage` (from
  `components/Flow.jsx`) showing that section's blocks, with no `part`s, so
  the takes compare how the section reads. Promotion replaces those blocks
  in `memo.body`; the paginator re-flows the pages.
- The take's CSS goes in its own file (`ta.css`, imported at the top of
  `TakeA.jsx`), every class under its prefix (`ta-`, `tb-`, …).
- The `idea` line tells the user what the take does and what it gives up,
  in one or two sentences. The worker may sharpen it; it reports any change.
- The worker runs `pnpm lab <id>`, **looks at** `output/lab/<id>.png`, and
  fixes what it sees until the line reads `ok` and the page looks finished.

## 4. Check before showing

Run `pnpm lab`. Every take must read `ok` (no CLIPPED, SPILL, OVERLAP,
WORDY or BROKEN). Then **look at every screenshot** in `output/lab/` side by
side. Fix what the checks can't see: ragged wraps, a range broken across
lines, dead space, misaligned cells. Run the squint test again on the
pictures: rework a take that drifted onto another's axis or off the
identity. Don't show a take you haven't looked at.

When a take holds a photo, screenshot or illustration and `TYPESAFE_API_KEY`
is set, also run `pnpm ask fit output/lab/<id>.png` for those takes. Fix any
`misfit` (its `reasons` say what: `subject_cut`, `covers_text`, `distorted`)
and look again at any `unsure`. An error from it means the check didn't run;
say so rather than reading it as a pass.

## 5. Show it

Start the dev server if it isn't running (`pnpm dev`, in the background) and
give the URL: `http://localhost:5173/lab.html` (use the port Vite prints).
Say the identity you held (or departed from), then one line per take: its
axis and what it tries. Then how to answer: ←/→ to flip through at full
size (R for the page today, G to see them all), mark each take, add notes,
**Send to agent**, then say "lab feedback".

## 6. Iterate

On "lab feedback" (or notes in chat), read `.lab/feedback.json`, then:

- **Cut** → delete that take's `.jsx`, `.css` and entry.
- **Keep going** / **Pick** with notes → revise the take; fill its `changes`
  field with what changed and why, in one sentence.
- Mixing instructions ("A's strip with C's band") → a new take with the next
  free key; say which takes it draws on in its `idea`, and set `axis` to the
  stronger of the two.
- A note that changes the direction or mode ("all too safe", "go further")
  → re-plan from step 2 for the takes that remain open.
- Revisions to 2 or more takes go to `take-worker`s in parallel, as in step 3.
- Bump `round` (this also clears the board's verdicts, which are stored per
  round), re-run step 4, and say what changed per take.

If a note is ambiguous, ask rather than guess. Keep going until the user
says a take is the one.

## 7. Promote

Only when the user says which take goes in.

1. Copy → the page's module, `src/deck/pages/<key>.js` (replace, or a new
   file for a new page), with dated comments for anything cut or changed.
2. Component → `src/slides/` (replacing the old one, or new), reading from
   that module. CSS → the page's block in `src/styles.css`, renamed from the
   take prefix to the page's own. A departure take's proposed token values
   go into `:root` and `DESIGN.md` only if the user confirms the new look
   for the whole deck; otherwise ask how to fit them.
3. `src/slides/index.jsx`: entries and appendix `SHORT` names. For removed
   pages, delete their component, page module and CSS.
4. Fix hand references to page labels (`AGENTS.md` lists them; `grep` for
   the old labels in `src/deck/`). Update the page list in `AGENTS.md`.
5. Look at the page with `pnpm check <label>`, then `pnpm run audit` must pass.
6. Empty `src/lab/takes/` back to just the idle session (an `index.js`
   with `takes: []`, `reference: []`) and delete `.lab/`.
7. Don't commit unless asked; offer `/sl-ide-ship`.
