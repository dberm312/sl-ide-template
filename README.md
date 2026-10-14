# sl-ide

**An IDE for building slides with Claude Code or Codex.**

You describe the deck; your agent writes the pages as React components at a
fixed 16:9 size. You watch them change in the browser, comment on any
element to steer, and print a vector PDF. A layout audit catches clipped,
crowded and overlapping pages before they ship.

## Start a new deck

sl-ide is the starter; each deck gets its own repo made from it. Don't build
a deck in this repo itself.

**Recommended: `pnpm new-project`**, run from sl-ide (or from any deck):

```sh
pnpm new-project acme-pitch --team acme   # ../acme-pitch, a private GitHub repo, publishing to sl-ide cloud
pnpm new-project acme-pitch --public      # a public repo instead
pnpm new-project acme-pitch --no-github   # local only
DIR=~/decks pnpm new-project acme-pitch   # somewhere other than next to this repo
```

It clones sl-ide from GitHub with its history (so commit and push harness
changes first), names that remote `upstream`, creates the deck's own repo as
`origin`, sets it up to publish to sl-ide cloud (see "Publish to sl-ide
cloud" below), installs dependencies and prints the next steps. Run from inside a
deck, it still clones sl-ide, via that deck's `upstream`.

By hand, the same thing is:

```sh
git clone https://github.com/dberm312/sl-ide-template acme-pitch && cd acme-pitch
git remote rename origin upstream          # sl-ide, for harness updates
gh repo create acme-pitch --private --source . --push   # the deck's own repo
```

Later, to pick up sl-ide's improvements:

```sh
git pull upstream main
```

**Or: a one-off from the template.** sl-ide is a GitHub template repository,
so you can click **Use this template** on GitHub, or run:

```sh
gh repo create acme-pitch --private --template dberm312/sl-ide-template --clone
```

That repo starts from one clean commit with no shared history, so
`git pull upstream` won't work. Pick this when the deck won't need harness
updates.

GitHub's Fork button won't work here, because it can't fork a repo into the
account that already owns it.

**Keeping pulls clean.** Harness files belong to sl-ide: `src/components/`,
`src/lab/` (except `takes/`), `scripts/`, `vite.config.js`, `.githooks/`,
`.github/` and the skills in `.agents/skills/`. A deck's own work goes in
`src/deck/content.js`, `src/slides/`, its blocks in `src/styles.css`,
`PRODUCT.md`, `DESIGN.md` and the "This deck" section of `AGENTS.md`. Fix a
harness bug in sl-ide first, then pull it into the decks, so it never has to
be redone per deck.

## Get started

In the new deck's folder:

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
| `v` | viewer: what an audience sees (Esc to come back) |
| `c` | comment mode: click an element, write a note, ⌘↵ copies a prompt-ready block |
| `⌘F` | find in slides |
| `b` | show or hide the slide rail (each page's word count and layout faults) |
| `d` | dock the bar left or on top |
| right-click a thumb | copy the page as a PNG |

| Route | |
|---|---|
| `/` | dev server: scroll preview with the dev bar · built deck: the viewer |
| `/#view/3` | the viewer, at page 3: one page at a time, ← → to move, `g` all pages, `f` full screen, Download PDF when `deck.pdf` sits beside it |
| `/#preview` | the scroll preview, also in a built deck |
| `/#sorter` | thumbnails |
| `/#print` | pages without chrome (what the PDF prints) |
| `/#audit` | the layout report |
| `/lab.html` | the slide lab (dev server only) |

## Commands

```sh
pnpm run audit        # CLIPPED / SPILL / OVERLAP / WORDY per page; exits 1 on any
pnpm shots 2 A1       # output/shots/page-<label>.png (no args = all; SCALE=2 for 2x)
pnpm pdf              # output/<META.pdfName>.pdf, vector, fonts embedded
pnpm publish-deck     # publish dist/ and the PDF to sl-ide cloud (CI does this)
pnpm lab              # fit report and screenshots for the slide lab's takes
pnpm fonts            # re-fetch the self-hosted fonts listed in scripts/fonts.sh
pnpm doctor           # setup checklist
pnpm new-project NAME # start a new deck repo from sl-ide (see above)
```

Use `pnpm run audit`, not `pnpm audit` (that's pnpm's dependency audit).
The audit, PDF and screenshots need Chrome or Chromium (`CHROME=/path` to
point at one). The font check needs `pdffonts` (`brew install poppler`).

Every commit that touches the deck runs the audit (`.githooks/pre-commit`).
On every push, CI (`.github/workflows/publish.yml`) audits, prints the PDF,
checks its fonts and publishes the deck to sl-ide cloud.

## Publish to sl-ide cloud

Every push publishes that version to [sl-ide.com](https://sl-ide.com): main
at `sl-ide.com/d/<slug>/`, any other branch as a preview at
`sl-ide.com/d/<slug>/b/<branch>/`, and each version at
`sl-ide.com/d/<slug>/v/<sha>/`. Viewers get the viewer and a PDF download.

A deck publishes when it has `sl-ide.config.json`:

```json
{ "slug": "acme-pitch", "team": "acme", "visibility": "team" }
```

- `slug`: the deck's link.
- `team`: the team on sl-ide cloud that owns it; members see it in their list.
- `visibility`: `team` (signed-in members only) or `public` (anyone with the link).

It also needs the repo secret `SL_IDE_PUBLISH_TOKEN`.
`pnpm new-project <name> --team <slug> [--share public]` sets up both: it
writes the config and sets the secret from `~/.config/sl-ide/publish-token`.
Save your team's slug in `~/.config/sl-ide/team` to skip `--team`. Without
a config, CI still audits and prints, and skips publishing.

By hand: `pnpm build && pnpm pdf && SL_IDE_PUBLISH_TOKEN=… pnpm publish-deck`.

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
