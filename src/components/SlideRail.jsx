import { useCallback, useEffect, useRef, useState } from 'react';
import SlideThumb from './SlideThumb.jsx';
import {
  countWords, devbarHeight, overflowPx, overlapPx, scrollToSlide, spillPx, WORD_BUDGET,
} from './DevBar.jsx';

// Screen-only strip of slide thumbnails for the preview route. It lives inside
// the DevBar, under the bar's commands, so like the bar it cannot reach the PDF.
// Docked on the left it is a column that scrolls down; docked on top it is a
// row that scrolls sideways (the mouse wheel scrolls it too).
//
// Docked left, its width is part of the preview's geometry: App subtracts it
// from the window when it sizes the slides (usePreviewScale), and body pads by
// --rail-w so the slides centre in the space that is left. Docked on top, its
// height is part of the bar's, which the bar publishes as --devbar-h.
//
// Beside each thumb sit the page's live word count and, when it has one, its
// worst layout fault (runs past the footer, spills its card, or overlaps the
// band beneath it), so the density budget and clipping are visible while
// editing instead of being discovered after an export.

// The open side rail is resizable by dragging its right edge; the thumbs fill
// whatever is left after the label column, the gaps and the scrollbar. On top
// the strip is resizable by dragging its bottom edge, which sets the thumbs'
// width (and so their height) directly.
export const RAIL_SHUT_PX = 40;
const RAIL_DEFAULT_PX = 230;
const RAIL_MIN_PX = 200;
const RAIL_MAX_PX = 640;
const RAIL_CHROME_PX = 70;
const TOP_THUMB_DEFAULT_PX = 150;
const TOP_THUMB_MIN_PX = 90;
const TOP_THUMB_MAX_PX = 480;
const clampWidth = (w) => Math.round(Math.min(RAIL_MAX_PX, Math.max(RAIL_MIN_PX, w)));
const clampThumb = (w) => Math.round(Math.min(TOP_THUMB_MAX_PX, Math.max(TOP_THUMB_MIN_PX, w)));

function readTopThumb() {
  try {
    const n = Number(localStorage.getItem('rail-top-thumb'));
    if (n) return clampThumb(n);
  } catch { /* private window */ }
  return TOP_THUMB_DEFAULT_PX;
}

// Puts a page of the deck on the clipboard as a 2x PNG. The dev server draws
// it (scripts/slide-shot.js) from the #print route in headless Chrome, so the
// image is the page exactly as the PDF prints it. The render starts when the
// menu opens (fetchSlideImage), so it is usually done by the time Copy is
// clicked; the clipboard gets a promise of the blob either way, so the write
// still counts as part of the click.
function fetchSlideImage(index) {
  const blob = fetch(`/__shot?i=${index}`).then(async (res) => {
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.blob();
  });
  blob.catch(() => {}); // reported when copied, not when prefetched
  return blob;
}

