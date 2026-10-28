// What every page shares: the page's zones, the memo's META, and rich().
//
// The words and boxes live in one plain module per page,
// src/deck/pages/<key>.js, exporting <key>: pages/memo.js holds the flowing
// body, and each fixed page has its own. One file per page, so agents working
// on different pages never edit the same file. The modules are plain JS with
// no JSX, so copy can be read and edited without touching a component.
// Change copy there, never in a component.
//
// The starter memo explains how memos work, and it is the pattern to copy.
// Replace it with your own as you write.
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
