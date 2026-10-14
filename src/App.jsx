import { useEffect, useState } from 'react';
import slides, { pageNumbers, appendixLabels } from './slides/index.jsx';
import SlideThumb from './components/SlideThumb.jsx';
import DevBar, { devbarHeight, scrollToSlide } from './components/DevBar.jsx';
import Audit from './components/Audit.jsx';
import Viewer from './components/Viewer.jsx';
import { RAIL_SHUT_PX, readDockPlace, readRailOpen, readRailWidth } from './components/SlideRail.jsx';

// Slides are fixed 1280px pages; scale the screen preview so one whole slide
// fits the window: as wide as the space beside the rail allows, unless that
// would make it taller than the space under the bar. It scales up as well as
// down. Print media ignores --preview-scale. `inset` is the width the bar
// takes from the left edge when it is docked there.
const SLIDE_WIDTH_PX = 1280;
const SLIDE_HEIGHT_PX = 720;
const PREVIEW_GAP_PX = 24;
function usePreviewScale(active, inset = 0) {
  useEffect(() => {
    if (!active) {
      document.documentElement.style.setProperty('--preview-scale', '1');
      return undefined;
    }
    // clientWidth/Height leave out the scrollbar, which innerWidth counts.
    const apply = () => {
      const root = document.documentElement;
      const byWidth = (root.clientWidth - inset - 2 * PREVIEW_GAP_PX) / SLIDE_WIDTH_PX;
      const byHeight = (root.clientHeight - devbarHeight() - PREVIEW_GAP_PX) / SLIDE_HEIGHT_PX;
      const scale = Math.max(0.1, Math.min(byWidth, byHeight));
      root.style.setProperty('--preview-scale', String(scale));
    };
    apply();
    window.addEventListener('resize', apply);
    // The bar's height lands after its first layout and changes if it wraps.
    const bar = document.querySelector('.devbar');
    const ro = bar ? new ResizeObserver(() => requestAnimationFrame(apply)) : null;
    if (bar) ro.observe(bar);
    return () => {
      window.removeEventListener('resize', apply);
      ro?.disconnect();
    };
  }, [active, inset]);
}

// Modes (via URL hash, so they survive a static server with no routing):
//   (none)           -> dev server: the editing preview, every page, DevBar on
//                       built deck (dist/, sl-ide cloud): the viewer
//   #view[/N]        -> the viewer: one page at a time, for an audience
//   #preview         -> the editing preview, also in a built deck
//   #sorter          -> slide-sorter grid, the whole deck zoomed out
//   #print           -> everything, no chrome (what scripts/pdf.sh prints)
//   #audit           -> a text report of words-per-slide and overflow, for audit.sh
function getMode() {
  const hash = window.location.hash;
  if (hash.startsWith('#print')) return 'print';
  if (hash.startsWith('#audit')) return 'audit';
  if (hash.startsWith('#sorter')) return 'sorter';
  if (hash.startsWith('#view')) return 'view';
  if (hash.startsWith('#preview')) return 'preview';
  return import.meta.env.DEV ? 'preview' : 'view';
}

