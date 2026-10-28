// Which pages a change touches, for `pnpm check --changed`. A static read
// of src/slides/index.jsx and the pages' imports, no parser:
//   a page component        -> its page
//   a page's copy module    -> the pages whose component imports it
//     (src/deck/pages/*.js)
//   content.js, styles, shell, index -> every page
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EVERY_PAGE = /^(index\.html|src\/(App|main)\.jsx|src\/styles\.css|src\/slides\/index\.jsx|src\/deck\/content\.js|src\/(components|fonts)\/)/;
export const PAGES_DIR = 'src/deck/pages';

// What a file imports from src/deck: [{ key, file }], where file is the
// module (src/deck/content.js, or a page's src/deck/pages/<name>.js).
const importsOf = (src) => [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*\/deck\/((?:pages\/)?[\w-]+\.js)'/g)]
  .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)
    .map((key) => ({ key, file: `src/deck/${m[2]}` })));
const pageKeys = (src) => importsOf(src).filter((i) => i.file.startsWith(`${PAGES_DIR}/`));

// The deck's entries ({ id, kind, file, content }; content is the
// [{ key, file }] it reads from its page modules; a flow's pages are `<id>-N`
// and `blocks` names its body, e.g. 'memo.body'), and what index.jsx itself
// reads from page modules (for the divider's list of appendix pages).
export function deckSources(root) {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const index = read('src/slides/index.jsx');
  const modules = new Map([...index.matchAll(/import \* as (\w+) from '\.\/([^']+)'/g)]
    .map((m) => [m[1], `src/slides/${m[2]}`]));
  const pages = [];
  for (const m of index.matchAll(/entry\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\w+)/g)) {
    const file = modules.get(m[3]);
    if (file) pages.push({ id: m[1], kind: m[2], file, content: pageKeys(read(file)) });
  }
  const indexReads = pageKeys(index);
  for (const m of index.matchAll(/flow\(\s*'([^']+)'\s*,\s*([\w.]+)/g)) {
    const key = m[2].split('.')[0];
    pages.push({ id: m[1], kind: 'flow', file: 'src/slides/index.jsx', content: indexReads.filter((i) => i.key === key), blocks: m[2] });
  }
  const flowKeys = new Set(pages.filter((p) => p.kind === 'flow').flatMap((p) => p.content.map((c) => c.key)));
  return { pages, indexReads: indexReads.filter((i) => !flowKeys.has(i.key)) };
}

// changes: repo-relative paths. Returns { all, ids }.
export function pagesFor(changes, { pages, indexReads }) {
  const ids = new Set();
  const add = (list) => list.forEach((p) => ids.add(p.id));
  for (const file of changes) {
    if (EVERY_PAGE.test(file)) return { all: true, ids };
    if (file.startsWith(`${PAGES_DIR}/`)) {
      add(pages.filter((p) => p.content.some((c) => c.file === file)));
      if (indexReads.some((c) => c.file === file)) add(pages.filter((p) => p.kind === 'divider'));
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

// What changed since the last commit: staged, unstaged and untracked.
export function gitChanges(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return [
    ...git('diff', '--name-only', '--no-renames', '--relative', 'HEAD').split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean);
}

// Indexes of the deck's pages (`pageIds`, in deck order, as the audit
// reports them) that the changes touch.
export function changedPages(root, pageIds, changes = gitChanges(root)) {
  const { all, ids } = pagesFor(changes, deckSources(root));
  return pageIds.flatMap((id, i) => (all || [...ids].some((e) => id === e || id.startsWith(`${e}-`)) ? [i] : []));
}
