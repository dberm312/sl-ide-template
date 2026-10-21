# sl-ide

An IDE for building slides and memos with Claude Code, Codex or any AI
agent. A deck is a set of React pages at a fixed 16:9 size; a memo
is US Letter pages whose body flows from page to page. The user watches them in the dev server and
steers by commenting on elements, and the deliverable is a vector PDF.
This file is the working agreement for any agent in this repo. `CLAUDE.md`
imports it.

## Getting started

If `PRODUCT.md` or `DESIGN.md` is missing, the deck hasn't been set up. When
the user asks for slides, run the **new-deck** skill first. It runs
**impeccable** to capture the audience (PRODUCT.md) and learn the style
from a brand source (DESIGN.md and the tokens), then outlines the story.
`node scripts/doctor.js` reports what's left; `pnpm dev` prints the same.

## Harness vs. deck

Each deck is its own repo made by `pnpm create sl-ide` (README, "Start a
new deck"), with sl-ide as the `upstream` remote. Harness files belong to sl-ide:
`src/components/`, `src/lab/` (except `takes/`), `scripts/`, `starters/`,
`vite.config.js`, `.githooks/`, `.github/` and `.agents/skills/`. When a fix
belongs in the harness rather than one deck, say so and suggest making it in
sl-ide and pulling it in (`git pull upstream main`), so decks don't drift
apart. In the sl-ide-template repo itself, keep everything brand-neutral.

## This deck

<!-- new-deck fills this in: the page list in order (one line each: label,
     action title, what the page shows) and the standing decisions about
     story, numbers and voice, each dated and attributed, e.g.
     "(Alex, 2026-10-14)". Keep it a description of the deck as it is now. -->

The starter deck: cover, Start here, Anatomy, Checks, then an Appendix
divider and A1 Where things live. It explains the harness; replace it.

**Hand references** to page labels in copy: none yet. List each one here
(e.g. "page 3's footer cites A2") so they get fixed when pages move.

## Skills

| Skill | When | Source |
|---|---|---|
| `new-deck` | Start a deck: audience, style, story | this repo |
| `slide-lab` | Compare 2–4 takes on a page side by side, then promote one | this repo |
| `copy-pass` | Edit the deck's copy under the deck's rules | this repo, uses copy-editing |
| `ship-it` | Audit, print, check fonts, commit, push | this repo |
| `clean-up` | Remove dead code; fix doc drift | this repo |
| `impeccable` | Product context, visual system, critique and polish | `skills-lock.json` |
| `copy-editing` | Editing passes on existing copy | `skills-lock.json` |
| `copywriting` | Writing new copy from scratch | `skills-lock.json` |

This repo's skills live in `.agents/skills/` (Codex reads them there) and
are symlinked into `.claude/skills/` (Claude Code). The third-party ones are
declared in `skills-lock.json`. `pnpm skills` restores them with
`npx skills experimental_install` into `.agents/skills/` and links them into
`.claude/skills/` (both gitignored for these); a global install works just
as well. If one is missing when you need it, offer that command.
Never vendor a third-party skill's files into the repo.

## Sources of truth

- **Copy and geometry:** `src/deck/content.js`. Every word and every region
  box lives there; components only place them. The user's copy goes in as
  written. If it overflows, shorten the words, never a number, and mark the
  change `// fit:` with the original wording.
- **`[CONFIRM: …]` and `[TBD: …]`** render exactly as written, highlighted.
  Never invent a replacement: no made-up figures, names, quotes, customers
  or results. Any illustrative figure is labelled "Illustrative".
- **Audience and purpose:** `PRODUCT.md`. **Visual system:** `DESIGN.md`.
  Both written by impeccable; update them when a decision changes them.
- **Tokens:** only in `src/styles.css` `:root`. Slides never hard-code a
  colour, font or size. The `--ide-*` tokens style sl-ide itself; leave them.
- **Page order:** `src/slides/index.jsx`. Appendix labels (A1, A2…) come from
  its order.
- **The deliverable is the deck on sl-ide cloud, plus its PDF.** On every
  push, CI (`.github/workflows/publish.yml`) builds, prints the PDF and
  publishes that version: main to `sl-ide.com/d/<slug>/`, other branches
  to `/d/<slug>/b/<branch>/`. `sl-ide.config.json` sets the slug, the owning
  team and `visibility` (`public` or `team`); the repo secret
  `SL_IDE_PUBLISH_TOKEN` authorizes it. Local builds go to `output/`
  (gitignored); never commit a PDF.

## The page

- `.slide` is a fixed 1280 × 720 px box (13.333 × 7.5 in at 96 px/in) with
  `overflow: hidden`. Content that doesn't fit is clipped silently, so
  `pnpm run audit` is the gate: run it before calling a page done, and look
  at the page with `pnpm shots <label>`.
- Regions are absolutely positioned from inch boxes with
  `box([x, y, w, h])` (`src/components/geometry.js`). Don't reflow them into
  normal document flow.
- Zones: title `[0.5, 0.4, 12.33, 0.8]`, content from y ≈ 1.4 in, sources
  `[0.5, 6.85, 12.33, 0.35]`, footer chrome at 694 px. A page with a
  two-line title passes a taller `titleZone` and moves its body down.
- Type floors: body 16 px (12 pt), footer 12 px (9 pt).
- **Action titles** are full sentences stating the page's point, one line
  where they fit. Read in order, the titles alone tell the story.
- Emphasis is one pattern used once per page at most (the starter's is an
  outline, `.is-outline`; DESIGN.md names the deck's). Never signal with red
  vs. green, and never with colour alone: every signal also carries a shape
  or a text label.
- Any fixed-height box that holds copy gets the `card` class (or sits in a
  `.region`), so the audit's SPILL check measures it.
- Fonts are self-hosted (`scripts/fonts.sh`, `src/fonts/`). Each
  `@font-face` names an exact weight. After adding a character outside
  latin, run `pnpm pdf && scripts/check-fonts.sh` to catch fallbacks.

## Memos

A project is one format, set by `META.format` in `content.js`: `'slides'`
(the default) or `'memo'`. `components/page.js` turns it into the page size
everything else reads. A new project becomes a memo with
`pnpm create sl-ide --format memo`, or `pnpm use-format memo` while it still
has the slide starter.

- The page is 816 × 1056 px (8.5 × 11 in). Zones: body `[1, 1, 6.5, 9]`
  (1 in margins), running header above it, sources `[1, 10.12, 6.5, 0.3]`,
  footer chrome at 1008 px. Body type is 11 pt serif (`--memo-*` tokens).
- The body is **flowing blocks** in `memo.body`: strings for paragraphs,
  then `{ h2 }`, `{ ul }`, `{ table }`, `{ callout }` and the rest listed at
  the top of `components/Flow.jsx`. The paginator lays them onto pages:
  paragraphs break between lines (two lines at least on each side), lists
  between items, tables between rows with the header repeated, headings
  stay with what follows. Never hand-break copy to fit a page, and never
  pad it to fill one.
- **Fixed pages** (a cover, a full-page exhibit, an appendix table) are
  components placed in inch boxes like slides, listed in `index.jsx` before
  or after `flow('memo', memo.body)`.
- Headings carry the argument the way action titles do: full sentences,
  so the headings alone tell the story.
- The audit skips WORDY on flowing pages; LONG fails a memo over
  `META.pageBudget` pages, and RUNT (advisory) flags a last page holding a
  line or two.
- Keep spacing between blocks in each block's `margin-top` and never use
  `text-wrap: pretty` in the body: the paginator measures one layout and
  prints another if either changes how a block is set.

## Checks

| | |
|---|---|
| `pnpm run audit` | CLIPPED / SPILL / OVERLAP / WORDY per page, LONG per memo; exits 1 on any. RAGGED and RUNT are advisory. Not `pnpm audit`, which audits dependencies. |
| `pnpm shots [labels]` | `output/shots/page-<label>.png` at 1:1 (`SCALE=2` for 2x) |
| `pnpm pdf` | `output/<META.pdfName>.pdf` |
| `pnpm lab` | the slide lab's fit report and screenshots |
| `node scripts/doctor.js` | setup status |
| `pnpm publish-deck` | publish `dist/` and the PDF to sl-ide cloud (CI does this on push) |
| `pnpm new-project <name>` | another deck next to this one, via `pnpm create sl-ide` |

The pre-commit hook (`.githooks/pre-commit`, turned on by `pnpm install`)
runs the audit whenever a commit touches the deck. A failing page blocks
the commit; fix the page rather than using `--no-verify`: it is the only
audit, since CI on push only prints, checks fonts and publishes.

## Working with the user

- **Comment mode:** the user presses `c` in the preview, clicks an element
  and pastes a block naming the slide, a CSS path and the element's text.
  Find the element from the path and the text, and edit `content.js` or the
  page's component, not the DOM.
- When asked for options on a page, use **slide-lab** rather than describing
  alternatives in chat.
- Record standing decisions in "This deck" above, dated and attributed, the
  moment the user makes them.
- pnpm, not npm. Don't commit unless asked (ship-it is standing permission).
  Say which branch you're on whenever you commit or push.
