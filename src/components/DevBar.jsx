import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Inspector from './Inspector.jsx';
import FindBar from './FindBar.jsx';
import SlideRail from './SlideRail.jsx';
import SetupChip from './SetupChip.jsx';
import { META } from '../deck/content.js';

// Screen-only development chrome. App renders it in 'preview' mode only, so
// there is no route and no accident that can put it in the exported PDF.
//
// It does four jobs:
//   1. switches between the preview and the sorter
//   2. toggles comment mode (Inspector.jsx): pick an element, copy a note
//      about it for your agent (Claude or Codex)
//   3. opens find (FindBar.jsx) on ⌘F / Ctrl+F
//   4. holds the slide rail (SlideRail.jsx): the thumbnails, with each page's
//      live word count and overflow flags, which use the measurements
//      exported here
// The bar docks on the left (commands stacked, thumbs scrolling down beneath)
// or on top (commands stacked in a left column, thumbs scrolling sideways in
// the rest), and minimises to a row of commands on top or a thin strip on the
// left. The shortcut hints are hidden until the keyboard button shows them.

const ROUTES = [
  { hash: '', label: 'Preview', hint: 'Every page at full size, scrolling' },
  { hash: '#sorter', label: 'Sorter', hint: 'The whole deck as a grid (s)' },
];

// A smell detector, not a rule: a page past it is usually trying to be two
// pages. Set it per deck in META.wordBudget (src/deck/content.js). Sources
// footers are excluded; they are citations, not argument.
export const WORD_BUDGET = META.wordBudget ?? 340;

function hasOwnText(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) return true;
  }
  return false;
}

// .slide is a fixed box with overflow:hidden and an absolutely positioned
// footer, so content that runs long is neither clipped loudly nor reflowed —
// it just slides under the footer and gets exported that way. This measures
// the worst offender so the preview says so out loud.
// Boxes that are measured even though their text lives in children: a card is
// a flex item with `min-height: auto`, so content it cannot fit makes the card
// itself grow past the row — and past the footer — while every line of type
// inside it still sits above the limit.
// Every region is such a box, plus the cards inside them. Give any other
// fixed-height box the `card` class (or add its selector here) so it is checked.
const BOXES = '.region, .card';

// Two stacked bands printing on top of each other. This is its own failure
// mode: when a flex or grid container's content is taller than the container,
// the children overflow *visibly* — they neither scroll nor push the page down
// — so they simply print over whatever band comes next. Nothing crosses the
// slide boundary, so `overflowPx` sees a clean page.
//
// What is deliberately NOT flagged is content merely running past its own
// container into the page's 96px of footer clearance. That is what the padding
// is for, and `overflowPx` already measures the thing that actually matters
// there — whether it reaches the footer — against the footer's real top edge.
function inFlow(el) {
  const p = getComputedStyle(el).position;
  return p !== 'absolute' && p !== 'fixed';
}

// An element's real vertical extent, including anything its children overflow
// it by — which is the whole point, since the container's own box is exactly
// what the overflowing content does not respect.
function extent(el) {
  const r = el.getBoundingClientRect();
  let top = r.top;
  let bottom = r.bottom;
  for (const d of el.querySelectorAll('*')) {
    if (!inFlow(d)) continue;
    const c = d.getBoundingClientRect();
    if (!c.height) continue;
    top = Math.min(top, c.top);
    bottom = Math.max(bottom, c.bottom);
  }
  return { top, bottom };
}

// Only containers that actually stack their children top to bottom. A row of
// cards or a multi-column grid puts consecutive children side by side, where
// they overlap vertically by design — comparing those pairs reports the whole
// height of every card row as an overlap. `.cardgrid` carries `.fill` too, so
// this is checked on the computed style rather than by class name.
function stacksVertically(el) {
  const cs = getComputedStyle(el);
  if (cs.display === 'flex') return cs.flexDirection.startsWith('column');
  return cs.display === 'block';
}

