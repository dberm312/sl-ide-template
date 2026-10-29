# sl-ide-template

**An IDE for building slides and memos with Claude Code, Codex or any AI agent.**

sl-ide is a harness around the agent you already use, not a new one. It
gives the agent the pages, the house rules (`AGENTS.md`), the skills and
the layout checks; the agent writes and edits your slides.

| Works with | | How |
|---|---|---|
| **Anthropic** | <img src=".github/agents/claude.svg" height="20" alt="" align="absmiddle"> Claude &nbsp; <img src=".github/agents/claude-code.svg" height="20" alt="" align="absmiddle"> Claude Code | Skills as slash commands: `/new-deck`, `/slide-lab`, `/ship-it` |
| **OpenAI** | <img src=".github/agents/chatgpt.svg" height="20" alt="" align="absmiddle"> ChatGPT &nbsp; <img src=".github/agents/codex.svg" height="20" alt="" align="absmiddle"> Codex | The same skills: `$new-deck`, `$slide-lab`, `$ship-it` |
| **Any AI agent** | Works natively | Everything is plain files in the repo (`AGENTS.md`, skills, scripts), so any agent that reads files and runs commands picks it up. No plugin. |

Logos belong to their owners.

> **Agents: this README is sl-ide's, not the deck's.** When you set up a new
> project from this template (`/new-deck`), rewrite it for that project.
> Keep one line at the top linking back to
> [sl-ide](https://github.com/dberm312/sl-ide-template) and saying what it is (the
> IDE this deck is built in, with its docs and commands). Everything below
> that is about this deck or memo: what it's for and who reads it, where
> it publishes (the sl-ide cloud link from `sl-ide.config.json`), how to
> run it (`pnpm install && pnpm dev`) and anything specific to working on
> it. Leave the harness docs to the sl-ide link rather than copying them.

## Start a new deck

You'll need:

- Node 20.19+ or 22.12+
- pnpm (`corepack enable pnpm`)
- Git
- The GitHub CLI, signed in (`gh auth login`)
- Claude Code or Codex

```sh
pnpm create sl-ide my-deck
```

That's [sl-ide-create](https://github.com/dberm312/sl-ide-create). It asks a
few questions, then:

- clones the **latest** sl-ide template from GitHub, keeping its history as
  the `upstream` remote, so later editor updates arrive with
  `git pull upstream main`;
