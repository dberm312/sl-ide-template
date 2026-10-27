// Which pages a change touches, for `pnpm check --changed`. A static read
// of src/slides/index.jsx and the pages' imports, no parser:
//   a page component        -> its page
//   a content.js export     -> the pages whose component imports it
//   styles, shell, index    -> every page
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EVERY_PAGE = /^(index\.html|src\/(App|main)\.jsx|src\/styles\.css|src\/slides\/index\.jsx|src\/(components|fonts)\/)/;
const CONTENT = 'src/deck/content.js';

// Names a file imports from content.js.
const keysOf = (src) => [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*\/deck\/content\.js'/g)]
  .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));

// The deck's entries ({ id, kind, file, keys }; a flow's pages are `<id>-N`
// and `blocks` names its body, e.g. 'memo.body'),
// the content keys every page reads (`shared`) and content.js's top-level
// exports with the line each starts on.
export function deckSources(root) {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const index = read('src/slides/index.jsx');
  const modules = new Map([...index.matchAll(/import \* as (\w+) from '\.\/([^']+)'/g)]
    .map((m) => [m[1], `src/slides/${m[2]}`]));
  const pages = [];
  for (const m of index.matchAll(/entry\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\w+)/g)) {
    const file = modules.get(m[3]);
    if (file) pages.push({ id: m[1], kind: m[2], file, keys: keysOf(read(file)) });
  }
  for (const m of index.matchAll(/flow\(\s*'([^']+)'\s*,\s*([\w.]+)/g)) {
    pages.push({ id: m[1], kind: 'flow', file: 'src/slides/index.jsx', keys: [m[2].split('.')[0]], blocks: m[2] });
  }
  // index.jsx reads the rest itself for the divider's list of appendix pages.
  const indexKeys = keysOf(index).filter((k) => !pages.some((p) => p.kind === 'flow' && p.keys.includes(k)));
  const components = path.join(root, 'src/components');
  const shared = new Set((fs.existsSync(components) ? fs.readdirSync(components) : [])
    .flatMap((f) => keysOf(read(`src/components/${f}`))));
  const exports = read(CONTENT).split('\n').flatMap((l, i) => {
    const m = /^export\s+(?:const|let|function)\s+(\w+)/.exec(l);
    return m ? [{ key: m[1], line: i + 1 }] : [];
  });
  return { pages, indexKeys, shared, exports };
}

// changes: [{ file, lines }] with repo-relative paths and the new file's
// changed line numbers (null: the whole file). Returns { all, ids }.
export function pagesFor(changes, { pages, indexKeys, shared, exports }) {
  const ids = new Set();
  const add = (list) => list.forEach((p) => ids.add(p.id));
  for (const { file, lines } of changes) {
    if (EVERY_PAGE.test(file)) return { all: true, ids };
    if (file === CONTENT) {
      if (!lines) return { all: true, ids };
      for (const line of lines) {
        const key = exports.findLast((e) => e.line <= line)?.key;
        if (!key || shared.has(key)) return { all: true, ids };
        add(pages.filter((p) => p.keys.includes(key)));
        if (indexKeys.includes(key)) add(pages.filter((p) => p.kind === 'divider'));
      }
    } else if (file.startsWith('src/slides/')) {
      const mine = pages.filter((p) => p.file === file);
      if (!mine.length) return { all: true, ids }; // a helper several pages may share
      add(mine);
    } else if (file.startsWith('src/') && !file.startsWith('src/lab/')) {
      return { all: true, ids };
    }
  }
  return { all: false, ids };
}

// `git diff --unified=0` -> [{ file, lines }].
export function parseDiff(text) {
  const out = [];
  let cur = null;
  let from = null;
  for (const line of text.split('\n')) {
    let m;
    if ((m = /^--- (?:a\/(.*)|\/dev\/null)$/.exec(line))) from = m[1] ?? null;
    else if ((m = /^\+\+\+ (?:b\/(.*)|\/dev\/null)$/.exec(line))) {
      cur = m[1] ? { file: m[1], lines: [] } : null;
      out.push(cur ?? { file: from, lines: null });
    } else if (cur && (m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line))) {
      const start = Number(m[1]);
      const n = m[2] === undefined ? 1 : Number(m[2]);
      for (let i = 0; i < Math.max(n, 1); i += 1) cur.lines.push(start + i);
    }
  }
  return out;
}

// What changed since the last commit: staged, unstaged and untracked.
export function gitChanges(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return [
    ...parseDiff(git('diff', '--unified=0', '--no-color', '--no-ext-diff', '--relative', 'HEAD')),
    ...git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean).map((file) => ({ file, lines: null })),
  ];
}

// Indexes of the deck's pages (`pageIds`, in deck order, as the audit
// reports them) that the changes touch.
export function changedPages(root, pageIds, changes = gitChanges(root)) {
  const { all, ids } = pagesFor(changes, deckSources(root));
  return pageIds.flatMap((id, i) => (all || [...ids].some((e) => id === e || id.startsWith(`${e}-`)) ? [i] : []));
}
