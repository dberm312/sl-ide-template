import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

// Comment mode: hover an element on a slide, click it, write a note, and a
// prompt-ready block — which slide, a CSS path to the element, its visible
// text, the note — goes to the clipboard to paste into Claude Code or Codex.
//
// Mounted only by DevBar, which exists only in preview mode, so none of this
// can reach #print, #audit or the PDF. The highlight boxes are fixed-position
// siblings of the slides rather than children, so the word counts and overflow
// checks in DevBar.jsx never see them, and getBoundingClientRect() already
// returns viewport pixels — the slides' CSS `zoom` needs no correction.

const SNIPPET_MAX = 200;
const POP_WIDTH = 380;
const POP_HEIGHT = 240; // roughly; only decides which side it opens on

function slideOf(el) {
  const slide = el?.closest?.('#root > .slide');
  return slide || null;
}

// One step per ancestor up to the slide: `tag.classA.classB`, with state
// classes (`is-*`) dropped since they change under the pointer, and an
// :nth-of-type only when a sibling would otherwise match the same step.
function step(el) {
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).filter((c) => !c.startsWith('is-'));
  const base = classes.length ? `${tag}.${classes.map((c) => CSS.escape(c)).join('.')}` : tag;
  const parent = el.parentElement;
  if (!parent) return base;
  const twins = Array.from(parent.children).filter((s) => s.tagName === el.tagName
    && classes.every((c) => s.classList.contains(c)));
  if (twins.length < 2) return base;
  const sameTag = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
  return `${base}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

export function cssPath(el, slideEl) {
  const parts = [];
  for (let n = el; n && n !== slideEl; n = n.parentElement) parts.unshift(step(n));
  return ['section.slide', ...parts].join(' > ');
}

function snippet(el) {
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX - 1)}…` : text;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API refused (no focus, insecure origin) — the old way still works.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function useRect(el) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!el) { setRect(null); return undefined; }
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [el]);
  return rect;
}

const boxStyle = (r) => r && ({ top: r.top, left: r.left, width: r.width, height: r.height });

export default function Inspector({ slides, pages, apx, onExit }) {
  const [hover, setHover] = useState(null);
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  // The hover box keeps following the pointer while something is picked, so
  // the next target is visible before you click it; it only steps aside when
  // it would sit exactly on the picked box.
  const hoverRect = useRect(hover === picked ? null : hover);
  const pickedRect = useRect(picked);

  useEffect(() => {
    document.body.classList.add('is-commenting');
    return () => document.body.classList.remove('is-commenting');
  }, []);

  useEffect(() => {
    const track = (el) => {
      const slide = slideOf(el);
      setHover(slide && el !== slide ? el : null);
    };
    // Scrolling moves the page under a still pointer, and mousemove does not
    // fire for that — re-resolve the element at the last pointer position.
    let last = null;
    const onMove = (e) => {
      last = { x: e.clientX, y: e.clientY };
      track(e.target);
    };
    const onScroll = () => {
      if (last) track(document.elementFromPoint(last.x, last.y));
    };
    const onClick = (e) => {
      if (e.target.closest('.inspector-pop, .devbar')) return;
      const slide = slideOf(e.target);
      if (!slide) return;
      // Capture phase, so a button or link on the slide never sees the click.
      e.preventDefault();
      e.stopPropagation();
      setPicked(e.target === slide ? null : e.target);
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  const cancel = useCallback(() => { setPicked(null); setNote(''); }, []);

  const describe = useCallback((el) => {
    const slideEl = slideOf(el);
    const i = Array.from(document.querySelectorAll('#root > .slide')).indexOf(slideEl);
    const s = slides[i];
    const label = s ? (apx.get(s.id) ?? pages.get(s.id) ?? s.kind) : '?';
    return {
      slide: s ? `Slide ${label} (${s.id}) — "${s.title}"` : 'Slide ?',
      path: cssPath(el, slideEl),
      text: snippet(el),
    };
  }, [slides, pages, apx]);

  const copy = useCallback(async () => {
    if (!picked) return;
    const d = describe(picked);
    const block = [
      d.slide,
      `Element: ${d.path}`,
      d.text && `Text: "${d.text}"`,
      `Comment: ${note.trim() || '(none)'}`,
    ].filter(Boolean).join('\n');
    const ok = await copyText(block);
    setToast(ok ? 'Copied — paste it to Claude or Codex' : 'Copy failed');
    cancel();
  }, [picked, note, describe, cancel]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // Esc backs out one level: selection first, then comment mode itself.
  // Alt+Up / Alt+Down walk the selection to its parent / first child — with a
  // modifier so they work while the note has focus, which it does on pick.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (picked) cancel(); else onExit();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        copy();
        return;
      }
      if (!picked || !e.altKey) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const up = picked.parentElement;
        if (up && up !== slideOf(picked)) setPicked(up);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (picked.firstElementChild) setPicked(picked.firstElementChild);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, cancel, copy, onExit]);

  const info = picked ? describe(picked) : null;
  // Under the box, else above it, else — a box taller than the window allows
  // either — inside its top edge. Clamped horizontally to stay on screen.
  let popStyle;
  if (pickedRect) {
    const below = pickedRect.bottom + 8;
    let vertical;
    if (below + POP_HEIGHT < window.innerHeight) vertical = { top: below };
    else if (pickedRect.top - 8 - POP_HEIGHT > 0) {
      vertical = { bottom: window.innerHeight - pickedRect.top + 8 };
    } else {
      vertical = { top: Math.max(8, Math.min(pickedRect.top + 8, window.innerHeight - POP_HEIGHT)) };
    }
    popStyle = {
      left: Math.max(8, Math.min(pickedRect.left, window.innerWidth - POP_WIDTH - 8)),
      width: POP_WIDTH,
      ...vertical,
    };
  }

  return (
    <>
      {hoverRect && <div className="inspector-box" style={boxStyle(hoverRect)} />}
      {pickedRect && <div className="inspector-box is-picked" style={boxStyle(pickedRect)} />}
      {info && popStyle && (
        <div className="inspector-pop" style={popStyle}>
          <div className="ip-slide">{info.slide}</div>
          <code className="ip-path">{info.path}</code>
          {info.text && <div className="ip-text">“{info.text}”</div>}
          <textarea
            // The popover mounts a render after the pick (it waits on the
            // measured rect), so focus on mount rather than in an effect.
            autoFocus
            className="ip-note"
            rows={3}
            placeholder="What should change here?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="ip-actions">
            <span className="ip-keys">
              <kbd>⌥↑</kbd><kbd>⌥↓</kbd> parent / child · <kbd>esc</kbd>
            </span>
            <button type="button" className="ip-btn" onClick={cancel}>Cancel</button>
            <button type="button" className="ip-btn is-primary" onClick={copy}>
              Copy <kbd>⌘↵</kbd>
            </button>
          </div>
        </div>
      )}
      {toast && <div className="inspector-toast">{toast}</div>}
    </>
  );
}
