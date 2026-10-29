#!/usr/bin/env node
// Headless Claude Code and Codex runs on fixed deck tasks (SL-70).
//
//   pnpm agent-bench [--agent claude|codex|both] [--task <id>] [--runs N]
//                    [--jobs N] [--max-turns N] [--budget USD] [--compare] [--baseline]
//
// Each run copies this project to a temp dir (symlinked node_modules, its own
// git repo), seeds the task, runs the agent, then checks the result with
// scripts: the audit, the diff, the figures. Writes output/agent-bench.json;
// --compare diffs it against bench/agent-baseline.json, --baseline writes
// that file (AGENT_BENCH_OUT moves the report). Local and manual: it spends tokens. CLAUDE_BIN / CODEX_BIN
// override the CLIs (the tests use fakes).
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { TASKS, deckFiles, figures } from '../bench/agent-tasks.mjs';

const root = path.resolve(import.meta.dirname, '..');
const run = promisify(execFile);
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? def : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);
const agents = { both: ['claude', 'codex'], claude: ['claude'], codex: ['codex'] }[opt('agent', 'both')];
const tasks = TASKS.filter((t) => !opt('task') || t.id === opt('task'));
const runs = Number(opt('runs', 3));
const jobs = Number(opt('jobs', 2));
const maxTurns = Number(opt('max-turns', 40));
const budget = Number(opt('budget', 2));
const wallCap = Number(opt('timeout-min', 15)) * 60_000;
if (!agents || !tasks.length || !Number.isInteger(runs) || runs <= 0
  || !Number.isInteger(jobs) || jobs <= 0 || !Number.isInteger(maxTurns) || maxTurns <= 0
  || !Number.isFinite(budget) || budget <= 0 || !Number.isFinite(wallCap) || wallCap <= 0) {
  console.error(`usage: pnpm agent-bench [--agent claude|codex|both] [--task ${TASKS.map((t) => t.id).join('|')}] [--runs N] [--compare] [--baseline]`);
  process.exit(2);
}

const git = (dir, ...a) => run('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@localhost', ...a], { cwd: dir });
const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-agent-bench-'));
  fs.cpSync(root, dir, { recursive: true, filter: (src) => !/^(node_modules|\.git|dist|output|\.sl-ide|\.lab)(\/|$)/.test(path.relative(root, src)) });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
}

const AUDIT_CMD = /pnpm (run )?audit|audit\.sh|pnpm check/;

// Claude Code: stream-json events; the last one is the result.
function parseClaude(out) {
  const m = { turns: null, tools: {}, readsBeforeEdit: 0, tokens: null, cost: null, ranAudit: false, capped: false, error: null };
  let edited = false;
  for (const line of out.split('\n')) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'assistant') {
      for (const c of e.message?.content ?? []) {
        if (c.type !== 'tool_use') continue;
        m.tools[c.name] = (m.tools[c.name] ?? 0) + 1;
        if (/^(Edit|Write|MultiEdit)$/.test(c.name)) edited = true;
        else if (!edited && c.name === 'Read') m.readsBeforeEdit += 1;
        if (c.name === 'Bash' && AUDIT_CMD.test(c.input?.command ?? '')) m.ranAudit = true;
      }
    } else if (e.type === 'result') {
      m.turns = e.num_turns ?? null;
      m.cost = e.total_cost_usd ?? null;
      const u = e.usage ?? {};
      m.tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      m.capped = /max_turns|max_budget/.test(e.subtype ?? '');
      if (e.is_error) m.error = e.subtype ?? 'error';
    }
  }
  return m;
}

// Codex: JSONL thread events; items are commands, file changes, messages.
function parseCodex(out) {
  const m = { turns: 0, tools: {}, readsBeforeEdit: 0, tokens: 0, cost: null, ranAudit: false, capped: false, error: null };
  let edited = false;
  for (const line of out.split('\n')) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'turn.completed') {
      m.turns += 1;
      const u = e.usage ?? {};
      m.tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
    } else if (e.type === 'turn.failed' || e.type === 'error') m.error = e.error?.message ?? e.message ?? 'error';
    else if (e.type === 'item.completed' && e.item && !/^(agent_message|reasoning)$/.test(e.item.type)) {
      const t = e.item.type;
      m.tools[t] = (m.tools[t] ?? 0) + 1;
      if (t === 'file_change') edited = true;
      else if (!edited && t === 'command_execution') m.readsBeforeEdit += 1;
      if (t === 'command_execution' && AUDIT_CMD.test(e.item.command ?? '')) m.ranAudit = true;
    }
  }
  return m;
}

function invoke(agent, prompt, dir) {
  const [bin, args, parse] = agent === 'claude'
    ? [process.env.CLAUDE_BIN ?? 'claude', ['-p', prompt, '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'acceptEdits', '--max-turns', String(maxTurns), '--max-budget-usd', String(budget)], parseClaude]
    : [process.env.CODEX_BIN ?? 'codex', ['exec', '--json', '-C', dir, '--sandbox', 'workspace-write', '--ephemeral',
      '-o', path.join(dir, '.agent-last-message'), prompt], parseCodex];
  return new Promise((resolve) => {
    const started = performance.now();
    const grouped = process.platform !== 'win32';
    const child = spawn(bin, args, {
      cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: grouped,
      // Copies share installed dependencies; pnpm must not try to replace the symlink.
      env: { ...process.env, pnpm_config_verify_deps_before_run: 'false' },
    });
    const stop = () => {
      if (grouped && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); return; } catch { /* group already gone */ }
      }
      child.kill('SIGKILL');
    };
    let out = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => { timedOut = true; stop(); }, wallCap);
    let finished = false;
    const done = (code, err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      stop(); // also remove background tools before deleting the project
      const m = parse(out);
      if (timedOut) Object.assign(m, { capped: true, error: 'wall-time cap' });
      else if (err) m.error = err.message;
      else if (code !== 0 && !m.error) m.error = `exit ${code}`;
      resolve({ wall: (performance.now() - started) / 1000, ...m });
    };
    child.on('error', (err) => done(null, err));
    child.on('close', (code) => done(code));
  });
}

