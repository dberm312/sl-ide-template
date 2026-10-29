#!/usr/bin/env node
// sl-ide's setup checks. One source for three readers:
//   - the banner `pnpm dev` prints under Vite's URLs (vite.config.js)
//   - the "Setup · N steps left" chip in the dev bar (/__sl-ide/status)
//   - `pnpm doctor`, which prints the same banner and exits 1 until set up
//
// `pnpm doctor` and `pnpm dev` also show the deck repo's latest Publish deck
// run (lastPublish), so a failing publish shows up locally. It is information,
// never a setup step: gh missing, signed out or offline only hides it.
//
// Setup is three things: the agent skills are reachable, PRODUCT.md exists,
// and DESIGN.md exists. Impeccable writes both docs (init, then a style pass);
// the /deck-setup skill runs it. Chrome is reported but optional for preview.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();

export const CHROME_PATHS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
].filter(Boolean);

// Where Claude Code and Codex look for skills, project first, then user-level.
// A skill installed globally counts: nothing needs to be copied into the repo.
function skillDirs(root) {
  return [
    path.join(root, '.agents/skills'),
    path.join(root, '.claude/skills'),
    path.join(HOME, '.agents/skills'),
    path.join(HOME, '.claude/skills'),
    path.join(HOME, '.codex/skills'),
  ];
}

function lockedSkills(root) {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'skills-lock.json'), 'utf8')).skills);
  } catch {
    return [];
  }
}

function findSkill(root, name) {
  return skillDirs(root).find((d) => fs.existsSync(path.join(d, name, 'SKILL.md'))) ?? null;
}

// `skills experimental_install` restores into .agents/skills/ only, which
// Codex reads. Claude Code reads .claude/skills/, so link each restored skill
// there too (the layout `skills add` makes). Idempotent; never overwrites.
export function linkSkills(root = ROOT) {
  const linked = [];
  for (const name of lockedSkills(root)) {
    const src = path.join(root, '.agents/skills', name);
    const dst = path.join(root, '.claude/skills', name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue;
    try {
      fs.lstatSync(dst);
      continue;
    } catch { /* absent: link it */ }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.symlinkSync(path.join('../../.agents/skills', name), dst);
    linked.push(name);
  }
  return linked;
}

export function status(root = ROOT) {
  const skills = lockedSkills(root).map((name) => ({ name, at: findSkill(root, name) }));
  const missing = skills.filter((s) => !s.at).map((s) => s.name);
  const has = (f) => fs.existsSync(path.join(root, f));
  const chrome = CHROME_PATHS.find((p) => fs.existsSync(p)) ?? null;
  return {
    chrome,
    skills,
    checks: [
      {
        id: 'skills',
        label: 'Agent skills',
        ok: missing.length === 0,
        detail: missing.length ? `missing ${missing.join(', ')}` : skills.map((s) => s.name).join(', '),
        fix: 'pnpm skills',
      },
      {
        id: 'product',
        label: 'PRODUCT.md',
        ok: has('PRODUCT.md'),
        detail: has('PRODUCT.md') ? 'audience and purpose captured' : 'who the deck is for, and what it must do',
        fix: 'run /deck-setup in Claude Code ($deck-setup in Codex)',
      },
      {
        id: 'design',
        label: 'DESIGN.md',
        ok: has('DESIGN.md'),
        detail: has('DESIGN.md') ? 'visual system recorded' : 'the style impeccable learns from your brand',
        fix: 'finish /deck-setup: impeccable learns the style',
      },
    ],
  };
}

const GH_MS = 3000;

// Never rejects and never outlives `ms`: { code, out, err }, code null when it
// timed out and 'ENOENT' when the command is missing.
function run(cmd, args, cwd, ms = GH_MS) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, out: out.trim(), err: err.trim() });
    };
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' } });
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(null); }, ms);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish(e.code ?? 'error'));
    child.on('close', (code) => finish(code));
  });
}

