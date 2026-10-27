#!/usr/bin/env node
// Audit, print and shoot the cover of a served dist/ from one headless Chrome,
// so a CI run starts Chrome once instead of once per job. Each step loads its
// route fresh under the same 8 s virtual-time budget the old one-shot
// `--dump-dom` / `--print-to-pdf` / `--screenshot` runs had.
//
//   node scripts/render.mjs <port> <step...>
//
// <port> must be serving this checkout's dist/ (scripts/serve.mjs, via
// lib.sh serve_dist); anything else, such as another worktree's deck, fails.
//
// report  print the #audit report; fail unless it finished measuring
// audit   report, then fail on CLIPPED, WORDY, SPILL, OVERLAP, LONG or FONTS-PENDING
// pdf     print #print to $OUT_PDF
// cover   screenshot the top of #print ($PAGE_W x $PAGE_H + 24) to $OUT_COVER
//
// Steps run in order and stop at the first failure, so `audit pdf` prints
// nothing for a deck that fails the audit. Needs $CHROME (lib.sh find_chrome).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildId } from './serve.mjs';

const BUDGET_MS = 8000;
const TIMEOUT_MS = 60000;
const GATE = /CLIPPED|WORDY|SPILL|OVERLAP|LONG|FONTS-PENDING/;

const [port, ...steps] = process.argv.slice(2);
const known = new Set(['report', 'audit', 'pdf', 'cover']);
if (!/^\d+$/.test(port ?? '') || !steps.length || steps.some((s) => !known.has(s))) {
  console.error('usage: node scripts/render.mjs <port> <report|audit|pdf|cover>...');
  process.exit(2);
}
const page = `http://127.0.0.1:${port}/index.html`;
const dist = path.join(import.meta.dirname, '..', 'dist');
const served = await fetch(`http://127.0.0.1:${port}/__sl-ide/build`).then((r) => (r.ok ? r.text() : null), () => null);
if (served !== buildId(dist)) {
  console.error(`error: port ${port} is not serving this checkout's dist/ (${served ? 'another build' : 'no sl-ide server'})`);
  process.exit(1);
}

// --- Chrome: one process and profile, removed however this script ends ----

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-chrome.'));
const flags = ['--headless', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`];
if (process.getuid?.() === 0) flags.push('--no-sandbox');
const chrome = spawn(process.env.CHROME, [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

const chromeExited = new Promise((resolve) => chrome.once('close', resolve));
// Wait for Chrome to go before removing its profile, or it writes it back.
async function quit(code) {
  chrome.kill('SIGKILL');
  await Promise.race([chromeExited, new Promise((r) => setTimeout(r, 5000))]);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  process.exit(code);
}
process.on('exit', () => { // a last resort; quit() is the normal way out
  chrome.kill('SIGKILL');
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
});
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(signal, () => quit(code));

function within(promise, what) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), TIMEOUT_MS);
  })]).finally(() => clearTimeout(timer));
}

process.on('unhandledRejection', (err) => { console.error(`error: ${err.message}`); quit(1); });

const browserUrl = await within(new Promise((resolve, reject) => {
  let err = '';
  chrome.stderr.on('data', (d) => {
    err += d;
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
    if (m) resolve(m[1]);
  });
  chrome.once('error', reject);
  chrome.once('exit', () => reject(new Error(`Chrome exited: ${err.slice(-300)}`)));
}), 'Chrome startup');

// --- DevTools protocol over the page's WebSocket ---------------------------

const { port: devtools } = new URL(browserUrl);
const tabs = await (await fetch(`http://127.0.0.1:${devtools}/json/list`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await within(new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('could not reach Chrome')); }), 'Chrome connection');

let nextId = 0;
const pending = new Map();
const waiters = new Map();
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method && waiters.has(msg.method)) {
    waiters.get(msg.method)();
    waiters.delete(msg.method);
  }
};
ws.onclose = () => { for (const { reject } of pending.values()) reject(new Error('Chrome closed the connection')); };
const send = (method, params = {}) => within(new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
}), method);
const event = (method) => new Promise((resolve) => waiters.set(method, resolve));

// Load a route fresh (about:blank first: from #audit to #print would only
// change the hash) and let it run for the virtual-time budget, as
// --virtual-time-budget did: timers fast-forward, network fetches finish.
async function load(hash) {
  await send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.navigate', { url: `${page}${hash}` });
  const expired = event('Emulation.virtualTimeBudgetExpired');
  await send('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget: BUDGET_MS });
  await within(expired, `loading ${hash}`);
}

// --- steps -----------------------------------------------------------------

// The #audit report as text. A report still "measuring…" carries no failure
// flags, so one that never finished fails rather than passing.
async function report() {
  await load('#audit');
  const { result } = await send('Runtime.evaluate', {
    expression: "document.getElementById('audit')?.textContent ?? null", returnByValue: true,
  });
  const text = result.value;
  if (text === null) throw new Error('audit: could not read the report');
  console.log(text);
  const lines = text.split('\n');
  const head = /^AUDIT {2}(\d+) pages/.exec(lines[0] ?? '');
  if (!head) throw new Error('audit: the report never finished measuring');
  const pages = Number(head[1]);
  const rows = lines.slice(2, 2 + pages).filter((l) => !l.startsWith('  '));
  if (pages === 0 || rows.length !== pages) throw new Error(`audit: expected ${pages} page rows, read ${rows.length}`);
  return text;
}

async function pdf() {
  const out = process.env.OUT_PDF;
  await load('#print');
  const { data } = await send('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false,
  });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  if (!fs.statSync(out).size) throw new Error(`Chrome did not write ${out}`);
  console.log(`wrote ${out}`);
}

// The top of #print: its 24px of body padding, then the first page.
async function cover() {
  const out = process.env.OUT_COVER;
  const width = Number(process.env.PAGE_W);
  const height = Number(process.env.PAGE_H) + 24;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await load('#print');
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  if (!fs.statSync(out).size) throw new Error('Chrome did not write the cover');
  console.log(`wrote ${out}`);
}

try {
  for (const step of steps) {
    if (step === 'report') await report();
    if (step === 'audit' && GATE.test(await report())) await quit(1);
    if (step === 'pdf') await pdf();
    if (step === 'cover') await cover();
  }
} catch (err) {
  console.error(`error: ${err.message}`);
  await quit(1);
}
await quit(0);
