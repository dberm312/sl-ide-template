// pnpm check (SL-66): which pages a change touches, and the warm loop itself.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { changedPages, deckSources, pagesFor, parseDiff } from '../scripts/deck-files.mjs';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const content = fs.readFileSync(path.join(root, 'src/deck/content.js'), 'utf8').split('\n');
const lineOf = (re) => content.findIndex((l) => re.test(l)) + 1;
const IDS = ['cover', 'start-here', 'anatomy', 'checks', 'appendix', 'files'];
const pages = (changes) => changedPages(root, IDS, changes).map((i) => IDS[i]);

test('a page component, or the content.js export it reads, maps to that page', () => {
  assert.deepEqual(pages([{ file: 'src/slides/AnatomySlide.jsx', lines: [12] }]), ['anatomy']);
  assert.deepEqual(pages([{ file: 'src/deck/content.js', lines: [lineOf(/^export const anatomy/) + 1] }]), ['anatomy']);
  assert.deepEqual(pages([
    { file: 'src/deck/content.js', lines: [lineOf(/^export const checks/) + 2] },
    { file: 'src/slides/CoverSlide.jsx', lines: null },
  ]), ['cover', 'checks']);
  // The appendix page's block also names it on the divider (index.jsx's SHORT).
  assert.deepEqual(pages([{ file: 'src/deck/content.js', lines: [lineOf(/^export const files/) + 1] }]), ['appendix', 'files']);
});

test('styles, shared components, META and helpers map to every page; docs and the lab to none', () => {
  for (const change of [
    { file: 'src/styles.css', lines: [3] },
    { file: 'src/components/SlideShell.jsx', lines: [3] },
    { file: 'src/slides/index.jsx', lines: [3] },
    { file: 'src/slides/agentLogos.js', lines: [3] },
    { file: 'src/deck/content.js', lines: [lineOf(/^export const META/) + 1] },
    { file: 'src/deck/content.js', lines: null },
  ]) assert.deepEqual(pages([change]), IDS, change.file);
  assert.deepEqual(pages([{ file: 'README.md', lines: [1] }, { file: 'src/lab/takes/index.js', lines: [1] }]), []);
});

test("a memo's flowing body maps to every flow page", () => {
  const memo = path.join(root, 'starters/memo');
  const src = deckSources(memo);
  assert.deepEqual(pagesFor([{ file: 'src/deck/content.js', lines: [src.exports.find((e) => e.key === 'memo').line + 1] }], src).ids, new Set(['memo']));
  assert.deepEqual(changedPages(memo, ['memo-1', 'memo-2', 'files'], [{ file: 'src/slides/FilesPage.jsx', lines: [1] }]), [2]);
});

test('parseDiff reads changed lines, new files and deletions', () => {
  assert.deepEqual(parseDiff([
    'diff --git a/src/a.js b/src/a.js', '--- a/src/a.js', '+++ b/src/a.js', '@@ -3 +3,2 @@', '@@ -9,2 +10,0 @@',
    '--- /dev/null', '+++ b/src/new.jsx', '@@ -0,0 +1,3 @@',
    '--- a/src/gone.jsx', '+++ /dev/null', '@@ -1,4 +0,0 @@',
  ].join('\n')), [
    { file: 'src/a.js', lines: [3, 4, 10] },
    { file: 'src/new.jsx', lines: [1, 2, 3] },
    { file: 'src/gone.jsx', lines: null },
  ]);
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
