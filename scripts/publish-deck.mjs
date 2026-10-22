#!/usr/bin/env node
// Publish the built deck to sl-ide cloud, as the version for this commit.
//
//   pnpm build && pnpm pdf && pnpm publish-deck
//
// CI runs this on every push (.github/workflows/publish.yml). The branch's
// link then shows this version: main at app.sl-ide.com/d/<slug>/, any other
// branch at app.sl-ide.com/d/<slug>/r/<encoded-branch>/.
//
// Reads sl-ide.config.json:   { "slug", "team", "visibility": "public" | "team" }
// Needs SL_IDE_PUBLISH_TOKEN; SL_IDE_URL overrides https://app.sl-ide.com.
// Uploads dist/ plus the PDF (output/<META.pdfName>.pdf) as deck.pdf and the
// cover image (output/cover.png) as deck-cover.png, one file per request, then
// records the version. Nothing changes for viewers until
// that last step succeeds.
//
//   pnpm publish-deck --unpublish <branch>
//
// takes a branch's link down (.github/workflows/unpublish.yml runs it when a
// PR closes or a branch is deleted). Its versions stay at /v/<sha>/ for 30
// days, then the cloud deletes them; anything that was on main stays.
import { randomUUID, createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const die = (msg) => { console.error(`publish-deck: ${msg}`); process.exit(1); };
const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };

const configPath = path.join(ROOT, 'sl-ide.config.json');
if (!fs.existsSync(configPath)) {
  console.log('publish-deck: no sl-ide.config.json, so this deck is not set up to publish (see README, "Publish to sl-ide cloud")');
  process.exit(0);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { slug, team, visibility = 'team' } = config;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
if (!SLUG_RE.test(slug ?? '')) die(`"slug" must be lowercase letters, digits and dashes (got ${JSON.stringify(slug)})`);
if (!SLUG_RE.test(team ?? '')) die('"team" must be the slug of your team on sl-ide cloud');
if (!['public', 'team'].includes(visibility)) die('"visibility" must be "public" or "team"');

const token = process.env.SL_IDE_PUBLISH_TOKEN;
if (!token) die('SL_IDE_PUBLISH_TOKEN is not set (a GitHub Actions secret in CI)');
const base = (process.env.SL_IDE_URL || config.url || 'https://app.sl-ide.com').replace(/\/$/, '');
const uploadId = randomUUID();
const auth = { Authorization: `Bearer ${token}`, 'X-Sl-Ide-Upload-Id': uploadId, 'X-Sl-Ide-Team': team };
const manifest = Object.create(null);

const unpublish = process.argv.indexOf('--unpublish');
if (unpublish !== -1) {
  const name = process.argv[unpublish + 1];
  if (!name) die('--unpublish needs a branch name');
  if (name === 'main') die('main is never unpublished');
  const res = await fetch(`${base}/api/publish/${slug}/refs/${name.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE', headers: auth });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) die(`unpublishing ${name} failed: ${res.status} ${out.error ?? ''}`);
  console.log(`publish-deck: ${out.deleted ? 'took down' : 'nothing published for'} ${slug} @ ${name}`);
  process.exit(0);
}

const sha = process.env.GITHUB_SHA || git('rev-parse HEAD');
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('rev-parse --abbrev-ref HEAD');
if (!/^[0-9a-f]{40}$/.test(sha)) die('could not read the commit sha');
if (!branch || branch === 'HEAD') die('could not read the branch name');
const repo = process.env.GITHUB_REPOSITORY || (git('remote get-url origin').match(/github\.com[/:](.+?)(\.git)?$/)?.[1] ?? null);

const dist = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) die('no dist/index.html: run pnpm build first');

const { META } = await import(path.join(ROOT, 'src/deck/content.js'));
const pdf = path.join(ROOT, 'output', `${META.pdfName || 'deck'}.pdf`);
const hasPdf = fs.existsSync(pdf);
if (!hasPdf) console.warn(`publish-deck: no ${path.relative(ROOT, pdf)}; publishing without a PDF (run pnpm pdf)`);
// The deck list's thumbnail; without one it shows the title.
const cover = path.join(ROOT, 'output', 'cover.png');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
// index.html last, so a half-finished upload never has a page pointing at
// assets that aren't there yet.
const files = walk(dist)
  .map((p) => ({ from: p, to: path.relative(dist, p).split(path.sep).join('/') }))
  .sort((a, b) => (a.to === 'index.html') - (b.to === 'index.html'));
if (hasPdf) files.unshift({ from: pdf, to: 'deck.pdf' });
if (fs.existsSync(cover)) files.unshift({ from: cover, to: 'deck-cover.png' });

async function upload({ from, to }) {
  const body = fs.readFileSync(from);
  if (body.length > 4_000_000) die(`${to} exceeds the cloud's 4 MB per-file limit`);
  const hash = createHash('sha256').update(body).digest('hex');
  manifest[to] = { hash, size: body.length };
  const url = `${base}/api/publish/${slug}/${sha}/${to.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, { method: 'PUT', headers: auth, body }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) {
      const uploaded = await res.json();
      if (uploaded.hash !== hash || uploaded.size !== body.length) die(`cloud checksum mismatch for ${to}`);
      return;
    }
    if ([403, 409, 413, 426].includes(res.status)) die(`upload of ${to} rejected: ${res.status} ${await res.text()}`);
    if (res.status === 401) die('the cloud rejected SL_IDE_PUBLISH_TOKEN');
    if (attempt >= 3) die(`upload of ${to} failed: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
}

console.log(`publish-deck: ${slug} @ ${sha.slice(0, 7)} (${branch}) -> ${base}`);
const rest = files.slice(0, -1);
const last = files[files.length - 1];
for (let i = 0; i < rest.length; i += 6) await Promise.all(rest.slice(i, i + 6).map(upload));
await upload(last);

// Pages in the PDF: Chrome writes one "/Type /Page" object per page.
const pages = hasPdf ? (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length || null : null;

const res = await fetch(`${base}/api/publish/${slug}/${sha}`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ uploadId, manifest, branch, title: META.deckTitle, format: META.format === 'memo' ? 'memo' : 'slides', visibility, team, repo, pages, hasPdf }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) die(`recording the version failed: ${res.status} ${out.error ?? ''}`);
if (out.notice) console.log(`publish-deck: ${out.notice}`);
console.log(`publish-deck: ${files.length} files published\n  ${out.url}\n  this version: ${out.version}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Published to sl-ide cloud\n\n- Latest on \`${branch}\`: ${out.url}\n- This version: ${out.version}\n`);
}
// For the workflow's later steps (the PR comment).
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${out.url}\nversion=${out.version}\n`);
}
