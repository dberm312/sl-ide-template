import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { META, ZONES, rich } from '../deck/content.js';
import { box } from './geometry.js';
import Rich from './Rich.jsx';
import SlideShell from './SlideShell.jsx';

// Flowing text for memos. A slide is a fixed page you place by hand; a memo's
// body is a list of blocks (paragraphs, headings, lists, tables…) that this
// file lays onto as many pages as it takes. index.jsx lists the document:
//
//   const slides = [
//     flow('memo', memo.body),          // as many pages as the body needs
//     entry('exhibit', 'appendix', Ex), // a fixed page, placed in inches
//   ];
//
// The paginator renders every block once, off screen, at print size, measures
// it, and deals the blocks out page by page. The pages it makes are ordinary
// entries (Component MemoPage, with the blocks as props), so the rail, the
// sorter, the viewer, comment mode, the audit and the PDF treat them like any
// other page.
//
// What it guarantees, so nobody has to check by hand:
//   paragraphs   split between lines, never leaving one line alone at the foot
//                or the head of a page (orphans and widows: 2 lines each side)
//   lists        split between items
//   tables       split between rows; the header row repeats on the next page
//   headings     stay with the first lines of what follows them
//   everything else (callout, memohead, exhibit) stays whole
//   { pageBreak: true } starts a new page
// A block taller than a whole page is placed anyway and fails the audit.
//
// Block shapes, in a page module (src/deck/pages/):
//   'A paragraph, with **bold**.'      or { p: '…' }
//   { h1: '…' } { h2: '…' } { h3: '…' }
//   { ul: ['…', '…'] }  { ol: ['…', '…'] }
//   { table: { head: ['…'], rows: [['…']], widths: ['30%', …] } }
//   { callout: '…' }
//   { memohead: [['To', '…'], ['From', '…'], ['Date', '…'], ['Re', '…']] }
//   { exhibit: Component, props: {…} }   any React component, kept whole
//   { pageBreak: true }

export const flow = (id, blocks) => ({ id, kind: 'flow', blocks });

const TYPES = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'table', 'callout', 'memohead', 'exhibit', 'pageBreak'];
function typeOf(block) {
  if (typeof block === 'string') return 'p';
  return TYPES.find((t) => block && t in block) ?? 'unknown';
}
const textOf = (block) => (typeof block === 'string' ? block : block.p);

// A [CONFIRM: …] is one highlighted span; a page break inside one would split
// it into two unhighlighted halves, so the paginator never breaks there.
const CONFIRM = /\[(?:CONFIRM|TBD):[^\]]*\]/g;

// The visible characters [from, to) of a rich string, with its **bold**
// markup kept intact. Offsets count rendered text, which is the source minus
// its ** markers.
export function sliceRich(str, from, to = Infinity) {
  let pos = 0;
  let out = '';
  for (const seg of rich(str)) {
    const a = Math.max(from - pos, 0);
    const b = Math.min(to - pos, seg.text.length);
    if (b > a) {
      const t = seg.text.slice(a, b);
      out += seg.bold ? `**${t}**` : t;
    }
    pos += seg.text.length;
  }
  return out.trim();
}

