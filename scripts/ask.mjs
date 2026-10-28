#!/usr/bin/env node
// Typed questions about the deck, answered fast by TypeSafe's Jev (SL-72).
//
//   pnpm ask fit 2 A1            -> does the picture on each page fit it?
//   pnpm ask fit output/lab/a.png  (any PNG or JPEG, e.g. a slide-lab take)
//   pnpm ask find "the pricing"  -> which pages mention a topic?
//   --dry-run                    -> print the request payloads, send nothing
//
// Pages are rendered by `pnpm check` (warm), so the questions see what the
// PDF shows. The wording, thresholds and truth tables are all in
// scripts/ask-questions.mjs. Prints JSON. A failed call is an error (exit 1),
// never a "no". Needs TYPESAFE_API_KEY in the environment, never in the repo.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fitQuestions, fitVerdict, findQuestions, findState, findVerdict, MODELS } from './ask-questions.mjs';

const root = path.resolve(import.meta.dirname, '..');
const API = process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai';
const LONG_STATE = 100_000; // characters; past this, ask for long context

export class AskError extends Error {}

// Width and height from a PNG or JPEG header; Jev takes 280-1568 px a side.
export function imageInfo(bytes) {
  if (bytes.subarray(1, 4).toString() === 'PNG') {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length;) {
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpg', height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      }
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return null;
}

function imageAsset(file) {
  const bytes = fs.readFileSync(file);
  const info = imageInfo(bytes);
  if (!info) throw new AskError(`${file} is not a PNG or JPEG`);
  const { width, height } = info;
  if (Math.min(width, height) < 280 || Math.max(width, height) > 1568) {
    throw new AskError(`${file} is ${width}x${height}; TypeSafe takes 280-1568 px a side (shoot at SCALE=1)`);
  }
  return { type: 'image', format: info.format, data_base64: bytes.toString('base64') };
}

export async function systemOne(body, { images = false, fetchImpl = fetch } = {}) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new AskError('TYPESAFE_API_KEY is not set (README, Typed questions)');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (images) headers['TypeSafe-Danger-Zone-Images'] = 'true';
  if (JSON.stringify(body.state).length > LONG_STATE) headers['TypeSafe-Danger-Zone-Long-Context'] = 'true';
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(`${API}/v1/systemone`, {
        method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new AskError(`TypeSafe request failed: ${err.cause?.message ?? err.message}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const after = Number(res.headers.get('retry-after') ?? NaN);
      const wait = Math.min(Number.isFinite(after) ? after : 2 ** attempt, 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* reported below */ }
    if (!res.ok) {
      const detail = json?.detail ? (typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail)) : text.slice(0, 300);
      throw new AskError(`TypeSafe answered ${res.status}: ${detail}`);
    }
    const missing = Object.keys(body.questions).filter((q) => !json?.answers?.[q]);
    if (missing.length) throw new AskError(`TypeSafe's answer is missing ${missing.join(', ')}`);
    return json;
  }
}

const run = promisify(execFile);

// Render the pages through `pnpm check`, which also writes output/text.json.
async function rendered(labels) {
  const started = Date.now();
  try {
    await run(process.execPath, [path.join(root, 'scripts/check.mjs'), ...labels], { cwd: root, env: process.env });
  } catch (err) {
    // Exit 1 with audit flags still renders; only a check error stops us.
    const error = /^error: .*/m.exec(err.stderr ?? '');
    if (error || err.code !== 1) throw new AskError(`pnpm check failed: ${error?.[0] ?? err.message}`);
  }
  const file = path.join(root, 'output/text.json');
  if (!(fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs >= started - 1000)) {
    throw new AskError('pnpm check did not write output/text.json');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')).pages;
}

const shotName = (p) => `page-${p.label === '—' ? `at${p.position}` : p.label}.png`;
const shown = (body) => JSON.stringify(body, (k, v) => (k === 'data_base64' ? `<${v.length} base64 chars>` : v), 2);

async function fit(targets, { dryRun }) {
  const files = targets.filter((t) => /\.(png|jpe?g)$/i.test(t));
  const labels = targets.filter((t) => !files.includes(t));
  const items = files.map((f) => ({ image: path.resolve(f) }));
  if (labels.length) {
    const pages = await rendered(labels);
    for (const l of labels) {
      const p = l.startsWith('@') ? pages[Number(l.slice(1)) - 1] : pages.find((x) => x.label === l);
      if (!p) throw new AskError(`no page '${l}'`);
      items.push({ label: p.label, title: p.title, image: path.join(root, 'output/shots', shotName(p)) });
    }
  }
  return Promise.all(items.map(async (item) => {
    const body = {
      model: MODELS.image,
      state: { slide: 'slide-image' },
      assets: { 'slide-image': imageAsset(item.image) },
      questions: fitQuestions(),
    };
    const where = item.label ?? path.relative(process.cwd(), item.image);
    if (dryRun) return { page: where, request: JSON.parse(shown(body)) };
    const res = await systemOne(body, { images: true });
    return { page: where, ...(item.title ? { title: item.title } : {}), model: res.model, ...fitVerdict(res.answers) };
  }));
}

async function find(topic, { dryRun }) {
  const pages = await rendered([]);
  const body = { model: MODELS.text, state: findState(pages), questions: findQuestions(topic, pages) };
  if (dryRun) return { request: body };
  const res = await systemOne(body);
  return { topic, model: res.model, ...findVerdict(res.answers, pages) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const [cmd, ...rest] = args.filter((a) => a !== '--dry-run');
  try {
    let out;
    if (cmd === 'fit' && rest.length) out = await fit(rest, { dryRun });
    else if (cmd === 'find' && rest.length) out = await find(rest.join(' '), { dryRun });
    else {
      console.error('usage: pnpm ask fit <labels or images...> | pnpm ask find <topic>  [--dry-run]');
      process.exit(2);
    }
    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}
