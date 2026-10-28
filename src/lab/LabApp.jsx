import { useEffect, useRef, useState } from 'react';
import { countWords, overflowPx, overlapPx, spillPx, WORD_BUDGET } from '../components/DevBar.jsx';
import session from './takes/index.js';
import { applyPageFormat, PAGE } from '../components/page.js';

// The slide lab: rival takes on one page, stacked for scrolling, so you can compare
// them, mark each one and send the verdicts back to the agent. See
// .claude/skills/slide-lab/SKILL.md for the loop this page serves.
//
// Routes (URL hash):
//   (none)        the board: every take down one page, verdicts and notes
//   #solo=<id>    one take at 1:1 with no chrome, for screenshots
//   #audit        every take at 1:1 plus a text report, for scripts/lab.sh

applyPageFormat();

const SLIDE_W = PAGE.w;
const SLIDE_H = PAGE.h;
const { slug, round, brief, reference = [], takes } = session;
const STORE = `lab:${slug}:r${round}`;

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window */ }
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function Slide({ take }) {
  const { Component, props = {} } = take;
  return <Component appendixLabel={take.label ?? 'A1'} pageNumber={take.label ?? 'A1'} {...props} />;
}

// The deck's own checks, run on a 1:1 render: a zoomed one reflows and
// measures a page the PDF never prints (see App.jsx).
function measure(el) {
  const words = countWords(el);
  const flags = [
    words > WORD_BUDGET ? `WORDY(${words}>${WORD_BUDGET})` : '',
    overflowPx(el) > 2 ? `CLIPPED(+${overflowPx(el)}px)` : '',
    spillPx(el) > 2 ? `SPILL(+${spillPx(el)}px)` : '',
    overlapPx(el) > 2 ? `OVERLAP(+${overlapPx(el)}px)` : '',
  ].filter(Boolean);
  return { words, flags };
}

