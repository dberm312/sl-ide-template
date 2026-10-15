import { META } from '../deck/content.js';

// The page every component and script sizes against. A project is one
// format, set once in META.format (src/deck/content.js):
//   'slides'  13.333 × 7.5 in, 16:9 (the default)
//   'memo'    8.5 × 11 in, US Letter, portrait
// 96 px to the inch either way, so box() and the type floors mean the same
// thing in both. Plain JS, so the shell scripts can read it with node.
export const FORMAT = META.format === 'memo' ? 'memo' : 'slides';

const SIZES = {
  slides: { w: 1280, h: 720, inW: 13.333, inH: 7.5 },
  memo: { w: 816, h: 1056, inW: 8.5, inH: 11 },
};

export const PAGE = SIZES[FORMAT];

// Sets the format on <html> (styles.css keys the memo page off it) and the
// printed page size. App.jsx and LabApp.jsx call it at the top of their
// modules, not main.jsx: content.js edits then hot-update through those
// components instead of reloading the page. Safe to call again.
export function applyPageFormat(doc = document) {
  doc.documentElement.dataset.format = FORMAT;
  let style = doc.getElementById('sl-ide-page');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'sl-ide-page';
    doc.head.append(style);
  }
  style.textContent = `@page { size: ${PAGE.inW}in ${PAGE.inH}in; margin: 0; }`;
}
