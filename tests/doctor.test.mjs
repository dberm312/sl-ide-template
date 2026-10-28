// The last-publish line in `pnpm doctor` and the `pnpm dev` banner (SL-91):
// the deck's own repo (`-R` origin), a failure flagged, and never a hang or a
// failure when gh is missing, signed out or offline, or there's no origin.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://github.com/acme/deck.git';
const which = (cmd) => execFileSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).trim();
const GIT = which('git');
const hour = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const RUN = { databaseId: 123, headBranch: 'main', headSha: 'abcdef0123456789', createdAt: hour(2), url: 'https://github.com/acme/deck/actions/runs/123' };
// No user or system git config: the VM's url.insteadOf would rewrite ORIGIN.
const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

// Canonical paths keep doctor.js's entrypoint check working on macOS /var symlinks.
// A deck in a temp dir with its own copy of doctor.js and a PATH holding only
// git and, when given, a gh: 'fake' (tests/fake-gh.mjs) or a shell body.
async function deck(t, { config = true, origin = ORIGIN, gh, runs = [], setUp = false } = {}) {
  const dir = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sl-ide-doctor-')));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.copyFileSync(path.join(root, 'scripts/doctor.js'), path.join(dir, 'scripts/doctor.js'));
  fs.symlinkSync(GIT, path.join(dir, 'bin/git'));
  execFileSync(GIT, ['init', '-q'], { cwd: dir, env: { ...process.env, ...GIT_ENV } });
  if (origin) execFileSync(GIT, ['remote', 'add', 'origin', origin], { cwd: dir, env: { ...process.env, ...GIT_ENV } });
  if (config) fs.writeFileSync(path.join(dir, 'sl-ide.config.json'), '{ "slug": "deck" }\n');
  if (setUp) for (const f of ['PRODUCT.md', 'DESIGN.md']) fs.writeFileSync(path.join(dir, f), '# x\n');
  const stateFile = path.join(dir, 'gh.json');
  fs.writeFileSync(stateFile, JSON.stringify({ repo: ORIGIN, calls: [], prs: [], comments: [], runs }));
  if (gh === 'fake') {
    fs.writeFileSync(path.join(dir, 'bin/gh'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(root, 'tests/fake-gh.mjs')}" "$@"\n`, { mode: 0o755 });
  } else if (gh) {
    fs.writeFileSync(path.join(dir, 'bin/gh'), `#!/bin/sh\n${gh}\n`, { mode: 0o755 });
  }
  const doctor = async (...args) => {
    const started = Date.now();
    const r = await execFileAsync(process.execPath, [path.join(dir, 'scripts/doctor.js'), ...args], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, PATH: path.join(dir, 'bin'), FAKE_GH_STATE: stateFile },
    }).then((x) => ({ ...x, code: 0 }), (e) => ({ stdout: e.stdout, stderr: e.stderr, code: e.code }));
    return { ...r, ms: Date.now() - started };
  };
  return {
    dir,
    calls: () => JSON.parse(fs.readFileSync(stateFile, 'utf8')).calls,
    publish: async () => JSON.parse((await doctor('--json')).stdout).publish,
    doctor,
  };
}

