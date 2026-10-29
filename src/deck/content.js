// What every page shares: the page's zones, the deck's META, and rich().
//
// Each page's words and boxes live in their own plain module,
// src/deck/pages/<key>.js, exporting <key>; the page's component in
// src/slides/ imports it. One file per page, so agents working on different
// pages never edit the same file. The modules are plain JS with no JSX, so
// copy and geometry can be read and edited without touching a component.
// Change copy there, never in a slide component.
//
// The starter deck's pages explain the harness, and they are the pattern to
// copy. Replace them with your own as you build.
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
