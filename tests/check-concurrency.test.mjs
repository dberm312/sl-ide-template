// Cold fallback checks share one dist/: a second build must not remove the
// files that another check is building or serving.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('cold check and map share one build, wait for live owners and recover dead owners', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-cold-check-'));
  fs.cpSync(root, dir, { recursive: true, filter: (src) => !/^(node_modules|\.git|dist|output|\.sl-ide)(\/|$)/.test(path.relative(root, src)) });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  const script = path.join(dir, 'scripts/check.mjs');
  // Instrument only the fixture's build command, keeping the real checker and
  // real Vite build. The marker lets the second caller overlap a cold build.
  fs.writeFileSync(script, fs.readFileSync(script, 'utf8').replace("path.join(root, 'node_modules/vite/bin/vite.js')", "path.join(root, 'tests/cold-build.mjs')"));
  fs.writeFileSync(path.join(dir, 'tests/cold-build.mjs'), `
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
fs.appendFileSync('build-count', 'build\\n');
fs.writeFileSync('building', '');
await new Promise((resolve) => setTimeout(resolve, 500));
const result = spawnSync(process.execPath, [${JSON.stringify(path.join(root, 'node_modules/vite/bin/vite.js'))}, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
`);
  const state = path.join(dir, '.sl-ide');
  const lock = path.join(state, 'check-dist.lock');
  fs.mkdirSync(lock, { recursive: true });
  const live = `owner-${process.pid}-fixture`;
  fs.writeFileSync(path.join(lock, live), '');
  const check = (...args) => run(process.execPath, ['scripts/check.mjs', ...args], { cwd: dir, timeout: 30_000 });
  t.after(async () => {
    try { fs.unlinkSync(path.join(lock, live)); fs.rmdirSync(lock); } catch { /* already released */ }
    await first;
    await check('--stop');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const first = check('2').then((result) => ({ result }), (error) => ({ error }));
  await sleep(250);
  assert.equal(fs.existsSync(path.join(dir, 'building')), false, 'a live checker owns dist until it releases the lock');
  fs.unlinkSync(path.join(lock, live));
  fs.rmdirSync(lock);
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(path.join(dir, 'building')) && Date.now() < deadline) await sleep(20);
  assert.ok(fs.existsSync(path.join(dir, 'building')), 'the first cold build started');
  const second = check('--map', '--json').then((result) => ({ result }), (error) => ({ error }));
  const [a, b] = await Promise.all([first, second]);
  assert.ifError(a.error);
  assert.ifError(b.error);
  assert.match(a.result.stdout, /^AUDIT {2}6 pages {2}0 need attention/m);
  assert.equal(JSON.parse(b.result.stdout).pages.length, 6);
  assert.equal(fs.readFileSync(path.join(dir, 'build-count'), 'utf8'), 'build\n', 'the second caller reuses the finished build');
  assert.equal(fs.existsSync(lock), false, 'both calls released dist');

  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner-2147483647-dead-fixture'), '');
  const recovered = await Promise.all(Array.from({ length: 3 }, () => check('--map', '--json')));
  assert.ok(recovered.every((result) => JSON.parse(result.stdout).pages.length === 6));
  assert.equal(fs.existsSync(lock), false, 'a dead owner does not strand the next check');
});
