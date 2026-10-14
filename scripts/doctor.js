#!/usr/bin/env node
// sl-ide's setup checks. One source for three readers:
//   - the banner `pnpm dev` prints under Vite's URLs (vite.config.js)
//   - the "Setup · N steps left" chip in the dev bar (/__sl-ide/status)
//   - `pnpm doctor`, which prints the same banner and exits 1 until set up
//
// Setup is three things: the agent skills are reachable, PRODUCT.md exists,
// and DESIGN.md exists. Impeccable writes both docs (init, then a style pass);
// the /new-deck skill runs it. Chrome is reported but optional for preview.
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
        fix: 'run /new-deck in Claude Code ($new-deck in Codex)',
      },
      {
        id: 'design',
        label: 'DESIGN.md',
        ok: has('DESIGN.md'),
        detail: has('DESIGN.md') ? 'visual system recorded' : 'the style impeccable learns from your brand',
        fix: 'finish /new-deck: impeccable learns the style',
      },
    ],
  };
}

const c = process.stdout.isTTY || process.env.FORCE_COLOR
  ? { b: (s) => `\x1b[1m${s}\x1b[22m`, d: (s) => `\x1b[2m${s}\x1b[22m`, g: (s) => `\x1b[32m${s}\x1b[39m`, y: (s) => `\x1b[33m${s}\x1b[39m`, cy: (s) => `\x1b[36m${s}\x1b[39m` }
  : { b: (s) => s, d: (s) => s, g: (s) => s, y: (s) => s, cy: (s) => s };

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
    `    2. Learn the style. Open Claude Code or Codex here and run ${c.cy('/new-deck')} ${c.d('(Codex: $new-deck)')}.`,
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
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(st, null, 2));
  } else {
    console.log(banner(st));
  }
  process.exit(st.checks.every((k) => k.ok) ? 0 : 1);
}
