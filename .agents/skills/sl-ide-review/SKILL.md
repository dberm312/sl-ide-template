---
name: sl-ide-review
description: Hand the rendered deck to a cold reader who sees only the page images and a short covering note, then compare what they took away with what the deck meant to say. Use when the user says "review the deck", "cold read", "what would a partner take away", "fresh eyes", "test the deck on someone", "does this land", "/sl-ide-review", or wants a deck evaluated as its audience would see it.
---

# Cold-read review

A deck gets read without its author in the room. This skill reproduces
that: a `deck-reader` subagent gets the page images and the note a real
reader would get with them, nothing else. It never sees the source,
`PRODUCT.md`, `AGENTS.md` or this conversation. You then compare what it
took away with what the deck meant to say. The gap is the review.

## 1. Choose the reader and the scenario

Read `PRODUCT.md` (audience, the decision the deck asks for) and the
deck's action titles (`output/map.md`; `pnpm map` if missing). Then set:

- **Who.** One specific person from the audience, with a role, what they
  already know, and what they care about: "a partner at a growth fund who
  has seen forty Series A decks this quarter and is wary of services
  revenue", not "an investor".
- **How it reaches them.** Forwarded by email the night before, skimmed on
  a phone between meetings, read closely ahead of an IC vote, printed for a
  board pack.
- **The covering note.** The few lines they would actually get with the
  deck, written in that sender's voice. Usually one to three sentences.
- **The task.** Default: their key takeaways, then an evaluation. The user
  may ask for something else (would they take the meeting, what would they
  forward to whom, which page they'd push back on).

If the user named a persona or scenario, use it. Otherwise propose one in
two lines and go ahead unless they stop you. For a deck with two audiences
(say, a partner and their analyst), run one reader each, in parallel.

Write down, for yourself only, the **intended read**: the three things the
deck means a reader to take away and the action it asks for, from
`PRODUCT.md` and the titles. Don't show it to the reader.

## 2. Render the pages

`pnpm shots` writes every page to `output/shots/page-<label>.png` in deck
order. Use `SCALE=2 pnpm shots` when pages carry small type, tables or
charts. List the files in deck order (the cover first). If the user wants
the published version reviewed instead, render from that commit, not the
working tree.

## 3. Brief the reader

Launch the `deck-reader` subagent (`.claude/agents/deck-reader.md`; for
another agent, pass that file's body as the subagent's instructions). Its
prompt holds only:

1. The persona and scenario, in second person ("You are…", "This came
   in…").
2. The covering note, quoted.
3. The page image paths, in order, with the instruction to read each one.
4. The task.

Leave out everything the real reader wouldn't have: the deck's goal, the
intended takeaways, what the author worries about, the page labels' roles
("this is the traction page"), the fact that you'll compare. A hint in the
brief spoils the result, so reread it before you launch and cut anything
that tells the reader what to think.

For the default task, ask in this order, so the cold read is written before
the critique:

1. **Takeaways.** In your own words, the two or three things you'd tell a
   colleague this deck says, and what it asks you to do.
2. **Reaction.** What you'd do next (take the meeting, pass, forward it,
   ask for more) and the first question you'd ask the sender.
3. **Evaluation.** Where you got lost or slowed down, what you didn't
   believe and why, what's missing that you expected, the page you'd
   remember, the page you'd skip. Name pages by the number printed on them
   (or "the cover").

## 4. Compare and report

Put the reader's takeaways next to the intended read. Report:

- **Landed / missed / misread.** Each intended point, and whether the
  reader got it, missed it, or took away something else. A misread is worse
  than a miss; quote the reader's words.
- **Unintended takeaways.** Anything they concluded that the deck didn't
  mean to say.
- **Page notes.** Each page the reader flagged, with what they said and the
  likely cause (title states a topic, not a point; chart has no takeaway;
  figure with no source; term never defined).
- **Fixes.** The few changes that would close the biggest gaps, each routed
  to where it gets made: a title or wording fix (`sl-ide-copy-pass`), a
  layout or emphasis question (`sl-ide-lab`), a missing fact the user must
  supply (never invent it).

Quote the reader's verdict in full at the end; it is the user's evidence.

Don't edit the deck. If the user asks you to act on the review, follow the
deck's rules in `AGENTS.md`, then rerun this skill with a **fresh** reader
(a new subagent, not a resumed one) and the same brief, to see whether the
fix landed.