// .slide carries `zoom: var(--preview-scale)` on screen (styles.css), so every
// measurement in this file is taken in zoomed pixels and has to be normalised
// back to page pixels before it is reported. Read it from the custom property
// rather than off an element: `zoom` is inherited by every box on the page, and
// the property is the one place the number is authored.
function previewZoom() {
  return Number(getComputedStyle(document.documentElement)
    .getPropertyValue('--preview-scale')) || 1;
}

export function overlapPx(slideEl) {
  let worst = 0;
  const bands = [slideEl, ...slideEl.querySelectorAll('.fill, .sp-left, .sp-right')]
    .filter(stacksVertically);
  for (const band of bands) {
    const kids = Array.from(band.children)
      .filter((el) => inFlow(el)
        && !el.classList.contains('slide-footer')
        && el.getBoundingClientRect().height > 0);
    for (let i = 0; i < kids.length - 1; i += 1) {
      const a = extent(kids[i]);
      const b = extent(kids[i + 1]);
      worst = Math.max(worst, a.bottom - b.top);
    }
  }
  // Rects only, so the whole measurement is in zoomed pixels.
  return Math.round(worst / previewZoom());
}

export function overflowPx(slideEl) {
  const guard = slideEl.querySelector('.slide-footer');
  if (!guard) return 0;
  const zoom = previewZoom();
  const limit = guard.getBoundingClientRect().top;
  // A full-bleed SplitPanel keeps its own footer clearance as padding-bottom
  // rather than relying on the slide's. Chrome's print path DROPS in-flow
  // content that runs past that padding box — the screen still paints it, so
  // the failure is invisible twice over. Panels are measured against their own
  // padding box, which is the tighter of the two limits. `pad * zoom` because
  // a rect comes back in zoomed pixels and a computed style does not.
  const panels = Array.from(slideEl.querySelectorAll('.sp-left, .sp-right')).map((el) => {
    const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    return { el, bottom: el.getBoundingClientRect().bottom - pad * zoom };
  });
  const capFor = (el) => {
    const panel = panels.find((p) => p.el !== el && p.el.contains(el));
    return panel ? Math.min(limit, panel.bottom) : limit;
  };
  // A flex column that overflows a `justify-content: center` container spills
  // in BOTH directions, so content can run up over the headline while every
  // element still sits above the footer. Measuring only downward reported such
  // a slide as fine; measure the top edge too.
  const top = slideEl.getBoundingClientRect().top;
  let worst = 0;
  for (const el of slideEl.querySelectorAll('*')) {
    // The footer line and the mark beside it are page chrome below the line.
    if (el.closest('.slide-footer, .deck-mark')) continue;
    // Leaves only — boxes inherit their children's extent. But "leaf" has to
    // mean "carries its own text", not "has no element children": a bullet
    // <li> holds a positioned <span> for the dot, and testing children.length
    // skipped every list item on the page. A slide whose lists ran a hundred
    // pixels under the footer audited clean because of it.
    if (el.children.length && !hasOwnText(el) && !el.matches(BOXES)) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    worst = Math.max(worst, r.bottom - capFor(el), top - r.top);
  }
  // .slide is zoomed in preview; report the number in page pixels
  return Math.round(worst / zoom);
}

// Content that overflows its own card rather than the page. A flex row of cards
// gives every card the same height, so one card with too much copy spills over
// the next one — two blocks of type printed on top of each other, well above
// the footer and invisible to overflowPx. Cards are the only boxes that
// constrain their content this way, so they are the only ones measured.
export function spillPx(slideEl) {
  let worst = 0;
  for (const el of slideEl.querySelectorAll(BOXES)) {
    worst = Math.max(worst, el.scrollHeight - el.clientHeight);
  }
  // Not divided by the zoom: scrollHeight and clientHeight are already in
  // unzoomed page pixels.
  return Math.round(worst);
}

