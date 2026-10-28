// Exercise competing warm-Chrome callers against the real checker/browser.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const exec = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-chrome-startup-')));
  fs.cpSync(root, dir, { recursive: true, filter: (src) => !/^(node_modules|\.git|dist|output|\.sl-ide)(\/|$)/.test(path.relative(root, src)) });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  const release = path.join(dir, 'release-lock-attempt');
  const gate = path.join(dir, 'lock-attempt');
  const state = path.join(dir, '.sl-ide/chrome.json');
  const lock = path.join(dir, '.sl-ide/chrome.lock');
  const keepers = new Set();
  const running = [];
  const keeper = () => {
    const value = JSON.parse(fs.readFileSync(state, 'utf8'));
    keepers.add(value.pid);
    return value;
  };
  const call = (args, preload) => {
    const result = exec(process.execPath, [...(preload ? ['--import', preload] : []), 'scripts/check.mjs', ...args], { cwd: dir, timeout: 30_000 });
    running.push(result.catch(() => {}));
    return result;
  };
  t.after(async () => {
    fs.writeFileSync(release, '');
    await Promise.all(running);
    if (fs.existsSync(state)) keeper();
    await call(['--stop']);
    for (const pid of keepers) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already stopped */ }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const paused = path.join(dir, 'pause-lock.mjs');
  fs.writeFileSync(paused, `
import fs from 'node:fs';
let paused = false;
function before(file) {
  if (paused || file !== ${JSON.stringify(lock)}) return;
  paused = true;
  fs.writeFileSync(${JSON.stringify(gate)}, '');
  const until = Date.now() + 15_000;
  while (!fs.existsSync(${JSON.stringify(release)})) {
    if (Date.now() > until) throw new Error('fixture lock gate timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}
const mkdir = fs.mkdirSync;
fs.mkdirSync = (file, ...args) => { before(file); return mkdir(file, ...args); };
const rename = fs.renameSync;
fs.renameSync = (from, to) => { before(to); return rename(from, to); };
`);
  const faulty = path.join(dir, 'transient-probe.mjs');
  fs.writeFileSync(faulty, `
import fs from 'node:fs';
const fetch = globalThis.fetch;
let failed = false;
globalThis.fetch = (...args) => {
  if (!failed && String(args[0]).endsWith('/json/version')) {
    failed = true;
    fs.writeFileSync('probe-failed', '');
    return Promise.reject(new Error('fixture transient health-probe failure'));
  }
  return fetch(...args);
};
`);
  return { dir, gate, release, paused, faulty, call, keeper };
}

test('a cold caller rechecks Chrome after another caller finishes startup', async (t) => {
  const f = fixture(t);
  const waiting = f.call(['--map', '--json'], f.paused);
  const until = Date.now() + 10_000;
  while (!fs.existsSync(f.gate) && Date.now() < until) await sleep(20);
  assert.ok(fs.existsSync(f.gate), 'the first caller is paused before acquiring the startup lock');
  await f.call(['--map', '--json']);
  const started = f.keeper();
  fs.writeFileSync(f.release, '');
  assert.equal(JSON.parse((await waiting).stdout).pages.length, 6);
  assert.equal(f.keeper().pid, started.pid, 'the waiting caller reuses the keeper that started while it waited');
});

test('a transient health-probe failure does not replace a live Chrome keeper', async (t) => {
  const f = fixture(t);
  await f.call(['--map', '--json']);
  const started = f.keeper();
  assert.equal(JSON.parse((await f.call(['--map', '--json'], f.faulty)).stdout).pages.length, 6);
  assert.ok(fs.existsSync(path.join(f.dir, 'probe-failed')), 'the fixture failed one health probe');
  assert.equal(f.keeper().pid, started.pid, 'a live keeper survives a transient health-probe failure');
});
