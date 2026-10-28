#!/usr/bin/env node
// The agent's inner loop: the audit report and screenshots of the pages
// asked for, in one call, warm (SL-66).
//
//   pnpm check              -> audit, and shoot every page
//   pnpm check 2 A1 @1      -> audit, and shoot those pages (label or @position)
//   pnpm check --changed    -> audit, and shoot the pages `git diff` touches
//   SCALE=2 pnpm check 2    -> shots at 2x
//   pnpm check --stop       -> stop this worktree's warm Chrome
//   pnpm map [--json]       -> (check --map) print the deck map, no shots
//
// Every call also writes the deck map, output/map.md and output/map.json
// (scripts/deck-map.mjs): each page's label, title, files, content keys,
// words and audit status. A call that shoots also writes each printed page's
// text to output/text.json (read by scripts/ask.mjs).
//
// It measures the running `pnpm dev` when there is one for this checkout
// (.sl-ide/dev.json, confirmed through /__sl-ide/root); otherwise it builds
// dist/ if a source is newer and serves it on a free port. One Chrome per
// worktree stays up between calls (scripts/check-chrome.mjs) and exits after
// 10 idle minutes. The audit is always the whole deck. It exits 1 on the same
// flags as `pnpm run audit`, which stays the gate before a push and in CI.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { changedPages } from './deck-files.mjs';
import { deckMap, mapText } from './deck-map.mjs';
import { serve } from './serve.mjs';

const root = path.resolve(import.meta.dirname, '..');
const state = process.env.SL_IDE_CHECK_STATE ?? path.join(root, '.sl-ide');
const chromeFile = path.join(state, 'chrome.json');
const GATE = /CLIPPED|WORDY|SPILL|OVERLAP|LONG|FONTS-PENDING/;
const started = performance.now();

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const wanted = args.filter((a) => !a.startsWith('--'));
const known = ['--changed', '--stop', '--map', '--json'];
if ([...flags].some((f) => !known.includes(f)) || (flags.has('--changed') && wanted.length)
  || (flags.has('--json') && !flags.has('--map')) || (flags.has('--map') && (wanted.length || flags.has('--changed')))) {
  console.error('usage: pnpm check [labels... | --changed] | pnpm check --stop | pnpm map [--json]');
  process.exit(2);
}

setTimeout(() => { console.error('error: check timed out'); process.exit(1); }, 90_000).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
};
const text = (url) => fetch(url, { signal: AbortSignal.timeout(1000) })
  .then((r) => (r.ok ? r.text() : null), () => null);

if (flags.has('--stop')) {
  const c = readJson(chromeFile);
  if (!c || !alive(c.pid)) {
    console.log('no warm Chrome for this checkout');
    process.exit(0);
  }
  process.kill(c.pid, 'SIGTERM');
  for (let i = 0; i < 100 && alive(c.pid); i += 1) await sleep(50);
  console.log('stopped the warm Chrome');
  process.exit(0);
}

// --- what to measure: this checkout's dev server, or its dist/ ------------

async function devServer() {
  const dev = readJson(path.join(state, 'dev.json'));
  if (!dev || !alive(dev.pid)) return null;
  const origin = `http://localhost:${dev.port}`;
  if (await text(`${origin}/__sl-ide/root`) !== fs.realpathSync(root)) return null;
  return { url: `${origin}/`, what: `pnpm dev on :${dev.port}` };
}

function newest(p) {
  const stat = fs.statSync(p, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return stat?.mtimeMs ?? 0;
  return Math.max(0, ...fs.readdirSync(p).map((f) => newest(path.join(p, f))));
}

// A process-owned directory protects the build and Chrome startup sections.
// Unique markers let dead owners be cleared without deleting a new owner.
async function lockDirectory(lock) {
  const parent = path.dirname(lock);
  fs.mkdirSync(parent, { recursive: true });
  const prepared = fs.mkdtempSync(path.join(parent, `${path.basename(lock)}-pending-`));
  const marker = `owner-${process.pid}-${randomUUID()}`;
  fs.writeFileSync(path.join(prepared, marker), '');
  const removeMarker = (dir, name) => {
    try { fs.unlinkSync(path.join(dir, name)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    // Never remove recursively: a new owner may already have replaced the
    // empty directory, in which case its unique marker keeps it non-empty.
    try { fs.rmdirSync(dir); } catch (err) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(err.code)) throw err; }
  };
  try {
    for (;;) {
      try {
        // The prepared directory is already non-empty when published, so
        // another caller can never mistake a live acquisition for stale state.
        fs.renameSync(prepared, lock);
        return () => removeMarker(lock, marker);
      } catch (err) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(err.code) && !(err.code === 'EPERM' && fs.existsSync(lock))) throw err;
      }
      let owners;
      try { owners = fs.readdirSync(lock); } catch (err) {
        if (err.code === 'ENOENT') continue;
        throw err;
      }
      if (!owners.length) removeMarker(lock, marker);
      for (const name of owners) {
        const owner = /^owner-(\d+)-/.exec(name);
        if (!owner) throw new Error(`invalid ${path.basename(lock)} owner`);
        if (!alive(Number(owner[1]))) removeMarker(lock, name);
      }
      await sleep(50);
    }
  } finally {
    if (fs.existsSync(prepared)) removeMarker(prepared, marker);
  }
}

