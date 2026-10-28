// scripts/claim-deck.mjs against a fake GitHub id-token endpoint and a fake
// cloud: it asks for a token meant for the cloud, sends it with the code, and
// fails loudly on a refusal or a missing setting. The real cloud side is
// cloud's src/test/claim.integration.test.ts. Run with `pnpm test`.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t, answer) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sl-ide-claim-'));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts/claim-deck.mjs'), path.join(dir, 'scripts/claim-deck.mjs'));
  fs.writeFileSync(path.join(dir, 'sl-ide.config.json'), JSON.stringify({ slug: 'my-deck' }));
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    if (req.url.startsWith('/token')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ value: 'oidc-jwt' }));
    } else {
      const [status, out] = answer;
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const run = async (env) => {
    try {
      return { code: 0, ...await execFileAsync(process.execPath, [path.join(dir, 'scripts/claim-deck.mjs')], {
        env: { PATH: process.env.PATH, SL_IDE_URL: base, CODE: 'the-code', ACTIONS_ID_TOKEN_REQUEST_URL: `${base}/token?api-version=2.0`, ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token', ...env },
      }) };
    } catch (error) { return error; }
  };
  return { base, seen, run };
}

describe('claim-deck', () => {
  it('asks GitHub for a token meant for the cloud and sends it with the code', async (t) => {
    const { base, seen, run } = await fixture(t, [200, { ok: true }]);
    const { code, stdout } = await run({});
    assert.equal(code, 0);
    assert.match(stdout, /"my-deck" now belongs to the account that started the claim/);
    const [token, claim] = seen;
    assert.equal(token.auth, 'Bearer request-token');
    assert.equal(new URL(token.url, base).searchParams.get('audience'), base);
    assert.deepEqual([claim.method, claim.url, claim.auth, JSON.parse(claim.body)], ['POST', '/api/claim/my-deck', 'Bearer oidc-jwt', { code: 'the-code' }]);
  });

  it("prints the cloud's reason when it refuses", async (t) => {
    const { run } = await fixture(t, [403, { error: "this workflow didn't run in the deck's repo" }]);
    const { code, stderr } = await run({});
    assert.equal(code, 1);
    assert.match(stderr, /refused the claim \(403\): this workflow didn't run in the deck's repo/);
  });

  it('stops before any request without a code or an id-token', async (t) => {
    const { seen, run } = await fixture(t, [200, { ok: true }]);
    assert.match((await run({ CODE: '' })).stderr, /CODE is not set/);
    assert.match((await run({ ACTIONS_ID_TOKEN_REQUEST_URL: '' })).stderr, /id-token: write/);
    assert.equal(seen.length, 0);
  });
});
