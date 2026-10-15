#!/usr/bin/env node
// Switch a fresh project from the slide starter to another format's starter.
//
//   pnpm use-format memo     -> US Letter memo (starters/memo)
//
// Copies starters/<format>/ over the project, deletes the slide starter's
// pages, and updates the "This deck" note in AGENTS.md. Meant for a new
// project, before any pages are your own: `pnpm create sl-ide --format memo`
// runs it for you. It refuses when the slide starter's pages are gone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const format = process.argv[2];
const die = (msg) => { console.error(`use-format: ${msg}`); process.exit(1); };

const FORMATS = {
  memo: {
    note: 'The starter memo: a flowing body that explains how memos work, then\nA1 Where things live (a fixed page). It explains the harness; replace it.',
  },
};
if (!FORMATS[format]) die(`usage: pnpm use-format <${Object.keys(FORMATS).join('|')}>`);

const SLIDE_STARTER = [
  'src/slides/CoverSlide.jsx', 'src/slides/StartHereSlide.jsx', 'src/slides/AnatomySlide.jsx',
  'src/slides/ChecksSlide.jsx', 'src/slides/AppendixDivider.jsx', 'src/slides/FilesSlide.jsx',
];
if (!SLIDE_STARTER.every((f) => fs.existsSync(path.join(ROOT, f)))) {
  die('this project no longer has the slide starter, so its pages are your own; switch by hand');
}

const from = path.join(ROOT, 'starters', format);
function copy(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const src = path.join(dir, e.name);
    if (e.isDirectory()) { copy(src); continue; }
    const dst = path.join(ROOT, path.relative(from, src));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log(`  wrote ${path.relative(ROOT, dst)}`);
  }
}
copy(from);
for (const f of SLIDE_STARTER) {
  fs.rmSync(path.join(ROOT, f));
  console.log(`  removed ${f}`);
}

const agents = path.join(ROOT, 'AGENTS.md');
const text = fs.readFileSync(agents, 'utf8');
const re = /The starter deck:[\s\S]*?replace it\./;
if (re.test(text)) fs.writeFileSync(agents, text.replace(re, FORMATS[format].note));
console.log(`use-format: this project is now a ${format}. Run pnpm dev to see it.`);