async function copySlideImage(blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function readRailWidth() {
  try {
    const n = Number(localStorage.getItem('rail-w'));
    if (n) return clampWidth(n);
  } catch { /* private window */ }
  return RAIL_DEFAULT_PX;
}

// Open by default only when the window has room for it; remembered per browser
// once toggled.
export function readRailOpen() {
  try {
    const v = localStorage.getItem('rail-open');
    if (v === '1' || v === '0') return v === '1';
  } catch { /* private window */ }
  return window.innerWidth >= 1100;
}

// Where the bar docks, 'top' or 'side'. Remembered per browser.
export function readDockPlace() {
  try {
    const v = localStorage.getItem('dock-place');
    if (v === 'top' || v === 'side') return v;
  } catch { /* private window */ }
  return 'side';
}

export default function SlideRail({
  slides, pages, apx, place, open, setOpen, width, setWidth,
}) {
  const side = place === 'side';
  const [current, setCurrent] = useState(0);
  const [stats, setStats] = useState([]);
  const statsRef = useRef([]);
  const railRef = useRef(null);
  const [topThumb, setTopThumb] = useState(readTopThumb);
  // The right-click menu on a thumb: where it opened, which page, the image
  // being rendered for it, and how the copy is going ('idle' | 'busy' | 'done' | 'failed').
  const [menu, setMenu] = useState(null);

  const recount = useCallback(() => {
    const els = document.querySelectorAll('#root > .slide');
    const next = Array.from(els, (el) => ({
      words: countWords(el), over: overflowPx(el), spill: spillPx(el),
      overlap: overlapPx(el),
    }));
    const prev = statsRef.current;
    const same = next.length === prev.length
      && next.every((n, i) => n.words === prev[i].words && n.over === prev[i].over
        && n.spill === prev[i].spill && n.overlap === prev[i].overlap);
    if (same) return;
    statsRef.current = next;
    setStats(next);
  }, []);

  // No dependency array: re-measure after every render, including the ones
  // Vite's HMR triggers when a slide file is saved. recount() bails out when
  // nothing changed, so this can't loop. The web fonts swap in after the last
  // render, and a font swap is not a render, so measure again once they land:
  // the fallback faces are narrower and under-report, which is the silent
  // direction to be wrong in. Audit.jsx gates on document.fonts for the same
  // reason.
  useEffect(() => {
    const id = requestAnimationFrame(recount);
    document.fonts?.ready.then(recount);
    return () => cancelAnimationFrame(id);
  });

  useEffect(() => {
    try { localStorage.setItem('rail-open', open ? '1' : '0'); } catch { /* private window */ }
  }, [open]);

  useEffect(() => {
    try { localStorage.setItem('rail-w', String(width)); } catch { /* private window */ }
  }, [width]);

  useEffect(() => {
    try { localStorage.setItem('rail-top-thumb', String(topThumb)); } catch { /* private window */ }
  }, [topThumb]);

  // The menu closes on Esc, a click elsewhere, a scroll or a resize.
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && e.target.closest?.('.rail-menu')) return;
      // Captured on the window, an element's own blur arrives here too (the
      // menu's button taking focus fires one); only the window's counts.
      if (e.type === 'blur' && e.target !== window) return;
      // Likewise only scrolls of the page or the strip, not of the menu.
      if (e.type === 'scroll' && e.target.closest?.('.rail-menu')) return;
      setMenu(null);
    };
    const on = ['keydown', 'pointerdown', 'scroll', 'resize', 'blur'];
    on.forEach((t) => window.addEventListener(t, close, true));
    return () => on.forEach((t) => window.removeEventListener(t, close, true));
  }, [menu]);

  const copyFromMenu = async () => {
    const { i, blob } = menu;
    setMenu((m) => m && { ...m, status: 'busy' });
    try {
      // A failed prefetch is retried rather than reported.
      await copySlideImage(blob.catch(() => fetchSlideImage(i)));
      setMenu((m) => m && { ...m, status: 'done' });
      setTimeout(() => setMenu((m) => (m?.status === 'done' ? null : m)), 900);
    } catch (err) {
      console.error('[rail] copy image failed', err);
      setMenu((m) => m && { ...m, status: 'failed' });
    }
  };

  // Drag the edge to resize (the right edge docked left, the bottom edge on
  // top); double-click it to go back to the default.
  // Updates are batched to one per frame, since each one rescales the deck.
  // The drag listens on the window, not the grip, and ends on whichever comes
  // first: a release anywhere (inside the window or out), a lost capture, the
  // window losing focus, a move with no button held, Esc, or a fresh click.
  // Listening on the grip alone left the drag stuck on whenever its pointerup
  // went somewhere else — e.g. when the browser started its own drag-and-drop
  // of a thumb or selected text, which swallows the release; dragstart is
  // cancelled for the same reason.
  const onGripDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    try { grip.setPointerCapture(e.pointerId); } catch { /* already released */ }
    document.body.classList.add(side ? 'is-rail-resizing' : 'is-rail-resizing-y');
    // Docked left the pointer's x is the width; on top, the thumbs grow by the
    // pointer's travel, in height, converted to a width at 16:9.
    const y0 = e.clientY;
    const thumb0 = topThumb;
    const apply = () => (side
      ? setWidth(clampWidth(x))
      : setTopThumb(clampThumb(thumb0 + (y - y0) * (1280 / 720))));
    let frame = 0;
    let x = e.clientX;
    let y = e.clientY;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      apply();
      document.body.classList.remove('is-rail-resizing', 'is-rail-resizing-y');
      detach();
    };
    const onMove = (ev) => {
      if (!(ev.buttons & 1)) { end(); return; }
      x = ev.clientX;
      y = ev.clientY;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; apply(); });
    };
    const onKey = (ev) => { if (ev.key === 'Escape') end(); };
    const noDrag = (ev) => ev.preventDefault();
    const on = [
      ['pointermove', onMove], ['pointerup', end], ['pointercancel', end],
      ['pointerdown', end], ['mouseup', end], ['keydown', onKey], ['dragstart', noDrag],
    ];
    function detach() {
      on.forEach(([t, f]) => window.removeEventListener(t, f, true));
      window.removeEventListener('blur', end);
      grip.removeEventListener('lostpointercapture', end);
    }
    on.forEach(([t, f]) => window.addEventListener(t, f, true));
    window.addEventListener('blur', end);
    grip.addEventListener('lostpointercapture', end);
  };

  // b shows or hides the slides. Same guards as the DevBar's keys.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'b') setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // The current slide is the last one whose top has passed a line a third of
  // the way down the visible area (below the bar), so a slide counts as
  // current once it fills most of the window.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = devbarHeight();
      const line = top + (window.innerHeight - top) / 3;
      const els = document.querySelectorAll('#root > .slide');
      let i = 0;
      els.forEach((el, n) => { if (el.getBoundingClientRect().top <= line) i = n; });
      setCurrent(i);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Keep the current thumb in view as j/k walk the deck. Scrolls the rail by
  // hand: scrollIntoView would also nudge the window.
  useEffect(() => {
    const rail = railRef.current;
    const cell = rail?.querySelectorAll('.rail-cell')[current];
    if (!open || !cell) return;
    const r = rail.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    if (side) {
      if (c.top < r.top) rail.scrollTop -= r.top - c.top + 12;
      else if (c.bottom > r.bottom) rail.scrollTop += c.bottom - r.bottom + 12;
    } else if (c.left < r.left) rail.scrollLeft -= r.left - c.left + 12;
    else if (c.right > r.right) rail.scrollLeft += c.right - r.right + 12;
  }, [current, open, side]);

  // On top, a plain mouse wheel scrolls the strip sideways instead of the page
  // underneath it. Not passive, so it can stop the page scrolling as well.
  useEffect(() => {
    const rail = railRef.current;
    if (side || !open || !rail) return undefined;
    const onWheel = (e) => {
      if (e.deltaX || !e.deltaY) return;
      e.preventDefault();
      rail.scrollLeft += e.deltaY;
    };
    rail.addEventListener('wheel', onWheel, { passive: false });
    return () => rail.removeEventListener('wheel', onWheel);
  }, [side, open]);

  const jump = (i) => scrollToSlide(document.querySelectorAll('#root > .slide')[i]);

  // A page's worst fault in px and what it is, or null when it is clean.
  const fault = (st) => {
    if (!st) return null;
    if (st.over > 2) return { px: st.over, what: 'content runs past the footer' };
    if (st.spill > 2) return { px: st.spill, what: 'a card overflows its box' };
    if (st.overlap > 2) return { px: st.overlap, what: 'two bands overlap' };
    return null;
  };
  const faults = stats.filter((st, i) => fault(st)
    || (slides[i]?.kind !== 'cover' && st.words > WORD_BUDGET)).length;

  return (
    <>
      {!open && faults > 0 && (
        <span className="rail-alert" title={`${faults} page${faults > 1 ? 's' : ''} need attention`}>
          !
        </span>
      )}
      {open && (
        <div className="rail-list" ref={railRef}>
          {slides.map(({ id, kind, Component, props = {}, title }, i) => {
            const st = stats[i];
            const f = fault(st);
            const wordy = kind !== 'cover' && (st?.words ?? 0) > WORD_BUDGET;
            const hint = [
              title,
              st && `${st.words} words${wordy ? `, over the ${WORD_BUDGET} budget` : ''}`,
              f && `${f.what} by ${f.px}px`,
            ].filter(Boolean).join(' — ');
            return (
            <button
              type="button" key={id} title={hint}
              className={`rail-cell ${i === current ? 'is-on' : ''} ${f ? 'is-clipped' : ''}`}
              onClick={() => jump(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  i,
                  blob: fetchSlideImage(i),
                  x: Math.min(e.clientX, window.innerWidth - 220),
                  y: Math.min(e.clientY, window.innerHeight - 50),
                  status: 'idle',
                });
              }}
            >
              <span className="rail-meta">
                <span className="rail-no">{apx.get(id) ?? pages.get(id) ?? '·'}</span>
                <span className={`rail-words ${wordy ? 'is-over' : ''}`}>{st ? st.words : '–'}</span>
                {f && <span className="rail-clip">+{f.px}px</span>}
              </span>
              <SlideThumb
                Component={Component}
                componentProps={{ ...props, pageNumber: pages.get(id), appendixLabel: apx.get(id) }}
                widthPx={side ? width - RAIL_CHROME_PX : topThumb}
              />
            </button>
            );
          })}
        </div>
      )}
      {open && (
        <div
          className={`rail-grip ${side ? 'is-x' : 'is-y'}`} title="drag to resize · double-click to reset"
          onPointerDown={onGripDown}
          onDoubleClick={() => (side ? setWidth(RAIL_DEFAULT_PX) : setTopThumb(TOP_THUMB_DEFAULT_PX))}
        />
      )}
      {menu && (
        <div className="rail-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          <button
            type="button" role="menuitem" className="rail-menu-item"
            disabled={menu.status === 'busy'} onClick={copyFromMenu}
          >
            {{
              busy: 'Copying…',
              done: 'Copied',
              failed: 'Copy failed (see console)',
            }[menu.status] ?? 'Copy slide as image'}
          </button>
        </div>
      )}
    </>
  );
}
