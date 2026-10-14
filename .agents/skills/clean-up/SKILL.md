---
name: clean-up
description: Find and remove vestigial code (unused CSS, components, exports, content keys, assets, fonts) and bring the docs (README, AGENTS.md, DESIGN.md, PRODUCT.md, skills) back in line with the deck. The user is the source of truth, so any conflict is asked, never guessed. Use when the user says "clean up", "cleanup", "tidy", "vestigial", "doc drift", or /clean-up.
---

# Clean up

Two passes: dead code, then doc drift. **The user is the source of truth.**
The code shows what the deck is today, and the docs say what it should be.
When they disagree and the answer isn't obvious, ask. Don't pick a side.

## 1. Scan for dead code

From the repo root run `python3 .agents/skills/clean-up/scan.py`. Every hit
is a lead, not a verdict. Before calling one dead, grep for how it might be
built at runtime:

- Classes built from data (`is-${key}`, `${prefix}-${level}`). A modifier on
  such a class is live if any data value produces it.
- Keys read by index (`labels[row.kind]`, a logo map).
- Classes that `DevBar.jsx`, `Audit.jsx` or `Inspector.jsx` query with
  `querySelector` or list in a selector constant (`BOXES`, `RAGGED_CHECK`).
- The lab (`src/lab/`) is permanent tooling. When idle, `takes.css` is
  nearly empty by design.
- The starter's building blocks in `styles.css` (`.card`, `.bullets`,
  `.table`, `.lede`, `.eyebrow`, `.section-title`, `.is-outline`, `.fill`)
  are the deck's vocabulary. Unused ones are **Redundant**, not Dead: propose.

Also read for:
- Data a cut feature left behind, such as a label whose element is gone.
  Check dated comments ("cut 2026-10-12") against what still exists.
- Modifiers every instance gets, so they tell nothing apart.
- `// fit:` notes and `// Was …` history comments are deliberate records;
  keep them.

Sort what you find into three groups:
- **Dead:** nothing reads it. Remove it with no question asked.
- **Redundant:** live, but simplifiable. Propose; don't do it unasked.
- **Harmless:** unstyled semantic hooks and the like. Mention, then leave.

## 2. Check for doc drift

The docs are `README.md`, `AGENTS.md`, `DESIGN.md`, `PRODUCT.md` and
`.agents/skills/*/SKILL.md`. Build the deck's actual state from
`src/slides/index.jsx` (order, appendix labels) and `src/deck/content.js`
(titles, headline numbers, `[TBD]` and `[CONFIRM]` placeholders), and the
tokens from `src/styles.css` `:root`. Then check each doc for:

- Page numbers, order, count and appendix labels.
- Pages, sections or features that were cut or renamed.
- Headline figures that must match across pages.
- Tokens in DESIGN.md that differ from `:root`, or are missing from it.
- Placeholder inventories (which `[CONFIRM]` and `[TBD]` asks remain).
- Rules a later decision overrode. AGENTS.md piles up dated notes, and a
  later note often supersedes an earlier one without removing it.

Sort each finding:
- **Mechanical:** the code is clearly current and the doc simply lags. Fix it.
- **Conflict:** the docs disagree with each other or with the code in a way
  that could be intent, or a standing rule may or may not still hold.
  **Ask the user**, batching up to four questions at a time, each with the
  options and what each implies. Never resolve a conflict by guessing, and
  never change deck copy or numbers to match a doc.

## 3. Apply

1. List what you found under Dead / Redundant / Harmless / Mechanical drift /
   Conflicts, with `file:line` for each item.
2. Ask the conflict questions, plus any redundant items worth proposing.
3. Make the edits: dead code, mechanical drift, and the answered conflicts.
4. **AGENTS.md** stays a description of the deck as it is plus the standing
   rules, not a changelog; git holds the history. Keep the dated
   attributions on rules. If a rewrite drops more than a few lines, show the
   new version before committing.
5. `pnpm run audit` must read ok. A code removal should leave the printed
   deck unchanged (compare `pnpm shots` before and after), so if a page
   moves, something was live.
6. Commit only if asked, with a subject like "Clean up vestigial code and
   doc drift". Say which branch you're on.
