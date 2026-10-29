import { useCallback, useEffect, useRef, useState } from 'react';
import SlideThumb from './SlideThumb.jsx';
import { META } from '../deck/content.js';
import { FORMAT, PAGE } from './page.js';

// The audience's view of the deck: one page at a time, filling the window,
// with the controls out of the way. A built deck (dist/, and so sl-ide cloud)
// opens here by default; on the dev server it is the "View" route.
//
//   #view        page 1        #view/3   page 3 (positions, cover = 1)
//
// Keys: ← → (also space, PgUp/PgDn, j/k) · Home/End · a number then Enter
// jumps to that page · g grid · f fullscreen · b slides · d dock · Esc back
// to the editor (dev server only).
//
// The slides strip is the editor's rail for viewers: every page as a
// thumbnail, docked on the left (a column) or on top (a row), the current one
// marked. It doesn't fade with the controls, since it takes room from the
// page rather than sitting over it, and full screen hides it. Open by default
// when the window has room; whether it's open and where it docks are
// remembered per browser.
// Swipe on touch screens. The controls fade after a moment of stillness and
// come back on any movement, so a presented page shows nothing but the page.
//
// "Download PDF" appears when a deck.pdf sits beside index.html, which
// `pnpm publish-deck` puts there. Pages render through the same components
// as the PDF, so what viewers see is what prints.
//
// A memo reads like a document instead: every page down one scrolling
// column, as wide as the window allows (up to MEMO_MAX_SCALE). The keys and
// the counter still move by page, and #view/N scrolls to page N.

const MEMO = FORMAT === 'memo';
const MEMO_MAX_SCALE = 1.4;
const IDLE_MS = 2200;
// Typed digits wait this long for Enter before they're dropped.
const JUMP_MS = 1600;
const PDF_PATH = './deck.pdf';
// Thumbs are as wide as the side strip allows, or as tall as the top one.
const STRIP_SIDE_W = MEMO ? 120 : 168;
const STRIP_TOP_H = 84;
const thumbWidth = (side) => (side ? STRIP_SIDE_W : Math.round(STRIP_TOP_H * (PAGE.w / PAGE.h)));

function readStripOpen() {
  try {
    const v = localStorage.getItem('vw-strip-open');
    if (v === '1' || v === '0') return v === '1';
  } catch { /* private window */ }
  return window.innerWidth >= 1100;
}

function readStripPlace() {
  try {
    const v = localStorage.getItem('vw-strip-place');
    if (v === 'top' || v === 'side') return v;
  } catch { /* private window */ }
  return 'side';
}

function pageFromHash(count) {
  const m = /^#view\/(\d+)/.exec(window.location.hash);
  const n = m ? Number(m[1]) : 1;
  return Math.min(count, Math.max(1, n)) - 1;
}

