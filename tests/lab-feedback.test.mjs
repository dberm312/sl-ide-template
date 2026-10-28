// The slide lab's feedback endpoint takes posts from its own page only and
// writes inside .lab, never anywhere a request names (SL-76).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import config from '../vite.config.js';

const MAX_BODY = 256 * 1024;
const labFeedback = () => config.plugins.flat().find((p) => p?.name === 'lab-feedback');

let root;
let server;
let base;
let host;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-lab-'));
  let handler;
  labFeedback().configureServer({
    config: { root },
    middlewares: { use(_path, fn) { handler = fn; } },
  });
  server = http.createServer((req, res) => {
    if (req.url === '/__lab/feedback') return handler(req, res);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  host = `127.0.0.1:${server.address().port}`;
  base = `http://${host}`;
});
after(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

const lab = () => path.join(root, '.lab');
const listing = () => {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else files.push(path.relative(root, p));
    }
  };
  walk(root);
  return files.sort();
};
const clear = () => fs.rmSync(lab(), { recursive: true, force: true });

function post(body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}/__lab/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}

describe('lab feedback endpoint', { concurrency: false }, () => {
  test('the lab page post writes feedback.json and a per-round copy', async () => {
    clear();
    const data = { slug: 'cover', round: 2, general: 'tighter', takes: [] };
    const res = await post(data, { Origin: base, 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(lab(), 'feedback.json'), 'utf8')), data);
    const copies = fs.readdirSync(lab()).filter((f) => f !== 'feedback.json');
    assert.equal(copies.length, 1);
    assert.match(copies[0], /^feedback-r2-\d+\.json$/);
  });

  test('a post without browser headers (curl, scripts) is still accepted', async () => {
    clear();
    assert.equal((await post({ round: 0 })).status, 200);
  });

  test('a cross-site Origin is refused before anything is written', async () => {
    clear();
    const res = await post({ round: 1 }, { Origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.deepEqual(listing(), []);
  });

  test('Sec-Fetch-Site other than same-origin is refused', async () => {
    clear();
    for (const site of ['cross-site', 'same-site', 'none']) {
      const res = await post({ round: 1 }, { 'Sec-Fetch-Site': site });
      assert.equal(res.status, 403, site);
    }
    assert.deepEqual(listing(), []);
  });

  test('a non-JSON content type (a no-preflight text/plain send) is refused', async () => {
    clear();
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const res = await post({ round: 1 }, { 'Content-Type': type });
      assert.equal(res.status, 415, type);
    }
    assert.deepEqual(listing(), []);
  });

  test('a round that is not a small non-negative integer is refused', async () => {
    clear();
    for (const round of ['/../x', '/../../src/deck/notes', '1', -1, 1.5, 10000, null, undefined]) {
      const res = await post({ round, general: 'planted' });
      assert.equal(res.status, 400, String(round));
    }
    assert.equal((await post('[]')).status, 400);
    assert.equal((await post('null')).status, 400);
    assert.equal((await post('{nope')).status, 400);
    assert.deepEqual(listing(), []);
  });

  test('a body over the cap gets 413 and writes nothing', async () => {
    clear();
    const big = JSON.stringify({ round: 1, general: 'x'.repeat(MAX_BODY) });
    assert.equal((await post(big)).status, 413);
    assert.deepEqual(listing(), []);
  });

  test('a chunked body over the cap (no Content-Length) gets 413', async () => {
    clear();
    const res = await new Promise((resolve, reject) => {
      const req = http.request(`${base}/__lab/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
      }, (r) => { r.resume(); r.on('end', () => resolve(r.statusCode)); });
      req.on('error', (err) => (err.code === 'ECONNRESET' || err.code === 'EPIPE' ? null : reject(err)));
      const chunk = 'x'.repeat(64 * 1024);
      req.write('{"round":1,"general":"');
      for (let i = 0; i < 5; i++) req.write(chunk);
      req.end('"}');
    });
    assert.equal(res, 413);
    assert.deepEqual(listing(), []);
  });

  test('non-POST methods get 405', async () => {
    const res = await fetch(`${base}/__lab/feedback`);
    assert.equal(res.status, 405);
  });
});
