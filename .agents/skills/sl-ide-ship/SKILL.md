---
name: sl-ide-ship
description: Audit, build and print the deck PDF, check its fonts, commit and push, then wait for CI to publish it and give the sl-ide cloud link, or the failing step and its fix. Use when the user says "ship it", "ship", or /sl-ide-ship.
---

# Ship it

Run each step in order from the repo root. Stop at the first failure, show
the output, and do not commit or push.

1. **Audit:** `mkdir -p output && bash -o pipefail -c 'pnpm run audit | tee output/feedback-audit.txt'`. Every page must read `ok`. Keep this output for step 8; it stays local and is never sent. Use `pnpm run audit` here, not `pnpm check`: it measures a clean build, as CI does.
2. **PDF:** `pnpm pdf`. It writes `output/<META.pdfName>.pdf`.
3. **Fonts:** `scripts/check-fonts.sh`. Any fallback font means a glyph is
   missing from the self-hosted fonts; stop and say which.
4. **Placeholders:** `grep -rn "\[CONFIRM:\|\[TBD:" src/deck/`. Don't
   stop for them, but list them in the report: they print highlighted.
   Also say whether `META.watermark` is still on.
5. **Commit:** `git status`. If nothing changed, say so and skip to push.
   Otherwise stage the changed files by name (never `output/` or `dist/`)
   and commit with a short imperative subject that describes the change.
6. **Push:** if there is a remote, bring in what origin has, then `git push`
   to the current branch. No remote: say so and stop.
   - If `git rev-list --merges @{u}..HEAD` lists anything (an unpushed
     `Pull sl-ide` merge from sl-ide-update), `git pull --no-rebase`. A
     rebase would replay upstream's commits one by one and drop the
     merge's resolution, even with `--rebase=merges`.
   - Otherwise `git pull --rebase`.
   - On a conflict, stop and show it. Preserve both sides' intended
     changes; ask if unclear. To cancel, use `git merge --abort` or
     `git rebase --abort`, depending on the operation.
7. **Publish:** the push runs CI (`.github/workflows/publish.yml`, "Publish
   deck"), which publishes to sl-ide cloud when the repo has
   `sl-ide.config.json`. No config: say the deck isn't set up to publish,
   point to the README's "Publish to sl-ide cloud", and go to step 8.
   Otherwise wait for the run. Name the deck's repo on every gh call with
   `-R "$(git remote get-url origin)"`: with an `upstream` remote, gh's
   default repo can be sl-ide itself.
   - Find the run for the pushed commit:
     `gh run list -R "$(git remote get-url origin)" --workflow publish.yml --commit "$(git rev-parse HEAD)" -L 1 --json databaseId -q '.[0].databaseId'`.
     It takes a few seconds to appear after the push; retry every 5 s for up
     to a minute.
   - Wait for it: `gh run watch <id> -R "$(git remote get-url origin)" --exit-status > output/publish-watch.log 2>&1`.
     It exits 0 when the run passed.
   - Passed: the link, built from the config's slug, is live:
     `app.sl-ide.com/d/<slug>/` on main, or `/d/<slug>/r/<branch as UTF-8 hex>/`
     on a branch.
   - Failed: the failing step is
     `gh run view <id> -R "$(git remote get-url origin)" --json jobs -q '.jobs[].steps[] | select(.conclusion == "failure") | .name'`,
     and its last lines are
     `gh run view <id> -R "$(git remote get-url origin)" --log-failed | grep -m 1 -B 30 '##\[error\]'`
     (the end of the log is cleanup). Report it as not published: the step,
     its last lines and the fix. An audit failure names the page (fix it,
     then ship again); the publisher prints its own fix (a new
     `SL_IDE_PUBLISH_TOKEN`, a usage limit); a font fallback is step 3's.
     Never give the link as live.
   - gh missing or signed out, or no run within a minute: say the publish
     couldn't be confirmed, and give the link as pending and the run list
     (`https://github.com/<owner>/<repo>/actions/workflows/publish.yml`).

8. **Feedback:** if `.sl-ide/feedback.json` has `"auto": true`, run
   `node scripts/feedback.mjs ship --audit output/feedback-audit.txt` with the
   saved audit output. Add `--note "<mechanism>"` only if something in this
   ship was hard. Launch in the background with output redirected to a local
   file (`> output/feedback-delivery.log 2>&1 &`). Do not wait for the result.
   Do not report it. Read the sl-ide-feedback scrub rules before writing a note.

Report in a few lines: the audit result, the PDF path, open placeholders,
the commit hash and subject, the branch, whether the push landed, and the
publish: the sl-ide cloud link once CI passed, or the failing step and fix.
Ship-it is standing permission to commit and push, so don't ask first.
