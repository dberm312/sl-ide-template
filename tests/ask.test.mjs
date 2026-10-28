// pnpm ask (SL-72): TypeSafe questions, verdicts and failures, against a fake API.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { fitQuestions, fitVerdict, findQuestions, findState, findVerdict, MODELS } from '../scripts/ask-questions.mjs';
import { imageInfo } from '../scripts/ask.mjs';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

// A blank RGB PNG; Jev takes 280-1568 px a side.
function png(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height, 0xff);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const nouls = (o) => Object.fromEntries(Object.entries(o).map(([k, p]) => [k, { noul: p }]));
const box = { box: { top: 0.2, bottom: 0.8, left: 0.5, right: 0.95, confidence: null } };

test('fit: the truth table turns probabilities into a verdict', () => {
  const v = (o) => fitVerdict({ ...nouls(o), where: box });
  const clean = { picture: 0.95, subject_cut: 0.05, covers_text: 0.1, distorted: 0.02 };
  assert.equal(v(clean).verdict, 'fits');
  assert.deepEqual(v(clean).box, { top: 0.2, bottom: 0.8, left: 0.5, right: 0.95 });
  assert.deepEqual(v({ ...clean, covers_text: 0.9 }).reasons, ['covers_text']);
  assert.equal(v({ ...clean, covers_text: 0.9 }).verdict, 'misfit');
  assert.deepEqual(v({ ...clean, subject_cut: 0.5 }), { ...v({ ...clean, subject_cut: 0.5 }), verdict: 'unsure', reasons: ['subject_cut'] });
  // Box always returns a location, so no picture means no box.
  assert.equal(v({ ...clean, picture: 0.1 }).verdict, 'no-picture');
  assert.equal(v({ ...clean, picture: 0.1 }).box, null);
  assert.equal(v({ ...clean, picture: 0.5 }).verdict, 'unsure');
});

test('fit: one judgment per question, the null case paired with the Box', () => {
  const q = fitQuestions();
  assert.equal(q.where.type, 'box');
  assert.equal(q.picture.type, 'noul');
  for (const [k, v] of Object.entries(q)) {
    assert.doesNotMatch(v.instructions, /\band\/or\b/, k);
    if (v.type === 'noul') assert.ok(v.criteria.true && v.criteria.false, k);
  }
});

test('find: one Noul per page, referring to its path in the state', () => {
  const pages = [
    { position: 1, label: '—', title: 'Cover', text: 'Acme 2027' },
    { position: 2, label: '1', title: 'Pricing', text: 'Plans start at $10' },
  ];
  assert.deepEqual(findState(pages).pages.p2, { label: '1', title: 'Pricing', text: 'Plans start at $10' });
  const q = findQuestions('pricing', pages);
  assert.match(q.p2.instructions, /`pages\.p2`/);
  const out = findVerdict(nouls({ p1: 0.05, p2: 0.92 }), pages);
  assert.deepEqual(out.mentions, ['1']);
  assert.deepEqual(out.pages.map((p) => p.label), ['1', '—']);
});

test('imageInfo reads PNG and JPEG sizes', () => {
  assert.deepEqual(imageInfo(png(320, 300)), { format: 'png', width: 320, height: 300 });
  const sof = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x02, 0xd0, 0x05, 0x00, 3, 0, 0, 0]);
  assert.deepEqual(imageInfo(sof), { format: 'jpg', width: 1280, height: 720 });
  assert.equal(imageInfo(Buffer.from('not an image')), null);
});

async function fakeApi(t, reply) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const r = { method: req.method, url: req.url, headers: req.headers, body: JSON.parse(body) };
    seen.push(r);
    const [status, json] = reply(r, seen.length);
    res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '0' });
    res.end(JSON.stringify(json));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, seen };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-ask-'));
const slide = path.join(dir, 'take.png');
fs.writeFileSync(slide, png(1280, 720));
const ask = (env, ...args) => run(process.execPath, ['scripts/ask.mjs', ...args], { cwd: root, env: { ...process.env, ...env } })
  .then((r) => ({ code: 0, ...r }), (e) => e);

test('fit on an image sends one image request and prints the verdict as JSON', async (t) => {
  const api = await fakeApi(t, (r) => [200, {
    model: 'jev-1.14.0',
    answers: { ...nouls({ picture: 0.97, subject_cut: 0.81, covers_text: 0.04, distorted: 0.03 }), where: box },
  }]);
  const r = await ask({ TYPESAFE_API_KEY: 'test-key', TYPESAFE_BASE_URL: api.url }, 'fit', slide);
  assert.equal(r.code, 0, r.stderr);
  const [out] = JSON.parse(r.stdout);
  assert.equal(out.verdict, 'misfit');
  assert.deepEqual(out.reasons, ['subject_cut']);
  const [req] = api.seen;
  assert.equal(req.url, '/v1/systemone');
  assert.equal(req.headers.authorization, 'Bearer test-key');
  assert.equal(req.headers['typesafe-danger-zone-images'], 'true');
  assert.equal(req.body.model, MODELS.image);
  assert.equal(req.body.state.slide, 'slide-image');
  assert.equal(req.body.assets['slide-image'].format, 'png');
  assert.deepEqual(Object.keys(req.body.questions), Object.keys(fitQuestions()));
});