- creates the deck's own GitHub repo (private by default);
- asks about automatic anonymous harness feedback (Off by default; `--feedback auto` opts in);
- sets it up to publish to [sl-ide cloud](https://app.sl-ide.com): you approve a
  sign-in in your browser, it saves a token for your account, writes
  `sl-ide.config.json` and sets the repo's `SL_IDE_PUBLISH_TOKEN` secret;
- runs `pnpm install`.

Then `cd my-deck && pnpm dev`. Don't build a deck in this template repo
itself.

Already in an empty folder for the deck? `pnpm create sl-ide .` builds it
there and names it after the folder.

For a memo instead of slides: `pnpm create sl-ide my-memo --format memo`
(see [Memos](#memos)).

Without prompts: `pnpm create sl-ide my-deck --yes`.
From inside an existing deck, `pnpm new-project my-next-deck` does the same,
next to it. `pnpm create sl-ide login` switches the signed-in account.

**Keeping pulls clean.** Harness files belong to sl-ide: `src/components/`,
`src/lab/` (except `takes/`), `scripts/`, `vite.config.js`,
`.github/` and the skills in `.agents/skills/`. A deck's own work goes in
`src/deck/`, `src/slides/`, its blocks in `src/styles.css`,
`PRODUCT.md`, `DESIGN.md`, `sl-ide.config.json` and the "This deck" section
of `AGENTS.md`. Fix a harness bug in sl-ide first, then pull it into the
decks, so it never has to be redone per deck. In a deck, the
**update-sl-ide** skill (`/update-sl-ide`) does the pull: it takes the
harness, keeps the deck's own files, drops any starter pages the pull brings
along and checks the deck still prints. A deck made before the skill existed
needs one plain `git pull upstream main` to get it.

## Get started

In the new deck's folder:

```sh
pnpm install          # deps
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
   words, and `/ship-it` to audit, print, commit and push, then wait for CI to
   publish it.

The dev bar shows a "Setup · N steps left" chip until steps 1 and 2 are done.
`pnpm doctor` prints the same checklist. Both also show the deck repo's latest
Publish deck run (through `gh`, when it's signed in) and flag a failure.

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
| `→` / `←` (or `↓` / `↑`) | next / previous page |
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

## Memos

A memo is the same IDE on US Letter pages (8.5 × 11 in, portrait). You
write its body as blocks in `src/deck/pages/memo.js` (paragraphs, headings,
lists, tables, callouts) and the paginator in `src/components/Flow.jsx`
lays them onto as many pages as they need. It splits paragraphs between
lines, lists between items and tables between rows (repeating the header),
and keeps headings with the text below them. Pages that shouldn't flow, like
an exhibit or an appendix table, are fixed pages placed in inches, like
slides. The viewer shows a memo as one scrolling document, and the PDF is
Letter-sized.

`META.format: 'memo'` makes a project a memo. `pnpm create sl-ide --format
memo` starts one, and `pnpm use-format memo` switches a project that still
has the slide starter.

## Commands

```sh
pnpm check 2          # audit + output/shots/page-2.png, warm (--changed: pages git diff touches)
pnpm map              # output/map.md: each page's label, title, files, copy keys, words, audit
pnpm run audit        # CLIPPED / SPILL / OVERLAP / WORDY per page, LONG per memo; exits 1 on any
pnpm shots 2 A1       # output/shots/page-<label>.png (no args = all; SCALE=2 for 2x)
pnpm pdf              # output/<META.pdfName>.pdf, vector, fonts embedded; and output/cover.png
pnpm publish-deck     # publish dist/ and the PDF to sl-ide cloud (CI does this)
pnpm lab              # fit report and screenshots for the slide lab's takes
pnpm ask fit 2 A1     # TypeSafe: does the picture on each page fit it? (JSON)
pnpm ask find pricing # TypeSafe: which pages mention a topic? (JSON)
pnpm fonts            # re-fetch the self-hosted fonts listed in scripts/fonts.sh
pnpm doctor           # setup checklist and the last publish
pnpm new-project NAME # start another deck next to this one (sl-ide-create)
pnpm use-format memo  # turn a fresh project into a memo (starters/memo)
```

Use `pnpm run audit`, not `pnpm audit` (that's pnpm's dependency audit).
The audit, PDF and screenshots need Chrome or Chromium (`CHROME=/path` to
point at one).

### Typed questions (TypeSafe)

`pnpm ask` puts typed questions about the pages to
[TypeSafe](https://typesafe.ai)'s Jev and prints its answers as JSON, with
calibrated probabilities: `fit` sends each page's shot (or any PNG or JPEG,
such as a slide-lab take) and asks whether its picture fits; `find` sends
every page's text and asks which pages mention a topic. The questions and the
thresholds that turn answers into verdicts are in `scripts/ask-questions.mjs`;
`--dry-run` prints the requests without sending them. A failed call exits 1
and is never read as a "no".

It needs an API key from [typesafe.ai](https://typesafe.ai) in your
environment (your shell profile, say), never in the deck's repo:

```sh
export TYPESAFE_API_KEY=...
```

The pages you ask about leave your machine: `fit` sends the page images,
`find` every page's text. To write new questions, the `typesafe-ai` skill
(`pnpm skills`) knows the API.

On every push, CI (`.github/workflows/publish.yml`) audits the deck, prints
the PDF, checks its fonts and publishes the deck to sl-ide cloud. A failing
page stops the publish. Commits don't wait on the audit; run it yourself
before pushing to catch problems earlier.

## Publish to sl-ide cloud

Every push publishes that version to [app.sl-ide.com](https://app.sl-ide.com): main
at `app.sl-ide.com/d/<slug>/`, any other branch as a preview at
`app.sl-ide.com/d/<slug>/r/<encoded-branch>/`, and each version at
`app.sl-ide.com/d/<slug>/v/<sha>/`. Viewers get the viewer and a PDF download.

CI builds once, then audits and prints that same build. The Actions summary
shows install, build, audit, PDF, upload and finalization times. Local audit
and PDF commands still build by default; `SL_IDE_REUSE_DIST=1` explicitly
reuses an existing `dist/index.html` and fails if it is missing.

A branch's open PR gets one comment with its preview link, posted when the
PR opens and updated on each push. When the PR is merged or closed, or the
branch is deleted,
`.github/workflows/unpublish.yml` takes its preview link down. Its versions
stay at `/v/<sha>/` for 30 days, then the cloud deletes them. Versions that
were on main are kept.

If the account that owned the deck was deleted, the deck is orphaned and
publishing it fails until it has a new owner. Sign in with the new account,
start a claim at `app.sl-ide.com/claim/<slug>`, and run the Claim deck
workflow (`.github/workflows/claim-deck.yml`) on `main` with the code it
shows: `gh workflow run claim-deck.yml -R "$(git remote get-url origin)" --ref main -f code=<code>`. GitHub's OIDC token
proves the run is in this repo (by name, and by GitHub's repository id, which
every publish sends as `GITHUB_REPOSITORY_ID`); the deck then belongs to the
new account. Run
`pnpm create sl-ide@latest token` to set a new `SL_IDE_PUBLISH_TOKEN`.

A deck publishes when it has `sl-ide.config.json`:

```json
{ "slug": "acme-pitch" }
```

- `slug`: the deck's link.

New decks are restricted. To share publicly, open the deck's cloud page and
choose Share to add viewers or allow “Anyone with the link”. Publishing never changes sharing.

It also needs the repo secret `SL_IDE_PUBLISH_TOKEN`, a publish token for
the deck owner. `pnpm create sl-ide` sets up both. For a deck made without it,
add the config, then run `pnpm create sl-ide@latest token` in the deck to set
the secret. Tokens are listed and revoked at app.sl-ide.com/tokens. Without a
config, CI still prints, and skips publishing. Before uploading anything, the
publisher asks the cloud whether its token may publish this deck, and stops
with the fix if not.

By hand: `pnpm build && pnpm pdf && SL_IDE_PUBLISH_TOKEN=… pnpm publish-deck`.

## Where things live

| Path | |
|---|---|
| `src/deck/pages/` | every word and every region box, in inches: one module per page |
| `src/deck/content.js` | what every page shares: `META`, the page zones, `rich()` |
| `src/slides/` | one component per page; `index.jsx` sets the order and the appendix |
| `src/styles.css` | design tokens on `:root`, then page styles, then the IDE chrome |
| `src/components/` | the harness: page shell, memo paginator, dev bar, rail, comment mode, find, audit |
| `starters/` | the memo starter, copied in by `pnpm use-format memo` |
| `src/lab/` | the slide lab board; `takes/` holds the current session |
| `PRODUCT.md`, `DESIGN.md` | audience and visual system, written by impeccable |
| `AGENTS.md` | the working agreement for agents (`CLAUDE.md` imports it) |
| `.agents/skills/` | new-deck, slide-lab, copy-pass, ship-it, clean-up, update-sl-ide (symlinked into `.claude/skills/`) |
| `skills-lock.json` | the third-party skills this repo expects (impeccable, copy-editing, copywriting, typesafe-ai) |
| `scripts/` | audit, pdf, shots, lab, fonts, doctor |

## Parallel worktrees

`pnpm run audit`, `pnpm pdf` and `pnpm shots` serve `dist/` with
`scripts/serve.mjs` on a port the OS picks, and `pnpm lab` starts its dev
server the same way, so several worktrees (or agents) can check at once.
`scripts/render.mjs` first asks the server for its build id (this
checkout's `dist/` path plus its `index.html`) and fails rather than measure
another deck. `tests/serve.test.mjs` audits two differently edited copies
concurrently.
`pnpm check` keeps its state in each checkout's `.sl-ide/` (the warm
Chrome, and `dev.json`, where `pnpm dev` says which port it is on) and asks
the dev server for its checkout path before using it. Without a dev server,
checks in the same checkout take turns building and measuring `dist/`, so a
rebuild cannot remove files another check is using. Different worktrees
remain independent.

## Browser smoke checks

Run `pnpm test:smoke` with Google Chrome installed. The suite uses real Chrome
(including the dev server's copy-slide renderer), creates disposable slide and
memo projects, and removes them afterward. It checks editor navigation, comment
text on the clipboard, 2× PNG captures on the clipboard, viewer navigation,
source edits and full reloads preserving the page, and PDF downloads from a
local production build. PDF fixtures are printed from each starter's `#print`
route; downloaded bytes must match. No cloud account or publish token is needed.
Failures retain traces under `output/playwright/`.

These are local harness checks (template-C). Published URLs, authentication,
pinned versions and cloud-triggered reloads belong to cloud-F; publishing and
the shell PDF pipeline belong to cloud-G/template-A. Run this suite in a host
that permits Chrome processes and localhost servers.

## Preview comment checks

`pnpm test` runs `scripts/preview-comment.mjs` against a fake `gh`
(`tests/fake-gh.mjs`, which needs `jq`). It checks that preview links use the
same `/r/<UTF-8 hex>/` keys the cloud serves (pinned alongside cloud's branch
tests), with case, slashes and Unicode normalization kept apart, and that a
PR keeps exactly one preview comment through open, publish, close and reopen,
including when two workflow runs race to post it.

## Bench

`pnpm bench` runs `test`, `test:smoke`, `audit`, `shots 2` and `pdf` three
times each and writes the median and min wall time, with the machine's CPU
count, OS and Node, to `output/bench.json`, then prints the 10 slowest tests
of each suite. `pnpm bench --compare` adds the speedup against
`bench/baseline.json` (the SL-60 baseline, from an 8-core Mac);
`pnpm bench --compare main` instead runs the same commands at `main` in a
throwaway worktree on this machine, which is the fair before/after for a PR.
Name commands to run only those (`pnpm bench test --runs 5`); `--save`
rewrites the baseline. CI runs `pnpm test` through it once and warns, without
failing, when a command takes over 1.5x its baseline.

## Publisher checks

The publisher (`scripts/publish-deck.mjs`) is tested against a disposable
cloud in the private `sl-ide-cloud` repo, which runs this copy of the script
when it is checked out beside it (or at `$SL_IDE_TEMPLATE_DIR`):
`pnpm test:db` there, file `src/test/publisher.integration.test.ts`. It covers
the upload session and manifest, index.html going last, per-request deadlines
and retries after slow, failed and lost responses (uploads and recording the
version; only timeouts, lost connections, 408, 429 and 5xx are retried), checksum mismatches, interrupted runs leaving the live
version alone, malformed requests, rejected tokens and other users' decks (refused before any upload),
the 4 MB limit, exact branch names, unpublishing, and slides and memo PDFs
printed by Chrome (template-A / cloud-G). Run it after changing the publisher
or the workflows that call it.

The canonical template repository also runs `Template checks` on PRs and
`Cross-repo smoke` on trusted main pushes. It dispatches `sl-ide-cloud`'s private shared workflow with the
exact template SHA and waits for the result, including actual CLI-created
slides and memos, PDF printing, publishing and served-artifact checks.
The token-bearing dispatch job executes no PR source. Configure repository
secret `CROSS_REPO_CI_TOKEN` with Actions read/write on `dberm312/sl-ide-cloud`
(installed), and `Template checks` is a required check on `main`
([SL-38](https://linear.app/sl-ide/issue/SL-38/activate-hosted-staging-and-cross-repo-ci-enforcement)).
Missing configuration, downstream failures and timeouts fail clearly.
Check the main-push result before releasing.
Public PRs never dispatch their code into private cloud; cloud
validates dispatched SHAs against trusted public main before running them.
Cloned decks skip this product-only workflow and retain their own publishing CI.

## Anonymous harness feedback

Feedback is off by default, including with `-y`. Choose Auto during setup or use
`pnpm create sl-ide my-deck --feedback auto`; `--feedback off` keeps it off.
Reports describe harness behavior, audit counts and workarounds, never deck copy,
names or file contents. A random project ID lives only in gitignored
`.sl-ide/feedback.json`; a fresh clone gets a new ID.

In a deck, `pnpm feedback on` / `off` toggles automatic reports. `status` shows
settings and the endpoint; `log` shows queued and sent JSON. `/give-feedback`
previews a manual report and asks “Send?” even when automatic feedback is off.
`DO_NOT_TRACK=1` or `SL_IDE_FEEDBACK=0` blocks every delivery.
`SL_IDE_FEEDBACK_DEBUG=1` prints scrubbed payloads locally without sending.

Reports are scrubbed before being saved to `.sl-ide/outbox/`, and again before
retrying. Delivery times out after five seconds. Failed deliveries stay queued
(up to 20 reports) for a later run; successful ones move to `.sl-ide/sent/`.
Existing decks get the scripts through `/update-sl-ide` and stay opted out.

## Agent benchmark

`pnpm agent-bench` runs headless Claude Code (`claude -p`) and Codex
(`codex exec`) on five fixed deck tasks (`bench/agent-tasks.mjs`: a copy
edit, a seeded overflow fix, a new appendix page, a pasted comment, a
multi-page pass), each in a throwaway copy of this project. Every run is
checked by script, never by the agent's word: the audit passes, only the
task's files changed, nothing was committed, every figure survives, plus
the task's own checks. It records wall time, turns, tool calls, reads
before the first edit, tokens, cost and whether the agent ran the audit
or `pnpm check`, into `output/agent-bench.json`.

```bash
pnpm agent-bench --agent claude --task copy-edit --runs 1   # one cheap run
pnpm agent-bench --runs 3 --baseline                        # write bench/agent-baseline.json
pnpm agent-bench --runs 3 --compare                         # diff against it
```

It spends tokens, so it is local and manual; CI never runs it. Each run is
capped (`--max-turns 40`, `--budget 2` USD for Claude, `--timeout-min 15`);
a capped run fails. `--jobs` (default 2) sets how many run at once.
