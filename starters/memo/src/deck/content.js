// Every word and every box in the memo, in one plain module.
//
// The React pages (src/slides/*) render from it. It is plain JS with no JSX,
// so copy and geometry can be read and edited without touching a component.
// Change copy here, never in a component.
//
// The memo below is sl-ide's starter memo: it explains how memos work, and
// it is the pattern to copy. Replace it with your own as you write.
//
// Inline markup, parsed by rich() below:
//   **bold**                 bold figures and key terms
//   [CONFIRM: …] / [TBD: …]  render exactly as written, on the confirm
//                            highlight, until the facts are supplied
//
// The body flows: write blocks (paragraphs, headings, lists, tables) and the
// paginator in components/Flow.jsx lays them onto Letter pages. Its header
// comment lists the block shapes. Fixed pages (an exhibit, an appendix page)
// are placed in inches, like slides.
//
// Geometry: every box is [x, y, w, h] in inches on an 8.5 × 11 in page.
// 1 in = 96 px on the 816 px page. box() in components/geometry.js converts.

export const PX_PER_IN = 96;

export const ZONES = {
  // The flowing body: 1 in margins all round.
  body: [1, 1, 6.5, 9],
  // The running header on every page after the first.
  header: [1, 0.55, 6.5, 0.3],
  // A fixed page's action title, and its sources line above the footer.
  title: [1, 0.75, 6.5, 0.6],
  footer: [1, 10.12, 6.5, 0.3],
};

export const META = {
  // 'memo': US Letter pages. See components/page.js.
  format: 'memo',
  deckTitle: 'sl-ide starter memo',
  author: 'Your name',
  date: 'October 2026',
  // The PDF's file name, without .pdf (scripts/pdf.sh).
  pdfName: 'sl-ide-starter-memo',
  // The mark bottom-left on every page. null for none, { text: 'ACME' } for a
  // boxed wordmark, or { src, ratio } for a file in public/.
  mark: null,
  // A corner tab on every page while the memo is a draft. null to share.
  watermark: 'Draft',
  // Fixed pages past this many words are flagged WORDY by the audit.
  wordBudget: 450,
  // The memo is flagged LONG past this many pages (flowing pages and fixed
  // ones together). A memo that runs over is usually saying two things.
  pageBudget: 4,
};

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

// --- The memo ----------------------------------------------------------------
export const memo = {
  body: [
    {
      memohead: [
        ['To', 'Whoever opens this project first'],
        ['From', 'sl-ide'],
        ['Date', 'October 2026'],
        ['Re', 'How a memo is built here, and what to replace first'],
      ],
    },
    { h1: 'Write the memo as blocks; the pages take care of themselves' },
    'This project is a **memo**: US Letter pages, portrait, printed to a vector PDF. You write the body as a list of blocks in **src/deck/content.js** and the paginator lays them onto as many pages as they need. You never move a paragraph to the next page by hand.',
    'Everything else works as it does for slides. The preview updates as you save, comment mode (press **c**) points your agent at any element, and the audit runs before every commit. On every push, CI prints the PDF and publishes the memo to sl-ide cloud.',

    { h2: 'Start here' },
    {
      ol: [
        'Run **pnpm skills** to restore impeccable, copy-editing and copywriting, unless you have them installed globally.',
        'Run **/new-deck**. Impeccable asks who the memo is for and what it must do (PRODUCT.md), then learns the style from your brand (DESIGN.md and the tokens).',
        'Ask for the memo in plain words, or paste a draft. It lands in **memo.body** as blocks, and the preview pages it as you go.',
        'Run **/copy-pass** to tighten the words, then **/ship-it** to audit, print and commit.',
      ],
    },

    { h2: 'What a block can be' },
    'A string is a paragraph. Everything else is an object whose key names the block. Paragraphs, lists and tables can break across pages; the rest stay whole.',
    {
      table: {
        head: ['Block', 'Written as', 'Across a page break'],
        widths: ['22%', '42%', '36%'],
        rows: [
          ['Paragraph', "a plain 'string'", 'Splits between lines, two lines at least on each side'],
          ['Heading', '{ h1 }, { h2 }, { h3 }', 'Stays with the first lines below it'],
          ['List', '{ ul: [...] } or { ol: [...] }', 'Splits between items; numbering carries on'],
          ['Table', '{ table: { head, rows, widths } }', 'Splits between rows; the header repeats'],
          ['Callout', '{ callout }', 'Stays whole'],
          ['Memo head', '{ memohead: [[label, value]] }', 'Stays whole'],
          ['Exhibit', '{ exhibit: Component, props }', 'Stays whole; any React component'],
          ['Page break', '{ pageBreak: true }', 'Starts a new page'],
        ],
      },
    },
    { callout: '**Placeholders stay visible.** A fact you still need, like [TBD: the launch date], prints exactly as written on the highlight until someone supplies it. Never let an agent invent the figure.' },

    { h2: 'How the paginator decides' },
    'It renders every block once, off screen, at print size and in the memo’s own fonts, and measures each one. Then it deals the blocks onto pages from the top. When a paragraph won’t fit, it breaks at a line, never leaving a single line alone at the foot or the head of a page. When a heading would land at the bottom of a page with nothing under it, it moves to the next page with its text.',
    'The pages it makes are ordinary pages. The rail, the sorter, the viewer and the PDF all show the same render, so what you see in the preview is what prints.',

    { h2: 'Fixed pages' },
    'Some pages shouldn’t flow: a cover, a full-page chart, an appendix table. Those are components placed in inch boxes, exactly like slides, and they sit in **src/slides/index.jsx** before or after the flowing body. The appendix page at the end of this memo is one. Appendix pages are labelled A1, A2 and so on, in order.',

    { h2: 'Checks' },
    'Run **pnpm run audit** before calling the memo done. Flowing pages are checked for anything that runs past the footer and for a region too small for its copy. Fixed pages get the same checks as slides. Across the whole memo, LONG flags a memo over **META.pageBudget** pages. The pre-commit hook runs the audit and CI repeats it on every push.',
    'Look at the pages with **pnpm shots**, and print with **pnpm pdf**. The PDF is US Letter, with selectable text and the fonts embedded.',
  ],
};

// --- Appendix -------------------------------------------------------------------
export const files = {
  title: 'Where things live',
  regions: { table: [1, 1.5, 6.5, 8.3] },
  rows: [
    ['src/deck/content.js', 'Every word, every block and every box. Edit copy here.'],
    ['src/slides/index.jsx', 'The page order: the flowing body and the fixed pages.'],
    ['src/slides/', 'One component per fixed page.'],
    ['src/components/Flow.jsx', 'The paginator and the block types. Part of sl-ide.'],
    ['src/styles.css', 'Tokens on :root, then the memo styles, then the IDE chrome.'],
    ['PRODUCT.md · DESIGN.md', 'Audience and visual system, written by impeccable.'],
    ['AGENTS.md', 'The rules every agent follows here (CLAUDE.md imports it).'],
    ['scripts/', 'audit, pdf, shots, lab, fonts, doctor.'],
  ],
  sources: 'Source: sl-ide starter. A fixed page: placed in inch boxes, like a slide.',
};