export function countWords(slideEl) {
  const clone = slideEl.cloneNode(true);
  clone.querySelectorAll('.slide-footer, .sources, [data-artifact]')
    .forEach((n) => n.remove());
  const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

// The bar is fixed, and docked on top its height depends on how many rows it
// wraps to — which changes with the window width. Everything
// that positions a slide against the top of the window has to know the real
// number, so the bar publishes it as a custom property and these two read it.
// Docked on the left it takes nothing from the top and publishes zero.
export function devbarHeight() {
  return parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--devbar-h')) || 0;
}

// scrollIntoView({ block: 'start' }) parks a slide's top edge at the top of the
// window, which is behind the bar. Offsetting by hand rather than with
// scroll-margin-top because .slide carries CSS `zoom` (--preview-scale), which
// scales lengths set on the element itself; window.scrollTo is in real viewport
// pixels and is immune to it.
export function scrollToSlide(el, behavior = 'smooth') {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - devbarHeight();
  window.scrollTo({ top, behavior });
}

// Small line icons for the dock buttons; they draw in currentColor.
function DockIcon({ kind }) {
  const paths = {
    side: <><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M6 2.5v11" /></>,
    top: <><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M1.5 6.5h13" /></>,
    left: <path d="M10 4 6 8l4 4" />,
    right: <path d="M6 4l4 4-4 4" />,
    up: <path d="M4 10l4-4 4 4" />,
    down: <path d="M4 6l4 4 4-4" />,
    keys: <><rect x="1.5" y="4" width="13" height="8" rx="1.5" /><path d="M4.5 7h1M7.5 7h1M10.5 7h1M5 9.5h6" /></>,
  };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

export default function DevBar({
  slides, pages, apx, place, setPlace, open, setOpen, width, setWidth,
}) {
  const [commenting, setCommenting] = useState(false);
  // The shortcut hints start hidden; the keyboard button shows them.
  const [showKeys, setShowKeys] = useState(() => {
    try { return localStorage.getItem('dock-keys') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('dock-keys', showKeys ? '1' : '0'); } catch { /* private window */ }
  }, [showKeys]);
  const [finding, setFinding] = useState(false);
  const barRef = useRef(null);

  // Publish the bar's measured height for the padding and the scroll offset.
  // No dependency array: the bar rewraps as the window narrows. A
  // ResizeObserver alone would miss the first of those in a background tab,
  // where it never gets a frame to fire on, so re-measure after every render
  // and let the observer cover resizes that don't re-render.
  //
  // Never cleared on unmount: leaving the sorter re-mounts the bar, and the
  // sorter scrolls to a slide 50ms later — a stale-but-right value beats a zero.
  const publish = useCallback(() => {
    const el = barRef.current;
    if (!el) return;
    const h = el.classList.contains('is-side') ? 0 : Math.round(el.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--devbar-h', `${h}px`);
  }, []);

  useLayoutEffect(publish);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    // The web fonts swap in after the last render and change the bar's height
    // with no render to hang a measurement on. The observer sees it, but only
    // on a frame — and a background tab is given none, so the value would stay
    // a dozen pixels short until the window was touched.
    document.fonts?.ready.then(publish);
    return () => ro.disconnect();
  }, [publish]);

  useEffect(() => {
    try { localStorage.setItem('dock-place', place); } catch { /* private window */ }
  }, [place]);

  // j/k (and arrows) walk the deck; s drops into the sorter; d moves the bar.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFinding(true);
        document.querySelector('.findbar .fb-input')?.select();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest('input, textarea')) return;
      const els = Array.from(document.querySelectorAll('#root > .slide'));
      if (e.key === 's') { window.location.hash = '#sorter'; return; }
      if (e.key === 'c') { setCommenting((on) => !on); return; }
      if (e.key === '?') { setShowKeys((on) => !on); return; }
      if (e.key === 'd') { setPlace((p) => (p === 'side' ? 'top' : 'side')); return; }
      const dir = e.key === 'j' || e.key === 'ArrowDown' ? 1
        : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      // "current" is whichever slide's top is nearest the bottom edge of the
      // bar — the top of the window is behind the bar, not at it.
      const limit = devbarHeight() + 8;
      const tops = els.map((el) => el.getBoundingClientRect().top);
      let current = 0;
      tops.forEach((t, i) => { if (t <= limit) current = i; });
      scrollToSlide(els[Math.min(els.length - 1, Math.max(0, current + dir))]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPlace]);

  const side = place === 'side';
  let minIcon = open ? 'up' : 'down';
  if (side) minIcon = open ? 'left' : 'right';
  // Shown by CSS on hover (data-tip), and read out as the icon's label.
  const keysTip = showKeys ? 'Hide keyboard shortcuts (?)' : 'Show keyboard shortcuts (?)';
  const placeTip = side ? 'Move this panel to the top (d)' : 'Move this panel to the left (d)';
  const openTip = open ? 'Hide the slide list (b)' : 'Show the slide list (b)';
  // The count beside the title: every page in the deck, cover, divider and
  // appendix included; the tooltip splits it by section.
  const main = slides.filter((s) => s.kind === 'cover' || s.kind === 'content').length;
  const apxCount = slides.filter((s) => s.kind === 'appendix').length;
  const countTip = `${main} main pages, the divider and ${apxCount} appendix pages`;

  return (
    <div className={`devbar is-${place} ${open ? 'is-open' : 'is-min'}`} ref={barRef}>
      <div className="devbar-row">
        <div className="devbar-head">
          <span className="devbar-brand">
            <span className="devbar-logo">sl<i>-</i>ide</span>
            <span className="devbar-deck" title={META.deckTitle}>{META.deckTitle}</span>
            <span className="devbar-count" title={countTip}>{slides.length} slides</span>
          </span>
          <span className="devbar-tools">
            <button
              type="button" className={`devbar-icon is-keys ${showKeys ? 'is-on' : ''}`}
              data-tip={keysTip} aria-label={keysTip}
              onClick={() => setShowKeys((on) => !on)}
            >
              <DockIcon kind="keys" />
            </button>
            <button
              type="button" className="devbar-icon"
              data-tip={placeTip} aria-label={placeTip}
              onClick={() => setPlace(side ? 'top' : 'side')}
            >
              <DockIcon kind={side ? 'top' : 'side'} />
            </button>
            <button
              type="button" className="devbar-icon"
              data-tip={openTip} aria-label={openTip}
              onClick={() => setOpen((o) => !o)}
            >
              <DockIcon kind={minIcon} />
            </button>
          </span>
        </div>
        <nav className="devbar-routes">
          {ROUTES.map((r) => (
            <a
              key={r.label}
              href={r.hash || '#'}
              data-tip={r.hint}
              className={`devbar-route ${(window.location.hash || '') === r.hash ? 'is-on' : ''}`}
              onClick={(e) => {
                if (!r.hash) {
                  e.preventDefault();
                  history.replaceState(null, '', ' ');
                  window.dispatchEvent(new HashChangeEvent('hashchange'));
                }
              }}
            >
              {r.label}
            </a>
          ))}
          <button
            type="button"
            className={`devbar-route ${commenting ? 'is-on' : ''}`}
            data-tip="Click anything on a slide to copy a note about it for your agent (Claude or Codex) (c)"
            onClick={() => setCommenting((on) => !on)}
          >
            Comment
          </button>
        </nav>
        <SetupChip />
        {showKeys && (
          <span className="devbar-keys">
            <kbd>j</kbd><kbd>k</kbd> slide · <kbd>s</kbd> sorter · <kbd>b</kbd> slides · <kbd>d</kbd> dock · <kbd>c</kbd> comment · <kbd>⌘F</kbd> find · <kbd>?</kbd> shortcuts
          </span>
        )}
      </div>

      <SlideRail slides={slides} pages={pages} apx={apx} place={place} open={open}
        setOpen={setOpen} width={width} setWidth={setWidth}
      />

      {finding && (
        <FindBar slides={slides} pages={pages} apx={apx} onExit={() => setFinding(false)} />
      )}
      {commenting && (
        <Inspector slides={slides} pages={pages} apx={apx} onExit={() => setCommenting(false)} />
      )}
    </div>
  );
}