const ago = (iso) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min)) return '';
  if (min < 60) return `${Math.max(min, 0)} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
};

// The latest Publish deck run on the deck's own repo: { state, detail, fix? },
// state ok | failed | running | unknown. Always `-R` origin: with an
// `upstream` remote, gh's default repo can be sl-ide itself. null when the
// deck has no sl-ide.config.json (nothing to publish).
export async function lastPublish(root = ROOT, ms = GH_MS) {
  if (!fs.existsSync(path.join(root, 'sl-ide.config.json'))) return null;
  const origin = await run('git', ['remote', 'get-url', 'origin'], root, ms);
  if (origin.code !== 0 || !origin.out) return { state: 'unknown', detail: 'no origin remote yet; push the deck to publish it' };
  const repo = origin.out;
  const gh = await run('gh', ['run', 'list', '-R', repo, '--workflow', 'publish.yml', '-L', '1',
    '--json', 'databaseId,status,conclusion,headBranch,headSha,createdAt,url'], root, ms);
  if (gh.code === 'ENOENT') return { state: 'unknown', detail: 'install the GitHub CLI (gh) to see it' };
  if (gh.code === null) return { state: 'unknown', detail: `gh took over ${ms / 1000} s (offline?)` };
  if (gh.code !== 0) {
    if (/auth login|not logged in|authenticat/i.test(gh.err)) return { state: 'unknown', detail: 'gh is not signed in', fix: 'gh auth login' };
    return { state: 'unknown', detail: `gh could not read ${repo}'s runs: ${gh.err.split('\n')[0].slice(0, 120)}` };
  }
  let r;
  try {
    [r] = JSON.parse(gh.out);
  } catch {
    return { state: 'unknown', detail: 'gh gave an unreadable answer' };
  }
  if (!r) return { state: 'unknown', detail: 'no Publish deck run yet' };
  const at = `${r.headBranch} @${String(r.headSha).slice(0, 7)}`;
  if (r.status !== 'completed') return { state: 'running', detail: `${at} ${String(r.status).replace('_', ' ')}, started ${ago(r.createdAt)}`, url: r.url };
  if (['success', 'skipped', 'neutral'].includes(r.conclusion)) return { state: 'ok', detail: `${at} passed ${ago(r.createdAt)}`, url: r.url };
  return {
    state: 'failed',
    detail: `${at} ${String(r.conclusion).replace('_', ' ')} ${ago(r.createdAt)}`,
    fix: `gh run view ${r.databaseId} -R ${repo} --log-failed`,
    url: r.url,
  };
}

const c = process.stdout.isTTY || process.env.FORCE_COLOR
  ? { b: (s) => `\x1b[1m${s}\x1b[22m`, d: (s) => `\x1b[2m${s}\x1b[22m`, g: (s) => `\x1b[32m${s}\x1b[39m`, y: (s) => `\x1b[33m${s}\x1b[39m`, r: (s) => `\x1b[31m${s}\x1b[39m`, cy: (s) => `\x1b[36m${s}\x1b[39m` }
  : { b: (s) => s, d: (s) => s, g: (s) => s, y: (s) => s, r: (s) => s, cy: (s) => s };

export function publishLine(p) {
  if (!p) return '';
  const mark = { ok: c.g('✓'), failed: c.r('✕'), running: c.y('○'), unknown: c.d('·') }[p.state];
  const text = p.state === 'failed' ? `${c.b('Publish deck failed:')} ${p.detail}` : c.d(p.detail);
  return `  ${mark} ${'Last publish'.padEnd(13)} ${text}${p.fix ? `  ${c.cy(p.fix)}` : ''}\n`;
}

export function banner(st = status(), url = 'http://localhost:5173/') {
  const done = st.checks.every((k) => k.ok);
  const logo = `${c.b('sl')}${c.cy('-')}${c.b('ide')}`;
  if (done) {
    return [
      '',
      `  ${logo}  ${c.d('ready.')} Ask Claude or Codex for pages; ${c.b('c')} on a slide copies a comment for them.`,
      `  ${c.d('/slide-lab for options · /copy-pass for copy · pnpm run audit · pnpm pdf · /ship-it')}`,
      '',
    ].join('\n');
  }
  const mark = (k) => (k.ok ? c.g('✓') : c.y('○'));
  const rows = st.checks.map((k) => `    ${mark(k)} ${k.label.padEnd(13)} ${c.d(k.detail)}`);
  rows.push(`    ${st.chrome ? c.g('✓') : c.y('○')} ${'Chrome'.padEnd(13)} ${c.d(st.chrome ? 'audit, PDF and screenshots' : 'needed for audit, PDF and screenshots; preview works without it')}`);
  const skillsOk = st.checks[0].ok;
  return [
    '',
    `  ${logo}  ${c.d('an IDE for building slides')}`,
    '',
    ...rows,
    '',
    `  ${c.b('Get started')}`,
    ...(skillsOk
      ? [`    1. ${c.d(`Skills are installed (${[...new Set(st.skills.map((s) => s.at.replace(HOME, '~')))].join(', ')}).`)}`]
      : [
        `    1. Install the skills (impeccable, copy-editing, copywriting):  ${c.cy('pnpm skills')}`,
        `       ${c.d('Restores them from skills-lock.json into .agents/ and .claude/ (gitignored). Installed globally already? Then this step is done.')}`,
      ]),
    `    2. Learn the style. Open Claude Code or Codex here and run ${c.cy('/deck-setup')} ${c.d('(Codex: $deck-setup)')}.`,
    `       ${c.d('It runs impeccable: init writes PRODUCT.md, then it reads your brand (a site, a PDF, a guide) and writes DESIGN.md and the tokens.')}`,
    `    3. Build slides. Ask for pages in plain words; watch them land at ${c.cy(url)}`,
    `       ${c.d('c = comment on any element · /slide-lab = compare takes · /copy-pass = tighten copy · /ship-it = audit, PDF, commit')}`,
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const linked = linkSkills();
  if (linked.length && !process.argv.includes('--json')) console.log(`linked for Claude Code: ${linked.join(', ')}`);
  const st = status();
  const publish = await lastPublish();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...st, publish }, null, 2));
  } else {
    console.log(banner(st));
    if (publish) console.log(publishLine(publish));
  }
  process.exit(st.checks.every((k) => k.ok) ? 0 : 1);
}
