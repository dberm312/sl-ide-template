#!/usr/bin/env node
// Publish the built deck to sl-ide cloud, as the version for this commit.
//
//   pnpm build && pnpm pdf && pnpm publish-deck
//
// CI runs this on every push (.github/workflows/publish.yml). The branch's
// link then shows this version: main at app.sl-ide.com/d/<slug>/, any other
// branch at app.sl-ide.com/d/<slug>/r/<encoded-branch>/.
//
// Reads sl-ide.config.json:   { "slug", "team" } (and "url" for another server)
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
//
// Every request has a deadline (SL_IDE_REQUEST_TIMEOUT_MS, default 60 s) and
// the whole run has one (SL_IDE_PUBLISH_DEADLINE_MS, default 4 min). A request
// that times out, loses its connection, or gets 408, 429 or 5xx is sent again,
// up to SL_IDE_PUBLISH_ATTEMPTS times (default 3), after a jittered backoff or
// the server's Retry-After (up to 30 s). Any other answer is final; a usage
// limit (413 or 429 naming `limit`) is printed with when it resets. Retries
// send the same upload session and the same bytes, so repeating is safe: an
// upload stores content-addressed bytes, finalizing the same manifest in the
// same session again answers as the first did, and unpublishing is idempotent.
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
const { slug } = config;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
if (!SLUG_RE.test(slug ?? '')) die(`"slug" must be lowercase letters, digits and dashes (got ${JSON.stringify(slug)})`);

const token = process.env.SL_IDE_PUBLISH_TOKEN;
if (!token) die('SL_IDE_PUBLISH_TOKEN is not set (a GitHub Actions secret in CI)');
const base = (process.env.SL_IDE_URL || config.url || 'https://app.sl-ide.com').replace(/\/$/, '');
const uploadId = randomUUID();
const auth = { Authorization: `Bearer ${token}`, 'X-Sl-Ide-Upload-Id': uploadId };
const manifest = Object.create(null);

const setting = (name, fallback) => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : fallback; };
const REQUEST_MS = setting('SL_IDE_REQUEST_TIMEOUT_MS', 60_000);
const ATTEMPTS = Math.min(10, Math.floor(setting('SL_IDE_PUBLISH_ATTEMPTS', 3)));
const BACKOFF_MS = setting('SL_IDE_RETRY_BACKOFF_MS', 500);
const MAX_WAIT_MS = 30_000;
const deadline = Date.now() + setting('SL_IDE_PUBLISH_DEADLINE_MS', 240_000);
const retryable = (status) => status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600);
const parse = (text) => { try { return JSON.parse(text) ?? {}; } catch { return {}; } };

function retryAfterMs(header) {
  if (!header) return null;
  const ms = /^\d+$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

// The cloud's usage limits (413 for a quota, 429 for a rate) name the limit
// in `limit`; a rate limit's Retry-After says when it resets.
function limitHint(res) {
  const { limit } = parse(res.text);
  if (!limit) return '';
  const after = retryAfterMs(res.retryAfter);
  return `\n  sl-ide usage limit reached: ${limit}. ${after ? `It resets in about ${Math.ceil(after / 60_000)} min; rerun this job then.` : 'Ask sl-ide to raise it.'}`;
}

function authHint(res) {
  if (res.status !== 401) return '';
  const { reason } = parse(res.text);
  const fixes = {
    missing: 'Set SL_IDE_PUBLISH_TOKEN to a publish token (a GitHub Actions secret in CI).',
    unknown: `Mint a new token at ${base}/tokens, then \`gh secret set SL_IDE_PUBLISH_TOKEN\`, then rerun the job.`,
    revoked: `Mint a new token at ${base}/tokens, then \`gh secret set SL_IDE_PUBLISH_TOKEN\`, then rerun the job.`,
    expired: `Mint a new token at ${base}/tokens, then \`gh secret set SL_IDE_PUBLISH_TOKEN\`, then rerun the job.`,
    'owner-missing': 'The account that minted this token no longer exists; sign in and mint a new one (the deck may need its owner moved).',
  };
  return `\n  ${Object.hasOwn(fixes, reason) ? `${reason}: ${fixes[reason]}` : `Check SL_IDE_PUBLISH_TOKEN or mint a new token at ${base}/tokens.`}`;
}

// One attempt: { status, ok, text, retryAfter }, status 0 when no answer came.
async function attempt(url, init) {
  const limit = Math.min(REQUEST_MS, deadline - Date.now());
  if (limit <= 0) return { status: 0, ok: false, text: 'out of time' };
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(limit) });
    return { status: res.status, ok: res.ok, text: await res.text(), retryAfter: res.headers.get('retry-after') };
  } catch (e) {
    return { status: 0, ok: false, text: e.name === 'TimeoutError' ? `no answer within ${limit} ms` : (e.cause?.message ?? e.message) };
  }
}

