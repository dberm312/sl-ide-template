// Fixed deck tasks for `pnpm agent-bench` (SL-70). Each has a prompt, an
// optional setup that seeds the copy before the agent starts, the files the
// agent may change, and scripted checks: never the agent's own claim.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTENT = 'src/deck/content.js';
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const swap = (dir, f, from, to) => {
  const s = read(dir, f);
  if (!s.includes(from)) throw new Error(`task setup: ${f} no longer contains ${JSON.stringify(from)}`);
  fs.writeFileSync(path.join(dir, f), s.replace(from, to));
};
const titleOf = (src, key) => new RegExp(`export const ${key} = \\{\\s*title: '([^']*)'`).exec(src)?.[1];

const CHECK_ROW = 'A card or region is too small for its own copy.';
const CHECK_NEW = 'A card or region is too small for the copy inside it.';
const CARD = 'Give it the card class so the audit measures it.';
const LONG = ' It also keeps every number, name and source exactly as written, marks a shortened line with the original wording, and never pads a card to fill the space it was given on the page.'.repeat(7);

export const TASKS = [
  {
    id: 'copy-edit',
    prompt: "Shorten page 2's action title so it reads tighter on one line. Keep its point. Don't change anything else.",
    allowed: [CONTENT],
    checks: (dir, base) => ({
      'title changed': titleOf(read(dir, CONTENT), 'startHere') !== titleOf(base[CONTENT], 'startHere'),
    }),
  },
  {
    id: 'overflow-fix',
    prompt: 'pnpm run audit fails on page 3. Fix it.',
    setup: (dir) => swap(dir, CONTENT, `${CARD}'`, `${CARD}${LONG}'`),
    allowed: [CONTENT],
    checks: async (dir) => {
      let body;
      try {
        const { anatomy } = await import(pathToFileURL(path.join(dir, CONTENT)).href);
        body = anatomy?.cards?.[1]?.body;
      } catch { /* invalid content also fails the audit */ }
      return {
        // The original wording belongs in // fit:, not in the rendered card.
        'copy shortened': typeof body === 'string' && !body.includes(LONG.trim().slice(0, 60)),
        'fit: mark': /\/\/ fit:/.test(read(dir, CONTENT)),
      };
    },
  },
  {
    id: 'new-page',
    prompt: "Add an appendix page A2, after A1, titled 'Three numbers to confirm', listing these three numbers: 41% of decks, $2.3M ARR, 17 days to ship. For this benchmark, change only src/deck/content.js, src/slides/index.jsx and src/slides/*.jsx files. Do not update AGENTS.md, src/styles.css or any other files.",
    allowed: [CONTENT, 'src/slides/index.jsx', /^src\/slides\/[^/]+\.jsx$/],
    checks: (dir, base, audit) => {
      const all = [CONTENT, 'src/slides/index.jsx', ...fs.readdirSync(path.join(dir, 'src/slides')).map((f) => `src/slides/${f}`)]
        .map((f) => read(dir, f)).join('\n');
      return {
        'A2 in the audit': /^A2 /m.test(audit),
        'numbers verbatim': ['41%', '$2.3M', '17 days'].every((n) => all.includes(n)),
      };
    },
  },
  {
    id: 'comment-paste',
    prompt: [
      'Comment from the preview:',
      'Slide 4 (checks) · section.slide > div.region > table.table > tbody > tr:nth-of-type(2) > td:nth-of-type(2)',
      `"${CHECK_ROW}"`,
      `Note: make this read "${CHECK_NEW}"`,
    ].join('\n'),
    allowed: [CONTENT],
    checks: (dir, base) => {
      const before = base[CONTENT].split('\n');
      const after = read(dir, CONTENT).split('\n');
      const changed = after.filter((l, i) => l !== before[i]);
      return {
        'element changed': after.some((l) => l.includes(CHECK_NEW)) && !after.some((l) => l.includes(CHECK_ROW)),
        'nothing else': after.length === before.length && changed.length === 1,
      };
    },
  },
  {
    id: 'multi-page',
    prompt: 'Tighten the copy on every page. For this benchmark, edit only src/deck/content.js. Do not update AGENTS.md, src/styles.css or any other files.',
    allowed: [CONTENT],
    checks: (dir, base) => {
      const placeholders = base[CONTENT].match(/\[(?:CONFIRM|TBD):[^\]]*\]/g) ?? [];
      return {
        'placeholders survive': placeholders.every((p) => read(dir, CONTENT).includes(p)),
        'copy changed': read(dir, CONTENT) !== base[CONTENT],
      };
    },
  },
];

// Every figure inside a content.js string; each must survive every task.
export const figures = (src) => [...new Set((src.match(/'(?:[^'\\]|\\.)*'/g) ?? [])
  .flatMap((s) => s.match(/[$€£]?\d+(?:[.,]\d+)*%?[MKBk]?/g) ?? []))];
