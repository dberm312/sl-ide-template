#!/usr/bin/env node
// The headless Chrome `pnpm check` keeps warm for one worktree. check.mjs
// starts this detached; it writes { pid, port } to <state file> once Chrome
// listens, and exits, taking Chrome and its profile with it, when no check
// has touched the file for SL_IDE_CHECK_IDLE_MIN minutes (default 10), when
// the file is gone, when Chrome dies, or on SIGTERM (`pnpm check --stop`).
//
//   node scripts/check-chrome.mjs <state file> <chrome>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [file, chromePath] = process.argv.slice(2);
const IDLE_MS = Number(process.env.SL_IDE_CHECK_IDLE_MIN ?? 10) * 60_000;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-check-chrome.'));
const flags = ['--headless', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  // Each check works in tabs of its own, which Chrome would otherwise treat
  // as background tabs and throttle (fonts, timers), so the audit reads
  // FONTS-PENDING.
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`];
if (process.getuid?.() === 0) flags.push('--no-sandbox');
const chrome = spawn(chromePath, [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
const closed = new Promise((resolve) => chrome.once('close', resolve));

const mine = () => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid; } catch { return false; }
};
let quitting = false;
async function quit() {
  if (quitting) return;
  quitting = true;
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* already gone */ }
  await Promise.race([closed, new Promise((r) => setTimeout(r, 5000))]);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (mine()) fs.rmSync(file, { force: true });
  process.exit(0);
}
chrome.once('exit', quit);
chrome.once('error', quit);
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, quit);

let listening = false;
let err = '';
chrome.stderr.on('data', (d) => { // keep reading, so Chrome never blocks on a full pipe
  if (listening) return;
  err += d;
  const m = /DevTools listening on ws:\/\/[^/]+:(\d+)\//.exec(err);
  if (!m) return;
  listening = true;
  fs.writeFileSync(`${file}.${process.pid}`, `${JSON.stringify({ pid: process.pid, port: Number(m[1]) })}\n`);
  fs.renameSync(`${file}.${process.pid}`, file);
});

setInterval(() => {
  if (!listening) return;
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat || !mine() || Date.now() - stat.mtimeMs > IDLE_MS) quit();
}, 5_000);
