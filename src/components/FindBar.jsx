import { useCallback, useEffect, useRef, useState } from 'react';
import { devbarHeight } from './DevBar.jsx';

// Find in the deck: ⌘F / Ctrl+F in the preview. The browser's own find works
// too, but it parks every match behind the fixed dev bar and searches the bar's
// chips along with the slides. This one searches slide text only.
//
// Matches are painted with the CSS Custom Highlight API rather than by wrapping
// them in <mark>: the slides' DOM is never touched, so the word counts, the
// overflow checks and the Inspector's element paths all see the page exactly
// as it prints.

const SLIDES = '#root > .slide';

// Every match of `query` in one slide, as Ranges. The slide's text nodes are
// joined first so a match can cross an inline boundary — a bold run inside a
// sentence is its own text node.
function matchesIn(slideEl, query) {
  const walker = document.createTreeWalker(slideEl, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let text = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n, start: text.length });
    text += n.textContent;
  }
  const at = (offset) => {
    let i = nodes.length - 1;
    while (i > 0 && nodes[i].start > offset) i -= 1;
    return [nodes[i].node, offset - nodes[i].start];
  };
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  const out = [];
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
    const range = document.createRange();
    range.setStart(...at(i));
    // End is exclusive, so look up the last character and step past it; the
    // node holding offset i + length may be the next one, which starts there.
    const [endNode, endOffset] = at(i + needle.length - 1);
    range.setEnd(endNode, endOffset + 1);
    out.push(range);
  }
  return out;
}

function search(query) {
  if (!query) return [];
  return Array.from(document.querySelectorAll(SLIDES), (slide, index) => (
    matchesIn(slide, query).map((range) => ({ range, index }))
  )).flat();
}

// Puts a match in the middle of the visible area below the bar. window.scrollTo
// works in viewport pixels, so the slides' CSS zoom needs no correction.
function reveal(range) {
  const r = range.getBoundingClientRect();
  const bar = devbarHeight();
  const mid = bar + (window.innerHeight - bar) / 2;
  window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - mid, behavior: 'auto' });
}

const supported = typeof CSS !== 'undefined' && 'highlights' in CSS;

export default function FindBar({ slides, pages, apx, onExit }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef(null);

  const run = useCallback(() => {
    setHits(search(query));
  }, [query]);

  useEffect(() => {
    run();
    setCurrent(0);
  }, [run]);

  // Saving a slide file hot-reloads it and leaves the old Ranges pointing at
  // detached nodes, so search again when slide content changes. Mutations
  // inside the bar itself (this component's counter) are ignored, or every
  // search would trigger the next.
  useEffect(() => {
    const root = document.getElementById('root');
    const mo = new MutationObserver((records) => {
      const inSlides = (r) => {
        const el = r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement;
        return el && !el.closest('.devbar');
      };
      if (records.some(inSlides)) run();
    });
    mo.observe(root, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [run]);

  const at = hits.length ? Math.min(current, hits.length - 1) : -1;

  useEffect(() => {
    if (!supported) return undefined;
    const others = hits.filter((_, i) => i !== at).map((h) => h.range);
    CSS.highlights.set('find', new Highlight(...others));
    if (at >= 0) CSS.highlights.set('find-current', new Highlight(hits[at].range));
    else CSS.highlights.delete('find-current');
    return () => {
      CSS.highlights.delete('find');
      CSS.highlights.delete('find-current');
    };
  }, [hits, at]);

  useEffect(() => {
    if (at >= 0) reveal(hits[at].range);
  }, [hits, at]);

  // Pressing ⌘F again while the bar is open is DevBar's job: it reselects the
  // field by class name.
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const step = (dir) => {
    if (!hits.length) return;
    setCurrent((c) => (Math.min(c, hits.length - 1) + dir + hits.length) % hits.length);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      // Stop it reaching comment mode's Esc handler on window.
      e.preventDefault();
      e.stopPropagation();
      onExit();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  };

  const hit = at >= 0 ? hits[at] : null;
  const where = hit
    ? (() => {
      const s = slides[hit.index];
      return `${apx?.get(s.id) ?? pages.get(s.id) ?? s.kind} · ${s.title}`;
    })()
    : '';

  return (
    <div className="findbar">
      <input
        ref={inputRef}
        className="fb-input"
        type="text"
        placeholder="Find in slides"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="fb-count">
        {query ? (hits.length ? `${at + 1} of ${hits.length}` : 'No matches') : ''}
      </span>
      <button type="button" className="ip-btn" title="previous (⇧↩)" onClick={() => step(-1)} disabled={!hits.length}>↑</button>
      <button type="button" className="ip-btn" title="next (↩)" onClick={() => step(1)} disabled={!hits.length}>↓</button>
      <button type="button" className="ip-btn" title="close (esc)" onClick={onExit}>×</button>
      {where && <span className="fb-where" title={where}>{where}</span>}
      {!supported && <span className="fb-where">Highlighting needs a newer browser</span>}
    </div>
  );
}
