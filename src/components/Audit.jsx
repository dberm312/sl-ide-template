import { countWords, hasWordBudget, overflowPx, overlapPx, spillPx, WORD_BUDGET } from './DevBar.jsx';
import { META } from '../deck/content.js';
import { useEffect, useState } from 'react';

// How full a wrapped block's last line is, as a share of the line width: a
// stub like "them" alone on a line reads as a mistake.
// Returns null for a one-line block.
function lastLineFill(el) {
  // Text nodes only, so a marker like the decision diamond isn't a line.
  const rects = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(n);
    rects.push(...Array.from(range.getClientRects()).filter((r) => r.width > 0));
  }
  // Boxes within a few px of each other share a line, so a smaller inline tag
  // isn't read as a line of its own.
  const tops = rects.map((r) => r.top).sort((a, b) => a - b);
  const lines = tops.filter((t, i) => i === 0 || t - tops[i - 1] > 6);
  if (lines.length < 2) return null;
  const lastTop = lines[lines.length - 1];
  const last = rects.filter((r) => r.top >= lastTop - 0.5);
  const used = Math.max(...last.map((r) => r.right)) - Math.min(...last.map((r) => r.left));
  const cs = getComputedStyle(el);
  const width = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  return used / width;
}

// Wrapped bullets and card text whose last line is under RAGGED_MIN full.
// Advisory: listed under the table, never fails the audit. Widen or narrow
// the net with RAGGED_CHECK; raise RAGGED_MIN for a stricter eye.
const RAGGED_CHECK = '.card li, .card p, .bullets li';
const RAGGED_MIN = 1 / 3;
function raggedLines(el, label) {
  return Array.from(el.querySelectorAll(RAGGED_CHECK))
    .map((li) => [li, lastLineFill(li)])
    .filter(([, fill]) => fill !== null && fill < RAGGED_MIN)
    .map(([li, fill]) => `  ${label}  RAGGED(${Math.round(fill * 100)}%)  ${li.textContent.trim()}`);
}

// A memo whose last flowing page holds a line or two: usually a sentence to
// cut. Advisory, like RAGGED. RUNT_MIN is the share of the body in use.
const RUNT_MIN = 1 / 4;
function runtPages(els, slides, labelOf) {
  return els.flatMap((el, i) => {
    const s = slides[i];
    if (s.kind !== 'flow' || slides[i + 1]?.kind === 'flow' || slides[i - 1]?.kind !== 'flow') return [];
    const body = el.querySelector('.memo-flow');
    const last = body?.lastElementChild;
    if (!last) return [];
    const fill = (last.getBoundingClientRect().bottom - body.getBoundingClientRect().top)
      / body.getBoundingClientRect().height;
    return fill < RUNT_MIN ? [`  ${labelOf(s)}  RUNT(${Math.round(fill * 100)}%)  the memo's last page is nearly empty`] : [];
  });
}

// A machine-readable version of the DevBar's two checks, so `./audit.sh` can
// answer "does every slide still fit" from the command line instead of asking
// someone to read every PDF page at full size.
export default function Audit({ slides, pages, apx }) {
  const [report, setReport] = useState('measuring…');

  // Measure only once the deck's web fonts are live. The first frame lays out
  // in the *fallback* faces, which set at different widths, so a slide that
  // overflows by 50px can report clean. A gate cannot be a race.
  //
  // This polls `document.fonts.status` rather than awaiting `document.fonts
  // .ready`: under `--virtual-time-budget`, which is how audit.sh drives the
  // page, that promise's callback had not run by the time Chrome dumped the
  // DOM, and the report went out still reading "measuring…".
  useEffect(() => {
    let id = 0;
    let tries = 0;
    // Lay the pages out first: that is what makes the browser request their
    // faces. A tab that has not painted yet (a check's own tab) can run this
    // effect before any layout, while `status` still reads "loaded".
    document.getElementById('root')?.getBoundingClientRect();
    const measure = () => {
      if (document.fonts.status !== 'loaded' && tries++ < 100) {
        id = setTimeout(measure, 16);
        return;
      }
      const els = Array.from(document.querySelectorAll('#root > .slide'));
      const lines = els.map((el, i) => {
        const s = slides[i];
        const label = apx.get(s.id) ?? String(pages.get(s.id) ?? '—');
        const words = countWords(el);
        const over = overflowPx(el);
        const spill = spillPx(el);
        const overlap = overlapPx(el);
        const flags = [
          hasWordBudget(s.kind) && words > WORD_BUDGET ? `WORDY(${words}>${WORD_BUDGET})` : '',
          over > 2 ? `CLIPPED(+${over}px)` : '',
          spill > 2 ? `SPILL(+${spill}px)` : '',
          overlap > 2 ? `OVERLAP(+${overlap}px)` : '',
        ].filter(Boolean).join(' ');
        return [
          label.padEnd(5),
          String(words).padStart(4),
          (flags || 'ok').padEnd(24),
          s.title,
        ].join('  ');
      });
      const bad = els.filter((el, i) => overflowPx(el) > 2 || spillPx(el) > 2
        || overlapPx(el) > 2
        || (hasWordBudget(slides[i].kind) && countWords(el) > WORD_BUDGET)).length;
      // LONG: a memo (or deck) over META.pageBudget pages, when it sets one.
      const long = META.pageBudget && els.length > META.pageBudget
        ? `  LONG(${els.length}>${META.pageBudget} pages)` : '';
      setReport([
        `AUDIT  ${els.length} pages  ${bad} need attention${long}`
          + (document.fonts.status === 'loaded' ? '' : '  FONTS-PENDING (numbers unreliable)'),
        'PAGE   WORDS  STATUS                    TITLE',
        ...lines,
        ...runtPages(els, slides, (s) => (apx.get(s.id) ?? String(pages.get(s.id) ?? '—')).padEnd(5)),
        ...els.flatMap((el, i) => raggedLines(el,
          (apx.get(slides[i].id) ?? String(pages.get(slides[i].id) ?? '—')).padEnd(5))),
      ].join('\n'));
    };
    // setTimeout, not requestAnimationFrame: headless Chrome paints one frame
    // for `--dump-dom` and then stops, so a *nested* rAF never runs and the
    // report is dumped still reading "measuring…". Timers keep firing under
    // the virtual-time budget.
    id = setTimeout(measure, 16);
    return () => clearTimeout(id);
  }, [slides, pages, apx]); // once: re-measuring after its own report never settles

  // data-ids: the page ids in report order, for scripts/check.mjs.
  return <pre id="audit" data-ids={slides.map((s) => s.id).join(' ')} style={{ whiteSpace: 'pre', fontSize: 12 }}>{report}</pre>;
}