describe('last publish', { concurrency: true }, () => {
  it('asks gh for the latest Publish deck run on origin, by URL, never gh\'s default repo', async (t) => {
    const d = await deck(t, { gh: 'fake', runs: [{ ...RUN, status: 'completed', conclusion: 'success' }] });
    const p = await d.publish();
    assert.deepEqual(d.calls(), [['run', 'list', '-R', ORIGIN, '--workflow', 'publish.yml', '-L', '1',
      '--json', 'databaseId,status,conclusion,headBranch,headSha,createdAt,url']]);
    assert.equal(p.state, 'ok');
    assert.equal(p.detail, 'main @abcdef0 passed 2 h ago');
    assert.match((await d.doctor()).stdout, /✓ Last publish +main @abcdef0 passed 2 h ago/);
  });

  it('flags a failed run with the command that shows why, and keeps the setup exit code', async (t) => {
    const d = await deck(t, { gh: 'fake', setUp: true, runs: [{ ...RUN, status: 'completed', conclusion: 'failure' }] });
    const p = await d.publish();
    assert.equal(p.state, 'failed');
    assert.equal(p.fix, `gh run view 123 -R ${ORIGIN} --log-failed`);
    const r = await d.doctor();
    assert.match(r.stdout, /✕ Last publish +Publish deck failed: main @abcdef0 failure 2 h ago {2}gh run view 123 -R \S+ --log-failed/);
    assert.equal(r.code, 0, 'a failed publish is not a setup step');
  });

  it('shows a run still in progress', async (t) => {
    const d = await deck(t, { gh: 'fake', runs: [{ ...RUN, createdAt: hour(0), status: 'in_progress', conclusion: '' }] });
    assert.deepEqual(await d.publish(), { state: 'running', detail: 'main @abcdef0 in progress, started 0 min ago', url: RUN.url });
  });

  it('says when the repo has no run yet', async (t) => {
    const d = await deck(t, { gh: 'fake', runs: [] });
    assert.equal((await d.publish()).detail, 'no Publish deck run yet');
  });

  it('skips a deck that is not set up to publish, without calling gh', async (t) => {
    const d = await deck(t, { gh: 'fake', config: false });
    assert.equal(await d.publish(), null);
    assert.doesNotMatch((await d.doctor()).stdout, /Last publish/);
    assert.deepEqual(d.calls(), []);
  });

  it('skips gh when there is no origin remote', async (t) => {
    const d = await deck(t, { gh: 'fake', origin: null });
    assert.deepEqual(await d.publish(), { state: 'unknown', detail: 'no origin remote yet; push the deck to publish it' });
    assert.deepEqual(d.calls(), []);
  });

  it('copes with gh missing', async (t) => {
    const d = await deck(t);
    const r = await d.doctor();
    assert.equal(r.code, 1, 'exit code is still setup only (no PRODUCT.md)');
    assert.match(r.stdout, /Last publish +install the GitHub CLI \(gh\) to see it/);
  });

  it('copes with gh signed out', async (t) => {
    const d = await deck(t, { gh: "echo 'To get started with GitHub CLI, please run:  gh auth login' >&2; exit 4" });
    assert.deepEqual(await d.publish(), { state: 'unknown', detail: 'gh is not signed in', fix: 'gh auth login' });
  });

  it('copes with gh offline', async (t) => {
    const d = await deck(t, { gh: "echo 'error connecting to api.github.com' >&2; exit 1" });
    assert.equal((await d.publish()).detail, `gh could not read ${ORIGIN}'s runs: error connecting to api.github.com`);
  });

  it('gives up on a gh that hangs after 3 s, even one whose child holds its output open', async (t) => {
    const d = await deck(t, { gh: `${which('sleep')} 60`, setUp: true });
    const r = await d.doctor();
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Last publish +gh took over 3 s \(offline\?\)/);
    assert.ok(r.ms < 6000, `took ${r.ms} ms`);
  });
});

it('pnpm dev prints the last publish under the banner without waiting for it', async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sl-ide-doctor-dev-'));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'sl-ide.config.json'), '{ "slug": "deck" }\n');
  const { default: config } = await import('../vite.config.js');
  const plugin = config.plugins.flat().find((p) => p?.name === 'sl-ide');
  const server = { config: { root: dir }, middlewares: { use() {} }, printUrls() {}, resolvedUrls: { local: ['http://localhost:5173/'] } };
  plugin.configureServer(server);
  const lines = [];
  const log = console.log;
  console.log = (s) => lines.push(String(s));
  try {
    server.printUrls();
    assert.equal(lines.length, 1, 'the banner prints at once');
    for (let i = 0; i < 100 && lines.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
  } finally {
    console.log = log;
  }
  assert.match(lines[0], /sl-ide/);
  assert.match(lines[1], /Last publish +no origin remote yet/);
});