// Fallback checks hold dist/ through measurement, so another build cannot
// remove the files that their server is using.
async function dist() {
  const release = await lockDirectory(path.join(root, '.sl-ide/check-dist.lock'));
  try {
    const dir = path.join(root, 'dist');
    const built = fs.statSync(path.join(dir, 'index.html'), { throwIfNoEntry: false })?.mtimeMs ?? 0;
    const inputs = ['src', 'public', 'index.html', 'lab.html', 'vite.config.js', 'package.json'];
    const fresh = built > 0 && inputs.every((f) => newest(path.join(root, f)) < built);
    if (!fresh) {
      execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'warn'],
        { cwd: root, stdio: ['ignore', 2, 2] });
    }
    const server = await serve(dir);
    return { url: `http://127.0.0.1:${server.address().port}/index.html`, what: fresh ? 'dist/' : 'a fresh build of dist/', server, release };
  } catch (err) {
    release();
    throw err;
  }
}

// --- the warm Chrome --------------------------------------------------------

function findChrome() {
  const onPath = (name) => (process.env.PATH ?? '').split(path.delimiter).map((d) => path.join(d, name));
  const found = [process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ...['google-chrome', 'chromium', 'chromium-browser'].flatMap(onPath),
    path.join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers', 'chromium'),
  ].find((c) => c && fs.statSync(c, { throwIfNoEntry: false })?.isFile());
  if (!found) throw new Error('Chrome not found (set CHROME=/path/to/chrome)');
  return found;
}

async function devtools() {
  // Validate only after acquiring the startup lock: another caller may have
  // finished starting Chrome while this caller waited for the lock.
  const release = await lockDirectory(path.join(state, 'chrome.lock'));
  try {
    const c = readJson(chromeFile);
    if (c && alive(c.pid)) {
      const end = Date.now() + 15_000;
      while (Date.now() < end && alive(c.pid)) {
        // Keep a responsive keeper from becoming idle while we probe it.
        if (readJson(chromeFile)?.pid === c.pid) {
          const now = new Date();
          try { fs.utimesSync(chromeFile, now, now); } catch (err) { if (err.code !== 'ENOENT') throw err; }
          if (await text(`http://127.0.0.1:${c.port}/json/version`)) return { port: c.port, warm: true };
        }
        await sleep(50);
      }
      // A timeout is not evidence that a live keeper is safe to replace:
      // it may still be serving another check's tabs.
      if (alive(c.pid)) throw new Error('warm Chrome is not responding (pnpm check --stop to restart it)');
    }
    fs.rmSync(chromeFile, { force: true });
    const keeper = spawn(process.execPath, [path.join(import.meta.dirname, 'check-chrome.mjs'), chromeFile, findChrome()],
      { detached: true, stdio: 'ignore' });
    keeper.unref();
    const end = Date.now() + 15_000;
    while (Date.now() < end && keeper.exitCode === null) {
      const current = readJson(chromeFile);
      if (current?.pid === keeper.pid && await text(`http://127.0.0.1:${current.port}/json/version`)) {
        return { port: current.port, warm: false };
      }
      await sleep(50);
    }
    try { process.kill(keeper.pid, 'SIGTERM'); } catch { /* already exited */ }
    throw new Error('could not start Chrome');
  } finally {
    release();
  }
}

// A tab of its own on the DevTools protocol, so parallel checks never share one.
async function tab(port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('could not reach Chrome'));
  });
  let next = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
    else p.resolve(msg.result);
  };
  ws.onclose = () => { for (const p of pending.values()) p.reject(new Error('Chrome closed the connection')); };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    next += 1;
    pending.set(next, { resolve, reject, method });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  // Evaluate until the expression gives a value; mid-navigation the call can
  // land in a context that is going away, which is just another try.
  const until = async (expression, what) => {
    for (const end = Date.now() + 30_000; Date.now() < end; await sleep(20)) {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).catch(() => null);
      if (res?.result?.value) return JSON.parse(res.result.value);
    }
    throw new Error(`${what} timed out`);
  };
  const close = () => { ws.close(); return fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {}); };
  return { send, until, close };
}

