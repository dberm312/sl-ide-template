// pnpm map (SL-67): the deck map an agent reads instead of the repo.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { deckMap, mapText } from '../scripts/deck-map.mjs';

const root = path.resolve(import.meta.dirname, '..');
const row = (id, kind, label, extra = {}) => ({ id, kind, label, words: 50, budget: 340, status: 'ok', title: id, ...extra });

test("each page names its component, its page module and the keys it reads", async () => {
  const map = await deckMap(root, {
    report: 'AUDIT  2 pages  0 need attention\n', source: 'dist/',
    rows: [row('anatomy', 'content', '3'), row('appendix', 'divider', '—', { budget: null })],
  });
  const [anatomy, divider] = map.pages;
  assert.equal(anatomy.file, 'src/slides/AnatomySlide.jsx');
  assert.deepEqual(anatomy.modules, ['src/deck/pages/anatomy.js']);
  assert.match(anatomy.content[0], /^anatomy\.\{title,.*cards\[0\.\.\d+\]/);
  assert.equal(divider.file, 'src/slides/AppendixDivider.jsx');
  assert.ok(divider.content.some((c) => c.startsWith('files.')), 'index.jsx reads appendix keys for the divider');
  assert.equal(map.handReferences, 'none yet.');
  const text = mapText(map);
  assert.match(text, /^@1 {2}3 {2}anatomy .*src\/slides\/AnatomySlide\.jsx +src\/deck\/pages\/anatomy\.js: anatomy\.\{.*words 50\/340 {2}audit ok$/m);
  assert.match(text, /^@2 .*words 50 +audit ok$/m);
});

test("a memo's flowing pages list the body blocks the paginator put on each", async () => {
  const map = await deckMap(path.join(root, 'starters/memo'), {
    report: 'AUDIT  2 pages  0 need attention\n', source: 'dist/',
    rows: [row('memo-1', 'flow', '1', { budget: null, blocks: [[0], [1], [2, 0, 3]] }),
      row('memo-2', 'flow', '2', { budget: null, blocks: [[2, 3, null], [3]] })],
  });
  assert.deepEqual(map.pages.map((p) => p.content), [['memo.body[0..2]'], ['memo.body[2..3]']]);
  assert.match(map.pages[0].blocks[0], /^memo\.body\[0\] memohead {2}"To, From/);
  assert.match(map.pages[0].blocks[2], /^memo\.body\[2\] p \(lines 1–3\) {2}"/);
  assert.match(map.pages[1].blocks[0], /^memo\.body\[2\] p \(lines 4–end\)/);
});

test('pnpm map measures the deck and writes output/map.md and map.json', async (t) => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-map-'));
  const env = { ...process.env, SL_IDE_CHECK_STATE: state };
  const run = (...args) => promisify(execFile)(process.execPath, ['scripts/check.mjs', ...args], { cwd: root, env });
  t.after(async () => {
    await run('--stop');
    fs.rmSync(state, { recursive: true, force: true });
  });
  const targets = async () => {
    const { port } = JSON.parse(fs.readFileSync(path.join(state, 'chrome.json'), 'utf8'));
    return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page').map((t) => ({ id: t.id, url: t.url })).sort((a, b) => a.id.localeCompare(b.id));
  };
  const map = JSON.parse((await run('--map', '--json')).stdout);
  const before = await targets();
  assert.equal(before.some((t) => t.url.endsWith('#audit')), false, 'map closes its audit tab');
  await run('--map');
  assert.deepEqual(await targets(), before, 'repeated maps do not retain browser tabs');
  assert.deepEqual(map.pages.map((p) => p.label), ['—', '2', '3', '4', '—', 'A1']);
  assert.ok(map.pages.every((p) => p.audit === 'ok' && p.file && p.title));
  assert.equal(map.pages[2].title, 'Each page is a copy module placed in inch boxes');
  assert.match(fs.readFileSync(path.join(root, 'output/map.md'), 'utf8'), /^@3 {2}3 {3}anatomy/m);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'output/map.json'), 'utf8')).pages, map.pages);
  await assert.rejects(run('--map', '2'), /usage/);
});
