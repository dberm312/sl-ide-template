// Parallel worktrees: each audit serves its own dist/ on a free port and
// refuses to measure any other deck (SL-62).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { promisify } from 'node:util';
import { buildId, serve } from '../scripts/serve.mjs';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const temps = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}
function fakeDist(html) {
  const d = path.join(tmp('sl-ide-dist-'), 'dist');
  fs.mkdirSync(path.join(d, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html);
  fs.writeFileSync(path.join(d, 'assets', 'a.css'), 'body{}');
  return d;
}
async function get(port, p) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`);
  return { status: r.status, type: r.headers.get('content-type'), body: await r.text() };
}

test('two servers get their own free ports and answer their own build id', async (t) => {
  const a = fakeDist('<p>a</p>');
  const b = fakeDist('<p>b</p>');
  const [sa, sb] = await Promise.all([serve(a), serve(b)]);
  t.after(() => { sa.close(); sb.close(); });
  const [pa, pb] = [sa.address().port, sb.address().port];
  assert.notEqual(pa, pb);
  assert.notEqual(buildId(a), buildId(b));
  assert.equal((await get(pa, '/__sl-ide/build')).body, buildId(a));
  assert.equal((await get(pb, '/__sl-ide/build')).body, buildId(b));
  assert.deepEqual(await get(pa, '/index.html'), { status: 200, type: 'text/html; charset=utf-8', body: '<p>a</p>' });
  assert.equal((await get(pa, '/assets/a.css')).type, 'text/css');
  assert.equal((await get(pa, '/missing.js')).status, 404);
  assert.equal((await get(pa, '/..%2F..%2Fetc%2Fpasswd')).status, 403);
});

test('the same index.html in another checkout is another build', () => {
  assert.notEqual(buildId(fakeDist('<p>same</p>')), buildId(fakeDist('<p>same</p>')));
});

test('render.mjs refuses a port that serves another deck, or nothing of ours', async (t) => {
  // A checkout of its own: render.mjs checks the dist/ beside its scripts/.
  const checkout = path.dirname(fakeDist('<p>this checkout</p>'));
  fs.mkdirSync(path.join(checkout, 'scripts'));
  for (const f of ['render.mjs', 'serve.mjs']) fs.copyFileSync(path.join(root, 'scripts', f), path.join(checkout, 'scripts', f));
  const render = (port) => run(process.execPath, ['scripts/render.mjs', String(port), 'report'], { cwd: checkout, env: { ...process.env, CHROME: '/bin/false' } });
  const refuses = (why) => (err) => err.code === 1 && err.stderr.includes(why);

  const other = await serve(fakeDist('<p>another worktree</p>'));
  const stranger = http.createServer((_, res) => res.end('hello'));
  await new Promise((r) => stranger.listen(0, '127.0.0.1', r));
  t.after(() => { other.close(); stranger.close(); });
  for (const server of [other, stranger]) {
    await assert.rejects(render(server.address().port), refuses("is not serving this checkout's dist/ (another build)"));
  }
  const closed = await serve(fakeDist('<p>gone</p>'));
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  await assert.rejects(render(port), refuses('(no sl-ide server)'));

  fs.rmSync(path.join(checkout, 'dist'), { recursive: true });
  await assert.rejects(render(other.address().port), refuses('dist/ is not built'));
});

// Two copies with different decks, audited at the same time, while something
// else holds the port audit.sh used to hard-code.
test('concurrent audits in two copies each report their own deck', { timeout: 120_000 }, async (t) => {
  const skip = new Set(['node_modules', '.git', 'dist', 'output', '.agents', '.claude', '.sl-ide', '.lab']);
  const copy = (title) => {
    const dir = tmp('sl-ide-worktree-');
    fs.cpSync(root, dir, { recursive: true, filter: (src) => !skip.has(path.basename(src)) || path.dirname(src) !== root });
    // A symlinked node_modules, as the smoke tests use; pnpm's install check would refuse it.
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
    const content = path.join(dir, 'src/deck/pages/cover.js');
    const src = fs.readFileSync(content, 'utf8');
    assert.ok(src.includes("title: 'Cover',"));
    fs.writeFileSync(content, src.replace("title: 'Cover',", `title: '${title}',`));
    return dir;
  };
  const squatter = http.createServer((_, res) => res.end('<!doctype html><title>someone else</title>'));
  await new Promise((r) => squatter.once('error', r).listen(8242, '127.0.0.1', r));
  t.after(() => squatter.close());

  const [a, b] = [copy('Deck Alpha'), copy('Deck Beta')];
  const [ra, rb] = await Promise.all([a, b].map((cwd) => run('./scripts/audit.sh', { cwd, env: { ...process.env, pnpm_config_verify_deps_before_run: 'false' } })));
  assert.match(ra.stdout, /Deck Alpha/);
  assert.doesNotMatch(ra.stdout, /Deck Beta/);
  assert.match(rb.stdout, /Deck Beta/);
  assert.doesNotMatch(rb.stdout, /Deck Alpha/);
});
