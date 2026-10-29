// pnpm check (SL-66): which pages a change touches, and the warm loop itself.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { changedPages, deckSources, pagesFor } from '../scripts/deck-files.mjs';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const IDS = ['cover', 'start-here', 'anatomy', 'checks', 'appendix', 'files'];
const pages = (changes) => changedPages(root, IDS, changes).map((i) => IDS[i]);

test('a page component, or the page module it reads, maps to that page', () => {
  assert.deepEqual(pages(['src/slides/AnatomySlide.jsx']), ['anatomy']);
  assert.deepEqual(pages(['src/deck/pages/anatomy.js']), ['anatomy']);
  assert.deepEqual(pages(['src/deck/pages/checks.js', 'src/slides/CoverSlide.jsx']), ['cover', 'checks']);
  // The appendix page's module also names it on the divider (index.jsx's SHORT).
  assert.deepEqual(pages(['src/deck/pages/files.js']), ['appendix', 'files']);
  // A new module no component imports yet touches no page.
  assert.deepEqual(pages(['src/deck/pages/draft.js']), []);
});

test('styles, shared components, content.js and helpers map to every page; docs and the lab to none', () => {
  for (const file of [
    'src/styles.css', 'src/components/SlideShell.jsx', 'src/slides/index.jsx',
    'src/slides/agentLogos.js', 'src/deck/content.js',
  ]) assert.deepEqual(pages([file]), IDS, file);
  assert.deepEqual(pages(['README.md', 'src/lab/takes/index.js']), []);
});

test("a memo's flowing body maps to every flow page", () => {
  const memo = path.join(root, 'starters/memo');
  const src = deckSources(memo);
  assert.deepEqual(pagesFor(['src/deck/pages/memo.js'], src).ids, new Set(['memo']));
  assert.deepEqual(changedPages(memo, ['memo-1', 'memo-2', 'files'], ['src/slides/FilesPage.jsx']), [2]);
  assert.deepEqual(changedPages(memo, ['memo-1', 'memo-2', 'files'], ['src/deck/pages/files.js']), [2]);
});

test('check audits and shoots warm, and never measures a dev server for another checkout', async (t) => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-check-'));
  // A dev server that answers for some other checkout, as another worktree's would.
  const other = http.createServer((_req, res) => res.end('/somewhere/else')).listen(0, '127.0.0.1');
  await new Promise((r) => other.once('listening', r));
  fs.writeFileSync(path.join(state, 'dev.json'), JSON.stringify({ port: other.address().port, pid: process.pid }));
  const env = { ...process.env, SL_IDE_CHECK_STATE: state };
  const check = (...args) => run(process.execPath, ['scripts/check.mjs', ...args], { cwd: root, env });
  t.after(async () => {
    await check('--stop');
    other.close();
    fs.rmSync(state, { recursive: true, force: true });
  });

  const first = await check('2');
  const keeper = JSON.parse(fs.readFileSync(path.join(state, 'chrome.json'), 'utf8')).pid;
  const second = await check('@1', '2');
  for (const { stdout } of [first, second]) {
    assert.match(stdout, /^AUDIT {2}6 pages {2}0 need attention\n/);
    assert.match(stdout, /wrote output\/shots\/page-2\.png/);
    assert.match(stdout, /check: [\d.]+ s on (a fresh build of )?dist\//);
  }
  assert.match(second.stdout, /wrote output\/shots\/page-at1\.png/);
  assert.doesNotMatch(second.stdout, /Chrome started/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(state, 'chrome.json'), 'utf8')).pid, keeper);
  assert.equal(fs.readFileSync(path.join(root, 'output/shots/page-2.png')).subarray(1, 4).toString(), 'PNG');
  await assert.rejects(check('Z9'), (err) => /no page 'Z9' \(labels: — 2 3 4 — A1\)/.test(err.stderr));

  assert.match((await check('--stop')).stdout, /stopped the warm Chrome/);
  assert.equal(fs.existsSync(path.join(state, 'chrome.json')), false);
});
