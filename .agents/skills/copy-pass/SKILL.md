---
name: copy-pass
description: Edit the deck's copy in src/deck/pages/ with the copy-editing skill, under the deck's rules (numbers never change, placeholders stay, every page still fits). Use when the user says "copy pass", "tighten the copy", "edit the words", "proofread the deck", "this sounds like AI", "de-slop", "/copy-pass", or asks to improve the writing on one page or all of them.
---

# Copy pass

The deck's words all live in `src/deck/pages/`, one module per page. This pass edits them
with the **copy-editing** skill, then proves every page still fits. If
copy-editing isn't installed, offer `pnpm skills`; if
the user declines, do the pass by hand with the rules below.

## 1. Scope and context

- Which pages? Default to every page. Read `PRODUCT.md` (audience, voice,
  brand commitments) and the "This deck" section of `AGENTS.md` (standing
  decisions about wording) before editing; both outrank general advice.
- Read each page's module alongside its screenshot
  (`pnpm check <label>`), since a line that reads well can still wrap badly.

## 2. Edit with copy-editing

For a pass over 3 or more pages, fan out (AGENTS.md, Working in parallel):
one `page-worker` per page or section, each given that page's module from
`output/map.md`, this skill's rules below, and the copy-editing passes.
You merge their diffs, read the titles in order across the deck, and keep
the voice consistent. Shared keys (`META`, a divider's list) stay with you.

Run the copy-editing skill's passes over each page's strings. Then apply the
deck's own rules, which win over the skill's:

- **Numbers, names and sources never change.** Shorten words around a
  figure, never the figure. Don't add claims or figures the user didn't give.
- **`[CONFIRM: …]` and `[TBD: …]` stay exactly as written.**
- **Action titles** stay full sentences that state the page's point, one
  line where they fit. Read the titles in order afterwards: they should
  still tell the story alone.
- **Parallel lists** (bullets, card heads, table rows) share one grammatical
  shape.
- Remove AI tells: "it's not X, it's Y" reveals, "no X, no Y, no Z" lists,
  sentences that trail into extra comma clauses, stacked em dashes, empty
  intensifiers.
- Keep `// fit:` comments and dated decision comments. If a cut shortens a
  line the user wrote, add `// fit: <original wording>` above it.
- Keep `**bold**` on the figure or term it marks; don't add more.

## 3. Prove it still fits

After each round of edits, `pnpm check --changed` audits the deck and shoots
the pages you touched. Fix any RAGGED line the edit created (reword so the
last line is fuller, or shorter so it holds one line), and look at each
shot. Finish with `pnpm run audit`, which must read ok on every page.

When a rename or a cut should reach every page that mentions something (a
product name, a figure, a claim) and `TYPESAFE_API_KEY` is set,
`pnpm ask find "<topic>"` lists the pages that mention it, including ones
that word it differently from a grep. Check each `mentions` and `unsure`
page by reading it; an error means the search didn't run.

## 4. Report

A short list per page: what changed and why, in a line each. Call out
anything you would change but didn't because a rule held you back (a figure
that reads oddly, a placeholder that blocks a sentence). Don't commit unless
asked.
