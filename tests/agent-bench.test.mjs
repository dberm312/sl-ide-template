// pnpm agent-bench (SL-70) against a fake claude and codex: the runner's
// isolation, its parsing of both CLIs' events and its scripted checks.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const fake = path.join(root, 'tests/fixtures/fake-agent.mjs');
async function bench(mode, ...args) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bench-test-')), 'report.json');
  await promisify(execFile)(process.execPath, ['scripts/agent-bench.mjs', ...args, '--task', 'copy-edit', '--runs', '1'],
    { cwd: root, env: { ...process.env, CLAUDE_BIN: fake, CODEX_BIN: fake, FAKE_AGENT_MODE: mode, AGENT_BENCH_OUT: out,
      ...(mode === 'dependency-env' && { pnpm_config_verify_deps_before_run: 'true' }) } });
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  return report;
}

test('a correct edit passes for both agents, with turns, tools, tokens and cost parsed', async () => {
  const { results, summary } = await bench('good', '--agent', 'both');
  const claude = results.find((r) => r.agent === 'claude');
  const codex = results.find((r) => r.agent === 'codex');
  assert.equal(claude.pass, true, JSON.stringify(claude.checks));
  assert.equal(codex.pass, true, JSON.stringify(codex.checks));
  assert.deepEqual([claude.turns, claude.cost, claude.tokens, claude.readsBeforeEdit, claude.ranAudit], [3, 0.12, 1000, 2, true]);
  assert.deepEqual(claude.tools, { Read: 2, Edit: 1, Bash: 1 });
  assert.deepEqual([codex.turns, codex.tokens, codex.readsBeforeEdit, codex.ranAudit], [1, 1200, 1, true]);
  assert.deepEqual(claude.changed, ['src/deck/content.js']);
  assert.deepEqual(summary.map((s) => [s.agent, s.passRate]), [['claude', 1], ['codex', 1]]);
});

test('a commit, a file outside the task, or a cap is a failure', async () => {
  const [commit, styles, capped] = await Promise.all(['commit', 'styles', 'capped']
    .map(async (m) => (await bench(m, '--agent', 'claude')).results[0]));
  assert.equal(commit.checks['no commit'], false);
  assert.equal(styles.checks['only allowed files'], false);
  assert.equal(capped.checks['within caps'], false);
  assert.ok(![commit, styles, capped].some((r) => r.pass));
});

test('an agent error fails even after a correct edit', async () => {
  const { results } = await bench('error', '--agent', 'both');
  for (const result of results) {
    assert.equal(result.checks['audit passes'], true);
    assert.equal(result.checks['title changed'], true);
    assert.equal(result.checks['agent completed'], false);
    assert.ok(result.error);
    assert.equal(result.pass, false);
  }
});

test('agent commands reuse installed dependencies even when parent verification is enabled', async () => {
  const { results } = await bench('dependency-env', '--agent', 'both');
  assert.ok(results.every((result) => result.pass));
});

test('invalid run counts and caps stop before running an agent', async () => {
  for (const args of [['--jobs', '0'], ['--jobs', 'NaN'], ['--jobs', 'Infinity'], ['--jobs', '1.5'],
    ['--runs', 'NaN'], ['--budget', 'Infinity'], ['--timeout-min', '0'], ['--max-turns', '-1']]) {
    await assert.rejects(promisify(execFile)(process.execPath, ['scripts/agent-bench.mjs', ...args], { cwd: root }),
      (error) => error.code === 2 && error.stderr.includes('usage:'));
  }
});

test('an overflow fix preserves the original in a fit comment without failing live-copy scoring', async () => {
  const { results } = await bench('overflow-comment', '--task', 'overflow-fix', '--agent', 'both');
  for (const result of results) assert.equal(result.pass, true, JSON.stringify(result.checks));
});

test('shortening repeated overflow copy may preserve its opening phrase', async () => {
  const { results } = await bench('overflow-repeat', '--task', 'overflow-fix', '--agent', 'both');
  for (const result of results) assert.equal(result.pass, true, JSON.stringify(result.checks));
});

test('a broken edit is recorded as a failed attempt without losing the report', async () => {
  const { results, summary } = await bench('missing-content', '--agent', 'both');
  assert.equal(results.length, 2);
  for (const result of results) {
    assert.equal(result.pass, false);
    assert.equal(result.checks['run completed'], false);
    assert.match(result.scoringError, /ENOENT/);
  }
  assert.ok(summary.every((s) => s.runs === 1 && s.passRate === 0));
});

test('the wall cap stops tool descendants holding the agent pipes open', { skip: process.platform === 'win32' }, async () => {
  const { results: [result] } = await bench('descendant', '--agent', 'claude', '--timeout-min', '0.033333');
  assert.equal(result.tools.FixtureChild, 1, 'the fixture spawned its tool before the cap');
  assert.equal(result.capped, true);
  assert.equal(result.pass, false);
  assert.ok(result.wall < 5, `wall cap did not stop the descendant: ${result.wall}s`);
});
