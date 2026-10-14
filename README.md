# sl-ide

**An IDE for building slides with Claude Code or Codex.**

You describe the deck; your agent writes the pages as React components at a
fixed 16:9 size. You watch them change in the browser, comment on any
element to steer, and print a vector PDF. A layout audit catches clipped,
crowded and overlapping pages before they ship.

## Get started

```sh
pnpm install          # deps, plus the pre-commit hook
pnpm dev              # preview at http://localhost:5173, setup guide in the terminal
```

Then follow the guide `pnpm dev` prints:

1. **Install the skills.** `pnpm skills` restores
   [impeccable](https://github.com/pbakaus/impeccable),
   copy-editing and copywriting
   ([marketingskills](https://github.com/coreyhaines31/marketingskills))
   from `skills-lock.json`. Skip it if you have them installed globally.
2. **Learn the style.** Open Claude Code (or Codex) here and run
   `/new-deck` (`$new-deck` in Codex). Impeccable interviews you for
   `PRODUCT.md` (who reads the deck, and what it must do), then reads your
   brand from a website, a PDF or a guide and writes `DESIGN.md` and the
   tokens. Then it drafts the story as action titles for you to approve.
3. **Build slides.** Ask for pages in plain words. In the preview, press
   `c` and click anything to copy a comment for your agent, ask for
   `/slide-lab` to compare takes on a page, `/copy-pass` to tighten the
   words, and `/ship-it` to audit, print and commit.

The dev bar shows a "Setup · N steps left" chip until steps 1 and 2 are done.
`pnpm doctor` prints the same checklist.

### Why a lockfile instead of bundled skills?

The third-party skills aren't copied into this repo. `skills-lock.json`
declares them (source repo, path and content hash). `pnpm skills` runs the
[`skills`](https://github.com/vercel-labs/skills) CLI's
`npx skills experimental_install` to restore them into `.agents/skills/`
(read by Codex), then links each into `.claude/skills/` (read by Claude
Code). Both folders are gitignored for these skills. You get the
upstream versions, the repo stays small, and a global install counts too.
`npx skills use pbakaus/impeccable@impeccable` can also run a skill without
installing it, but impeccable needs its scripts and references on disk, so
install it for real work.

## The preview

| Key | |
|---|---|
| `j` / `k` | next / previous page |
| `s` | slide sorter (`+` / `-` to resize) |
| `c` | comment mode: click an element, write a note, ⌘↵ copies a prompt-ready block |
| `⌘F` | find in slides |
| `b` | show or hide the slide rail (each page's word count and layout faults) |
| `d` | dock the bar left or on top |
| right-click a thumb | copy the page as a PNG |

| Route | |
|---|---|
| `/` | scroll preview with the dev bar |
| `/#sorter` | thumbnails |
| `/#print` | pages without chrome (what the PDF prints) |
| `/#audit` | the layout report |
| `/lab.html` | the slide lab (dev server only) |

## Commands

```sh
pnpm run audit        # CLIPPED / SPILL / OVERLAP / WORDY per page; exits 1 on any
pnpm shots 2 A1       # output/shots/page-<label>.png (no args = all; SCALE=2 for 2x)
pnpm pdf              # output/<META.pdfName>.pdf, vector, fonts embedded
pnpm lab              # fit report and screenshots for the slide lab's takes
pnpm fonts            # re-fetch the self-hosted fonts listed in scripts/fonts.sh
pnpm doctor           # setup checklist
```

Use `pnpm run audit`, not `pnpm audit` (that's pnpm's dependency audit).
The audit, PDF and screenshots need Chrome or Chromium (`CHROME=/path` to
point at one). The font check needs `pdffonts` (`brew install poppler`).

Every commit that touches the deck runs the audit and prints the PDF
(`.githooks/pre-commit`). On every push, CI (`.github/workflows/pdf.yml`)
does the same and commits the PDF to `pdf/`.

## Where things live

| Path | |
|---|---|
| `src/deck/content.js` | every word and every region box, in inches |
| `src/slides/` | one component per page; `index.jsx` sets the order and the appendix |
| `src/styles.css` | design tokens on `:root`, then page styles, then the IDE chrome |
| `src/components/` | the harness: page shell, dev bar, rail, comment mode, find, audit |
| `src/lab/` | the slide lab board; `takes/` holds the current session |
| `PRODUCT.md`, `DESIGN.md` | audience and visual system, written by impeccable |
| `AGENTS.md` | the working agreement for agents (`CLAUDE.md` imports it) |
| `.agents/skills/` | new-deck, slide-lab, copy-pass, ship-it, clean-up (symlinked into `.claude/skills/`) |
| `skills-lock.json` | the third-party skills this repo expects |
| `scripts/` | audit, pdf, shots, lab, fonts, doctor |