function useFitScale(ref) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setScale(Math.max(0.1, MEMO
        ? Math.min(width / PAGE.w, MEMO_MAX_SCALE)
        : Math.min(width / PAGE.w, height / PAGE.h)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

function Icon({ kind }) {
  const paths = {
    prev: <path d="M10 4 6 8l4 4" />,
    next: <path d="M6 4l4 4-4 4" />,
    grid: <><rect x="2" y="2.5" width="5" height="4.5" rx="0.8" /><rect x="9" y="2.5" width="5" height="4.5" rx="0.8" /><rect x="2" y="9" width="5" height="4.5" rx="0.8" /><rect x="9" y="9" width="5" height="4.5" rx="0.8" /></>,
    pdf: <><path d="M8 2.5v7.5" /><path d="M5 7l3 3 3-3" /><path d="M3 12.5h10" /></>,
    full: <><path d="M2.5 6V2.5H6" /><path d="M10 2.5h3.5V6" /><path d="M13.5 10v3.5H10" /><path d="M6 13.5H2.5V10" /></>,
    exit: <><path d="M6 2.5V6H2.5" /><path d="M13.5 6H10V2.5" /><path d="M10 13.5V10h3.5" /><path d="M2.5 10H6v3.5" /></>,
    side: <><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M6 2.5v11" /></>,
    top: <><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M1.5 6.5h13" /></>,
  };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

export default function Viewer({ slides, pages, apx }) {
  const count = slides.length;
  const [index, setIndex] = useState(() => pageFromHash(count));
  const [grid, setGrid] = useState(false);
  const [idle, setIdle] = useState(false);
  const [full, setFull] = useState(false);
  const [hasPdf, setHasPdf] = useState(false);
  const [strip, setStrip] = useState(readStripOpen);
  const [place, setPlace] = useState(readStripPlace);
  const [jump, setJump] = useState('');
  const side = place === 'side';
  const stageRef = useRef(null);
  const stripRef = useRef(null);
  const scale = useFitScale(stageRef);

  useEffect(() => {
    try { localStorage.setItem('vw-strip-open', strip ? '1' : '0'); } catch { /* private window */ }
  }, [strip]);
  useEffect(() => {
    try { localStorage.setItem('vw-strip-place', place); } catch { /* private window */ }
  }, [place]);

  const go = useCallback((i) => setIndex(Math.min(count - 1, Math.max(0, i))), [count]);

  // A memo scrolls: turning the page scrolls to it, and scrolling turns it.
  // `scrolling` marks a turn the scroll itself made, so it isn't scrolled to.
  const scrolling = useRef(false);
  useEffect(() => {
    if (!MEMO || scrolling.current) { scrolling.current = false; return; }
    const el = stageRef.current?.querySelector(`[data-page="${index}"]`);
    el?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [index, scale]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!MEMO || !stage) return undefined;
    const on = () => {
      const mid = stage.getBoundingClientRect().top + stage.clientHeight / 3;
      const els = Array.from(stage.querySelectorAll('[data-page]'));
      const i = els.reduce((at, el, k) => (el.getBoundingClientRect().top <= mid ? k : at), 0);
      setIndex((cur) => {
        if (cur !== i) scrolling.current = true;
        return i;
      });
    };
    stage.addEventListener('scroll', on, { passive: true });
    return () => stage.removeEventListener('scroll', on);
  }, []);

  // The page lives in the URL, so a link can point at one and reload keeps it.
  useEffect(() => {
    history.replaceState(null, '', `#view/${index + 1}`);
  }, [index]);
  useEffect(() => {
    const on = () => { if (window.location.hash.startsWith('#view')) setIndex(pageFromHash(count)); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [count]);

  useEffect(() => {
    let live = true;
    fetch(PDF_PATH, { method: 'HEAD' })
      .then((r) => { if (live) setHasPdf(r.ok && !/text\/html/.test(r.headers.get('content-type') ?? '')); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    document.body.classList.add('is-viewing');
    document.title = META.deckTitle;
    return () => document.body.classList.remove('is-viewing');
  }, []);

  // Controls fade when the pointer rests; any movement or key brings them back.
  useEffect(() => {
    let t = 0;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    const on = ['pointermove', 'pointerdown', 'keydown'];
    on.forEach((e) => window.addEventListener(e, wake));
    return () => { clearTimeout(t); on.forEach((e) => window.removeEventListener(e, wake)); };
  }, []);

  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  // Digits typed in a row, shown in the counter until Enter jumps there.
  useEffect(() => {
    if (!jump) return undefined;
    const t = setTimeout(() => setJump(''), JUMP_MS);
    return () => clearTimeout(t);
  }, [jump]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (grid) {
        if (k === 'Escape' || k === 'g') { e.preventDefault(); setGrid(false); }
        return;
      }
      if (/^[0-9]$/.test(k)) { setJump((j) => (j + k).slice(-3)); return; }
      if (jump && k === 'Enter') { e.preventDefault(); go(Number(jump) - 1); setJump(''); return; }
      if (jump && (k === 'Escape' || k === 'Backspace')) { e.preventDefault(); setJump(k === 'Escape' ? '' : jump.slice(0, -1)); return; }
      // On the dev server, Esc goes back to editing (the fullscreen exit
      // takes it first when fullscreen is on).
      if (k === 'Escape' && import.meta.env.DEV && !document.fullscreenElement) {
        window.location.hash = '#preview';
        return;
      }
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'j', 'l'].includes(k)) { e.preventDefault(); go(index + (e.shiftKey && k === ' ' ? -1 : 1)); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'k', 'h'].includes(k)) { e.preventDefault(); go(index - 1); }
      else if (k === 'Home') { e.preventDefault(); go(0); }
      else if (k === 'End') { e.preventDefault(); go(count - 1); }
      else if (k === 'g') setGrid(true);
      else if (k === 'f') toggleFull();
      else if (k === 'b') setStrip((o) => !o);
      else if (k === 'd') setPlace((p) => (p === 'side' ? 'top' : 'side'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grid, index, count, go, toggleFull, jump]);

  // Swipe: a mostly horizontal drag of 40px or more turns the page.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || MEMO) return undefined;
    let start = null;
    const down = (e) => { if (e.pointerType !== 'mouse') start = { x: e.clientX, y: e.clientY }; };
    const up = (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); };
  }, [index, go]);

  // Keep the current thumb in view as the pages turn. Scrolls the strip by
  // hand: scrollIntoView would also scroll a memo's stage.
  const showStrip = strip && !full;
  useEffect(() => {
    const el = stripRef.current;
    const cell = el?.children[index];
    if (!cell) return;
    const r = el.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    if (side) {
      if (c.top < r.top) el.scrollTop -= r.top - c.top + 12;
      else if (c.bottom > r.bottom) el.scrollTop += c.bottom - r.bottom + 12;
    } else if (c.left < r.left) el.scrollLeft -= r.left - c.left + 12;
    else if (c.right > r.right) el.scrollLeft += c.right - r.right + 12;
  }, [index, showStrip, side]);

  // On top, a plain mouse wheel scrolls the strip sideways.
  useEffect(() => {
    const el = stripRef.current;
    if (side || !el) return undefined;
    const onWheel = (e) => {
      if (e.deltaX || !e.deltaY) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [showStrip, side]);

  const s = slides[index];
  const label = (x) => apx.get(x.id) ?? pages.get(x.id);
  const { Component, props = {} } = s;

  return (
    <div className={`viewer is-${place}${idle && !grid ? ' is-idle' : ''}`}>
      {showStrip && (
        <nav className="vw-strip" ref={stripRef} aria-label="Pages">
          {slides.map((x, i) => (
            <button
              type="button" key={x.id} title={x.title}
              className={`vw-strip-cell${i === index ? ' is-on' : ''}`}
              aria-current={i === index ? 'page' : undefined}
              onClick={() => go(i)}
            >
              <span className="vw-strip-no">{label(x) ?? '·'}</span>
              <SlideThumb Component={x.Component} componentProps={{ ...(x.props ?? {}), pageNumber: pages.get(x.id), appendixLabel: apx.get(x.id) }} widthPx={thumbWidth(side)} />
            </button>
          ))}
        </nav>
      )}

      <div className="vw-main">
        {import.meta.env.DEV && <a className="vw-edit" href="#preview">Back to editor <kbd>esc</kbd></a>}

        {MEMO ? (
          <main className="vw-stage is-doc" ref={stageRef}>
            {slides.map((x, i) => (
              <div className="vw-page" data-page={i} key={x.id} style={{ width: PAGE.w * scale, height: PAGE.h * scale }}>
                <div style={{ zoom: scale }}>
                  <x.Component pageNumber={pages.get(x.id)} appendixLabel={apx.get(x.id)} {...(x.props ?? {})} />
                </div>
              </div>
            ))}
          </main>
        ) : (
          <main className="vw-stage" ref={stageRef}>
            <div className="vw-page" style={{ width: PAGE.w * scale, height: PAGE.h * scale }}>
              <div style={{ zoom: scale }}>
                <Component key={s.id} pageNumber={pages.get(s.id)} appendixLabel={apx.get(s.id)} {...props} />
              </div>
            </div>
            {/* Click the left or right third of the stage to turn the page. */}
            <button type="button" className="vw-hit is-prev" aria-label="Previous page" onClick={() => go(index - 1)} disabled={index === 0} />
            <button type="button" className="vw-hit is-next" aria-label="Next page" onClick={() => go(index + 1)} disabled={index === count - 1} />
          </main>
        )}

        <nav className="vw-bar" aria-label="Deck controls">
          <button type="button" className="vw-btn" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous page (←)" data-tip="Previous (←)"><Icon kind="prev" /></button>
          <span className={`vw-count${jump ? ' is-jump' : ''}`} aria-live="polite">{jump ? <>Go to {jump} <kbd>↵</kbd></> : <>{index + 1} <span>/ {count}</span></>}</span>
          <button type="button" className="vw-btn" onClick={() => go(index + 1)} disabled={index === count - 1} aria-label="Next page (→)" data-tip="Next (→)"><Icon kind="next" /></button>
          <span className="vw-sep" />
          <button type="button" className={`vw-btn${strip ? ' is-on' : ''}`} onClick={() => setStrip((o) => !o)} aria-pressed={strip} aria-label={strip ? 'Hide slides (b)' : 'Show slides (b)'} data-tip={strip ? 'Hide slides (b)' : 'Show slides (b)'}><Icon kind={side ? 'side' : 'top'} /></button>
          {strip && (
            <button type="button" className="vw-btn" onClick={() => setPlace(side ? 'top' : 'side')} aria-label={side ? 'Slides on top (d)' : 'Slides on the left (d)'} data-tip={side ? 'Slides on top (d)' : 'Slides on the left (d)'}><Icon kind={side ? 'top' : 'side'} /></button>
          )}
          <button type="button" className="vw-btn" onClick={() => setGrid(true)} aria-label="All pages (g)" data-tip="All pages (g)"><Icon kind="grid" /></button>
          {hasPdf && (
            <a className="vw-btn" href={PDF_PATH} download={`${META.pdfName || 'deck'}.pdf`} aria-label="Download PDF" data-tip="Download PDF"><Icon kind="pdf" /></a>
          )}
          <button type="button" className="vw-btn" onClick={toggleFull} aria-label={full ? 'Exit full screen (f)' : 'Full screen (f)'} data-tip={full ? 'Exit full screen (f)' : 'Full screen (f)'}><Icon kind={full ? 'exit' : 'full'} /></button>
        </nav>
      </div>

      {grid && (
        <div className="vw-grid" role="dialog" aria-label="All pages">
          <div className="vw-grid-head">
            <span>{count} pages</span>
            <button type="button" className="vw-btn" onClick={() => setGrid(false)} aria-label="Close (Esc)">Close <kbd>esc</kbd></button>
          </div>
          <div className="vw-grid-list">
            {slides.map((x, i) => (
              <button
                type="button" key={x.id} className={`vw-cell${i === index ? ' is-on' : ''}`}
                onClick={() => { go(i); setGrid(false); }}
              >
                <SlideThumb Component={x.Component} componentProps={{ ...(x.props ?? {}), pageNumber: pages.get(x.id), appendixLabel: apx.get(x.id) }} widthPx={MEMO ? 200 : 260} />
                <span className="vw-cell-cap"><b>{label(x) ?? '·'}</b>{x.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
