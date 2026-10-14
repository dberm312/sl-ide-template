---
name: ship-it
description: Audit, build and print the deck PDF, check its fonts, commit and push, and confirm the push published to sl-ide cloud. Use when the user says "ship it", "ship", or /ship-it.
---

# Ship it

Run each step in order from the repo root. Stop at the first failure, show
the output, and do not commit or push.

1. **Audit:** `pnpm run audit`. Every page must read `ok`.
2. **PDF:** `pnpm pdf`. It writes `output/<META.pdfName>.pdf`.
3. **Fonts:** `scripts/check-fonts.sh`. Any fallback font means a glyph is
   missing from the self-hosted fonts; stop and say which.
4. **Placeholders:** `grep -n "\[CONFIRM:\|\[TBD:" src/deck/content.js`. Don't
   stop for them, but list them in the report: they print highlighted.
   Also say whether `META.watermark` is still on.
5. **Commit:** `git status`. If nothing changed, say so and skip to push.
   Otherwise stage the changed files by name (never `output/` or `dist/`)
   and commit with a short imperative subject that describes the change.
   The pre-commit hook audits again; let it.
6. **Push:** if there is a remote, `git pull --rebase`, then `git push` to the
   current branch. No remote: say so and stop.
7. **Publish:** the push runs CI, which publishes to sl-ide cloud when the
   repo has `sl-ide.config.json`. Watch it with `gh run watch`, and report
   the link from its summary: `sl-ide.com/d/<slug>/` on main, or
   `/d/<slug>/b/<branch>/` on a branch. No config: say the deck isn't set
   up to publish and point to the README's "Publish to sl-ide cloud".

Report in a few lines: the audit result, the PDF path, open placeholders,
the commit hash and subject, the branch, whether the push landed, and the
sl-ide cloud link.
Ship-it is standing permission to commit and push, so don't ask first.