const allowedBy = (list, f) => list.some((a) => (typeof a === 'string' ? a === f : a.test(f)));

async function one(agent, task, n) {
  const dir = await project();
  let result;
  try {
    await git(dir, 'init', '-q');
    await git(dir, 'add', '-A');
    await git(dir, 'commit', '-qm', 'bench start');
    task.setup?.(dir);
    if (task.setup) await git(dir, 'commit', '-qam', 'bench seed');
    const base = deckFiles(dir);
    const head = (await git(dir, 'rev-parse', 'HEAD')).stdout.trim();
    result = await invoke(agent, task.prompt, dir);
    fs.rmSync(path.join(dir, '.agent-last-message'), { force: true });

    const audit = await run('./scripts/audit.sh', [], { cwd: dir, env: { ...process.env, pnpm_config_verify_deps_before_run: 'false' } })
      .then((r) => ({ ok: true, out: r.stdout }), (e) => ({ ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
    const changed = (await git(dir, 'status', '--porcelain', '--untracked-files=all')).stdout.split('\n').filter(Boolean)
      .map((l) => l.slice(3).replace(/^.* -> /, ''));
    const checks = {
      'agent completed': result.error === null,
      'audit passes': audit.ok,
      'only allowed files': changed.every((f) => allowedBy(task.allowed, f)),
      'no commit': (await git(dir, 'rev-parse', 'HEAD')).stdout.trim() === head,
      'figures survive': figures(Object.values(base).join('\n')).every((f) => Object.values(deckFiles(dir)).join('\n').includes(f)),
      'within caps': !result.capped,
      ...(await task.checks(dir, base, audit.out)),
    };
    const pass = Object.values(checks).every(Boolean);
    console.log(`${agent.padEnd(6)} ${task.id.padEnd(14)} #${n}  ${pass ? 'pass' : 'FAIL'}  ${result.wall.toFixed(1)} s`
      + (pass ? '' : `  (${Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(', ')})`));
    return { agent, task: task.id, run: n, pass, checks, changed, ...result };
  } catch (err) {
    // A broken agent edit must fail this attempt, not discard every result.
    console.log(`${agent.padEnd(6)} ${task.id.padEnd(14)} #${n}  FAIL  (could not score: ${err.message})`);
    return {
      agent, task: task.id, run: n, ...result, pass: false,
      checks: { 'run completed': false }, scoringError: err.message,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const queue = agents.flatMap((a) => tasks.flatMap((t) => Array.from({ length: runs }, (_, i) => () => one(a, t, i + 1))));
const results = [];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) results.push(await queue.shift()());
}));

const summary = agents.flatMap((agent) => tasks.map((t) => {
  const rs = results.filter((r) => r.agent === agent && r.task === t.id);
  return {
    agent, task: t.id, runs: rs.length, passRate: rs.filter((r) => r.pass).length / rs.length,
    wall: median(rs.map((r) => r.wall)), turns: median(rs.map((r) => r.turns)), cost: median(rs.map((r) => r.cost)),
    tokens: median(rs.map((r) => r.tokens)), ranAudit: rs.filter((r) => r.ranAudit).length,
  };
}));
const report = { date: new Date().toISOString(), node: process.version, os: `${os.platform()} ${os.release()}`, cpus: os.cpus().length, summary, results };
const outFile = process.env.AGENT_BENCH_OUT ?? path.join(root, 'output/agent-bench.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

const baselineFile = path.join(root, 'bench/agent-baseline.json');
const baseline = has('compare') && fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')).summary : null;
const fmt = (x, d = 1) => (x == null ? '—' : x.toFixed(d));
console.log('\nAGENT   TASK            PASS   WALL s  TURNS  COST $  AUDITED' + (baseline ? '   BASELINE PASS / WALL' : ''));
for (const s of summary) {
  const b = baseline?.find((x) => x.agent === s.agent && x.task === s.task);
  console.log([s.agent.padEnd(6), s.task.padEnd(14), `${Math.round(s.passRate * 100)}%`.padStart(4),
    fmt(s.wall).padStart(7), fmt(s.turns, 0).padStart(6), fmt(s.cost, 2).padStart(7), `${s.ranAudit}/${s.runs}`.padStart(8),
    ...(baseline ? [b ? `${Math.round(b.passRate * 100)}% / ${fmt(b.wall)} s`.padStart(22) : 'no baseline'.padStart(22)] : [])].join('  '));
}
if (has('baseline')) {
  fs.writeFileSync(baselineFile, `${JSON.stringify({ date: report.date, node: report.node, os: report.os, cpus: report.cpus, summary }, null, 2)}\n`);
  console.log('wrote bench/agent-baseline.json');
}
console.log(`wrote ${path.relative(root, outFile)}`);
