// Every word and every box on every page, in one plain module.
//
// The React slides (src/slides/*) render from it. It is plain JS with no JSX,
// so copy and geometry can be read and edited without touching a component.
// Change copy here, never in a slide component.
//
// The pages below are sl-ide's starter deck: they explain the harness, and
// they are the pattern to copy. Replace them with your own as you build.
//
// Inline markup, parsed by rich() below:
//   **bold**                 bold figures and key terms
//   [CONFIRM: …] / [TBD: …]  render exactly as written, on the confirm
//                            highlight, until the facts are supplied
//
// When copy has to be shortened to fit its box, shorten the words and never
// a number, and leave a `// fit:` comment with the original wording.
//
// Geometry: every box is [x, y, w, h] in inches on a 13.333 × 7.5 in page.
// 1 in = 96 px on the 1280 px page. box() in components/geometry.js converts.

export const PX_PER_IN = 96;

export const ZONES = {
  title: [0.5, 0.4, 12.33, 0.8],
  footer: [0.5, 6.85, 12.33, 0.35],
};

export const META = {
  deckTitle: 'sl-ide starter deck',
  author: 'Your name',
  date: 'October 2026',
  // The PDF's file name, without .pdf (scripts/pdf.sh).
  pdfName: 'sl-ide-starter',
  // The mark bottom-left on every page but the cover. null for none,
  // { text: 'ACME' } for a boxed wordmark, or { src, ratio } for a file in
  // public/. See components/DeckMark.jsx.
  mark: { text: 'sl-ide' },
  // A corner tab on every page while the deck is a draft. null to share.
  watermark: 'Draft',
  // Pages past this many words are flagged WORDY by the audit.
  wordBudget: 340,
};

// A sticker for any page whose numbers are a first pass. Pass it as a page's
// titleTag rather than writing a new one.
export const PRELIMINARY = { head: 'Preliminary', sub: 'First pass' };

// '**bold**' -> [{ text, bold }]
export function rich(str) {
  const out = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push({ text: str.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ text: str.slice(last), bold: false });
  return out;
}

// --- Cover ------------------------------------------------------------------
export const cover = {
  title: 'Cover',
  kicker: 'An IDE for building slides',
  inBriefHead: 'In brief',
  // One line per story beat. Read alone, they should tell the deck's story.
  inBrief: [
    'Pages are React components at a fixed 16:9 size, printed to a vector PDF',
    'Your agent writes the copy and the layout; you steer by commenting on the page',
    'Impeccable sets the visual system once, so every page shares it',
    'An audit catches clipped, crowded and overlapping pages before you ship',
  ],
};

// --- Start here ---------------------------------------------------------------
export const startHere = {
  title: 'Three steps take this starter to your first real deck',
  lede: 'Open Claude Code or Codex in this folder, keep pnpm dev running, and work through these in order.',
  steps: [
    {
      n: '1',
      head: 'Install the skills',
      cmd: 'pnpm skills',
      body: 'Restores **impeccable**, **copy-editing** and **copywriting** from skills-lock.json into gitignored project folders. If you have them installed globally, there is nothing to do here.',
    },
    {
      n: '2',
      head: 'Learn the style',
      cmd: '/new-deck',
      body: 'Impeccable interviews you for **PRODUCT.md** (audience, purpose, constraints), then reads your brand from a site, PDF or guide and writes **DESIGN.md** and the tokens.',
    },
    {
      n: '3',
      head: 'Build the slides',
      cmd: 'ask in plain words',
      body: 'Ask for pages and they land in the preview. Press **c** to comment on any element, **/slide-lab** to compare takes and **/ship-it** to audit, print and commit the deck.',
    },
  ],
  footer: 'Codex users: invoke skills as $new-deck, $slide-lab and so on. The terminal under pnpm dev and the setup chip in the dev bar show which steps are left.',
};

// --- Anatomy of a page ----------------------------------------------------------
export const anatomy = {
  title: 'Each page is copy in content.js, placed in inch boxes',
  regions: {
    left: [0.5, 1.45, 6.1, 5.2],
    right: [6.95, 1.45, 5.88, 5.2],
  },
  leftHead: 'How a page is made',
  points: [
    '**content.js** holds every word and box; components only place them.',
    '**One component per page** in src/slides/; index.jsx sets the order and the appendix.',
    '**Tokens only**: colour and type live on :root in styles.css, never in a slide.',
    '**Action titles** state the page’s point, so the titles alone tell the story.',
    'Open facts stay visible: [TBD: a figure you still need] prints as written.',
  ],
  rightHead: 'Building blocks',
  cards: [
    { head: 'Region', body: 'A box placed by box([x, y, w, h]); the audit flags copy that overflows it.' },
    { head: 'Card', body: 'A filled panel for one idea. Give it the card class so the audit measures it.' },
    { head: 'Sticker', body: 'A titleTag such as PRELIMINARY marks a page as a first pass.', outline: true },
  ],
  footer: 'Source: sl-ide starter. The outlined card shows the one-per-page emphasis pattern: an outline, not a fill.',
};

// --- Checks -----------------------------------------------------------------------
export const checks = {
  title: 'The preview flags crowded or clipped pages as you edit',
  regions: { table: [0.5, 1.45, 12.33, 5.2] },
  head: ['Check', 'What it catches', 'Where you see it'],
  rows: [
    ['CLIPPED', 'Content runs past the footer. Pages are a fixed box, so the PDF would hide it.', 'Rail badge, pnpm run audit'],
    ['SPILL', 'A card or region is too small for its own copy.', 'Rail badge, pnpm run audit'],
    ['OVERLAP', 'Two stacked bands print on top of each other.', 'Rail badge, pnpm run audit'],
    ['WORDY', 'The page is over the word budget (META.wordBudget).', 'Rail word count, audit'],
    ['RAGGED', 'A wrapped line ends in a stub under a third of the width. Advisory.', 'pnpm run audit'],
    ['Fonts', 'A glyph fell back to a system font in the PDF.', 'CI, before publishing'],
  ],
  footer: 'The pre-commit hook runs the audit, so a failing page blocks the commit. On push, CI audits again, prints the PDF and publishes to sl-ide cloud.',
};

// --- Appendix -------------------------------------------------------------------
export const appendixDivider = { title: 'Appendix' };

export const files = {
  title: 'Where things live',
  short: 'Where things live',
  regions: { table: [0.5, 1.45, 12.33, 5.2] },
  rows: [
    ['src/deck/content.js', 'Every word and region box. Edit copy here.'],
    ['src/slides/', 'One component per page; index.jsx sets the order.'],
    ['src/styles.css', 'Tokens on :root, then page styles, then the dev chrome.'],
    ['PRODUCT.md · DESIGN.md', 'Audience and visual system, written by impeccable.'],
    ['AGENTS.md', 'The rules every agent follows here (CLAUDE.md imports it).'],
    ['.agents/skills/', 'new-deck, slide-lab, copy-pass, ship-it, clean-up.'],
    ['skills-lock.json', 'The third-party skills this repo expects.'],
    ['scripts/', 'audit, pdf, shots, lab, fonts, doctor.'],
  ],
};
