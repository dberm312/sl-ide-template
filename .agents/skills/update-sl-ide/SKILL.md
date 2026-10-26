---
name: update-sl-ide
description: Pull the latest sl-ide harness into this deck from the `upstream` remote, keep the deck's own pages, copy and styles, drop any starter content the pull brings along, port the changes the harness now needs, check the deck still prints, and commit the merge. Use when the user says "update sl-ide", "pull upstream", "pull the template", "get the latest editor", or /update-sl-ide.
---

# Update sl-ide

A deck is a clone of sl-ide with the template as its `upstream` remote, so
`git pull upstream main` brings editor fixes in. A plain pull also brings
the template's own starter deck along: new starter pages, edits to starter
copy, placeholder tokens. This skill takes the harness and keeps the deck.

Run from the repo root. `git merge --abort` undoes everything up to the
commit in step 7, so use it whenever a step goes wrong and say so.

## Who owns what

| Owner | Paths | On a conflict or upstream change |
|---|---|---|
| **Harness** | `src/components/`, `src/lab/` (except `takes/`), `src/App.jsx`, `src/main.jsx`, `scripts/` (including `feedback.mjs`, `feedback-schema.mjs`, `feedback-vocab.json`, `feedback-common-words.txt`), `starters/`, `tests/`, `vite.config.js`, `playwright.config.js`, `lab.html`, `CLAUDE.md`, `.gitignore`, `.githooks/`, `.github/`, `.agents/skills/` and `.claude/skills/` (sl-ide's own skills), `skills-lock.json`, `pnpm-workspace.yaml` | Take upstream's |
| **Deck** | `src/deck/content.js`, `src/slides/`, `src/fonts/`, `src/lab/takes/`, `public/`, `PRODUCT.md`, `DESIGN.md`, `README.md`, `sl-ide.config.json`, `.sl-ide/` (private feedback settings and history; never touched by a pull) | Keep the deck's |
| **Mixed** | `src/styles.css`, `AGENTS.md`, `package.json`, `pnpm-lock.yaml`, `index.html` | Split, below |

Mixed files:
- `src/styles.css`: parts 1 and 2 (fonts, tokens, page frame, page
  blocks) are the deck's. Part 3, from the comment "sl-ide's own palette
  for the IDE chrome" to the end, is upstream's.
- `AGENTS.md`: the "## This deck" section is the deck's, as are any dated
  standing decisions the deck added. Everything else is upstream's.
- `package.json`: upstream's scripts, dependencies and `packageManager`,
  plus any dependency or script the deck added itself. The deck's `name`
  and `description` if it changed them.
- `pnpm-lock.yaml`: take upstream's and let `pnpm install` redo it in step 5.
- `index.html`: upstream's, but keep the deck's `<title>`.

A path that fits none of these is the deck's: keep it and mention it.

## 1. Check

1. `git status --porcelain` must be empty. If not, stop: say what's
   uncommitted and ask whether to commit or stash it first.
2. `git remote get-url upstream`. If that fails, add it:
   `git remote add upstream https://github.com/dberm312/sl-ide-template.git`.
3. `git fetch upstream`.
4. `BASE=$(git merge-base HEAD upstream/main)`. If there is none, the deck
   doesn't share sl-ide's history. Stop and ask; never use
   `--allow-unrelated-histories` without the user's yes.
5. `git rev-list --count HEAD..upstream/main`. At 0, say the deck is
   already current and stop.
6. Record the deck as it looks now: `pnpm shots`, then
   `mv output/shots output/shots-before`.

## 2. Preview

`git log --oneline HEAD..upstream/main` and
`git diff --stat $BASE upstream/main`. Tell the user in a few lines what
the update brings (from the commit subjects), and list any deck-owned or
mixed path it touches: those are the ones that need care.

## 3. Merge without committing

`git merge --no-ff --no-commit upstream/main`

## 4. Resolve by owner

List what the merge touched:
`git diff --name-status $BASE upstream/main` (what upstream changed) and
`git diff --name-only --diff-filter=U` (what conflicts). Then, path by path:

- **Harness, conflict:** `git checkout --theirs -- <path>`. If the deck had
  edited that file, show the deck's lost edits
  (`git diff $BASE HEAD -- <path>`) and ask whether any must survive. Say
  that a fix the deck needs belongs in sl-ide, so it doesn't have to be
  redone after every pull.
- **Harness, deleted in the deck:** restore it with
  `git checkout upstream/main -- <path>`, unless the user removed it on
  purpose (ask).
- **Deck, changed by upstream:** keep the deck's version,
  `git checkout HEAD -- <path>`, then `git add <path>`. This also undoes
  clean merges that slipped starter copy into the deck's own files. The
  one exception is a file the deck never changed since `$BASE`
  (`git diff --quiet $BASE HEAD -- <path>`) while the deck still shows the
  starter: then upstream's version is just a newer starter, so take it.
- **Deck, deleted in the deck:** a starter page the deck removed. Keep it
  removed: `git rm -q <path>`.
- **Deck, added by upstream:** a new starter page, font or asset
  (`--diff-filter=A` in the name-status list). Remove it:
  `git rm -q <path>`.
- **Mixed:** edit by hand along the split above, then `git add <path>`.

When done, `git diff --name-only --diff-filter=U` is empty and
`git grep -n -e '^<<<<<<< ' -e '^>>>>>>> '` finds nothing.

Never create `.sl-ide/feedback.json` during this update: an existing deck stays
opted out until its user runs `pnpm feedback on`.

## 5. Port what the harness now needs

Upstream sometimes changes a deck file because the harness changed: a new
`META` key the components read, a renamed import or export, a new prop, a
changed region shape, a new font face. Step 4 kept the deck's version, so
those changes are now missing. For each deck-owned or mixed path upstream
touched, read `git diff $BASE upstream/main -- <path>` and sort every hunk:

- **Starter copy or styling** (wording, starter pages, placeholder tokens):
  drop it.
- **Contract** (anything a harness file reads or imports): port it into
  the deck's version, in the deck's terms. Confirm by grepping the harness
  for the key or name (`git grep -n <name> -- src/components scripts`).

A memo deck copied its pages from `starters/memo/`, so also read
`git diff $BASE upstream/main -- starters/memo` for contract changes to
port. If a contract change needs the deck's own copy or numbers changed,
ask; never invent them.

## 6. Install and check

Stop at the first failure, show the output and leave the merge
uncommitted so it can be fixed or aborted.

1. `pnpm install`
2. `node --check` on every `.js`/`.mjs` file the merge touched, and
   `node --check src/deck/content.js`.
3. `pnpm doctor`
4. `pnpm run audit`. Every page must read `ok`.
5. `pnpm pdf`, then `scripts/check-fonts.sh`
6. `pnpm shots` and compare with `output/shots-before/`. The deck's pages
   should look the same. A difference the update's commit subjects explain
   is fine; any other means starter content or a missed contract change got
   through (back to steps 4 and 5). Then `rm -rf output/shots-before`.

## 7. Clean up and commit

1. `python3 .agents/skills/clean-up/scan.py`. Remove only what this merge
   orphaned, such as styles or content keys for a harness feature upstream
   removed. Anything older is for /clean-up: mention it, don't touch it.
2. Commit the merge. This skill is standing permission to commit it, not to
   push. Subject: `Pull sl-ide <short upstream sha>`, and a body with the
   update's highlights and anything kept, dropped or ported by hand.

Report in a few lines: the upstream range pulled, what it brings, the
deck-owned paths kept or dropped, contract changes ported, the check
results and the commit hash. Say that `/ship-it` pushes and publishes it.