test('a failed call is an error, never a "no"', async (t) => {
  const api = await fakeApi(t, () => [400, { detail: 'questions.where: bad' }]);
  const r = await ask({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: api.url }, 'fit', slide);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^error: TypeSafe answered 400: questions\.where: bad/);

  const missing = await fakeApi(t, () => [200, { model: 'jev', answers: nouls({ picture: 0.1 }) }]);
  const m = await ask({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: missing.url }, 'fit', slide);
  assert.equal(m.code, 1);
  assert.match(m.stderr, /answer is missing subject_cut/);

  const down = await ask({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: 'http://127.0.0.1:9' }, 'fit', slide);
  assert.equal(down.code, 1);
  assert.match(down.stderr, /^error: TypeSafe request failed/);
});

test('429 and 5xx are retried, then reported', async (t) => {
  const api = await fakeApi(t, (r, n) => (n < 3 ? [503, { detail: 'busy' }] : [200, {
    model: 'jev', answers: { ...nouls({ picture: 0.1, subject_cut: 0.1, covers_text: 0.1, distorted: 0.1 }), where: box },
  }]));
  const r = await ask({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: api.url }, 'fit', slide);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(api.seen.length, 3);
  assert.equal(JSON.parse(r.stdout)[0].verdict, 'no-picture');
});

test('no key is an error; --dry-run needs none and sends nothing', async () => {
  const env = { TYPESAFE_API_KEY: '', TYPESAFE_BASE_URL: 'http://127.0.0.1:9' };
  const r = await ask(env, 'fit', slide);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /TYPESAFE_API_KEY is not set/);
  const d = await ask(env, 'fit', slide, '--dry-run');
  assert.equal(d.code, 0, d.stderr);
  const [{ request }] = JSON.parse(d.stdout);
  assert.match(request.assets['slide-image'].data_base64, /^<\d+ base64 chars>$/);
});

test('an image outside 280-1568 px is refused before any call', async () => {
  const small = path.join(dir, 'small.png');
  fs.writeFileSync(small, png(200, 200));
  const r = await ask({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: 'http://127.0.0.1:9' }, 'fit', small);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /200x200; TypeSafe takes 280-1568 px/);
});

test('find and fit by label render the deck through pnpm check', { timeout: 120_000 }, async (t) => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-ask-check-'));
  const env = { SL_IDE_CHECK_STATE: state, TYPESAFE_API_KEY: 'k' };
  t.after(async () => {
    await run(process.execPath, ['scripts/check.mjs', '--stop'], { cwd: root, env: { ...process.env, ...env } }).catch(() => {});
    fs.rmSync(state, { recursive: true, force: true });
  });
  const api = await fakeApi(t, (r) => [200, {
    model: 'jev',
    answers: r.body.questions.where
      ? { ...nouls({ picture: 0.1, subject_cut: 0.1, covers_text: 0.1, distorted: 0.1 }), where: box }
      : Object.fromEntries(Object.keys(r.body.questions).map((k) => [k, { noul: k === 'p4' ? 0.9 : 0.05 }])),
  }]);
  const f = await ask({ ...env, TYPESAFE_BASE_URL: api.url }, 'find', 'the', 'audit');
  assert.equal(f.code, 0, f.stderr);
  const req = api.seen[0];
  assert.equal(req.headers['typesafe-danger-zone-images'], undefined);
  assert.equal(req.body.model, MODELS.text);
  assert.equal(Object.keys(req.body.questions).length, Object.keys(req.body.state.pages).length);
  assert.match(req.body.questions.p4.instructions, /mention the audit\?$/);
  assert.equal(req.body.state.pages.p4.title, JSON.parse(f.stdout).pages[0].title);
  assert.ok(req.body.state.pages.p4.text.length > 20);
  assert.deepEqual(JSON.parse(f.stdout).mentions, [req.body.state.pages.p4.label]);

  const g = await ask({ ...env, TYPESAFE_BASE_URL: api.url }, 'fit', '@1', 'A1');
  assert.equal(g.code, 0, g.stderr);
  assert.deepEqual(JSON.parse(g.stdout).map((x) => [x.page, x.verdict]), [['—', 'no-picture'], ['A1', 'no-picture']]);
  assert.equal(api.seen.length, 3);
});