function useMode() {
  const [mode, setMode] = useState(getMode);
  useEffect(() => {
    const onHashChange = () => setMode(getMode());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return mode;
}

// Thumbnails fill the column the grid gives them, so the column count is the
// zoom control: fewer columns, bigger slides. Remembered per browser.
const SORTER_COLS = [2, 3, 4, 6];
const SORTER_GAP_PX = 20;
function readSorterCols() {
  try {
    const n = Number(localStorage.getItem('sorter-cols'));
    return SORTER_COLS.includes(n) ? n : 3;
  } catch {
    return 3;
  }
}

function SorterView({ pages, apx }) {
  const [cols, setCols] = useState(readSorterCols);
  const [gridEl, setGridEl] = useState(null);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    try { localStorage.setItem('sorter-cols', String(cols)); } catch { /* private window */ }
  }, [cols]);

  useEffect(() => {
    if (!gridEl) return undefined;
    const ro = new ResizeObserver(([entry]) => setGridWidth(entry.contentRect.width));
    ro.observe(gridEl);
    return () => ro.disconnect();
  }, [gridEl]);

  // + / - step through the column counts (= is + without shift).
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = e.key === '+' || e.key === '=' ? -1 : e.key === '-' ? 1 : 0;
      if (!dir) return;
      setCols((c) => {
        const i = SORTER_COLS.indexOf(c) + dir;
        return SORTER_COLS[Math.min(SORTER_COLS.length - 1, Math.max(0, i))];
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const thumbWidth = gridWidth
    ? Math.floor((gridWidth - SORTER_GAP_PX * (cols - 1)) / cols)
    : 260;

  const jumpTo = (index) => {
    window.location.hash = '';
    setTimeout(() => {
      scrollToSlide(document.querySelectorAll('#root > .slide')[index], 'auto');
    }, 50);
  };
  return (
    <>
      <div className="sorter-bar">
        <span className="sorter-bar-label">Columns</span>
        {SORTER_COLS.map((n) => (
          <button
            type="button" key={n} onClick={() => setCols(n)}
            className={`sorter-bar-btn${n === cols ? ' is-on' : ''}`}
          >
            {n}
          </button>
        ))}
        <span className="sorter-bar-keys"><kbd>+</kbd><kbd>-</kbd> size</span>
      </div>
      <div
        className="sorter" ref={setGridEl}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: SORTER_GAP_PX }}
      >
        {slides.map(({ id, kind, Component, props = {}, title }, i) => (
          <button type="button" className="sorter-cell" key={id} onClick={() => jumpTo(i)}>
            <SlideThumb Component={Component} componentProps={{ ...props, pageNumber: pages.get(id) }} widthPx={thumbWidth} />
            <span className="sorter-caption">
              <span className="sc-page">{apx.get(id) ?? pages.get(id) ?? kind}</span>
              <span className="sc-title" title={title}>{title}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

export default function App() {
  const mode = useMode();
  // Not 'audit': --preview-scale is applied as CSS `zoom`, which reflows —
  // line breaks and rounded line boxes differ from the 1:1 print layout, so a
  // scaled audit measured a page the PDF never renders and passed a card that
  // overflowed its row by 40px in the export. The audit route renders at
  // full size, as print does, and is never looked at by a human anyway.
  // Not 'sorter' either: SlideThumb applies its own zoom.
  const [railOpen, setRailOpen] = useState(readRailOpen);
  const [railWidth, setRailWidth] = useState(readRailWidth);
  const [place, setPlace] = useState(readDockPlace);
  let railPx = 0;
  if (place === 'side') railPx = railOpen ? railWidth : RAIL_SHUT_PX;
  usePreviewScale(mode === 'preview', railPx);

  // Docked on top the bar adds top padding; docked left it adds left
  // padding (and publishes a zero --devbar-h). Take both away
  // again on every other route so print geometry is untouched.
  useEffect(() => {
    document.body.classList.toggle('has-devbar', mode === 'preview');
    document.documentElement.style.setProperty('--rail-w', `${railPx}px`);
  }, [mode, railPx]);

  const pages = pageNumbers();
  const apx = appendixLabels();

  if (mode === 'sorter') return <SorterView pages={pages} apx={apx} />;
  if (mode === 'view') return <Viewer slides={slides} pages={pages} apx={apx} />;

  return (
    <>
      {mode === 'preview' && (
        <DevBar slides={slides} pages={pages} apx={apx} place={place} setPlace={setPlace}
          open={railOpen} setOpen={setRailOpen} width={railWidth} setWidth={setRailWidth}
        />
      )}
      {mode === 'audit' && <Audit slides={slides} pages={pages} apx={apx} />}
      {slides.map(({ id, Component, props = {} }) => (
        <Component key={id} pageNumber={pages.get(id)} appendixLabel={apx.get(id)} {...props} />
      ))}
    </>
  );
}
