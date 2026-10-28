// The deck map (SL-67): one line per page, in deck order, with what an agent
// needs to change it: label, action title, component file, the page module
// (src/deck/pages/*.js) and keys it reads, words against the budget and the last audit status. A memo's
// flowing pages also list the body blocks the paginator put on each.
// Built from the audit's rows (Audit.jsx data-pages) and a static read of
// index.jsx (deck-files.mjs). `pnpm map` prints it; every `pnpm check`
// rewrites output/map.md and output/map.json.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deckSources, PAGES_DIR } from './deck-files.mjs';

const tail = (v) => (Array.isArray(v) ? (v.length ? `[0..${v.length - 1}]` : '[]') : '');
// anatomy -> 'anatomy.{title,cards[0..2],sources}'
function describe(key, v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return `${key}.{${Object.entries(v).map(([k, x]) => k + tail(x)).join(',')}}`;
  }
  return key + tail(v);
}

const TYPES = ['h1', 'h2', 'h3', 'ul', 'ol', 'table', 'callout', 'memohead', 'exhibit', 'pageBreak'];
const UNIT = { p: 'lines', ul: 'items', ol: 'items', table: 'rows' };
const clip = (s) => {
  const words = String(s).replace(/\*\*/g, '').split(/\s+/).filter(Boolean);
  return words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : words.join(' ');
};
function blockLine(expr, block, [i, from, to]) {
  const type = typeof block === 'string' ? 'p' : TYPES.find((t) => block && t in block) ?? 'block';
  const v = typeof block === 'string' ? block : block?.[type];
  const text = type === 'table' ? (v?.head ?? []).join(' | ')
    : Array.isArray(v) ? (type === 'memohead' ? v.map(([k]) => k).join(', ') : v[0]) : typeof v === 'string' ? v : '';
  const part = from === undefined ? '' : ` (${UNIT[type] ?? 'part'} ${from + 1}–${to == null ? 'end' : to})`;
  return `${expr}[${i}] ${type}${part}${text ? `  "${clip(text)}"` : ''}`;
}

// content.js and the page modules as data, merged; a module that imports
// something Node can't load (a JSX exhibit) is left out.
async function loadContent(root) {
  const dir = path.join(root, PAGES_DIR);
  const files = [path.join(root, 'src/deck/content.js'),
    ...(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(dir, f)) : [])];
  const mods = await Promise.all(files.map((file) => import(`${pathToFileURL(file).href}?${fs.statSync(file).mtimeMs}`).catch(() => ({}))));
  return Object.assign({}, ...mods);
}

function handReferences(root) {
  const file = path.join(root, 'AGENTS.md');
  const agents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const m = /\*\*Hand references\*\*([\s\S]*?)(?:\n\n|$)/.exec(agents);
  return m ? m[1].replace(/\s+/g, ' ').replace(/^ to page labels in copy:\s*/, '').replace(/\s*List each one here.*$/, '').trim() : null;
}

// report: the audit text; rows: its data (Audit.jsx).
export async function deckMap(root, { report, rows, source }) {
  const src = deckSources(root);
  const content = await loadContent(root);
  const at = (expr) => expr.split('.').reduce((v, k) => v?.[k], content);
  const entryOf = (id) => src.pages.find((p) => p.id === id)
    ?? src.pages.find((p) => p.kind === 'flow' && id.startsWith(`${p.id}-`));
  const pages = rows.map((r, n) => {
    const e = entryOf(r.id);
    const reads = e ? [...e.content, ...(e.kind === 'divider' ? src.indexReads : [])] : [];
    const modules = [...new Set(reads.map((c) => c.file))];
    const page = {
      position: n + 1, label: r.label, id: r.id, kind: r.kind, title: r.title,
      file: e?.file ?? null,
      modules,
      content: e?.kind === 'flow' ? [] : reads.map(({ key: k }) => (k in content ? describe(k, content[k]) : k)),
      words: r.words, budget: r.budget, audit: r.status,
    };
    if (r.blocks && e?.blocks) {
      const body = at(e.blocks);
      const idx = r.blocks.map(([i]) => i);
      page.content = [`${e.blocks}[${Math.min(...idx)}..${Math.max(...idx)}]`];
      page.blocks = r.blocks.map((b) => blockLine(e.blocks, body?.[b[0]], b));
    }
    return page;
  });
  return {
    format: content.META?.format ?? 'slides',
    audit: report.split('\n')[0],
    source,
    handReferences: handReferences(root),
    everyPage: ['src/deck/content.js', 'src/styles.css', 'src/components/', 'src/slides/index.jsx (order)'],
    pages,
  };
}

export function mapText(map) {
  const cell = (rows, i) => Math.max(...rows.map((r) => r[i].length));
  const rows = map.pages.map((p) => [
    `@${p.position}`, p.label, p.id, `"${p.title}"`, p.file ?? '?',
    `${p.modules.join(' ') || '—'}: ${p.content.join(' ') || '—'}`,
    `words ${p.words}${p.budget ? `/${p.budget}` : ''}`, `audit ${p.audit}`,
  ]);
  const widths = rows[0]?.map((_, i) => cell(rows, i)) ?? [];
  const lines = rows.flatMap((r, n) => [
    r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i]))).join('  '),
    ...(map.pages[n].blocks ?? []).map((b) => `      ${b}`),
  ]);
  return [
    '# Deck map',
    '',
    `Written by pnpm check / pnpm map from ${map.source}. ${map.audit.trim()}.`,
    `Hand references (AGENTS.md): ${map.handReferences ?? 'none listed'}`,
    `Every page reads: ${map.everyPage.join(', ')}`,
    '',
    '```',
    ...lines,
    '```',
    '',
  ].join('\n');
}