// `uncertain`: an earlier attempt got no clear answer (lost, timed out or a
// server error), so it may have taken effect even if the last one was refused.
async function request(what, url, init) {
  let uncertain = false;
  for (let n = 1; ; n += 1) {
    const r = { ...(await attempt(url, init)), uncertain };
    if (r.ok || !retryable(r.status) || n >= ATTEMPTS) return r;
    const asked = retryAfterMs(r.retryAfter);
    const wait = asked ?? Math.min(MAX_WAIT_MS, BACKOFF_MS * 2 ** (n - 1)) * (0.5 + Math.random() / 2);
    if (wait > MAX_WAIT_MS || Date.now() + wait >= deadline) return r;
    uncertain ||= r.status !== 429;
    console.warn(`publish-deck: ${what}: ${r.status ? `HTTP ${r.status}` : r.text}; trying again in ${(wait / 1000).toFixed(1)} s`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

const unpublish = process.argv.indexOf('--unpublish');
if (unpublish !== -1) {
  const name = process.argv[unpublish + 1];
  if (!name) die('--unpublish needs a branch name');
  if (name === 'main') die('main is never unpublished');
  const res = await request(`unpublishing ${name}`, `${base}/api/publish/${slug}/refs/${name.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE', headers: auth });
  const out = parse(res.text);
  if (!res.ok) die(`unpublishing ${name} failed: ${res.status} ${out.error ?? (res.status ? '' : res.text)}${limitHint(res)}${authHint(res)}`);
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
  const res = await request(`upload of ${to}`, url, { method: 'PUT', headers: auth, body });
  if (res.status === 401) die(`the cloud rejected SL_IDE_PUBLISH_TOKEN${authHint(res)}`);
  if (!res.ok) die(`upload of ${to} ${retryable(res.status) ? 'failed' : 'rejected'}: ${res.status} ${parse(res.text).error ?? res.text}${limitHint(res)}${authHint(res)}`);
  const uploaded = parse(res.text);
  if (uploaded.hash !== hash || uploaded.size !== body.length) die(`cloud checksum mismatch for ${to}`);
}

console.log(`publish-deck: ${slug} @ ${sha.slice(0, 7)} (${branch}) -> ${base}`);
const uploadStart = performance.now();
const rest = files.slice(0, -1);
const last = files[files.length - 1];
let next = 0;
await Promise.all(Array.from({ length: Math.min(6, rest.length) }, async () => {
  while (next < rest.length) await upload(rest[next++]);
}));
await upload(last);
const uploadMs = Math.round(performance.now() - uploadStart);
console.log(JSON.stringify({ event: 'sl-ide.publish', stage: 'upload', ms: uploadMs, files: files.length }));

// Pages in the PDF: Chrome writes one "/Type /Page" object per page.
const pages = hasPdf ? (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length || null : null;

const finalizeStart = performance.now();
// One body for every attempt: a retry after a lost answer finalizes the same
// manifest in the same session, which the cloud accepts again.
const res = await request('recording the version', `${base}/api/publish/${slug}/${sha}`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ uploadId, manifest, branch, title: META.deckTitle, format: META.format === 'memo' ? 'memo' : 'slides', repo, repoId: process.env.GITHUB_REPOSITORY_ID || null, pages, hasPdf }),
});
const out = parse(res.text);
const finalizeMs = Math.round(performance.now() - finalizeStart);
console.log(JSON.stringify({ event: 'sl-ide.publish', stage: 'finalize', ms: finalizeMs }));
if (!res.ok) {
  const hint = limitHint(res) + authHint(res);
  const maybe = res.uncertain || (!hint && retryable(res.status));
  die(`recording the version failed: ${res.status} ${out.error ?? (res.status ? '' : res.text)}${hint}${maybe ? '\n  It may have been recorded anyway; rerunning this job is safe.' : ''}`);
}
if (out.notice) console.log(`publish-deck: ${out.notice}`);
console.log(`publish-deck: ${files.length} files published\n  ${out.url}\n  this version: ${out.version}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Published to sl-ide cloud\n\n- Latest on \`${branch}\`: ${out.url}\n- This version: ${out.version}\n`);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- Upload: ${(uploadMs / 1000).toFixed(2)} s (${files.length} files)\n- Finalize: ${(finalizeMs / 1000).toFixed(2)} s\n`);
}
// For the workflow's later steps (the PR comment).
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${out.url}\nversion=${out.version}\n`);
}
