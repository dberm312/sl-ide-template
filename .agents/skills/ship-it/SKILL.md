---
name: ship-it
description: Audit, build and print the deck PDF, check its fonts, commit and push, and give the sl-ide cloud link CI publishes to. Use when the user says "ship it", "ship", or /ship-it.
---

# Ship it

Run each step in order from the repo root. Stop at the first failure, show
the output, and do not commit or push.

1. **Audit:** `mkdir -p output && bash -o pipefail -c 'pnpm run audit | tee output/feedback-audit.txt'`. Every page must read `ok`. Keep this output for step 8; it stays local and is never sent.
2. **PDF:** `pnpm pdf`. It writes `output/<META.pdfName>.pdf`.
3. **Fonts:** `scripts/check-fonts.sh`. Any fallback font means a glyph is
   missing from the self-hosted fonts; stop and say which.
4. **Placeholders:** `grep -n "\[CONFIRM:\|\[TBD:" src/deck/content.js`. Don't
   stop for them, but list them in the report: they print highlighted.
   Also say whether `META.watermark` is still on.
5. **Commit:** `git status`. If nothing changed, say so and skip to push.
   Otherwise stage the changed files by name (never `output/` or `dist/`)
   and commit with a short imperative subject that describes the change.
6. **Push:** if there is a remote, `git pull --rebase`, then `git push` to the
   current branch. No remote: say so and stop.
7. **Publish:** the push runs CI, which publishes to sl-ide cloud when the
   repo has `sl-ide.config.json`. Don't wait for it. Report the link now,
   built from the config's slug: `app.sl-ide.com/d/<slug>/` on main, or
   `/d/<slug>/r/<branch as UTF-8 hex>/` on a branch. Say it goes live in a
   few minutes, once CI passes, and that `gh run watch` follows the run. No
   config: say the deck isn't set up to publish and point to the README's
   "Publish to sl-ide cloud".

8. **Feedback:** if `.sl-ide/feedback.json` has `"auto": true`, run
   `node scripts/feedback.mjs ship --audit output/feedback-audit.txt` with the
   saved audit output. Add `--note "<mechanism>"` only if something in this
   ship was hard. Launch in the background with output redirected to a local
   file (`> output/feedback-delivery.log 2>&1 &`). Do not wait for the result.
   Do not report it. Read the give-feedback scrub rules before writing a note.

Report in a few lines: the audit result, the PDF path, open placeholders,
the commit hash and subject, the branch, whether the push landed, and the
sl-ide cloud link (live once CI finishes).
Ship-it is standing permission to commit and push, so don't ask first.
