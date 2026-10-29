import { Component as ReactComponent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { countWords, overflowPx, overlapPx, spillPx, WORD_BUDGET } from '../components/DevBar.jsx';
import session from './takes/index.js';
import { applyPageFormat, PAGE } from '../components/page.js';

// The slide lab: rival takes on one page, shown one at a time at full size
// (Focus) or stacked for scrolling (Compare), so you can judge them, mark each
// one and send the verdicts back to the agent. See
// .claude/skills/slide-lab/SKILL.md for the loop this page serves.
//
// Routes (URL hash):
//   (none)          the board: Focus or Compare, verdicts and notes
//   #solo=<id>      one take at 1:1 with no chrome, for screenshots
//   #audit[=a,b]    every take (or just those) at 1:1 plus a text report, for scripts/lab.sh

applyPageFormat();

// A take that doesn't compile shows its error in its own place on the board
// (Broken, below). Vite's full-page overlay would hide the takes that work
// while a subagent is still writing one, so drop it for take files only.
import.meta.hot?.on('vite:error', ({ err }) => {
  if (!/\/src\/lab\/takes\//.test(err?.id ?? err?.loc?.file ?? '')) return;
  requestAnimationFrame(() => document.querySelectorAll('vite-error-overlay').forEach((el) => el.remove()));
});

const SLIDE_W = PAGE.w;
const SLIDE_H = PAGE.h;
const { slug, round, brief, identity, mode = 'default', reference = [], takes } = session;
const STORE = `lab:${slug}:r${round}`;
const ALL = [...takes, ...reference];

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

// Each take is its own module, loaded on its own: one that doesn't compile
// breaks only itself, and `pnpm lab <id>` imports just that take, so
// subagents writing takes in parallel can each check theirs (SL-98).
// Reference pages are the deck's own slides, imported as Component.
// The browser only says "Failed to fetch dynamically imported module"; Vite's
// error page for that module says why (the parse error and where).
async function why(err) {
  const url = /imported module: (\S+)/.exec(err?.message ?? '')?.[1];
  try {
    const page = url && await (await fetch(url)).text();
    const json = page && /const error = (\{.*\})/.exec(page)?.[1];
    if (json) return JSON.parse(json).message.trim();
  } catch { /* fall through to the browser's message */ }
  return err?.message || String(err);
}

function useLoaded(list) {
  const [mods, setMods] = useState(() => Object.fromEntries(
    list.filter((x) => x.Component).map((x) => [x.id, { Component: x.Component }]),
  ));
  useEffect(() => {
    let live = true;
    for (const x of list) {
      if (!x.load) continue;
      x.load().then(
        (m) => live && setMods((s) => ({ ...s, [x.id]: { Component: m.default } })),
        (err) => why(err).then((error) => live && setMods((s) => ({ ...s, [x.id]: { error } }))),
      );
    }
    return () => { live = false; };
  }, [list]);
  return mods;
}

// A take that throws while rendering shows its error instead of taking the
// board down with it.
class Guard extends ReactComponent {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error ? <Broken message={this.state.error.message} /> : this.props.children;
  }
}

function Broken({ message }) {
  return (
    <div className="lab-broken" data-broken={message} style={{ width: SLIDE_W, height: SLIDE_H }}>
      <b>This take is broken.</b> {message}
    </div>
  );
}

function Slide({ take, mod }) {
  if (!mod) return null;
  if (mod.error) return <Broken message={mod.error} />;
  const { Component } = mod;
  const { props = {} } = take;
  return (
    <Guard>
      <Component appendixLabel={take.label ?? 'A1'} pageNumber={take.label ?? 'A1'} {...props} />
    </Guard>
  );
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
        const broken = wrap.querySelector('[data-broken]');
        const slide = wrap.querySelector('.slide');
        // One line, so the report stays one take per line for scripts/lab.sh.
        if (broken) next[wrap.dataset.take] = { words: 0, flags: [`BROKEN(${broken.dataset.broken.replace(/\s+/g, ' ')})`] };
        else if (slide) next[wrap.dataset.take] = measure(slide);
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

// Keys pick a verdict on the take in view (Focus) or last jumped to (Compare).
const VERDICTS = [
  ['pick', 'Pick', 'p'],
  ['maybe', 'Keep going', 'k'],
  ['cut', 'Cut', 'x'],
];

// Slide widths for Compare's size control: S puts two or more takes on a
// laptop screen at once; L reads like the PDF.
const SIZES = [['S', 500], ['M', 800], ['L', 1040]];
const VIEWS = [['focus', 'Focus'], ['compare', 'Compare']];

// Renders a page (PAGE.w × PAGE.h) at a given width.
function Fit({ width, children }) {
  const zoom = width / SLIDE_W;
  return (
    <div className="lab-fit" style={{ width, height: SLIDE_H * zoom }}>
      <div style={{ zoom }}>{children}</div>
    </div>
  );
}

function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

function TakeTitle({ t }) {
  return (
    <h2>
      {t.key && <span className="lab-key">{t.key}</span>}
      {t.key ? t.name : `Today: ${t.name}`}
      {t.axis && <span className="lab-axis">{t.axis}</span>}
    </h2>
  );
}

function VerdictButtons({ v, onPick }) {
  return (
    <div className="lab-verdict" role="group" aria-label="Verdict">
      {VERDICTS.map(([k, label, hot]) => (
        <button
          type="button" key={k} className={v.verdict === k ? 'is-on' : ''} title={`${label} (${hot.toUpperCase()})`}
          onClick={() => onPick(v.verdict === k ? '' : k)}
        >{label}</button>
      ))}
    </div>
  );
}

// What the board shows beside a take: its idea, health, verdict and note.
function TakeNotes({ t, v, h, setTake, rows = 5 }) {
  if (!t.key) return <p className="lab-idea">The deck today, for reference.</p>;
  return (
    <>
      <Health h={h} />
      <p className="lab-idea">{t.idea}</p>
      {t.changes && <p className="lab-changes"><b>This round:</b> {t.changes}</p>}
      <VerdictButtons v={v} onPick={(verdict) => setTake(t.id, { verdict })} />
      <textarea
        className="lab-note" rows={rows} value={v.note ?? ''} aria-label={`Notes on take ${t.key}`}
        placeholder="What works, what doesn’t, what to borrow from another take…"
        onChange={(e) => setTake(t.id, { note: e.target.value })}
      />
    </>
  );
}

function GeneralNote({ fb, setFb, rows = 2 }) {
  return (
    <textarea
      className="lab-note lab-general" rows={rows} value={fb.general} aria-label="Notes across all takes"
      placeholder="Notes across all takes: mix-and-match (“A’s strip with C’s band”), or anything that applies to every take"
      onChange={(e) => setFb((f) => ({ ...f, general: e.target.value }))}
    />
  );
}

// One page at a time, as large as the window allows: the way it will be
// presented. ←/→ and the number keys switch, R shows the page today.
function Focus({ current, mods, health, fb, setFb, setTake }) {
  const stageRef = useRef(null);
  const box = useBox(stageRef);
  const t = ALL.find((x) => x.id === current);
  const width = Math.floor(Math.min(box.w, box.h * (SLIDE_W / SLIDE_H)));
  const v = (t && fb.takes[t.id]) ?? {};
  return (
    <main className="lab-focus">
      <div className="lab-stage" ref={stageRef}>
        {t && width > 0 && (
          <div className={`lab-slide${v.verdict ? ` is-${v.verdict}` : ''}`}>
            <Fit width={width}><Slide take={t} mod={mods[t.id]} /></Fit>
          </div>
        )}
      </div>
      {t && (
        <aside className="lab-side">
          <TakeTitle t={t} />
          <TakeNotes t={t} v={v} h={health[t.id]} setTake={setTake} rows={6} />
          <GeneralNote fb={fb} setFb={setFb} rows={4} />
          <p className="lab-keys">
            <kbd>←</kbd><kbd>→</kbd> or <kbd>1</kbd>–<kbd>{Math.max(takes.length, 1)}</kbd> switch
            {reference.length > 0 && <> · <kbd>R</kbd> today</>}
            {' '}· <kbd>P</kbd> <kbd>K</kbd> <kbd>X</kbd> verdict · <kbd>G</kbd> compare
          </p>
        </aside>
      )}
    </main>
  );
}

// Every take stacked down one scrolling page, notes beside each, so several
// can be read at once. Today's pages follow, for reference.
function Compare({ mods, health, fb, setTake, width }) {
  return (
    <main className="lab-list">
      {ALL.map((t) => {
        const v = fb.takes[t.id] ?? {};
        return (
          <section key={t.id} id={`take-${t.id}`} className={`lab-row${v.verdict ? ` is-${v.verdict}` : ''}${t.key ? '' : ' is-ref'}`}>
            <div className="lab-slide"><Fit width={width}><Slide take={t} mod={mods[t.id]} /></Fit></div>
            <aside className="lab-side">
              <TakeTitle t={t} />
              <TakeNotes t={t} v={v} h={health[t.id]} setTake={setTake} />
            </aside>
          </section>
        );
      })}
    </main>
  );
}

function Board() {
  const measureRef = useRef(null);
  const mods = useLoaded(ALL);
  const health = useHealth(measureRef);
  const [view, setView] = useState(() => read('lab:view', 'focus'));
  const [size, setSize] = useState(() => read('lab:size', 'M'));
  const [current, setCurrent] = useState(() => ALL[0]?.id);
  const [fb, setFb] = useState(() => read(STORE, { general: '', takes: {} }));
  const [status, setStatus] = useState('');

  useEffect(() => write('lab:view', view), [view]);
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

  const go = (id) => {
    setCurrent(id);
    if (view === 'compare') document.getElementById(`take-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Latest state for the key handler, which is bound once.
  const keys = useRef();
  keys.current = { current, view, fb, go, setTake };
  useEffect(() => {
    const on = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('textarea, input, select')) return;
      const { current, view, fb, go, setTake } = keys.current;
      const i = ALL.findIndex((x) => x.id === current);
      const k = e.key.toLowerCase();
      const verdict = VERDICTS.find(([, , hot]) => hot === k)?.[0];
      if (k === 'arrowright' || k === 'arrowleft') {
        if (!ALL.length) return;
        go(ALL[(i + (k === 'arrowright' ? 1 : -1) + ALL.length) % ALL.length].id);
      } else if (/^[1-9]$/.test(k) && takes[k - 1]) go(takes[k - 1].id);
      else if ((k === 'r' || k === '0') && reference.length) go(reference[0].id);
      else if (k === 'g') setView(view === 'focus' ? 'compare' : 'focus');
      else if (verdict && takes.some((x) => x.id === current)) {
        setTake(current, { verdict: fb.takes[current]?.verdict === verdict ? '' : verdict });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const send = async () => {
    const body = {
      slug, round, sentAt: new Date().toISOString(), general: fb.general,
      takes: takes.map((t) => ({
        id: t.id, key: t.key, name: t.name, axis: t.axis ?? '',
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

  const marked = takes.filter((x) => fb.takes[x.id]?.verdict).length;

  return (
    <div className={`lab is-${view}`}>
      <header className="lab-bar">
        <div>
          <span className="lab-round">Slide lab · round {round}</span>
          <h1>{brief.title}</h1>
          <p>{brief.ask}</p>
          {identity && <p className="lab-identity"><b>{mode === 'departure' ? 'Departing from:' : 'Holding:'}</b> {identity}</p>}
        </div>
        <div className="lab-bar-tools">
          <span className="lab-seg" role="group" aria-label={view === 'focus' ? 'Show' : 'Jump to'}>
            {ALL.map((x) => (
              <button
                type="button" key={x.id} title={x.name} onClick={() => go(x.id)}
                className={`is-${fb.takes[x.id]?.verdict || 'none'}${x.key ? '' : ' is-ref'}${view === 'focus' && x.id === current ? ' is-on' : ''}`}
              >{x.key ?? `now ${x.label}`}</button>
            ))}
          </span>
          <span className="lab-seg" role="group" aria-label="View">
            {VIEWS.map(([k, label]) => (
              <button type="button" key={k} className={k === view ? 'is-on' : ''} onClick={() => setView(k)}>{label}</button>
            ))}
          </span>
          {view === 'compare' && (
            <span className="lab-seg" role="group" aria-label="Slide size">
              {SIZES.map(([k]) => (
                <button type="button" key={k} className={k === size ? 'is-on' : ''} onClick={() => setSize(k)}>{k}</button>
              ))}
            </span>
          )}
          <button type="button" className="lab-send" onClick={send}>Send to agent</button>
          <span className="lab-status">{status || `${marked} of ${takes.length} marked`}</span>
        </div>
        {/* In Compare's sticky bar, so it stays in reach while scrolling; Focus has it beside the page. */}
        {view === 'compare' && <GeneralNote fb={fb} setFb={setFb} />}
      </header>

      {takes.length === 0 && <p className="lab-idea">No takes in this session. Ask your agent for some (/slide-lab).</p>}

      {view === 'focus'
        ? <Focus current={current} mods={mods} health={health} fb={fb} setFb={setFb} setTake={setTake} />
        : <Compare mods={mods} health={health} fb={fb} setTake={setTake} width={width} />}

      {/* 1:1 renders, offscreen, for the fit checks. */}
      <div className="lab-measure" ref={measureRef} aria-hidden="true">
        {takes.map((x) => <div key={x.id} data-take={x.id}><Slide take={x} mod={mods[x.id]} /></div>)}
      </div>
    </div>
  );
}

function Solo({ id }) {
  const [list] = useState(() => ALL.filter((x) => x.id === id));
  const mods = useLoaded(list);
  useEffect(() => { document.body.classList.add('lab-solo'); }, []);
  return list[0] ? <Slide take={list[0]} mod={mods[id]} /> : <p style={{ color: '#fff' }}>No take “{id}”.</p>;
}

function AuditView({ ids }) {
  const ref = useRef(null);
  const [list] = useState(() => (ids.length ? takes.filter((t) => ids.includes(t.id)) : takes));
  const mods = useLoaded(list);
  const health = useHealth(ref);
  useEffect(() => { document.body.classList.add('lab-solo'); }, []);
  const unknown = ids.filter((id) => !takes.some((t) => t.id === id));
  const done = list.every((t) => health[t.id]);
  const report = done
    ? [
      `LAB  ${slug}  round ${round}  ${list.length} takes`
        + (document.fonts.status === 'loaded' ? '' : '  FONTS-PENDING (numbers unreliable)'),
      ...list.map((t) => `${t.id.padEnd(12)} ${String(health[t.id].words).padStart(4)}  ${health[t.id].flags.join(' ') || 'ok'}`),
      ...unknown.map((id) => `${id.padEnd(12)}    -  UNKNOWN (no take with this id)`),
    ].join('\n')
    : 'measuring…';
  return (
    <>
      <pre id="lab-audit">{report}</pre>
      <div ref={ref}>{list.map((t) => <div key={t.id} data-take={t.id}><Slide take={t} mod={mods[t.id]} /></div>)}</div>
    </>
  );
}

export default function LabApp() {
  const hash = useHash();
  // The deck's preview zoom is not used here; Fit and the overlay zoom instead.
  useEffect(() => { document.documentElement.style.setProperty('--preview-scale', '1'); }, []);
  if (hash.startsWith('#solo=')) return <Solo id={decodeURIComponent(hash.slice(6))} />;
  if (hash.startsWith('#audit')) {
    const ids = decodeURIComponent(hash.slice(7)).split(',').filter(Boolean);
    return <AuditView ids={ids} />;
  }
  return <Board />;
}
