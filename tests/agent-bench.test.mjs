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
  await promisify(execFile)(process.execPath, ['scripts/agent-bench.mjs', '--task', 'copy-edit', '--runs', '1', ...args],
    { cwd: root, env: { ...process.env, CLAUDE_BIN: fake, CODEX_BIN: fake, FAKE_AGENT_MODE: mode, AGENT_BENCH_OUT: out } });
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