// The #audit report and its rows as data ({ id, label, words, status, … }), in deck order.
async function audit(t, url) {
  await t.send('Page.navigate', { url: `${url}#audit` });
  return t.until(`(() => {
    const el = document.getElementById('audit');
    return el && /^AUDIT {2}\\d+ pages/.test(el.textContent)
      ? JSON.stringify({ report: el.textContent, rows: JSON.parse(el.dataset.pages) }) : null;
  })()`, 'the audit');
}

// #print at print size, once its fonts are in: each page's box on the page.
async function printed(t, url, scale) {
  const { PAGE } = await import('../src/components/page.js');
  await t.send('Emulation.setDeviceMetricsOverride', { width: PAGE.w, height: PAGE.h, deviceScaleFactor: scale, mobile: false });
  await t.send('Page.navigate', { url: `${url}#print` });
  return t.until(`document.fonts.ready.then(() => {
    const els = [...document.querySelectorAll('#root > .slide')];
    if (location.hash !== '#print' || !els.length) return null;
    return JSON.stringify(els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, text: el.innerText };
    }));
  })`, 'the printed pages');
}

let source;
const tabs = [];
try {
  const scale = Number(process.env.SCALE ?? 1);
  const [served, chrome] = await Promise.all([devServer().then((d) => d ?? dist()), devtools()]);
  source = served;
  const mapOnly = flags.has('--map');
  const [a, p] = await Promise.all([tab(chrome.port), mapOnly ? null : tab(chrome.port)]);
  tabs.push(a, p);
  const [{ report, rows }, boxes] = await Promise.all([audit(a, source.url), p && printed(p, source.url, scale)]);
  const ids = rows.map((r) => r.id);
  const labels = rows.map((r) => r.label);

  const map = await deckMap(root, { report, rows, source: source.what });
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output', 'map.md'), mapText(map));
  fs.writeFileSync(path.join(root, 'output', 'map.json'), `${JSON.stringify(map, null, 2)}\n`);
  if (mapOnly) {
    console.log(flags.has('--json') ? JSON.stringify(map, null, 2) : mapText(map).trimEnd());
  } else {
    console.log(report);

    if (boxes.length !== ids.length) throw new Error(`#print has ${boxes.length} pages, the audit ${ids.length}`);
    let pages;
    if (flags.has('--changed')) pages = changedPages(root, ids);
    else if (wanted.length) {
      pages = wanted.map((w) => {
        const i = w.startsWith('@') ? Number(w.slice(1)) - 1 : labels.indexOf(w);
        if (!(i >= 0 && i < ids.length)) throw new Error(`no page '${w}' (labels: ${labels.join(' ')})`);
        return i;
      });
    } else pages = ids.map((_, i) => i);

    // Each printed page's text, for `pnpm ask find` (scripts/ask.mjs).
    const text = rows.map((r, i) => ({ position: i + 1, label: r.label, id: r.id, title: r.title, text: boxes[i].text }));
    fs.writeFileSync(path.join(root, 'output', 'text.json'), `${JSON.stringify({ source: source.what, pages: text }, null, 2)}\n`);

    const out = path.join(root, 'output', 'shots');
    fs.mkdirSync(out, { recursive: true });
    if (flags.has('--changed') && !pages.length) console.log('no page changed since the last commit');
    for (const i of pages) {
      const { data } = await p.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true, clip: { x: boxes[i].x, y: boxes[i].y, width: boxes[i].width, height: boxes[i].height, scale: 1 },
      });
      const name = `page-${labels[i] === '—' ? `at${i + 1}` : labels[i]}.png`;
      fs.writeFileSync(path.join(out, name), Buffer.from(data, 'base64'));
      console.log(`wrote output/shots/${name}`);
    }
    console.log(`check: ${((performance.now() - started) / 1000).toFixed(2)} s on ${source.what}${chrome.warm ? '' : ', Chrome started'}`);
    process.exitCode = GATE.test(report) ? 1 : 0;
  }
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
} finally {
  try {
    await Promise.all(tabs.filter(Boolean).map((t) => t.close()));
    if (source?.server) await new Promise((resolve) => source.server.close(resolve));
  } finally {
    source?.release?.();
  }
}
process.exit();