// One block, or the part of it a page holds. `part` is [from, to) in the
// block's units: lines of a paragraph, items of a list, rows of a table.
export function Block({ block, part, meta }) {
  const type = typeOf(block);
  const [a, b] = part ?? [0, Infinity];
  switch (type) {
    case 'p': {
      const text = part ? sliceRich(textOf(block), meta.starts[a], meta.starts[b]) : textOf(block);
      return <p className={`memo-p${a > 0 ? ' is-cont' : ''}`}><Rich text={text} /></p>;
    }
    case 'h1': case 'h2': case 'h3': {
      const H = type;
      return <H className={`memo-${type}`}><Rich text={block[type]} /></H>;
    }
    case 'ul': case 'ol': {
      const L = type;
      return (
        <L className={`memo-list${a > 0 ? ' is-cont' : ''}`} start={type === 'ol' ? a + 1 : undefined}>
          {block[type].slice(a, b).map((item, i) => <li key={a + i}><Rich text={item} /></li>)}
        </L>
      );
    }
    case 'table': {
      const { head, rows, widths } = block.table;
      return (
        <table className="table memo-table">
          {widths && <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>}
          {head && <thead><tr>{head.map((h, i) => <th key={i}><Rich text={h} /></th>)}</tr></thead>}
          <tbody>
            {rows.slice(a, b).map((row, r) => (
              <tr key={a + r}>{row.map((cell, i) => <td key={i}><Rich text={cell} /></td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'callout':
      return <div className="memo-callout card"><Rich text={block.callout} /></div>;
    case 'memohead':
      return (
        <dl className="memo-head">
          {block.memohead.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd><Rich text={v} /></dd></div>
          ))}
        </dl>
      );
    case 'exhibit': {
      const { exhibit: Exhibit, props = {} } = block;
      return <figure className="memo-exhibit"><Exhibit {...props} /></figure>;
    }
    case 'pageBreak':
      return <div className="memo-break" />;
    default:
      return <p className="memo-p"><span className="confirm">[unknown block: {JSON.stringify(block)}]</span></p>;
  }
}

// One page of a flow. The first page of a memo carries its own head (the
// memohead block); the pages after it get a running header.
export function MemoPage({ blocks, metas, pieces, first, pageNumber }) {
  return (
    <SlideShell kind="flow" pageNumber={pageNumber}>
      {!first && ZONES.header && (
        <div className="region memo-running" style={box(ZONES.header)} data-artifact>{META.deckTitle}</div>
      )}
      <div className="region memo-flow" style={box(ZONES.body)}>
        {pieces.map(({ i, part }) => (
          <Block key={`${i}:${part?.[0] ?? 0}`} block={blocks[i]} part={part} meta={metas[i]} />
        ))}
      </div>
    </SlideShell>
  );
}

// --- measuring -----------------------------------------------------------

// Where each line of a rendered paragraph starts, as an offset into its
// visible text. Lines are told apart by where each word sits vertically.
function lineStarts(el) {
  const top = el.getBoundingClientRect().top;
  const range = document.createRange();
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const starts = [];
  const mids = [];
  let offset = 0;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    for (const m of n.data.matchAll(/\S+/g)) {
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const r = range.getClientRects()[0];
      if (!r) continue;
      const mid = (r.top + r.bottom) / 2 - top;
      // A new line starts when a word sits clearly below the last line's.
      if (!mids.length || mid - mids[mids.length - 1] > r.height / 2) {
        starts.push(offset + m.index);
        mids.push(mid);
      }
    }
    offset += n.data.length;
  }
  return starts.length ? starts : [0];
}

function measureBlock(block, el) {
  const type = typeOf(block);
  const r = el.getBoundingClientRect();
  const space = parseFloat(getComputedStyle(el).marginTop) || 0;
  const rel = (x) => {
    const c = x.getBoundingClientRect();
    return [c.top - r.top, c.bottom - r.top];
  };
  if (type === 'pageBreak') return { kind: 'break' };
  if (type === 'p') {
    const starts = lineStarts(el);
    const text = el.textContent;
    const confirms = [...text.matchAll(CONFIRM)].map((m) => [m.index, m.index + m[0].length]);
    return { kind: 'lines', space, h: r.height, lh: r.height / starts.length, starts, confirms };
  }
  if (type === 'ul' || type === 'ol') {
    const spans = Array.from(el.children).map(rel);
    return { kind: 'items', space, h: r.height, head: 0, spans };
  }
  if (type === 'table') {
    const thead = el.querySelector('thead');
    const spans = Array.from(el.querySelectorAll('tbody > tr')).map(rel);
    return { kind: 'items', space, h: r.height, head: thead ? thead.getBoundingClientRect().height : 0, spans };
  }
  return { kind: type.startsWith('h') ? 'heading' : 'keep', space, h: r.height };
}

const unitCount = (m) => (m.kind === 'lines' ? m.starts.length : m.kind === 'items' ? m.spans.length : 0);
function heightOf(m, a, b) {
  if (m.kind === 'lines') return (b - a) * m.lh;
  if (m.kind === 'items') return m.head + m.spans[b - 1][1] - m.spans[a][0];
  return m.h;
}
// What has to fit beside a heading for it to stay with the block below it.
function leadOf(m) {
  const n = unitCount(m);
  if (m.kind === 'lines') return heightOf(m, 0, Math.min(2, n));
  if (m.kind === 'items') return heightOf(m, 0, 1);
  return m.h;
}

// The most units of block m, from unit a, that fit in `room` without breaking
// the rules above. Returns a when none may go on this page.
function fit(m, a, room, emptyPage) {
  const n = unitCount(m);
  let b = a;
  while (b < n && heightOf(m, a, b + 1) <= room) b += 1;
  if (m.kind !== 'lines') return b;
  if (n - b < 2) b = n - 2; // widow: leave at least two lines for the next page
  const inConfirm = (k) => m.confirms.some(([s, e]) => m.starts[k] > s && m.starts[k] < e);
  while (b > a && inConfirm(b)) b -= 1;
  if (b - a < 2 && !emptyPage) return a; // orphan: two lines here, or none
  return Math.max(b, a);
}

const plain = (s) => String(s).replace(/\*\*/g, '');

// Deals the measured blocks onto pages of height H. Each page is a list of
// { i, part } pieces.
function paginate(blocks, metas, H) {
  const pages = [];
  let cur = [];
  let y = 0;
  const turn = () => { pages.push(cur); cur = []; y = 0; };
  metas.forEach((m, i) => {
    if (m.kind === 'break') { if (cur.length) turn(); return; }
    const n = unitCount(m);
    let a = 0;
    for (;;) {
      const space = cur.length ? m.space : 0;
      const room = H - y - space + 0.5;
      const rest = n ? heightOf(m, a, n) : m.h;
      let need = rest;
      const next = metas[i + 1];
      if (m.kind === 'heading' && next && next.kind !== 'break') need += next.space + leadOf(next);
      const part = a ? [a, n] : null;
      if (need <= room) {
        cur.push({ i, part });
        y += space + rest;
        return;
      }
      if (n) {
        const b = fit(m, a, room, !cur.length);
        if (b > a) {
          cur.push({ i, part: [a, b] });
          turn();
          a = b;
          continue;
        }
      }
      if (cur.length) { turn(); continue; }
      // Too tall for an empty page: place it and let the audit say so.
      cur.push({ i, part });
      y += rest;
      return;
    }
  });
  if (cur.length) turn();
  return pages;
}

// A caption for each page in the rail and the sorter: the first heading on
// it, or the heading it continues.
function pageTitles(blocks, pages, fallback) {
  let last = null;
  return pages.map((pieces) => {
    const h = pieces.find(({ i, part }) => !part && typeOf(blocks[i]).startsWith('h'));
    if (h) {
      const b = blocks[h.i];
      last = plain(b[typeOf(b)]);
      return last;
    }
    return last ? `${last} (cont.)` : fallback;
  });
}

function layOut(doc, root) {
  const H = box(ZONES.body).height;
  return doc.flatMap((e) => {
    if (e.kind !== 'flow') return [e];
    const flowEl = root.querySelector(`[data-flow="${e.id}"] .memo-flow`);
    const metas = e.blocks.map((b, i) => measureBlock(b, flowEl.children[i]));
    const pages = paginate(e.blocks, metas, H);
    const titles = pageTitles(e.blocks, pages, META.deckTitle);
    return pages.map((pieces, k) => ({
      id: `${e.id}-${k + 1}`,
      kind: 'flow',
      Component: MemoPage,
      title: titles[k],
      props: { blocks: e.blocks, metas, pieces, first: k === 0 },
    }));
  });
}

// Every flow in the document, rendered once off screen at print size (never
// under the preview's zoom, which reflows). Waits for the web fonts first:
// the fallback faces set at other widths, and a page dealt in them breaks
// in the wrong places.
function Measurer({ doc, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    let timer = 0;
    let tries = 0;
    // Laying the copy out is what makes the browser request its faces.
    ref.current.getBoundingClientRect();
    const wait = () => {
      if (document.fonts.status !== 'loaded' && tries++ < 150) {
        timer = setTimeout(wait, 16);
        return;
      }
      onDone(layOut(doc, ref.current));
    };
    // setTimeout, not fonts.ready: see the note in Audit.jsx.
    timer = setTimeout(wait, 0);
    return () => clearTimeout(timer);
  }, [doc, onDone]);
  return (
    <div ref={ref} className="flow-measure" aria-hidden="true">
      {doc.filter((e) => e.kind === 'flow').map((e) => (
        <section key={e.id} className="slide" data-flow={e.id}>
          <div className="region memo-flow" style={{ ...box(ZONES.body), height: 'auto' }}>
            {e.blocks.map((b, i) => <Block key={i} block={b} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

// The document's pages: `doc` as it is when it has no flows, otherwise with
// each flow dealt into pages. `slides` is null until the first layout lands;
// render `measurer` until then (and after each edit, while the last layout
// stays on screen).
export function usePages(doc) {
  const [laid, setLaid] = useState(null);
  const onDone = useCallback((slides) => setLaid({ doc, slides }), [doc]);
  if (!doc.some((e) => e.kind === 'flow')) return { slides: doc, measurer: null };
  const fresh = laid?.doc === doc;
  return {
    slides: laid?.slides ?? null,
    measurer: fresh ? null : <Measurer doc={doc} onDone={onDone} />,
  };
}

// id -> printed page number. Numbering counts every page from the first (so
// a slide deck's first content page is 2, after its cover) and prints on
// content pages and memo pages.
export function pageNumbers(slides) {
  const pages = new Map();
  slides.forEach((s, i) => { if (s.kind === 'content' || s.kind === 'flow') pages.set(s.id, i + 1); });
  return pages;
}

// id -> printed label ("A1", "A2", ...) for appendix pages, in order.
export function appendixLabels(slides) {
  const labels = new Map();
  slides.filter((s) => s.kind === 'appendix').forEach((s, i) => labels.set(s.id, `A${i + 1}`));
  return labels;
}