function useHealth(rootRef) {
  const [health, setHealth] = useState({});
  useEffect(() => {
    let id = 0;
    let tries = 0;
    const run = () => {
      if (document.fonts.status !== 'loaded' && tries++ < 100) {
        id = setTimeout(run, 16);
        return;
      }
      const next = {};
      rootRef.current?.querySelectorAll('[data-take]').forEach((wrap) => {
        const slide = wrap.querySelector('.slide');
        if (slide) next[wrap.dataset.take] = measure(slide);
      });
      setHealth((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    id = setTimeout(run, 16);
    return () => clearTimeout(id);
  });
  return health;
}

function Health({ h }) {
  if (!h) return <span className="lab-health">measuring…</span>;
  return h.flags.length
    ? <span className="lab-health is-bad">{h.flags.join(' ')}</span>
    : <span className="lab-health is-ok">fits · {h.words} words</span>;
}

const VERDICTS = [
  ['pick', 'Pick'],
  ['maybe', 'Keep going'],
  ['cut', 'Cut'],
];

// Slide widths for the size control: S puts two or more takes on a laptop
// screen at once; L reads like the PDF.
const SIZES = [['S', 500], ['M', 800], ['L', 1040]];

// Renders a page (PAGE.w × PAGE.h) at a given width.
function Fit({ width, children }) {
  const zoom = width / SLIDE_W;
  return (
    <div className="lab-fit" style={{ width, height: SLIDE_H * zoom }}>
      <div style={{ zoom }}>{children}</div>
    </div>
  );
}

// Every take stacked down one scrolling page, notes beside each, so several
// can be read at once. Today's pages follow, for reference.
function Board() {
  const measureRef = useRef(null);
  const health = useHealth(measureRef);
  const [size, setSize] = useState(() => read('lab:size', 'M'));
  const [fb, setFb] = useState(() => read(STORE, { general: '', takes: {} }));
  const [status, setStatus] = useState('');

  useEffect(() => write('lab:size', size), [size]);
  useEffect(() => write(STORE, fb), [fb]);

  const width = SIZES.find(([k]) => k === size)?.[1] ?? 800;

  const setTake = (id, patch) => setFb((f) => {
    const nextTakes = { ...f.takes };
    // One pick at a time: picking a take moves the old pick to "keep going".
    if (patch.verdict === 'pick') {
      for (const k of Object.keys(nextTakes)) {
        if (nextTakes[k]?.verdict === 'pick') nextTakes[k] = { ...nextTakes[k], verdict: 'maybe' };
      }
    }
    nextTakes[id] = { ...nextTakes[id], ...patch };
    return { ...f, takes: nextTakes };
  });

  const send = async () => {
    const body = {
      slug, round, sentAt: new Date().toISOString(), general: fb.general,
      takes: takes.map((t) => ({
        id: t.id, key: t.key, name: t.name,
        verdict: fb.takes[t.id]?.verdict ?? '', note: fb.takes[t.id]?.note ?? '',
        health: health[t.id] ?? null,
      })),
    };
    setStatus('Sending…');
    try {
      const res = await fetch('/__lab/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body, null, 2),
      });
      if (!res.ok) throw new Error(res.statusText);
      setStatus(`Sent ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Tell your agent “lab feedback”.`);
    } catch {
      setStatus('Could not reach the dev server. Is pnpm dev running?');
    }
  };

  const jump = (id) => document.getElementById(`take-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const marked = takes.filter((x) => fb.takes[x.id]?.verdict).length;

  return (
    <div className="lab">
      <header className="lab-bar">
        <div>
          <span className="lab-round">Slide lab · round {round}</span>
          <h1>{brief.title}</h1>
          <p>{brief.ask}</p>
        </div>
        <div className="lab-bar-tools">
          <span className="lab-seg" role="group" aria-label="Jump to">
            {[...takes, ...reference].map((x) => (
              <button
                type="button" key={x.id} title={x.name} onClick={() => jump(x.id)}
                className={`is-${fb.takes[x.id]?.verdict || 'none'}${x.label && !x.key ? ' is-ref' : ''}`}
              >{x.key ?? `now ${x.label}`}</button>
            ))}
          </span>
          <span className="lab-seg" role="group" aria-label="Slide size">
            {SIZES.map(([k]) => (
              <button type="button" key={k} className={k === size ? 'is-on' : ''} onClick={() => setSize(k)}>{k}</button>
            ))}
          </span>
          <button type="button" className="lab-send" onClick={send}>Send to agent</button>
          <span className="lab-status">{status || `${marked} of ${takes.length} marked`}</span>
        </div>
        {/* In the sticky bar, so it stays in reach while scrolling. */}
        <textarea
          className="lab-note lab-general" rows={2} value={fb.general} aria-label="Notes across all takes"
          placeholder="Notes across all takes: mix-and-match (“A’s strip with C’s band”), or anything that applies to every take"
          onChange={(e) => setFb((f) => ({ ...f, general: e.target.value }))}
        />
      </header>

      {takes.length === 0 && <p className="lab-idea">No takes in this session. Ask your agent for some (/slide-lab).</p>}

      <main className="lab-list">
        {takes.map((t) => {
          const v = fb.takes[t.id] ?? {};
          return (
            <section key={t.id} id={`take-${t.id}`} className={`lab-row${v.verdict ? ` is-${v.verdict}` : ''}`}>
              <div className="lab-slide"><Fit width={width}><Slide take={t} /></Fit></div>
              <aside className="lab-side">
                <h2><span className="lab-key">{t.key}</span>{t.name}</h2>
                <Health h={health[t.id]} />
                <p className="lab-idea">{t.idea}</p>
                {t.changes && <p className="lab-changes"><b>This round:</b> {t.changes}</p>}
                <div className="lab-verdict" role="group" aria-label="Verdict">
                  {VERDICTS.map(([k, label]) => (
                    <button
                      type="button" key={k} className={v.verdict === k ? 'is-on' : ''}
                      onClick={() => setTake(t.id, { verdict: v.verdict === k ? '' : k })}
                    >{label}</button>
                  ))}
                </div>
                <textarea
                  className="lab-note" rows={5} value={v.note ?? ''}
                  placeholder="What works, what doesn’t, what to borrow from another take…"
                  onChange={(e) => setTake(t.id, { note: e.target.value })}
                />
              </aside>
            </section>
          );
        })}


        {reference.map((r) => (
          <section key={r.id} id={`take-${r.id}`} className="lab-row is-ref">
            <div className="lab-slide"><Fit width={width}><Slide take={r} /></Fit></div>
            <aside className="lab-side">
              <h2>{r.name}</h2>
              <p className="lab-idea">The deck today, for reference.</p>
            </aside>
          </section>
        ))}
      </main>

      {/* 1:1 renders, offscreen, for the fit checks. */}
      <div className="lab-measure" ref={measureRef} aria-hidden="true">
        {takes.map((x) => <div key={x.id} data-take={x.id}><Slide take={x} /></div>)}
      </div>
    </div>
  );
}

function Solo({ id }) {
  const t = [...takes, ...reference].find((x) => x.id === id);
  useEffect(() => { document.body.classList.add('lab-solo'); }, []);
  return t ? <Slide take={t} /> : <p style={{ color: '#fff' }}>No take “{id}”.</p>;
}

function AuditView() {
  const ref = useRef(null);
  const health = useHealth(ref);
  useEffect(() => { document.body.classList.add('lab-solo'); }, []);
  const done = takes.every((t) => health[t.id]);
  const report = done
    ? [
      `LAB  ${slug}  round ${round}  ${takes.length} takes`
        + (document.fonts.status === 'loaded' ? '' : '  FONTS-PENDING (numbers unreliable)'),
      ...takes.map((t) => `${t.id.padEnd(12)} ${String(health[t.id].words).padStart(4)}  ${health[t.id].flags.join(' ') || 'ok'}`),
    ].join('\n')
    : 'measuring…';
  return (
    <>
      <pre id="lab-audit">{report}</pre>
      <div ref={ref}>{takes.map((t) => <div key={t.id} data-take={t.id}><Slide take={t} /></div>)}</div>
    </>
  );
}

export default function LabApp() {
  const hash = useHash();
  // The deck's preview zoom is not used here; Fit and the overlay zoom instead.
  useEffect(() => { document.documentElement.style.setProperty('--preview-scale', '1'); }, []);
  if (hash.startsWith('#solo=')) return <Solo id={decodeURIComponent(hash.slice(6))} />;
  if (hash.startsWith('#audit')) return <AuditView />;
  return <Board />;
}
